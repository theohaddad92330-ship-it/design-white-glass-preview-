"""GA-193 — le service ne tourne jamais sur un paquet présent par accident.

Le défaut trouvé le 30/08 : `sentry-sdk` et `jsonschema` étaient **importés**
par `app/main.py` (via `app/sentry_init.py`) et `app/graph/nodes.py`, et
**absents** de `apps/ia/pyproject.toml` — présents en production uniquement
parce qu'une AUTRE dépendance les tirait en transitif. Le jour où cette
dépendance intermédiaire les laisse tomber, l'import casse au DÉMARRAGE, en
production, sans qu'aucun test ne l'ait vu — et pour `sentry-sdk`, la panne
serait aussi celle du moyen de la voir.

Cette garde balaie tous les imports de premier niveau de `app/**` (le module
importé, pas le paquet PyPI — les deux diffèrent parfois, ex. `firecrawl` →
`firecrawl-py`) et vérifie que chacun a une déclaration dans
`pyproject.toml` : soit dans `[project.dependencies]`, soit dans une entrée
de `[project.optional-dependencies]` (ex. `openai`, optionnel par conception
et déjà déclaré sous `llm-openai`).

Trois précautions, pour ne pas se tromper de compte :
- le nom du module importé n'est PAS toujours celui du paquet — normalisé
  ici par la même règle que PEP 503 (`_` ↔ `-`), plus une table minuscule
  pour les cas irréguliers (`firecrawl` → `firecrawl-py`) ;
- la bibliothèque standard ne se déclare pas — exclue via
  `sys.stdlib_module_names`, jamais une liste écrite à la main ;
- un import protégé par un `try/except (ImportError|ModuleNotFoundError|
  Exception|BaseException)` est optionnel par conception : il n'a pas besoin
  d'être une dépendance DURE, mais doit rester déclaré quelque part dans le
  fichier (dur ou optionnel) — sauf exception NOMMÉE et justifiée, voir
  `_NAMED_EXCLUSIONS` ci-dessous. Le piège que ce fichier refuse : laisser
  cette liste grossir sans nom ni raison écrite.
"""

from __future__ import annotations

import ast
import re
import sys
import tomllib
from dataclasses import dataclass
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent  # apps/ia
_APP = _ROOT / "app"
_PYPROJECT = _ROOT / "pyproject.toml"

_STDLIB = set(sys.stdlib_module_names)

#: Le seul module de premier niveau qui est notre propre code, jamais une
#: dépendance.
_FIRST_PARTY = {"app"}

#: Exceptions à la normalisation `_` ↔ `-` : le nom du paquet PyPI diffère
#: du nom du module importé par plus qu'un simple échange de séparateur.
#: N'y ajouter QUE des modules réellement importés dans `app/**` (mesuré,
#: pas anticipé) — sinon cette table dérive vers une liste écrite à la main.
_MODULE_TO_PACKAGE: dict[str, str] = {
    "firecrawl": "firecrawl-py",  # paquet PyPI ``firecrawl-py``, module ``firecrawl``
    "PIL": "Pillow",  # paquet PyPI ``Pillow``, module ``PIL`` (#2433.12, orientation des photos)
}

#: Exceptions nommées : un import protégé, jamais déclaré, dont le
#: comportement à l'absence est explicitement un no-op documenté dans le
#: code appelant. Chaque entrée porte la raison — pas un silence muet — et
#: la garde elle-même vérifie plus bas que l'import reste bien protégé
#: (sinon l'exception devient un trou silencieux si la garde `try/except`
#: disparaît un jour sans qu'on repasse ici).
_NAMED_EXCLUSIONS: dict[str, str] = {
    "sentence_transformers": (
        "Reranker optionnel du RAG local — app/services/rag_knowledge.py, "
        "_cross_encoder_rerank(). Actif seulement si RAG_RERANK_CROSS_ENCODER "
        "nomme un modèle ET que sentence-transformers est installé ; "
        "l'import est protégé par un try/except explicitement commenté "
        "« optional dep absent → fall through », donc son absence ne casse "
        "ni le démarrage ni l'appelant. Pas de groupe [project.optional-"
        "dependencies] dédié aujourd'hui : personne ne l'installe encore en "
        "production."
    ),
}

#: Noms de handler qui rendent un `try` protecteur d'un import optionnel.
_IMPORT_ERROR_HANDLER_NAMES = {"ImportError", "ModuleNotFoundError", "Exception", "BaseException"}


