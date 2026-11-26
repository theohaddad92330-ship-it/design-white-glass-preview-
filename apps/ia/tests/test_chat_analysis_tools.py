"""Lancer une analyse depuis la conversation — #1489.

Ce que ces tests tiennent n'est pas le succès d'un lancement, c'est **l'ORDRE**
et **la liberté de ne pas répondre** :

- préparer, puis lancer, et le second n'accepte qu'un jeton que seul le premier
  produit — donc « on demande d'abord » est la forme du chemin, pas une consigne
  de prompt qu'un modèle pourrait sauter ;
- « go » sans avoir répondu à quoi que ce soit est un cas NORMAL, décidé par
  Louis le 05/09 ;
- aucune réponse n'est inventée : une question sans réponse n'a pas de clé.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool

USER = "11111111-1111-1111-1111-111111111111"


def _tool(name: str) -> dict:
    return next(tool for tool in CHAT_TOOLS if tool["name"] == name)


def test_registry_exposes_both_tools_in_order():
    """L'ordre compte : le modèle lit la liste, et « préparer » précède « lancer »."""
    names = [tool["name"] for tool in CHAT_TOOLS]
    assert "plan_account_analysis" in names
    assert "start_account_analysis" in names
    assert names.index("plan_account_analysis") < names.index("start_account_analysis")


def test_start_requires_the_plan_token_in_its_schema():
    """Le jeton est OBLIGATOIRE au schéma : le modèle ne peut pas l'omettre."""
    assert set(_tool("start_account_analysis")["input_schema"]["required"]) == {"company", "plan_token"}


def test_plan_description_says_the_answers_are_optional():
    """« Go » sans avoir tout répondu doit être DIT au modèle, sinon il insiste."""
    description = _tool("plan_account_analysis")["description"]
    assert "go" in description.lower()


def test_plan_description_routes_a_named_company_with_a_focus_to_search(monkeypatch):
    """#2892 (27/09) — recette prod : « ouvre l'analyse de Doctolib avec un focus
    sur les signaux de recrutement » (entreprise NOMMÉE + focus structuré)
    tombait sur `plan_account_analysis` (refus `plan_required`, texte de
    contrôle exposé), au lieu du preset `/search` — sans rien débiter. La
    description doit dire explicitement où renvoyer ce cas."""
    description = _tool("plan_account_analysis")["description"]
    assert "/search" in description
    assert "focus" in description.lower()


def test_search_preset_digest_names_the_named_company_plus_focus_case():
    """Même point, côté `/search` : le lien doit se savoir la bonne
    destination pour « entreprise nommée + focus », pas seulement le décrire
    par ses champs."""
    from app.services.chat_tools import GUIDED_ACTION_TOOL

    description = GUIDED_ACTION_TOOL["description"]
    assert "plan_account_analysis" in description
    assert "focus" in description.lower()


@pytest.mark.asyncio
async def test_plan_refuses_without_a_company_name():
    result = await execute_chat_tool("plan_account_analysis", {}, user_id=USER, profile_data=None)
    assert "error" in result


