"""GA-26 appliquée aux dépendances IA — deux fichiers épinglent, ils ne se contredisent pas.

─────────────────────────────────────────────────────────────────────────────
LA PANNE QUE CETTE GARDE EMPÊCHE
─────────────────────────────────────────────────────────────────────────────
Mesuré le 28/10/2026 sur `main` : `apps/ia/pyproject.toml` épinglait
`anthropic==2.1.0` et `apps/ia/requirements.txt` `anthropic==0.52.0`. Un SDK
**majeur** d'écart, sur le même service, dans deux fichiers que personne ne
comparait — la version réellement installée dépendait alors du fichier que la
chaîne d'installation avait choisi ce jour-là.

Et cette panne-là ne ressemble pas à une panne : `anthropic` 2.x retire
`temperature` du client. Selon le fichier installé, le même code lève donc un
`TypeError` **avant tout appel réseau** (mesuré : 146 ms) — on cherche une
coupure de réseau, un quota, une clé, alors que la signature a changé.

Un réglage vit à UN seul endroit (GA-26). Ici, deux fichiers doivent coexister
(`requirements.txt` pour l'image, `pyproject.toml` pour `pip install -e .`) :
la règle n'est donc pas « un seul fichier », mais « aucune CONTRADICTION ».

⚠️ Ce que cette garde ne fait PAS, à dessein : exiger que les deux listes
soient identiques. Un paquet épinglé dans un seul fichier est légitime —
`pydantic-core` et `starlette` sont déclarés dans `pyproject.toml` pour
satisfaire GA-193 (importés directement) sans être des lignes de l'image. Seuls
les paquets présents DANS LES DEUX sont comparés.
"""

from __future__ import annotations

import re
import tomllib
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]  # apps/ia
_REQUIREMENTS = _ROOT / "requirements.txt"
_PYPROJECT = _ROOT / "pyproject.toml"

_REQ_PIN_RE = re.compile(r"^([A-Za-z0-9._-]+)(?:\[[^\]]*\])?==([^\s#;]+)")
_SPEC_PIN_RE = re.compile(r"^([A-Za-z0-9._-]+)(?:\[[^\]]*\])?==([^\s#;,]+)$")


def _normalise(name: str) -> str:
    """PEP 503 : `_` et `-` ne distinguent pas deux paquets."""
    return name.lower().replace("_", "-")


def _pins_requirements() -> dict[str, str]:
    pins: dict[str, str] = {}
    for line in _REQUIREMENTS.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        match = _REQ_PIN_RE.match(stripped)
        if match:
            pins[_normalise(match.group(1))] = match.group(2)
    return pins


def _pins_pyproject() -> dict[str, str]:
    """Les `==` de `[project.dependencies]` ET des extras — tomllib, pas une regex
    sur le texte : une borne dans un commentaire ne doit pas compter."""
    data = tomllib.loads(_PYPROJECT.read_text(encoding="utf-8"))
    project = data.get("project", {})
    specs: list[str] = list(project.get("dependencies", []))
    for extra in (project.get("optional-dependencies") or {}).values():
        specs.extend(extra)
    pins: dict[str, str] = {}
    for spec in specs:
        match = _SPEC_PIN_RE.match(spec.strip())
        if match:
            pins[_normalise(match.group(1))] = match.group(2)
    return pins


def _contradictions(req: dict[str, str], pyp: dict[str, str]) -> dict[str, tuple[str, str]]:
    """Les paquets présents dans LES DEUX et épinglés à deux versions différentes.

    Une seule implémentation, partagée par l'assertion réelle et par ses deux
    contrôles : une garde dont le contrôle ne passe pas par le même code que
    l'assertion ne prouve rien de l'assertion.
    """
    return {n: (pyp[n], req[n]) for n in sorted(set(req) & set(pyp)) if pyp[n] != req[n]}


def test_la_garde_lit_les_deux_fichiers() -> None:
    """Sans corpus, l'assertion de contradiction passerait au vert sur du vide."""
    assert _REQUIREMENTS.exists(), _REQUIREMENTS
    assert _PYPROJECT.exists(), _PYPROJECT
    req, pyp = _pins_requirements(), _pins_pyproject()
    assert len(req) >= 20, f"trop peu d'épinglages lus dans requirements.txt : {len(req)}"
    assert len(pyp) >= 20, f"trop peu d'épinglages lus dans pyproject.toml : {len(pyp)}"
    # Trois témoins que ce sont bien les fichiers du service IA, et que
    # l'intersection comparée n'est pas vide.
    communs = set(req) & set(pyp)
    assert {"anthropic", "instructor", "fastapi"} <= communs, sorted(communs)
    assert len(communs) >= 15, f"intersection trop maigre : {sorted(communs)}"


def test_la_garde_sait_dire_non() -> None:
    """La divergence réellement mesurée le 28/10/2026, rejouée sur un corpus SYNTHÉTIQUE.

    Volontairement indépendant des fichiers du dépôt : un contrôle qui lit le
    corpus réel hérite de son état, et dirait donc « je sais dire non » pour la
    mauvaise raison le jour où le dépôt est sain — ou l'inverse.
    """
    contradictions = _contradictions(
        {"anthropic": "0.52.0", "fastapi": "0.115.12"},
        {"anthropic": "2.1.0", "fastapi": "0.115.12"},
    )
    assert contradictions == {"anthropic": ("2.1.0", "0.52.0")}, contradictions


def test_un_paquet_epingle_dans_un_seul_fichier_ne_declenche_rien() -> None:
    """La garde ne doit pas attraper ce qu'elle ne vise pas (GA-26 ≠ listes identiques).

    `pydantic-core` et `starlette` sont dans ce cas sur le dépôt réel : déclarés
    dans `pyproject.toml` pour GA-193, absents de l'image.
    """
    contradictions = _contradictions(
        {"anthropic": "2.3.0"},
        {"anthropic": "2.3.0", "paquet-absent-de-l-image": "1.0.0"},
    )
    assert contradictions == {}, contradictions


def test_aucun_paquet_nest_epingle_a_deux_versions_differentes() -> None:
    contradictions = _contradictions(_pins_requirements(), _pins_pyproject())
    assert not contradictions, (
        "ces paquets sont épinglés à DEUX versions différentes — la version "
        "réellement installée dépend du fichier que la chaîne lit : "
        + ", ".join(f"{n} (pyproject={a}, requirements={b})" for n, (a, b) in contradictions.items())
        + ". Aligner les deux fichiers, ou n'épingler le paquet que dans un seul."
    )