@dataclass(frozen=True)
class _ImportSite:
    file: str  # chemin relatif à apps/ia/app
    line: int
    module: str  # premier segment du module importé
    guarded: bool  # protégé par un try/except qui avale l'absence du paquet


def _iter_py_files() -> list[Path]:
    return sorted(p for p in _APP.rglob("*.py") if "__pycache__" not in p.parts)


def _handler_catches_import_error(handler: ast.excepthandler) -> bool:
    if handler.type is None:  # `except:` nu
        return True
    names: list[str] = []
    candidates = handler.type.elts if isinstance(handler.type, ast.Tuple) else [handler.type]
    for node in candidates:
        if isinstance(node, ast.Name):
            names.append(node.id)
        elif isinstance(node, ast.Attribute):
            names.append(node.attr)
    return any(n in _IMPORT_ERROR_HANDLER_NAMES for n in names)


def _collect_file_imports(path: Path) -> list[_ImportSite]:
    rel = path.relative_to(_APP).as_posix()
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    sites: list[_ImportSite] = []

    class Visitor(ast.NodeVisitor):
        def __init__(self) -> None:
            self.guard_stack: list[bool] = []

        def visit_Try(self, node: ast.Try) -> None:
            guarded = any(_handler_catches_import_error(h) for h in node.handlers)
            self.guard_stack.append(guarded)
            for stmt in node.body:
                self.visit(stmt)
            self.guard_stack.pop()
            for handler in node.handlers:
                for stmt in handler.body:
                    self.visit(stmt)
            for stmt in node.orelse:
                self.visit(stmt)
            for stmt in node.finalbody:
                self.visit(stmt)

        def visit_Import(self, node: ast.Import) -> None:
            for alias in node.names:
                top = alias.name.split(".", 1)[0]
                sites.append(
                    _ImportSite(
                        file=rel,
                        line=node.lineno,
                        module=top,
                        guarded=any(self.guard_stack),
                    )
                )

        def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
            if node.level and node.level > 0:
                return  # import relatif — premier parti, pas une dépendance
            if node.module is None:
                return
            top = node.module.split(".", 1)[0]
            sites.append(
                _ImportSite(
                    file=rel,
                    line=node.lineno,
                    module=top,
                    guarded=any(self.guard_stack),
                )
            )

    Visitor().visit(tree)
    return sites


def _collect_all_imports() -> list[_ImportSite]:
    sites: list[_ImportSite] = []
    for path in _iter_py_files():
        sites.extend(_collect_file_imports(path))
    return [s for s in sites if s.module not in _STDLIB and s.module not in _FIRST_PARTY]


def _normalize(name: str) -> str:
    return name.replace("_", "-").lower()


_REQUIREMENT_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*")


def _package_name_from_requirement(requirement: str) -> str:
    """``"psycopg[binary]==3.2.9"`` → ``"psycopg"`` ; ``"aiolimiter>=1.2.1"`` → ``"aiolimiter"``."""
    req = requirement.split(";", 1)[0].strip()  # coupe un éventuel marqueur d'environnement
    req = re.sub(r"\[[^\]]*\]", "", req)  # coupe les extras ``[binary]``
    match = _REQUIREMENT_NAME_RE.match(req)
    return match.group(0) if match else req


def _declared_packages() -> set[str]:
    data = tomllib.loads(_PYPROJECT.read_text(encoding="utf-8"))
    project = data["project"]
    requirements = list(project.get("dependencies", []))
    for group in project.get("optional-dependencies", {}).values():
        requirements.extend(group)
    return {_normalize(_package_name_from_requirement(r)) for r in requirements}


def _candidate_packages(module: str) -> set[str]:
    mapped = _MODULE_TO_PACKAGE.get(module)
    candidates = {_normalize(module)}
    if mapped is not None:
        candidates.add(_normalize(mapped))
    return candidates


def _compute_missing(sites: list[_ImportSite], declared: set[str]) -> list[_ImportSite]:
    """Les sites d'import dont AUCUN paquet candidat n'est déclaré, en retirant
    ce qu'une exception nommée couvre (et seulement si elle reste protégée)."""
    by_module: dict[str, list[_ImportSite]] = {}
    for site in sites:
        by_module.setdefault(site.module, []).append(site)

    missing: list[_ImportSite] = []
    for module, occurrences in by_module.items():
        if _candidate_packages(module) & declared:
            continue
        if module in _NAMED_EXCLUSIONS and all(o.guarded for o in occurrences):
            continue
        missing.extend(occurrences)
    return missing


