"""Le compilateur d'expansion de compte (#2792, épopée « Account Expansion »,
issue source #2315).

Couvre le compilateur et son branchement dans `chat_tools.py`. Les huit
scénarios de la RECETTE de #2315.24 sont couverts par
`test_the_eight_recette_scenarios_do_not_crash_and_respect_guardrails` — pas
une intégration bout-en-bout (l'ingestion des quinze sources reste hors de
cette tranche), mais une preuve que chacun des huit cas nommés est un lead
valide, que les garde-fous s'appliquent uniformément, et que rien ne lève.
"""

from __future__ import annotations

import pytest

from app.services import chat_tools
from app.services.compilers.account_expansion_compiler import (
    COMPILE_ACCOUNT_EXPANSION_TOOL,
    EXPANSION_MAX_PROPOSALS,
    EXPANSION_OUTPUT_FIELDS,
    EXPANSION_PISTES,
    EXPANSION_SIGNAL_TYPES,
    EXPANSION_SOURCE_TYPES,
    expansion_guardrail_violations,
    expansion_priority_score,
)

USER = "22222222-2222-4222-8222-222222222222"
ACCOUNT = "44444444-4444-4444-8444-444444444444"


def _lead(**overrides: object) -> dict:
    base = {
        "piste": "ajouter_capacite_meme_equipe",
        "signal_type": "mission",
        "source_type": "missions_actives_et_terminees",
        "preuve_source": "Mission .NET en cours sur l'équipe reprise d'existant",
        "perimetre": "Même équipe, capacité supplémentaire",
        "interlocuteur": "Manager d'équipe déjà en contact",
        "valeur_apportee": "Capacité .NET prouvée sur ce périmètre exact",
        "relation_existante": "Manager d'équipe, contact hebdomadaire",
        "information_manquante": "Budget disponible pour une capacité de plus",
        "premiere_question": "L'équipe voisine a-t-elle le même problème de reprise d'existant ?",
        "risque": "Aucun budget ouvert avant le prochain trimestre",
        "prochaine_action": "Demander au manager si un besoin similaire existe",
    }
    base.update(overrides)
    return base


async def _run(name: str, payload: dict | None = None) -> dict:
    return await chat_tools.execute_chat_tool(name, payload or {}, user_id=USER, profile_data=None)


# ── Ce que le catalogue promet ───────────────────────────────────────────────


def test_the_tool_is_declared_in_the_catalogue() -> None:
    names = [str(tool["name"]) for tool in chat_tools.CHAT_TOOLS]
    assert "compile_account_expansion" in names


def test_no_probability_is_ever_promised() -> None:
    description = str(COMPILE_ACCOUNT_EXPANSION_TOOL["description"]).lower()
    assert "probabilité" in description
    assert "chance de closing" not in description
    assert "prévisionnel pondéré" not in description


def test_eight_pistes_eight_signals_fifteen_sources() -> None:
    # #2315 OBJECTIF / SOURCES / PISTES D'EXPANSION — les comptes exacts de
    # l'épopée, pas une approximation.
    assert len(EXPANSION_PISTES) == 8
    assert len(EXPANSION_SIGNAL_TYPES) == 8
    assert len(EXPANSION_SOURCE_TYPES) == 15
    assert len(EXPANSION_OUTPUT_FIELDS) == 9


# ── expansion_guardrail_violations — les DEUX garde-fous du NO-GO ───────────


def test_no_violation_on_a_clean_lead() -> None:
    assert expansion_guardrail_violations(_lead()) == []


def test_group_reference_claimed_without_confirmation_is_a_violation() -> None:
    # #2315.11/.25 — NO-GO : jamais mission locale présentée comme accès groupe.
    lead = _lead(claims_group_reference=True, group_reference_confirmed=False)
    assert "group_reference_not_confirmed" in expansion_guardrail_violations(lead)


def test_group_reference_claimed_with_confirmation_is_clean() -> None:
    lead = _lead(claims_group_reference=True, group_reference_confirmed=True)
    assert expansion_guardrail_violations(lead) == []


def test_manager_relationship_reused_without_requalification_is_a_violation() -> None:
    # #2315.15/.16 — une relation manager ne signifie pas sponsor groupe.
    lead = _lead(relies_on_manager_relationship=True, manager_relationship_requalified=False)
    assert "manager_relationship_not_requalified" in expansion_guardrail_violations(lead)