@pytest.mark.asyncio
async def test_plan_says_it_cannot_when_the_bridge_is_not_configured(monkeypatch):
    """Pont éteint ⇒ on le DIT. Pas de faux « lancé », pas de silence."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: False)
    result = await execute_chat_tool("plan_account_analysis", {"company": "OGF"}, user_id=USER, profile_data=None)
    assert "error" in result


@pytest.mark.asyncio
async def test_plan_returns_what_the_bridge_says(monkeypatch):
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def fake_plan(user_id, *, company, locale="fr"):
        assert user_id == USER and company == "OGF"
        return {"questions": [{"field": "notes", "question": "Que sais-tu ?"}], "planToken": "tok", "costCredits": 1}

    monkeypatch.setattr(bellum_api, "plan_account_analysis", fake_plan)
    result = await execute_chat_tool("plan_account_analysis", {"company": "OGF"}, user_id=USER, profile_data=None)
    assert result["planToken"] == "tok"
    assert result["questions"][0]["field"] == "notes"


@pytest.mark.asyncio
async def test_start_without_a_token_tells_the_model_what_to_do():
    """Le message doit dire quoi FAIRE — sinon le modèle réessaie le même appel."""
    result = await execute_chat_tool("start_account_analysis", {"company": "OGF"}, user_id=USER, profile_data=None)
    assert "plan_account_analysis" in result["error"]


@pytest.mark.asyncio
async def test_start_passes_no_answers_when_the_user_just_said_go(monkeypatch):
    """⚠️ LA DÉCISION DE LOUIS : zéro réponse est un cas normal, pas une erreur."""
    seen: dict = {}

    async def fake_start(user_id, *, company, plan_token, preset=None, answers=None, **_scope):
        seen.update({"company": company, "token": plan_token, "answers": answers})
        return {"accountId": "acc-1", "launched": True}

    monkeypatch.setattr(bellum_api, "start_account_analysis", fake_start)
    result = await execute_chat_tool(
        "start_account_analysis",
        {"company": "OGF", "plan_token": "tok"},
        user_id=USER,
        profile_data=None,
    )
    assert result["launched"] is True
    assert seen["answers"] is None


@pytest.mark.asyncio
async def test_start_flattens_answers_and_drops_the_empty_ones(monkeypatch):
    """Le modèle rend parfois des nombres ou des vides ; le contexte n'accepte que du texte."""
    seen: dict = {}

    async def fake_start(user_id, *, company, plan_token, preset=None, answers=None, **_scope):
        seen["answers"] = answers
        return {"accountId": "acc-1", "launched": True}

    monkeypatch.setattr(bellum_api, "start_account_analysis", fake_start)
    await execute_chat_tool(
        "start_account_analysis",
        {
            "company": "OGF",
            "plan_token": "tok",
            "answers": {"notes": "Refonte SI RH", "vide": "   ", "chiffre": 42},
        },
        user_id=USER,
        profile_data=None,
    )
    assert seen["answers"] == {"notes": "Refonte SI RH", "chiffre": "42"}


# #2624.1 — le territoire, la taille et les exclusions n'avaient AUCUN champ
# dans ce schéma d'outil : un modèle qui les disait dans la conversation les
# perdait avant même d'atteindre `bellum_api`.
@pytest.mark.asyncio
async def test_start_passes_territory_headcount_and_exclusions_through(monkeypatch):
    seen: dict = {}

    async def fake_start(
        user_id,
        *,
        company,
        plan_token,
        preset=None,
        answers=None,
        territory=None,
        headcount_min=None,
        headcount_max=None,
        siren=None,
        exclusions=None,
    ):
        seen.update(
            {
                "territory": territory,
                "headcount_min": headcount_min,
                "headcount_max": headcount_max,
                "exclusions": exclusions,
            }
        )
        return {"accountId": "acc-1", "launched": True}

    monkeypatch.setattr(bellum_api, "start_account_analysis", fake_start)
    result = await execute_chat_tool(
        "start_account_analysis",
        {
            "company": "OGF",
            "plan_token": "tok",
            "territory": "france",
            "headcount_min": 50,
            "headcount_max": 999,
            "exclusions": ["OGF Pompes Funèbres"],
        },
        user_id=USER,
        profile_data=None,
    )
    assert result["launched"] is True
    assert seen == {
        "territory": "france",
        "headcount_min": 50,
        "headcount_max": 999,
        "exclusions": ["OGF Pompes Funèbres"],
    }


