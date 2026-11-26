"""#2118.8-.18 — la lecture du compte (`dossier_read`, verdict en sept axes) lit
le profil de l'ESN QUI VEND, pas seulement le compte.

Geste empêché : deux ESN différentes — une parisienne de 40 personnes, une
lyonnaise de 800 — reçoivent le MÊME verdict sur le même compte. Le verdict ne
peut différer que si le texte envoyé au modèle diffère : ce test exécute la
vraie phase 4 (`_plan`, `call_claude` mocké) et relit le prompt de l'appel
`bellum_plan_evaluation`, celui qui rend `dossier_read`.

Et une donnée absente se DIT (« non renseigné ») — jamais une valeur devinée,
jamais « 0 ».
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.models.plan import PlanRequest

PARIS_40 = {
    "companyName": "Seine Conseil",
    "size": "40",
    "offers": ["Data", "Cloud"],
    "sectors": ["Banque"],
    "references": ["BNP Paribas — migration data"],
    "geoZone": "Paris & Île-de-France",
    "sellerRole": "Fondateur qui vend seul",
    "rampUpCapacity": "Immédiate < 1 semaine",
    "consultantsOnMission": "31-80",
    "consultantsInPipe": "0",
}

LYON_800 = {
    "companyName": "Rhône Ingénierie",
    "size": "800",
    "offers": ["Cybersécurité"],
    "sectors": ["Industrie"],
    "references": ["Seb — SOC managé"],
    "geoZone": "Auvergne-Rhône-Alpes",
    "sellerRole": "Directeur commercial",
    "rampUpCapacity": "1-2 mois",
    "consultantsOnMission": "500+",
    "consultantsInPipe": "81-200",
}


async def _evaluation_prompts(monkeypatch, profile: dict, **extra) -> tuple[str, str]:
    """Exécute `_plan` et rend (système, utilisateur) de l'appel d'évaluation."""
    from app.routers import phase4_plan

    calls: dict[str, tuple[str, str]] = {}

    async def fake_call_claude(system, user, **kwargs):
        name = str(kwargs.get("prompt_name", ""))
        calls[name] = (system, user)
        if name == "bellum_messages":
            return {"messages": []}, None
        return {}, None

    monkeypatch.setattr(phase4_plan, "call_claude", fake_call_claude)
    monkeypatch.setattr(phase4_plan.rag_service, "retrieve_knowledge_context", AsyncMock(return_value=""))
    monkeypatch.setattr(phase4_plan.rag_knowledge, "retrieve_reranked_context", AsyncMock(return_value=""))
    monkeypatch.setattr(phase4_plan, "measure_self_consistency", AsyncMock(return_value=(None, [])))

    req = PlanRequest(
        account_id="acc-1",
        account_data={"sector": "Banque", "angles": [{"angle": "Modernisation SI"}]},
        contacts=[{"fullName": "Jean Dupont", "title": "DSI"}],
        profile_data=profile,
        **extra,
    )
    await phase4_plan._plan(req)
    assert "bellum_plan_evaluation" in calls, f"appel d'évaluation non capturé : {sorted(calls)}"
    return calls["bellum_plan_evaluation"]


@pytest.mark.asyncio
async def test_two_esns_send_two_different_evaluation_prompts(monkeypatch):
    paris_system, _ = await _evaluation_prompts(monkeypatch, PARIS_40)
    lyon_system, _ = await _evaluation_prompts(monkeypatch, LYON_800)
    assert paris_system != lyon_system
    for profile, system in ((PARIS_40, paris_system), (LYON_800, lyon_system)):
        # .8 profil entreprise · .11 offre · .12 références · .13 taille · .14 territoire
        assert profile["companyName"] in system
        assert f"Taille : {profile['size']} consultants" in system
        for offer in profile["offers"]:
            assert offer in system
        assert profile["references"][0] in system
        assert f"Territoire : {profile['geoZone']}" in system
        # .10 rôle · .15 capacité — lus par le prompt de lecture, pas seulement par Laura
        assert f"Role du commercial : {profile['sellerRole']}" in system
        assert f"Capacite de demarrage : {profile['rampUpCapacity']}" in system
        # .15 capacité DISPONIBLE — pas l'effectif total
        assert f"Consultants en mission : {profile['consultantsOnMission']}" in system
        assert f"Vivier actif : {profile['consultantsInPipe']}" in system


@pytest.mark.asyncio
async def test_absent_seller_fields_are_named_not_guessed(monkeypatch):
    system, user = await _evaluation_prompts(monkeypatch, {"companyName": "MonESN", "offers": ["Cloud"]})
    assert "Territoire : non renseigne" in system
    assert "Taille : non renseignee" in system
    assert "Role du commercial : non renseigne" in system
    assert "Capacite de demarrage : non renseignee" in system
    assert "Consultants en mission : non renseigne" in system
    assert "Vivier actif : non renseigne" in system
    # Jamais une valeur de remplissage qui se lirait comme une donnée.
    assert "N/A consultants" not in system
    assert "Zone geo : N/A" not in system
    # La consigne de lecture dit quoi faire d'un champ non renseigné.
    assert "non renseigne" in user


@pytest.mark.asyncio
async def test_evaluation_prompt_asks_to_cite_role_and_capacity(monkeypatch):
    _, user = await _evaluation_prompts(monkeypatch, PARIS_40)
    why = user.split("- why_for_your_esn :", 1)[1].split("\n", 1)[0]
    assert "role" in why
    assert "capacite" in why


@pytest.mark.asyncio
async def test_account_history_and_workspace_corrections_reach_the_evaluation(monkeypatch):
    # .17 historique du compte · .18 corrections du workspace — déjà câblés
    # (zero_layer_block, feedback_directives_block) ; ce test l'EXÉCUTE sur
    # l'appel qui rend le verdict, pas sur un appel voisin.
    history = "Rendez-vous perdu en mars 2026 : le DSI a choisi un prestataire en place."
    feedback = "- [contact] « Jean Dupont » signalé OBSOLÈTE par l'utilisateur (2026-07-08)"
    system, _ = await _evaluation_prompts(
        monkeypatch,
        PARIS_40,
        internal_history=history,
        account_feedback=feedback,
    )
    assert history in system
    assert feedback in system
