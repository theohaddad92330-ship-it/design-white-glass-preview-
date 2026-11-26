"""#3385.3 / #3385.12 (beta #3385, 30/09/2026) — les six formulations
STRATÉGIQUES de `main_sales_pain` (apps/web/.../questions/frein.ts) doivent
RÉELLEMENT changer ce que Laura diagnostique, pas rester du texte capté sans
lecteur : la doctrine du retour bêta est explicite — « ne pas les utiliser
uniquement comme texte ajouté à la fin d'un prompt ».

`CoachingInsights.main_weakness` (app/models/profile_context.py) est la
consigne qui dérive DIRECTEMENT le point de fragilité affiché de
`main_sales_pain` — c'est le même mécanisme qui prouve déjà les neuf
formulations historiques (`Trouver les bons comptes` → `Ciblage / scoring de
comptes`, etc.). Ce test prouve que les six nouvelles y sont mappées de la
même façon.
"""

from __future__ import annotations

from app.models.profile_context import CoachingInsights

_DESCRIPTION = CoachingInsights.model_fields["main_weakness"].description or ""

# Le pain (valeur EXACTE du catalogue) → un fragment de sa fragilité dérivée.
_NEW_STRATEGIC_MAPPINGS: dict[str, str] = {
    "Je manque de comptes qualifiés": "qualification",
    "Mes comptes sont ouverts mais ne s'étendent pas": "expansion",
    "Je manque de profils quand un besoin arrive": "staffing",
    "Mes marges se dégradent": "marge",
    "Toute l'activité dépend de quelques personnes": "dépendance",
    "Je manque de visibilité sur ce qui fonctionne": "pilotage",
}


def test_every_new_strategic_pain_is_named_in_the_main_weakness_consigne() -> None:
    for pain in _NEW_STRATEGIC_MAPPINGS:
        assert pain in _DESCRIPTION, f"« {pain} » n'apparaît pas dans la consigne main_weakness"


def test_every_new_strategic_pain_derives_a_distinct_weakness() -> None:
    for pain, weakness_fragment in _NEW_STRATEGIC_MAPPINGS.items():
        idx = _DESCRIPTION.index(pain)
        # Le fragment de fragilité dérivée doit être sur la MÊME ligne
        # (le motif `'<pain>' → '<fragilité>'` des neuf lignes historiques).
        line_end = _DESCRIPTION.index("\n", idx)
        line = _DESCRIPTION[idx:line_end]
        assert weakness_fragment.lower() in line.lower(), line
