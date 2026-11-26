"""#4631.3 — aucun gabarit de réponse n'interpole un nombre qui ne vient pas de la collection rendue.

`test_4631_annonce_liste.py` ne garde qu'UN gabarit (`talent_dropped`). Cette garde-ci les lit TOUS : chaque appel
`gabarit.format(n=…)` (ou `count`, `nb`, `total`, `number`) des services doit tirer son nombre d'une VARIABLE (jamais d'un
littéral) que le code a testée avant de parler — `if dropped`, `if not items: return`, `… > 0`. Une collection vide ne
promet donc rien ; l'absence se dit par la phrase d'absence (`empty_what`), pas par un volume.

Elle LIT le code, elle ne le réécrit pas ; elle rend le nombre de sites inspectés et `0 inspecté` est un ÉCHEC."""

from __future__ import annotations

import ast
from dataclasses import dataclass, field
from pathlib import Path

import pytest

COUNT_KEYWORDS = frozenset({"n", "count", "nb", "total", "number"})
SERVICES = Path(__file__).parent.parent / "app" / "services"


@dataclass
class Inspection:
    inspected: int = 0
    violations: list[str] = field(default_factory=list)


def _names(node: ast.AST) -> set[str]:
    return {n.id for n in ast.walk(node) if isinstance(n, ast.Name)}


def _terminates(body: list[ast.stmt]) -> bool:
    return bool(body) and isinstance(body[-1], (ast.Return, ast.Continue, ast.Raise, ast.Break))


def _guarded(call: ast.Call, names: set[str], parents: dict[ast.AST, ast.AST]) -> bool:
    """Vrai si une condition qui NOMME la variable du nombre entoure l'appel, ou l'a précédé en sortant du bloc."""
    node: ast.AST = call
    while node in parents:
        parent = parents[node]
        if isinstance(parent, (ast.If, ast.IfExp)) and node is not parent.test and names & _names(parent.test):
            return True
        for block in (getattr(parent, "body", None), getattr(parent, "orelse", None)):
            if isinstance(block, list) and node in block:
                for earlier in block[: block.index(node)]:  # type: ignore[arg-type]
                    if isinstance(earlier, ast.If) and names & _names(earlier.test) and _terminates(earlier.body):
                        return True
        node = parent
    return False


def inspect_count_templates(source: str, filename: str = "<source>") -> Inspection:
    """Inspecte chaque `gabarit.format(n=…)` dont le gabarit est un registre/une variable (pas un littéral inline)."""
    tree = ast.parse(source, filename)
    parents = {child: parent for parent in ast.walk(tree) for child in ast.iter_child_nodes(parent)}
    out = Inspection()
    for call in ast.walk(tree):
        if not (isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute) and call.func.attr == "format"):
            continue
        counted = [k for k in call.keywords if k.arg in COUNT_KEYWORDS]
        if not counted or isinstance(call.func.value, ast.Constant):
            continue  # un `{n}` dans un texte inline ne parle pas d'une collection rendue : hors de la garde
        out.inspected += 1
        names = set().union(*(_names(k.value) for k in counted))
        where = f"{filename}:{call.lineno}"
        if not names:
            out.violations.append(f"{where} — le nombre est un littéral, il ne vient d'aucune collection rendue")
        elif not _guarded(call, names, parents):
            out.violations.append(f"{where} — le nombre ({', '.join(sorted(names))}) n'est testé nulle part : une collection vide l'annoncerait")
    return out


# ── La garde sait dire NON (cas écrits d'abord, vus ROUGES avant la garde) ───────────────────────────────────────────

PROMET_TROIS_SUR_VIDE = '''
def render(items, labels):
    return labels["found"].format(n=3)
'''

ANNONCE_SANS_TESTER = '''
def render(items, labels):
    return labels["found"].format(n=len(items))
'''

TESTE_AVANT = '''
def render(items, labels):
    if not items:
        return labels["empty_what"].format(what="comptes")
    return labels["found"].format(n=len(items))

def dropped(dropped, labels):
    return [labels["dropped"].format(n=dropped)] if dropped else []

def capped_only(rows, labels):
    for row in rows:
        capped = row.get("capped")
        if not capped:
            continue
        yield labels["capped"].format(n=capped)
'''

TEXTE_SANS_COLLECTION = '''
def etape():
    return "Étape {n} sur 3".format(n=2)
'''


def test_4631_3_sait_dire_non_un_gabarit_qui_promet_trois_sur_une_collection_vide() -> None:
    result = inspect_count_templates(PROMET_TROIS_SUR_VIDE, "promet.py")
    assert result.inspected == 1
    assert len(result.violations) == 1 and "littéral" in result.violations[0]


def test_4631_3_sait_dire_non_un_nombre_annonce_sans_avoir_teste_la_collection() -> None:
    result = inspect_count_templates(ANNONCE_SANS_TESTER, "sans_test.py")
    assert result.inspected == 1 and len(result.violations) == 1


def test_4631_3_laisse_passer_un_nombre_teste_avant_de_parler() -> None:
    result = inspect_count_templates(TESTE_AVANT, "ok.py")
    assert result.inspected == 3 and result.violations == []


def test_4631_3_n_attrape_pas_un_n_dans_un_texte_qui_ne_parle_pas_d_une_collection() -> None:
    result = inspect_count_templates(TEXTE_SANS_COLLECTION, "etape.py")
    assert result.inspected == 0 and result.violations == []


# ── La garde sur les VRAIS gabarits des services ──────────────────────────────────────────────────────────────────

def _real() -> Inspection:
    total = Inspection()
    for path in sorted(SERVICES.rglob("*.py")):
        part = inspect_count_templates(path.read_text(encoding="utf-8"), str(path.relative_to(SERVICES.parent.parent)))
        total.inspected += part.inspected
        total.violations += part.violations
    return total


def test_4631_3_la_garde_lit_quelque_chose_zero_inspecte_est_un_echec() -> None:
    # known_shape_gate (8 gabarits `labels[…].format(n=…)` + headcount ×2) et shared_message_learning : > 0, sinon elle ne lit rien.
    assert _real().inspected >= 10


def test_4631_3_aucun_gabarit_des_services_ne_promet_hors_collection() -> None:
    # #4631.3 — aucun gabarit ne promet hors collection
    assert _real().violations == []


def test_4631_3_les_deux_langues_portent_les_memes_gabarits_a_nombre() -> None:
    from app.services.known_shape_gate import _LABELS

    def counted(lang: str) -> set[str]:
        return {k for k, v in _LABELS[lang].items() if "{n}" in v}

    assert counted("fr") == counted("en") and len(counted("fr")) >= 8
