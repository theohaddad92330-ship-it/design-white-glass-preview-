"""#3422 (LOT G01, retour bêta 30/09/2026) — reste de la recette prod
(commentaire « NON PROUVÉ ») sur le jeu de tests métier de référence :
profils #1 (fondateur de 3 consultants demandant 100 comptes) et #17
(données contradictoires).

Les 19 autres profils de #3422 sont couverts ailleurs (voir le commentaire
de recette du lot C18, #3422#issuecomment-5907794565) ; ce fichier prouve
les deux qui restaient nommés « reste » ou « non vérifié avec certitude ».
"""

from __future__ import annotations

import pytest

from app.services import chat_tools

USER = "77777777-7777-4777-8777-777777777777"


# ── Profil #1 — fondateur de 3 consultants demandant 100 comptes ───────────
#
# Le commentaire de recette du lot C18 disait : « aucun garde-fou
# volume-vs-capacité dans le code ; le seuil "100 comptes pour 3 consultants"
# n'est écrit nulle part ». C'était vrai au moment de cette recette (08:59) :
# `detect_capacity_overreach` (#3392.2) n'avait été livré que deux minutes
# plus tôt par un lot CONCURRENT (C04, 08:57) sur une branche séparée, pas
# encore visible depuis C18. Il est maintenant sur `main` (ancêtre confirmé
# de 26755bbac3) : le garde-fou EXISTE, et ce test le prouve sur le profil
# EXACT nommé par #3422.1 — un plafond FIXE (`_ACCOUNT_SEARCH_MAX_ITEMS`),
# pas calibré sur l'effectif consultant (aucune doctrine ne le demande :
# #3428, « tranché sans Louis », refuse déjà un nombre fixe imposé côté
# sprint — un second seuil dérivé de l'effectif serait la même chose
# inventée d'un cran plus bas).


@pytest.mark.asyncio
async def test_3422_1_founder_of_three_asking_for_100_accounts_is_challenged(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_search(_tool_input: dict, *, profile_data: dict | None, space_key: str | None = None) -> dict:
        return {"items": [], "criteria": {}}

    monkeypatch.setattr(chat_tools, "_run_account_search", _fake_search)
    result = await chat_tools.execute_chat_tool(
        "run_account_search",
        {"sectors": ["it"], "limit": 100},
        user_id=USER,
        # Le profil nommé par l'issue : un fondateur, trois consultants sur le bench.
        profile_data={"esn_name": "Petite ESN", "team_size": 3, "geo_zones": ["National (toute la France)"]},
    )
    assert result["challenge"]["case"] == "action dont le coût dépasse la valeur probable"
    assert "100" in result["challenge"]["problem"]


# ── Profil #17 — données contradictoires ────────────────────────────────────
#
# Le commentaire de recette du lot C18 disait : « non vérifié avec certitude
# dans le budget imparti ». `assess_identity` (`identity_resolution.py`)
# EST ce mécanisme : quand le registre légal et les données collectées sur
# le web se contredisent sur le même périmètre (taille, secteur), il ne les
# rapproche pas silencieusement — il distingue homonyme (contradiction
# forte, registre distrust) d'incertain (contradiction faible, nommée).
# Appelant réel : `app/routers/phase1_research.py:1293`.


def test_3422_17_contradictory_registry_and_web_data_is_not_silently_merged() -> None:
    from app.services.identity_resolution import assess_identity

    # Le registre voit une TPE de 6 à 9 salariés dans le transport fluvial ;
    # le web décrit un groupe industriel de défense de 12 000 salariés — même
    # nom, même périmètre visé, deux réalités qui ne peuvent pas coexister
    # sans être nommées (même mécanisme que le retour Thales, données
    # fictives distinctes ici).
    result = assess_identity(
        target_name="Atlas Systems",
        web={
            "sector": "Défense, aérospatiale et électronique",
            "employees": "12 000",
            "description": "Groupe industriel mondial spécialisé dans la défense.",
            "subsidiaries_count": 6,
        },
        registry={
            "legal_name": "Atlas Systems",
            "naf_label": "Transports fluviaux de fret",
            "headcount_label": "6 à 9 salariés",
            "headcount_max": 9,
            "subsidiaries_count": 0,
            "branch_count": 1,
        },
    )
    assert result.status in ("homonyme", "uncertain")
    assert result.use_registry_data is False
