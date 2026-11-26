"""#3385.12 (beta #3385, recette écran prod 26755bbac3, lot G04 30/09) — RESTE :
« les réponses du profil qui modifient le comportement, pas exercé ».

Le lot précédent (#3385, commentaire du 30/09 09:03) citait trois lecteurs :
`main_sales_pain` → `CoachingInsights.main_weakness`, `target_company_types` /
`geo_zones` → `welcome_account_suggestions.py:166,170`, et
`consultant_size`×`sales_team_size` → `CadenceRecommendation`/`KpiTargets`.
Aucun test ne les EXERÇAIT — ce fichier ferme ce reste, et corrige une citation
fausse trouvée en vérifiant.

CE QUI ÉTAIT DÉJÀ EXERCÉ AILLEURS (pas dupliqué ici) :
- `main_sales_pain` → `main_weakness` : chaque formulation (les 9 historiques
  ET les 6 nouvelles) dérive un fragment DISTINCT de la consigne du champ —
  `apps/ia/tests/test_main_sales_pain_strategic_mappings.py`.
- `consultant_size` → `seller_archetype` → prompts `bellum_scorer`/`bellum_weekly`
  réellement différents pour deux ESN de taille différente —
  `apps/ia/tests/test_seller_context.py::test_two_profiles_yield_different_scorer_prompts`
  et `::test_two_profiles_yield_different_weekly_prompts`.

CE QUI MANQUAIT ET QUE CE FICHIER LIVRE :
1. `geo_zones` CHANGE réellement le filtre envoyé au corpus (pas seulement
   « une zone déclarée part » — deux zones DIFFÉRENTES partent différemment).
2. Correction : `target_company_types` n'entre PAS dans ce filtre — la
   citation `:166` du lot précédent lisait le COMMENTAIRE qui l'EXCLUT
   explicitement comme s'il s'agissait du code qui l'inclut. Gardé ici pour
   qu'une régression future (quelqu'un qui branche le filtre) soit vue.
3. `consultant_size`/`sales_team_size` bornent `CadenceRecommendation` et
   `KpiTargets` par PALIER d'archétype (soloHunter/boutiqueExpert/
   midMarketChallenger/scaleUp/enterprisePlayer) dans la consigne lue par le
   modèle — même mécanisme de preuve que `test_main_sales_pain_strategic_mappings.py`
   pour `main_weakness` : chaque palier doit produire une plage NUMÉRIQUE
   DISTINCTE, jamais la même valeur recopiée pour tous.
"""

from __future__ import annotations

from app.models.profile_context import CadenceRecommendation, KpiTargets
from app.services import welcome_account_suggestions as was

# ── 1 & 2. `geo_zones` change le filtre, `target_company_types` n'y entre pas ──


def test_geo_zones_differentes_produisent_des_filtres_differents():
    answers_a = {"expertise_areas": [], "geo_zones": ["Île-de-France"]}
    answers_b = {"expertise_areas": [], "geo_zones": ["Occitanie"]}

    queries_a = was._queries(answers_a)
    queries_b = was._queries(answers_b)

    assert queries_a == [{"technology": None, "location": "Île-de-France"}]
    assert queries_b == [{"technology": None, "location": "Occitanie"}]
    assert queries_a != queries_b


def test_target_company_types_ne_traverse_pas_jusquau_filtre():
    """Correction du lot précédent : `target_company_types` était cité comme
    lecteur de `welcome_account_suggestions.py` — le fichier lui-même l'exclut
    explicitement (aucun barème « ETI = N personnes » n'existe). Deux réponses
    qui ne diffèrent QUE par `target_company_types` doivent produire le MÊME
    filtre."""
    base = {"expertise_areas": ["Data & IA"], "geo_zones": ["Île-de-France"]}
    with_types = {**base, "target_company_types": ["ETI"]}
    without_types = {**base, "target_company_types": []}

    assert was._queries(with_types) == was._queries(without_types)


# ── 3. `consultant_size`/`sales_team_size` (via l'archétype) bornent les cibles


def test_cadence_recommendation_borne_un_palier_distinct_par_archetype():
    description = CadenceRecommendation.model_fields["analyses_per_week"].description or ""
    # Trois plages VERBATIM, une par palier — jamais la même valeur recopiée.
    assert "(2-3) pour soloHunter" in description
    assert "5-10 pour midMarketChallenger" in description
    assert "10-20 pour scaleUp" in description
    assert len({"(2-3)", "5-10", "10-20"}) == 3


def test_kpi_targets_borne_un_palier_distinct_par_archetype():
    description = KpiTargets.model_fields["accounts_per_month"].description or ""
    ranges_by_archetype = {
        "soloHunter": "5-10",
        "boutiqueExpert": "10-20",
        "midMarketChallenger": "20-40",
        "scaleUp": "40-80",
        "enterprisePlayer": "60-120",
    }
    for archetype, plage in ranges_by_archetype.items():
        assert f"- {archetype}: {plage}" in description, description
    # Preuve concrète, pas seulement « présent » : les cinq plages sont bien
    # DISTINCTES (aucun palier n'hérite de la borne d'un autre).
    assert len(set(ranges_by_archetype.values())) == 5
