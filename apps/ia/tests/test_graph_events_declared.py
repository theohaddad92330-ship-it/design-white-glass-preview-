"""Garde incident #428 — aucun event de graphe non déclaré.

Tout event que le graphe IA peut émettre DOIT être modélisé par l'union
discriminée ``graphEventSchema`` du paquet ``@bellum/contracts``
(``packages/contracts/src/schemas/graph-events.ts``) : le consommateur parse
chaque frame, donc un type non modélisé est au mieux ignoré (et son contenu
perdu), au pire — avant que la politique de dégradation n'existe — faisait
crasher un run déjà terminé (incident judge #428). Ce test croise statiquement
les émissions du graphe Python avec l'union TypeScript pour attraper la dérive
AVANT la prod.

Depuis que ``data`` est typé par event (au lieu d'un ``z.record`` opaque), ce
test garde une deuxième propriété : ``KNOWN_EVENT_TYPES`` — la liste qui décide
« je connais » vs « j'ignore poliment » — doit rester alignée sur les membres de
l'union. Les deux se désynchronisent silencieusement sinon : un type présent dans
l'un et pas l'autre serait soit rejeté à tort, soit ignoré à tort.

Le chantier self-consistency (A1) n'ajoute AUCUN event de graphe — son bloc
voyage dans la sortie de la phase plan (``data.output.plan.selfConsistency``),
jamais comme un nouveau type d'event. Ce test le verrouille.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.graph import events as graph_events

_IA_ROOT = Path(__file__).resolve().parents[1]  # apps/ia
_GRAPH_DIR = _IA_ROOT / "app" / "graph"
_WORKER_SCHEMA = (
    _IA_ROOT.parents[1] / "packages" / "contracts" / "src" / "schemas" / "graph-events.ts"
)

# type=<litéral> dans une construction GraphEvent(...).
_LITERAL_TYPE_RE = re.compile(r"GraphEvent\((?:[^)]*?)type=\"([a-z_]+)\"", re.S)
# type=<CONSTANTE> (ex. JUDGE_COMPLETED) — résolue sur app.graph.events.
_CONST_TYPE_RE = re.compile(r"GraphEvent\((?:[^)]*?)type=([A-Z][A-Z_]+)", re.S)


def _emitted_types() -> set[str]:
    emitted: set[str] = set()
    for py in sorted(_GRAPH_DIR.glob("*.py")):
        src = py.read_text(encoding="utf-8")
        emitted |= set(_LITERAL_TYPE_RE.findall(src))
        for const in _CONST_TYPE_RE.findall(src):
            value = getattr(graph_events, const, None)
            assert isinstance(value, str), (
                f"{py.name} émet GraphEvent(type={const}) mais la constante n'est pas "
                f"résolvable dans app.graph.events — le test ne peut pas la vérifier."
            )
            emitted.add(value)
    return emitted


def _declared_types() -> set[str]:
    """Les membres de l'union discriminée — un ``type: z.literal('…')`` par event."""
    src = _WORKER_SCHEMA.read_text(encoding="utf-8")
    declared = set(re.findall(r"type:\s*z\.literal\('([a-z_]+)'\)", src))
    assert declared, "aucun membre d'union trouvé dans graph-events.ts"
    return declared


def _known_types() -> set[str]:
    """La liste qui pilote la dégradation : connu → parse strict, inconnu → ignoré."""
    src = _WORKER_SCHEMA.read_text(encoding="utf-8")
    match = re.search(r"KNOWN_EVENT_TYPES\s*=\s*new Set<string>\(\[(.*?)\]\)", src, re.S)
    assert match, "KNOWN_EVENT_TYPES introuvable dans graph-events.ts"
    return set(re.findall(r"'([a-z_]+)'", match.group(1)))


def test_graph_emits_at_least_the_known_event_types() -> None:
    emitted = _emitted_types()
    assert {"phase_completed", "phase_skipped", "phase_failed", "run_completed", "run_failed"} <= emitted


def test_every_emitted_graph_event_is_declared_in_the_worker_schema() -> None:
    if not _WORKER_SCHEMA.exists():
        pytest.skip("worker schema absent (déploiement IA standalone)")
    emitted = _emitted_types()
    declared = _declared_types()
    undeclared = emitted - declared
    assert not undeclared, (
        f"Events de graphe émis mais NON modélisés dans graphEventSchema (incident #428) : "
        f"{sorted(undeclared)}. Ajoute-leur un membre d'union dans "
        f"packages/contracts/src/schemas/graph-events.ts AVANT de les émettre — "
        f"sinon le consommateur les ignore et leur contenu est perdu en silence."
    )


def test_known_event_types_matches_the_union_members() -> None:
    """Les deux listes décrivent le même ensemble, vues sous deux angles.

    ``KNOWN_EVENT_TYPES`` décide accepter-vs-ignorer AVANT le parse ; l'union
    décide de la forme APRÈS. Un type dans l'union mais absent de la liste serait
    ignoré alors qu'on sait le lire ; l'inverse serait parsé par une union qui ne
    le connaît pas, donc rejeté comme malformé — un run cassé par une faute de
    frappe.
    """
    if not _WORKER_SCHEMA.exists():
        pytest.skip("contrats absents (déploiement IA standalone)")
    assert _known_types() == _declared_types()
