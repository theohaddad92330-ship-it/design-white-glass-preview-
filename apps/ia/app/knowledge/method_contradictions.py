"""Le registre des contradictions entre sources méthodologiques, côté Python (#3382).

`packages/contracts/src/schemas/method-contradictions.ts` porte la hiérarchie
des six niveaux de source et, pour chaque contradiction trouvée dans le dépôt,
UNE décision par canal et par condition. `packages/` n'est pas dans le contexte
de build Railway de `apps/ia` : les DÉCISIONS (ce que Laura applique) sont
recopiées ici, et `tests/test_method_contradictions.py` les compare au JSON
`method-contradictions.runtime.json`, photo du registre TypeScript.

Les sources et leurs niveaux ne voyagent pas : aucun appelant ici n'en a
besoin, et une donnée morte de plus est ce que `method_corpus_governance.py`
refuse déjà. Appelant réel : `render_block()` dans `bellum_advisor.py`.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Decision:
    channels: tuple[str, ...]  # () = tous les canaux
    condition: str | None
    decision: str


@dataclass(frozen=True)
class Contradiction:
    contradiction_id: str
    title: str
    decisions: tuple[Decision, ...]


METHOD_CONTRADICTIONS: tuple[Contradiction, ...] = (
    Contradiction(
        "ouverture_j_espere_que_vous_allez_bien",
        "« J’espère que vous allez bien » en ouverture",
        (
            Decision(
                (),
                "premier contact sans historique",
                "Jamais en ouverture d’un premier contact : on commence par le pourquoi de ce message, adressé à cette personne.",
            ),
            Decision(
                (),
                "historique réel avec la personne",
                "Permis, seulement parce qu’un historique réel avec cette personne existe et peut être cité.",
            ),
        ),
    ),
    Contradiction(
        "script_appel_referencement_affirme",
        "« Nous sommes référencés » affirmé dans le script d’appel",
        (
            Decision(
                ("phone",),
                "référencement prouvé",
                "La phrase peut être dite, avec le nom du référencement réel.",
            ),
            Decision(
                ("phone",),
                "référencement non prouvé",
                "La phrase est retirée : aucun référencement n’est suggéré ni affirmé sans preuve.",
            ),
        ),
    ),
    Contradiction(
        "clause_aucune_demarche_commerciale",
        "« Ma démarche n’est pas commerciale » dans le script d’appel",
        (
            Decision(
                (),
                None,
                "La clause n’est jamais écrite ni dite : la démarche est commerciale et se présente comme telle.",
            ),
        ),
    ),
)

_CHANNEL_LABELS = {"phone": "téléphone", "email": "e-mail", "linkedin": "LinkedIn", "meeting": "rendez-vous"}


def render_block() -> str:
    """Le bloc de prompt : chaque contradiction connue et SA décision."""
    lines = [
        "CONTRADICTIONS ENTRE SOURCES — TRANCHÉES (#3382) : quand deux textes de méthode se contredisent, "
        "tu ne tranches jamais au hasard et jamais sur la proximité de quelques mots. Pour les cas ci-dessous la "
        "décision est écrite ; pour tout autre conflit sans décision écrite, tu le nommes à la personne au lieu de choisir en silence."
    ]
    for contradiction in METHOD_CONTRADICTIONS:
        lines.append(f"- {contradiction.title} :")
        for decision in contradiction.decisions:
            scope = ", ".join(_CHANNEL_LABELS[c] for c in decision.channels) or "tous canaux"
            when = f"{decision.condition} — " if decision.condition else ""
            lines.append(f"  · [{scope}] {when}{decision.decision}")
    return "\n".join(lines)