def test_manager_relationship_reused_with_requalification_is_clean() -> None:
    lead = _lead(relies_on_manager_relationship=True, manager_relationship_requalified=True)
    assert expansion_guardrail_violations(lead) == []


def test_both_violations_can_fire_together() -> None:
    lead = _lead(
        claims_group_reference=True,
        group_reference_confirmed=False,
        relies_on_manager_relationship=True,
        manager_relationship_requalified=False,
    )
    violations = expansion_guardrail_violations(lead)
    assert set(violations) == {"group_reference_not_confirmed", "manager_relationship_not_requalified"}


# ── expansion_priority_score — l'ORDRE de #2315 PRIORISATION ─────────────────


def test_priority_order_matches_the_epic_exactly() -> None:
    assert expansion_priority_score(_lead(is_logical_extension=True)) > expansion_priority_score(
        _lead(has_existing_relationship=True)
    )
    assert expansion_priority_score(_lead(has_existing_relationship=True)) > expansion_priority_score(
        _lead(has_reusable_proof=True)
    )
    assert expansion_priority_score(_lead(has_reusable_proof=True)) > expansion_priority_score(
        _lead(has_favorable_timing=True)
    )
    assert expansion_priority_score(_lead(has_favorable_timing=True)) > expansion_priority_score(
        _lead(is_low_commercial_cost=True)
    )


def test_zero_score_on_a_lead_with_no_priority_signal() -> None:
    assert expansion_priority_score(_lead()) == 0


# ── L'exécuteur — refuse plutôt que de deviner ───────────────────────────────


@pytest.mark.asyncio
async def test_a_missing_account_is_refused() -> None:
    result = await _run("compile_account_expansion", {"leads": [_lead()]})
    assert "error" in result


@pytest.mark.asyncio
async def test_empty_leads_are_refused() -> None:
    result = await _run("compile_account_expansion", {"account_id": ACCOUNT, "leads": []})
    assert "error" in result


@pytest.mark.asyncio
async def test_an_unknown_piste_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _dossier(_ids: list[str], _user_id: str) -> list[dict]:
        return [{"account_id": ACCOUNT, "company_name": "ACME"}]

    monkeypatch.setattr(chat_tools, "_owned_account_dossiers", _dossier)
    result = await _run(
        "compile_account_expansion", {"account_id": ACCOUNT, "leads": [_lead(piste="attaquer_le_groupe")]}
    )
    assert "error" in result