@pytest.mark.asyncio
async def test_start_omits_territory_headcount_and_exclusions_when_absent(monkeypatch):
    """Absent ⇒ rien ne voyage : un lancement sans cadrage reste identique à avant."""
    seen: dict = {}

    async def fake_start(user_id, *, company, plan_token, **kwargs):
        seen.update(kwargs)
        return {"accountId": "acc-1", "launched": True}

    monkeypatch.setattr(bellum_api, "start_account_analysis", fake_start)
    await execute_chat_tool(
        "start_account_analysis",
        {"company": "OGF", "plan_token": "tok"},
        user_id=USER,
        profile_data=None,
    )
    assert seen.get("territory") is None
    assert seen.get("headcount_min") is None
    assert seen.get("headcount_max") is None
    assert seen.get("exclusions") is None


@pytest.mark.asyncio
async def test_start_never_exposes_the_raw_bridge_error_code(monkeypatch):
    """#2892 (27/09) — recette prod : un jeton absent/périmé rend
    `{"error": "plan_required", "message": "…"}` côté pont (`analysisStart`,
    `copilot-bridge.controller.ts:631`) ; Laura a répété `plan_required` telle
    quelle dans sa réponse. `error` doit porter la PHRASE, jamais le code."""

    async def fake_start(user_id, *, company, plan_token, **_kwargs):
        return {"error": "plan_required", "message": "Prépare d’abord l’analyse — le jeton est absent ou périmé."}

    monkeypatch.setattr(bellum_api, "start_account_analysis", fake_start)
    result = await execute_chat_tool(
        "start_account_analysis",
        {"company": "OGF", "plan_token": "tok"},
        user_id=USER,
        profile_data=None,
    )
    assert result["error"] == "Prépare d’abord l’analyse — le jeton est absent ou périmé."
    assert result["error_code"] == "plan_required"
    assert "plan_required" not in result["error"]


@pytest.mark.asyncio
async def test_start_leaves_a_plain_sentence_error_untouched(monkeypatch):
    """Filet : une erreur déjà écrite pour un lecteur humain (pas de `message`
    séparé, ou `error` qui n'a pas la forme d'un code) ne perd rien."""

    async def fake_start(user_id, *, company, plan_token, **_kwargs):
        return {"error": "Ton rôle dans l’espace ne permet pas de lancer une analyse."}

    monkeypatch.setattr(bellum_api, "start_account_analysis", fake_start)
    result = await execute_chat_tool(
        "start_account_analysis",
        {"company": "OGF", "plan_token": "tok"},
        user_id=USER,
        profile_data=None,
    )
    assert result["error"] == "Ton rôle dans l’espace ne permet pas de lancer une analyse."
    assert "error_code" not in result


@pytest.mark.asyncio
async def test_start_says_it_does_not_know_when_the_bridge_is_silent(monkeypatch):
    """⚠️ Un pont muet n'est pas un lancement réussi. Le dire, et dire où vérifier."""

    async def fake_start(user_id, **kwargs):
        return None

    monkeypatch.setattr(bellum_api, "start_account_analysis", fake_start)
    result = await execute_chat_tool(
        "start_account_analysis",
        {"company": "OGF", "plan_token": "tok"},
        user_id=USER,
        profile_data=None,
    )
    assert "error" in result
    assert "Comptes" in result["error"]