def test_the_guard_reads_a_corpus_that_is_not_empty():
    """Le témoin obligatoire : une garde qui balaie zéro fichier est verte
    pour toujours. Six gardes borgnes en deux jours dans ce dépôt avaient ce
    défaut — aucune ne le savait tant que personne n'avait mesuré son propre
    corpus."""
    files = _iter_py_files()
    assert len(files) > 100, f"corpus de fichiers suspect : {len(files)} fichiers sous app/"

    sites = _collect_all_imports()
    assert len(sites) > 50, f"corpus d'imports suspect : {len(sites)} imports tiers collectés"

    distinct_modules = {s.module for s in sites}
    assert len(distinct_modules) >= 10, (
        f"trop peu de modules tiers distincts ({sorted(distinct_modules)}) — "
        "la garde ne voit probablement pas tout app/**"
    )


def test_the_guard_can_say_no_when_a_real_dependency_goes_missing():
    """Preuve qu'elle sait dire NON : on retire ``sentry-sdk`` du JEU de
    paquets déclarés (en mémoire, jamais le fichier sur disque — treize
    autres agents écrivent en parallèle dans ce dépôt) et on vérifie que le
    calcul la signale bien comme manquante.

    La preuve « à blanc », faite à la main pendant le développement de cette
    garde : retirer la ligne ``"sentry-sdk==2.68.1"`` de
    ``apps/ia/pyproject.toml``, relancer ``pytest
    tests/test_dependency_declaration_guard.py`` → rouge sur
    ``sentry_sdk``&``jsonschema`` absents (les deux occurrences réintroduites
    par le lot du 30/08) ; remettre la ligne → vert. Ce test-ci rejoue la
    même preuve mécaniquement, à chaque exécution, sans toucher au fichier.
    """
    declared = _declared_packages()
    assert "sentry-sdk" in declared, "précondition : sentry-sdk doit être déclaré pour ce test"

    amputated = declared - {"sentry-sdk"}
    sites = _collect_all_imports()
    missing = _compute_missing(sites, amputated)

    assert any(s.module == "sentry_sdk" for s in missing), (
        "la garde ne signale PAS sentry_sdk quand sa déclaration est retirée du "
        "jeu de paquets — elle ne sait pas dire NON"
    )


def test_named_exclusions_stay_guarded():
    """Une exception nommée n'a de sens que tant que son import reste
    protégé — sinon elle devient un trou silencieux le jour où quelqu'un
    retire le ``try/except`` sans revenir ici."""
    sites = _collect_all_imports()
    by_module: dict[str, list[_ImportSite]] = {}
    for site in sites:
        by_module.setdefault(site.module, []).append(site)

    for module, reason in _NAMED_EXCLUSIONS.items():
        assert reason.strip(), f"{module} : une exception nommée sans raison écrite ne vaut rien"
        occurrences = by_module.get(module, [])
        assert occurrences, (
            f"{module} n'apparaît plus dans app/** — l'exception dans "
            "_NAMED_EXCLUSIONS est périmée, la retirer"
        )
        assert all(o.guarded for o in occurrences), (
            f"{module} n'est plus importé sous try/except à "
            f"{[f'{o.file}:{o.line}' for o in occurrences if not o.guarded]} — "
            "l'exception nommée ne protège plus rien, soit restaurer le "
            "garde-fou, soit déclarer le paquet dans pyproject.toml"
        )


def test_every_directly_imported_third_party_module_is_declared():
    """La garde elle-même : chaque module tiers importé au premier niveau
    dans ``app/**`` a un paquet déclaré dans ``pyproject.toml`` — dépendance
    dure ou optionnelle — sauf exception nommée et toujours protégée."""
    sites = _collect_all_imports()
    declared = _declared_packages()
    missing = _compute_missing(sites, declared)

    if missing:
        by_module: dict[str, list[_ImportSite]] = {}
        for site in missing:
            by_module.setdefault(site.module, []).append(site)
        report = "\n".join(
            f"  {module} — candidats {sorted(_candidate_packages(module))} non déclarés, "
            f"première occurrence {occurrences[0].file}:{occurrences[0].line} "
            f"(+{len(occurrences) - 1} autre(s))"
            if len(occurrences) > 1
            else f"  {module} — candidats {sorted(_candidate_packages(module))} non déclarés, "
            f"{occurrences[0].file}:{occurrences[0].line}"
            for module, occurrences in sorted(by_module.items())
        )
        raise AssertionError(
            "GA-193 — imports importés par app/** mais absents de "
            f"apps/ia/pyproject.toml :\n{report}"
        )