@pytest.mark.asyncio
async def test_an_incomplete_lead_is_refused_rather_than_completed(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _dossier(_ids: list[str], _user_id: str) -> list[dict]:
        return [{"account_id": ACCOUNT, "company_name": "ACME"}]

    monkeypatch.setattr(chat_tools, "_owned_account_dossiers", _dossier)
    lead = _lead()
    del lead["risque"]
    result = await _run("compile_account_expansion", {"account_id": ACCOUNT, "leads": [lead]})
    assert "error" in result
    assert "risque" in result["error"]


@pytest.mark.asyncio
async def test_an_account_outside_the_portfolio_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _no_dossier(_ids: list[str], _user_id: str) -> list[dict]:
        return []

    monkeypatch.setattr(chat_tools, "_owned_account_dossiers", _no_dossier)
    result = await _run("compile_account_expansion", {"account_id": "not-mine", "leads": [_lead()]})
    # #3195 — le refus garde son message exact, et porte désormais le geste
    # suivant : « introuvable » n'est jamais une impasse.
    assert result["error"] == "Ce compte est introuvable dans votre portefeuille."
    assert "web_search" in result["next_step"]


@pytest.mark.asyncio
async def test_a_guardrail_violation_is_rejected_never_proposed(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _dossier(_ids: list[str], _user_id: str) -> list[dict]:
        return [{"account_id": ACCOUNT, "company_name": "ACME"}]

    monkeypatch.setattr(chat_tools, "_owned_account_dossiers", _dossier)
    lead = _lead(piste="filiale_comparable", claims_group_reference=True, group_reference_confirmed=False)
    result = await _run("compile_account_expansion", {"account_id": ACCOUNT, "leads": [lead]})
    assert result["leads"] == []
    assert len(result["rejected"]) == 1
    assert result["rejected"][0]["guardrail_violations"] == ["group_reference_not_confirmed"]


@pytest.mark.asyncio
async def test_clean_leads_are_prioritised_and_capped_at_three(monkeypatch: pytest.MonkeyPatch) -> None:
    # #2315 PRIORISATION — « ne pas proposer dix cross-sells simultanément » :
    # cinq pistes saines n'en rendent jamais plus de trois.
    async def _dossier(_ids: list[str], _user_id: str) -> list[dict]:
        return [{"account_id": ACCOUNT, "company_name": "ACME"}]

    monkeypatch.setattr(chat_tools, "_owned_account_dossiers", _dossier)
    leads = [_lead(piste=piste, is_logical_extension=(piste == "filiale_comparable")) for piste in EXPANSION_PISTES[:5]]
    result = await _run("compile_account_expansion", {"account_id": ACCOUNT, "leads": leads})
    assert len(result["leads"]) == EXPANSION_MAX_PROPOSALS
    assert result["deprioritized_count"] == 5 - EXPANSION_MAX_PROPOSALS
    # La piste marquée « extension logique » passe EN TÊTE.
    assert result["leads"][0]["piste"] == "filiale_comparable"


@pytest.mark.asyncio
async def test_company_name_and_account_travel_to_the_result(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _dossier(_ids: list[str], _user_id: str) -> list[dict]:
        return [{"account_id": ACCOUNT, "company_name": "ACME"}]

    monkeypatch.setattr(chat_tools, "_owned_account_dossiers", _dossier)
    result = await _run("compile_account_expansion", {"account_id": ACCOUNT, "leads": [_lead()]})
    assert result["account_id"] == ACCOUNT
    assert result["company_name"] == "ACME"
    assert result["leads"][0]["piste"] == "ajouter_capacite_meme_equipe"
    assert result["leads"][0]["risque"] == "Aucun budget ouvert avant le prochain trimestre"


# ── #2315.24 — la RECETTE, huit scénarios nommés ────────────────────────────


_RECETTE_SCENARIOS: tuple[tuple[str, dict], ...] = (
    ("mission active", _lead(piste="ajouter_capacite_meme_equipe", signal_type="mission", has_reusable_proof=True)),
    ("mission terminée", _lead(piste="capitaliser_preuve", signal_type="preuve", has_reusable_proof=True)),
    (
        "satisfaction inconnue",
        _lead(
            piste="renouveler_mission", signal_type="satisfaction", information_manquante="Satisfaction jamais mesurée"
        ),
    ),
    (
        "manager parti",
        _lead(
            piste="remonter_direction_commune",
            signal_type="manager",
            relies_on_manager_relationship=True,
            manager_relationship_requalified=False,
        ),
    ),
    (
        "filiale sœur",
        _lead(
            piste="filiale_comparable",
            signal_type="filiale_similaire",
            source_type="entites",
            claims_group_reference=True,
            group_reference_confirmed=False,
        ),
    ),
    (
        "plusieurs compétences",
        _lead(piste="expertise_complementaire", signal_type="consultant", source_type="competences_livrees"),
    ),
    (
        "renouvellement proche",
        _lead(
            piste="renouveler_mission", signal_type="mission", source_type="renouvellement", has_favorable_timing=True
        ),
    ),
    (
        "aucun REX",
        _lead(
            piste="ouvrir_equipe_adjacente",
            signal_type="besoin_adjacent",
            source_type="rex",
            information_manquante="Aucun REX disponible",
        ),
    ),
)


@pytest.mark.asyncio
@pytest.mark.parametrize("scenario_name,lead", _RECETTE_SCENARIOS)
async def test_the_eight_recette_scenarios_do_not_crash_and_respect_guardrails(
    scenario_name: str, lead: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def _dossier(_ids: list[str], _user_id: str) -> list[dict]:
        return [{"account_id": ACCOUNT, "company_name": "ACME"}]

    monkeypatch.setattr(chat_tools, "_owned_account_dossiers", _dossier)
    result = await _run("compile_account_expansion", {"account_id": ACCOUNT, "leads": [lead]})
    assert "error" not in result, f"scénario « {scenario_name} » a échoué : {result}"
    # Le scénario « manager parti » et « filiale sœur » portent chacun une
    # violation délibérée : la piste doit être REJETÉE, jamais montrée.
    if scenario_name in ("manager parti", "filiale sœur"):
        assert result["leads"] == []
        assert len(result["rejected"]) == 1
    else:
        assert len(result["leads"]) == 1
        assert result["rejected"] == []