# ── D1 (renversée #2723) — plus de CARTE, un résumé que le modèle enchaîne seul
#
# D1, décision Louis 14/09/2026 : « propose seulement » rendait un pavé de texte
# — « Proposition d'analyse — THALES », deux options, 8 crédits, statut du
# compte — sans bouton, donc `plan_account_analysis` a gagné une carte à valider
# le 14/09. Mesurée en prod le 22/09/2026 (Loïc Inacio, OGF) : la carte EXIGEAIT
# un clic avant de partir, au point qu'il a fallu rouvrir une conversation neuve
# pour le donner.
#
# ⚠️ RENVERSEMENT ASSUMÉ — décision Louis, 22/09/2026 (#2723) : la carte tombe.
# `plan_account_analysis` rend les MÊMES chiffres (GA-18/GA-19, testés
# ci-dessous), mais SANS `status: pending_confirmation` ni `proposal` — à plat,
# au premier niveau. Le filet passe en aval (`c78_remboursement_credits_
# nocturne`), plus en amont (un clic) : voir
# `c84_analyse_recherche_enrichissement_partent_sans_carte`
# (`packages/contracts/src/schemas/doctrine-registry.ts`).
#
# ⚠️ Ce qui ne bouge PAS : `plan_account_analysis` n'appelle toujours jamais
# `start_account_analysis` elle-même — c'est le MODÈLE qui enchaîne, dans un
# second appel d'outil, pas le serveur dans le même appel bloquant (sinon le
# travail long ne partirait plus en arrière-plan). `never_start` ci-dessous le
# tient encore, pour la raison inverse d'avant : plus « le clic est la
# décision », mais « le serveur ne bloque jamais plusieurs minutes ».


def _plan_of(**overrides) -> dict:
    plan = {
        "account": None,
        "costCredits": 8,
        "creditsLeft": 40,
        "preset": "free",
        "questions": [{"field": "notes", "question": "Que sais-tu ?"}],
        "planToken": "tok",
    }
    plan.update(overrides)
    return plan


async def _plan(monkeypatch, plan: dict, **tool_input) -> dict:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def fake_plan(user_id, *, company, locale="fr"):
        return plan

    monkeypatch.setattr(bellum_api, "plan_account_analysis", fake_plan)

    async def never_start(*_a, **_k):
        raise AssertionError(
            "plan_account_analysis n'appelle jamais start_account_analysis elle-même — "
            "c'est le MODÈLE qui enchaîne dans un second appel d'outil, sinon le travail "
            "long ne part plus en arrière-plan (#2723)"
        )

    monkeypatch.setattr(bellum_api, "start_account_analysis", never_start)
    return await execute_chat_tool(
        "plan_account_analysis", {"company": "THALES", **tool_input}, user_id=USER, profile_data=None
    )


@pytest.mark.asyncio
async def test_plan_returns_the_summary_directly_no_card_to_validate(monkeypatch):
    """#2723 — D1 renversée : plus de `pending_confirmation`, les chiffres sont AU PREMIER NIVEAU."""
    result = await _plan(monkeypatch, _plan_of())
    assert "status" not in result
    assert "proposal" not in result
    # Le nom de l'action reste celui de l'outil que le MODÈLE appellera ensuite,
    # lui-même — plus un bouton que quelqu'un clique.
    assert result["action"] == "start_account_analysis"
    assert result["company"] == "THALES"
    # #4464 — crédits implicites : ni coût ni solde ne sont rendus à Laura.
    for clef in ("cost_credits", "credits_left", "credits_left_after"):
        assert clef not in result
    assert result["plan_token"] == "tok"
    assert result["preset"] == "free"
    assert "objects_count" not in result


@pytest.mark.asyncio
async def test_a_reintroduced_pending_confirmation_would_be_refused(monkeypatch):
    """Sait dire NON : un retour à la carte D1 (status + proposal) romprait ce test."""
    result = await _plan(monkeypatch, _plan_of())
    assert set(result.keys()).isdisjoint({"status", "proposal", "message"})


# #1957.3 — le nombre de sources/objets visés, sur le MÊME résumé que le coût.


@pytest.mark.asyncio
async def test_the_summary_carries_the_objects_count_when_the_bridge_measured_it(monkeypatch):
    result = await _plan(monkeypatch, _plan_of(objectsCount=12))
    assert result["objects_count"] == 12


@pytest.mark.asyncio
async def test_the_summary_never_shows_a_zero_objects_count(monkeypatch):
    """Doctrine GA-18/GA-19 : « non mesuré » n'est jamais « mesuré à zéro »."""
    result = await _plan(monkeypatch, _plan_of(objectsCount=0))
    assert "objects_count" not in result


@pytest.mark.asyncio
async def test_a_missing_objects_count_is_absent_not_zero(monkeypatch):
    result = await _plan(monkeypatch, _plan_of())
    assert "objects_count" not in result


# #2263.1 — « réutiliser tout ce que Bellum sait avant une analyse payante » :
# le pont agrège désormais aussi le CRM et Market Memory dans `knownFrom`.
# `_analysis_card` ne fait que relayer ce que le pont a mesuré — jamais une
# liste devinée, jamais une liste vide affichée.


@pytest.mark.asyncio
async def test_the_summary_carries_known_from_when_the_bridge_found_something(monkeypatch):
    result = await _plan(monkeypatch, _plan_of(knownFrom=["crm", "marketMemory"]))
    assert result["known_from"] == ["crm", "marketMemory"]


@pytest.mark.asyncio
async def test_a_missing_known_from_is_absent_not_an_empty_list(monkeypatch):
    result = await _plan(monkeypatch, _plan_of())
    assert "known_from" not in result


@pytest.mark.asyncio
async def test_the_summary_never_shows_an_empty_known_from_list(monkeypatch):
    """Doctrine GA-18/GA-19 : une liste vide ne s'affiche jamais."""
    result = await _plan(monkeypatch, _plan_of(knownFrom=[]))
    assert "known_from" not in result


# #3260.8/.9 (BEL-SC-231) — le garde-fou de périmètre avant un lancement à
# l'aveugle. `_analysis_card` ne fait que RELAYER ce que le pont a mesuré
# (`scopeGuardrail` -> `scope_guardrail`) — ne bloque rien
# (`c84_analyse_recherche_enrichissement_partent_sans_carte` reste en
# vigueur) : le modèle NOMME la suggestion dans la même phrase que le coût.


@pytest.mark.asyncio
async def test_the_summary_carries_the_scope_guardrail_when_the_bridge_found_one(monkeypatch):
    result = await _plan(
        monkeypatch,
        _plan_of(scopeGuardrail={"suggestedScopeMode": "business_unit", "reason": "grande entreprise"}),
    )
    assert result["scope_guardrail"] == {"suggested_scope_mode": "business_unit", "reason": "grande entreprise"}


@pytest.mark.asyncio
async def test_a_missing_scope_guardrail_is_absent_not_invented(monkeypatch):
    result = await _plan(monkeypatch, _plan_of())
    assert "scope_guardrail" not in result


@pytest.mark.asyncio
async def test_the_summary_says_the_dossier_status_and_never_invents_a_date(monkeypatch):
    """« Déjà analysé le … » ou « jamais analysé » — jamais une date devinée."""
    jamais = await _plan(monkeypatch, _plan_of())
    assert jamais["analysed_at"] is None
    assert jamais["account_id"] is None

    deja = await _plan(
        monkeypatch,
        _plan_of(
            account={
                "id": "acc-1",
                "companyName": "THALES SA",
                "status": "completed",
                "analysedAt": "2026-03-02T10:00:00.000Z",
            }
        ),
    )
    assert deja["analysed_at"] == "2026-03-02T10:00:00.000Z"
    assert deja["account_id"] == "acc-1"
    # Le nom CANONIQUE du dossier existant prime sur la graphie tapée.
    assert deja["company"] == "THALES SA"


@pytest.mark.asyncio
async def test_the_summary_names_the_colleague_who_produced_a_reused_dossier(monkeypatch):
    """#2148.11 — la PROVENANCE, DANS L'ESPACE : jamais un nom deviné, jamais
    au prix d'une lecture cross-workspace (le pont, jamais ce tour d'horizon,
    décide qui se nomme)."""
    named = await _plan(
        monkeypatch,
        _plan_of(
            account={
                "id": "acc-1",
                "companyName": "THALES SA",
                "status": "completed",
                "analysedAt": "2026-03-02T10:00:00.000Z",
                "analysedByName": "Théo Haddad",
            }
        ),
    )
    assert named["analysed_by_name"] == "Théo Haddad"


@pytest.mark.asyncio
async def test_a_dossier_with_no_named_author_stays_unnamed(monkeypatch):
    """Soi-même, un auteur introuvable, ou aucun run : le pont rend déjà
    `null` dans ces trois cas — jamais deviné ici."""
    unnamed = await _plan(
        monkeypatch,
        _plan_of(
            account={
                "id": "acc-1",
                "companyName": "THALES SA",
                "status": "completed",
                "analysedAt": "2026-03-02T10:00:00.000Z",
                "analysedByName": None,
            }
        ),
    )
    assert unnamed["analysed_by_name"] is None

    jamais = await _plan(monkeypatch, _plan_of())
    assert jamais["analysed_by_name"] is None


@pytest.mark.asyncio
async def test_no_cost_nor_balance_reaches_laura_even_when_the_bridge_sends_them(monkeypatch):
    """#4464 — un ancien pont qui enverrait encore le coût ne le fait pas fuiter vers Laura."""
    result = await _plan(monkeypatch, _plan_of(costCredits=None, creditsLeft=None))
    assert "cost_credits" not in result
    assert "credits_left" not in result
    assert "credits_left_after" not in result


@pytest.mark.asyncio
async def test_the_summary_carries_the_reason_sentence(monkeypatch):
    """« un compte de mon portefeuille qui la mérite » — la réponse dit POURQUOI celui-là."""
    result = await _plan(monkeypatch, _plan_of(), reason="Trois offres DSI publiées ce mois-ci.")
    assert result["reason"] == "Trois offres DSI publiées ce mois-ci."

    sans = await _plan(monkeypatch, _plan_of(), reason="   ")
    assert "reason" not in sans


@pytest.mark.asyncio
async def test_the_token_and_questions_stay_readable_for_the_model_to_chain(monkeypatch):
    """#2723 — le jeton et les questions restent au premier niveau : c'est ce que
    le modèle relit pour enchaîner lui-même avec `start_account_analysis`, sans
    carte ni « go » requis (D1 renversée)."""
    result = await _plan(monkeypatch, _plan_of())
    assert result["planToken"] == "tok"
    assert result["questions"][0]["field"] == "notes"


@pytest.mark.asyncio
async def test_a_refused_plan_opens_no_card(monkeypatch):
    """`analysis_forbidden` : pas de chiffres inventés, pas de suite automatique
    sur un compte refusé.

    ⚠️ Tranché sans Louis (#2892, 27/09) — CORRIGE un comportement testé mais
    faux : avant ce point, `result["error"]` portait le CODE brut
    (`analysis_forbidden`), pas la phrase. Recette prod du 27/09 : ce même
    défaut, sur `start_account_analysis` (`plan_required`), s'est lu texte
    pour texte dans la réponse de Laura — « erreur outil « plan_required » ».
    Doctrine (CLAUDE.md, règle #2 du lot) : jamais un nom de code technique
    exposé, `message` est ce qui se dit. Le code survit sous `error_code`."""
    result = await _plan(monkeypatch, {"error": "analysis_forbidden", "message": "Ton rôle ne le permet pas."})
    assert result["error"] == "Ton rôle ne le permet pas."
    assert result["error_code"] == "analysis_forbidden"
    assert "proposal" not in result
    assert "plan_token" not in result


@pytest.mark.asyncio
async def test_the_plan_tool_stays_out_of_the_write_family(monkeypatch):
    """Il PROPOSE sans rien écrire ni débiter : `WRITE_TOOL_NAMES` désigne ce qui
    écrit ou dépense, et `start_account_analysis` reste l'outil qui débite."""
    from app.services.chat_tools import WRITE_TOOL_NAMES

    assert "plan_account_analysis" not in WRITE_TOOL_NAMES
    assert "start_account_analysis" not in WRITE_TOOL_NAMES
