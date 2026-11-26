"""Le copilote cite CE QU'IL A CONSULTÉ — méthode comprise — et dit de quand ça date.

Trou fermé ici : depuis l'orchestration d'outils, une réponse peut être bâtie
sur un dossier de compte lu par `get_account_briefing` / `compare_accounts`.
Ce dossier n'apparaissait NULLE PART dans la transparence — ni comme source
citée, ni avec sa date. Un dossier de mars et un dossier d'hier produisaient un
briefing d'apparence identique.

Ce que ces tests verrouillent :
  1. le briefing porte la date RÉELLE du dossier (`updated_at`, sinon
     `created_at`), et rien quand on ne la connaît pas ;
  2. un résultat d'outil devient une source citée typée (`account_dossier`),
     jamais sur une erreur ni sur un outil d'écriture (qui ne consulte rien) ;
  3. la comparaison date chaque dossier comparé, et seulement ceux qui
     appartiennent VRAIMENT au caller ;
  4. la fusion des sources est déduplicante et n'écrase jamais une source
     existante (documents, méthode, CRM) ;
  5. flag éteint = aucune source d'outil, chemin de chat inchangé.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.prompts.context_transparency import build_context_transparency, merge_sources
from app.services.chat_tools import (
    build_account_briefing,
    cited_sources,
    execute_chat_tool,
    profile_version_hint,
)


def _terminal_event(text: str) -> dict:
    """`/chat/message` diffuse en SSE (LOT STREAM) — le dernier événement porte
    la MÊME forme que l'ancien corps JSON de cet endpoint."""
    events = [
        json.loads(block.strip()[len("data:") :].strip())
        for block in text.strip().split("\n\n")
        if block.strip().startswith("data:")
    ]
    return events[-1]

_ACCOUNT_ID = "22222222-2222-4222-8222-222222222222"
_OTHER_ID = "33333333-3333-4333-8333-333333333333"


# ── 1. Le briefing porte la date du dossier ─────────────────────────────────


def test_briefing_carries_the_dossier_date():
    b = build_account_briefing(
        {"id": _ACCOUNT_ID, "company_name": "TF1", "updated_at": "2026-03-12T10:00:00+00:00"}
    )
    assert b["as_of"] == "2026-03-12T10:00:00Z"


def test_briefing_falls_back_to_the_creation_date():
    b = build_account_briefing({"id": "a", "company_name": "TF1", "created_at": "2026-01-05T08:30:00Z"})
    assert b["as_of"] == "2026-01-05T08:30:00Z"


def test_briefing_invents_no_date_when_it_has_none():
    """Règle maison : pas de fraîcheur plutôt qu'une fraîcheur inventée."""
    assert "as_of" not in build_account_briefing({"id": "a", "company_name": "TF1"})
    assert "as_of" not in build_account_briefing(
        {"id": "a", "company_name": "TF1", "updated_at": "l'autre jour"}
    )


# ── 2. Un résultat d'outil devient une source citée ─────────────────────────


def test_a_briefing_result_becomes_a_dated_cited_source():
    out = {"account_id": _ACCOUNT_ID, "company_name": "TF1", "as_of": "2026-03-12T10:00:00Z"}
    assert cited_sources("get_account_briefing", out) == [
        {"kind": "account_dossier", "label": "TF1", "as_of": "2026-03-12T10:00:00Z"}
    ]


def test_a_briefing_without_a_date_is_still_cited_but_undated():
    out = {"account_id": _ACCOUNT_ID, "company_name": "TF1"}
    assert cited_sources("get_account_briefing", out) == [{"kind": "account_dossier", "label": "TF1"}]


def test_a_failed_tool_cites_nothing():
    """Un outil en erreur n'a rien consulté : il ne doit pas laisser croire le
    contraire dans le panneau « sources citées »."""
    assert cited_sources("get_account_briefing", {"error": "Compte introuvable"}) == []
    assert cited_sources("compare_accounts", {"error": "boom"}) == []


# ── #3858 (recette prod 08/10, Sanofi) — `get_account_preflight` ne citait ──
# rien : une question sur UN compte nommé (#2547 — account_signals_note dit
# explicitement de lire `get_account_preflight`) répondait juste mais le
# panneau « Ce qui a servi » ne nommait AUCUN dossier de compte — seule la
# mémoire marché large (`search_market_memory`, si aussi appelée ce tour)
# apparaissait. Même contrat que `get_account_briefing` : un dossier de compte
# consulté devient une source `account_dossier`, datée si on sait.


def test_account_preflight_result_becomes_a_dated_cited_source():
    out = {"account_id": _ACCOUNT_ID, "company_name": "Sanofi", "as_of": "2026-10-01T09:00:00Z"}
    assert cited_sources("get_account_preflight", out) == [
        {"kind": "account_dossier", "label": "Sanofi", "as_of": "2026-10-01T09:00:00Z"}
    ]


def test_account_preflight_without_a_date_is_still_cited_but_undated():
    out = {"account_id": _ACCOUNT_ID, "company_name": "Sanofi"}
    assert cited_sources("get_account_preflight", out) == [{"kind": "account_dossier", "label": "Sanofi"}]


def test_a_failed_preflight_cites_nothing():
    assert cited_sources("get_account_preflight", {"error": "Compte introuvable dans votre portefeuille."}) == []


# ── #3198 (épopée #3223) — `profile_version_hint`, relais du dossier vers ────
# `ReasoningTrace.profile_version` (`versioning.profile_version`, #3212.3) ────


def test_profile_version_hint_relays_the_dossiers_versioning():
    out = {
        "account_id": _ACCOUNT_ID,
        "company_name": "TF1",
        "versioning": {"analysis_version": "abc123f", "profile_version": "esn:1/context:1"},
    }
    assert profile_version_hint("get_account_briefing", out) == "esn:1/context:1"


def test_profile_version_hint_is_none_without_a_versioning_key():
    """Pont éteint, ou dossier antérieur à la colonne : `None`, jamais deviné."""
    out = {"account_id": _ACCOUNT_ID, "company_name": "TF1"}
    assert profile_version_hint("get_account_briefing", out) is None


def test_profile_version_hint_is_none_when_the_bridge_names_no_profile_version():
    out = {
        "account_id": _ACCOUNT_ID,
        "company_name": "TF1",
        "versioning": {"analysis_version": "abc123f", "profile_version": None},
    }
    assert profile_version_hint("get_account_briefing", out) is None


def test_profile_version_hint_ignores_other_tools_and_failed_calls():
    assert profile_version_hint("compare_accounts", {"versioning": {"profile_version": "esn:1/context:1"}}) is None
    assert profile_version_hint("get_account_briefing", {"error": "Compte introuvable"}) is None


def test_write_tools_cite_nothing():
    """Préparer un message ne consulte aucune source à citer."""
    assert cited_sources("prepare_message_for_contact", {"status": "pending_confirmation"}) == []
    assert cited_sources("schedule_reminder_for_contact", {"status": "pending_confirmation"}) == []
    assert cited_sources("outil_inconnu", {"whatever": 1}) == []


# ── #3193.2 (épopée #3217, lot E3 28/09 suite) — la couche `agenda` ─────────
#
# `list_agenda`/`find_free_slots`/`prepare_day_brief` lisaient déjà le
# calendrier connecté sans jamais apparaître dans « sources citées » — la
# couche `agenda` du reçu de connaissance (#3193.2/.3) n'avait donc rien à
# lire. UNE entrée par appel réussi, jamais une par évènement : le titre d'un
# rendez-vous peut nommer un client, il ne rejoint pas ce panneau.


def test_a_real_agenda_read_cites_one_calendar_source():
    assert cited_sources("list_agenda", {"events": [{"summary": "Point SNCF"}], "truncated": False}) == [
        {"kind": "calendar", "label": "Agenda"}
    ]
    assert cited_sources("find_free_slots", {"slots": [{"start": "2026-09-29T09:00:00Z"}], "truncated": False}) == [
        {"kind": "calendar", "label": "Agenda"}
    ]
    assert cited_sources("prepare_day_brief", {"day": "2026-09-29", "events": [{"title": "Point"}]}) == [
        {"kind": "calendar", "label": "Agenda"}
    ]


def test_an_empty_agenda_read_cites_nothing():
    """Zéro rendez-vous n'a rien consulté à citer — la couche reste
    `not_requested` plutôt qu'un `consulted` avec un compte à 0 deviné."""
    assert cited_sources("list_agenda", {"events": [], "truncated": False}) == []
    assert cited_sources("find_free_slots", {"slots": [], "truncated": False}) == []
    assert cited_sources("prepare_day_brief", {"day": "2026-09-29", "events": []}) == []


# ── #1915.6 — la mémoire marché consultée entre dans le panneau ─────────────
#
# Avant ce lot, `search_market_memory` n'apparaissait NULLE PART dans la
# transparence : le libellé `market_observation` existait côté écran depuis
# #1599 (« la source n'est pas branchée aujourd'hui »), mais aucun appelant ne
# le remplissait — l'outil a depuis été branché (#1961) sans qu'on revienne
# fermer cette case. Une réponse qui s'appuie sur la mémoire marché ne le
# disait donc qu'en texte, jamais dans « sources citées ».


def test_1915_6_a_market_memory_search_with_matches_cites_the_companies_found():
    out = {
        "truncated": False,
        "matches": [{"company_name": "TF1"}, {"company_name": "Decathlon"}],
    }
    assert cited_sources("search_market_memory", out) == [
        {"kind": "market_observation", "label": "TF1"},
        {"kind": "market_observation", "label": "Decathlon"},
    ]


def test_1915_6_a_market_memory_search_without_matches_cites_nothing():
    """Zéro résultat n'a rien consulté à citer — un panneau vide, pas une source fantôme."""
    assert cited_sources("search_market_memory", {"truncated": False, "matches": []}) == []


def test_1915_6_the_cited_companies_are_bounded():
    """Une recherche large (jusqu'à 50 résultats côté outil) ne doit pas noyer le
    panneau « sources citées » : bornée comme les autres listes du dépôt."""
    out = {"matches": [{"company_name": f"Société {i}"} for i in range(50)]}
    assert len(cited_sources("search_market_memory", out)) == 5


# ── #2547.1 — le tour d'horizon (`run_account_search`) ne cite QUE ce qu'il a ─
#
# Retour CLIENT (Ludovic Marx) : « Laura m'a remonté des éléments sans citer de
# signaux ». Un premier correctif (ce même lot, avant celui-ci) a ajouté une
# citation `market_signal` pour chaque compte rendu par `run_account_search`,
# datée avec `as_of`. Mesuré en PRODUCTION le 18/09 : FRANCE TELEVISIONS, BNP
# Paribas et LATECOERE portaient tous les trois la MÊME phrase invérifiable —
# « un signal a été indiqué dans les 7 derniers jours, mais sa nature et sa
# date exacte n'ont pas été rendues ».
#
# La cause : `as_of` n'est PAS la date d'un signal. C'est l'horodatage de
# LECTURE du registre (`app/routers/discover.py::_rank_and_angle`, ligne 1037 :
# `fetched_at = datetime.now(UTC).isoformat()`), posé sur CHAQUE candidat sans
# exception. Et ce chemin ne collecte JAMAIS de signal daté par compte : la
# même fonction pose `signals: list[dict] = []` (ligne 1056) — les signaux
# datés sont produits par l'outil VOISIN `/discover/signals`
# (`discover_signals.py`), que `run_account_search` n'appelle jamais. Citer
# « TF1 » ou « Decathlon » comme `market_signal` avec ou sans `as_of`
# affirmait donc un fait daté qu'on n'avait pas — exactement ce que
# `ContextDisclosure.tsx` promet pourtant à l'écran (« Signal marché » ...
# « ceci EST un fait daté »).
#
# Tant que le transport réel n'existe pas (câbler `/discover/signals` dans ce
# tour d'horizon est un chantier séparé, pas ce correctif), la réponse honnête
# est de ne citer AUCUN signal marché depuis cet outil — jamais un signal
# supposé.


def test_2547_1_an_account_search_result_never_cites_an_unproven_market_signal():
    out = {
        "items": [
            {"name": "FRANCE TELEVISIONS", "siren": "123456789", "as_of": "2026-09-18T09:00:00Z"},
            {"name": "BNP Paribas", "siren": "987654321", "as_of": "2026-09-18T09:00:00Z"},
            {"name": "LATECOERE", "siren": "111111111"},
        ]
    }
    assert cited_sources("run_account_search", out) == []


def test_2547_1_an_empty_account_search_cites_nothing():
    assert cited_sources("run_account_search", {"items": []}) == []
    assert cited_sources("run_account_search", {"error": "Le registre n'a pas répondu."}) == []


# ── #2547.1 (suite, 18/09) — le transport réel est câblé ────────────────────
#
# `run_account_search` va maintenant chercher les signaux datés (même motif
# que le lot voisin qui les a branchés dans Découvrir : `_start_signal_tasks`
# / `_finish_signal_tasks`, top 3, budget 3s). Un candidat dont `_search_item`
# a REELLEMENT trouvé un signal daté (`signals`, non vide) porte maintenant
# une citation `market_signal` — datée avec la date PROPRE du signal, jamais
# `as_of` (l'horodatage de lecture du registre, la cause du défaut #2547.1
# initial). La NATURE se nomme (registre officiel, offre d'emploi, appel
# d'offres), jamais le fournisseur.


def test_2547_1_suite_an_account_search_result_cites_a_proven_dated_signal():
    out = {
        "items": [
            {
                "name": "FRANCE TELEVISIONS",
                "siren": "123456789",
                "as_of": "2026-09-18T09:00:00Z",
                "signals_searched": True,
                "signals": [{"type": "tender", "label": "AO refonte SI", "date": "2026-09-15"}],
            },
            # cherché, rien trouvé : jamais cité (aucun fait daté à prouver).
            {"name": "BNP Paribas", "siren": "987654321", "signals_searched": True},
            # jamais cherché (hors top 3) : jamais cité non plus.
            {"name": "LATECOERE", "siren": "111111111", "signals_searched": False},
        ]
    }
    sources = cited_sources("run_account_search", out)
    assert sources == [
        {"kind": "market_signal", "label": "FRANCE TELEVISIONS — appel d'offres public en cours", "as_of": "2026-09-15"}
    ]
    rendu = repr(sources).lower()
    for fournisseur in ("boamp", "france_travail", "bodacc", "france travail"):
        assert fournisseur not in rendu, f"« {fournisseur} » part vers le modèle"


def test_2547_1_suite_market_signal_citations_are_bounded():
    """Bornée comme les autres listes dérivées d'un outil (`_MARKET_MEMORY_
    SOURCES_MAX`) : une longue liste de comptes ne doit pas noyer le panneau."""
    out = {
        "items": [
            {
                "name": f"Société {i}",
                "siren": str(100000000 + i),
                "signals_searched": True,
                "signals": [{"type": "hiring", "label": "Offre data", "date": "2026-09-10"}],
            }
            for i in range(10)
        ]
    }
    assert len(cited_sources("run_account_search", out)) <= 5


# ── 3. La comparaison date chaque dossier comparé ───────────────────────────


def _sb_returning(rows: list[dict]) -> MagicMock:
    sb = MagicMock()
    chain = MagicMock()
    chain.select.return_value = chain
    chain.in_.return_value = chain
    chain.eq.return_value = chain
    chain.aexecute = AsyncMock(return_value=MagicMock(data=rows))
    sb.table.return_value = chain
    return sb


@pytest.mark.asyncio
async def test_compare_dates_every_dossier_it_actually_read():
    rows = [
        {"id": _ACCOUNT_ID, "company_name": "TF1", "updated_at": "2026-03-12T10:00:00+00:00"},
        {"id": _OTHER_ID, "company_name": "Decathlon", "updated_at": "2026-07-20T09:00:00+00:00"},
    ]
    sb = _sb_returning(rows)

    async def _compare(_req):
        return {"success": True, "data": {"ranking": ["TF1", "Decathlon"]}}

    with (
        patch("app.services.supabase_client.get_supabase", return_value=sb),
        patch("app.routers.compare.compare_accounts", new=_compare),
    ):
        out = await execute_chat_tool(
            "compare_accounts",
            {"account_ids": [_ACCOUNT_ID, _OTHER_ID]},
            user_id="user-1",
            profile_data=None,
        )

    # Le modèle VOIT la fraîcheur de ce qu'il compare (il ne peut pas la deviner).
    assert out["dossiers"] == [
        {"account_id": _ACCOUNT_ID, "company_name": "TF1", "as_of": "2026-03-12T10:00:00Z"},
        {"account_id": _OTHER_ID, "company_name": "Decathlon", "as_of": "2026-07-20T09:00:00Z"},
    ]
    # …et l'écran aussi, une source par dossier comparé.
    assert cited_sources("compare_accounts", out) == [
        {"kind": "account_dossier", "label": "TF1", "as_of": "2026-03-12T10:00:00Z"},
        {"kind": "account_dossier", "label": "Decathlon", "as_of": "2026-07-20T09:00:00Z"},
    ]
    # Lecture SCOPÉE au caller : jamais le dossier d'un autre workspace.
    sb.table.return_value.eq.assert_any_call("user_id", "user-1")


@pytest.mark.asyncio
async def test_compare_cites_no_dossier_when_the_lookup_fails():
    """La datation est un bonus best-effort : si elle échoue, la comparaison
    part quand même — sans date inventée."""
    sb = MagicMock()
    sb.table.side_effect = RuntimeError("db down")

    async def _compare(_req):
        return {"success": True, "data": {"ranking": []}}

    with (
        patch("app.services.supabase_client.get_supabase", return_value=sb),
        patch("app.routers.compare.compare_accounts", new=_compare),
    ):
        out = await execute_chat_tool(
            "compare_accounts",
            {"account_ids": [_ACCOUNT_ID, _OTHER_ID]},
            user_id="user-1",
            profile_data=None,
        )
    assert "dossiers" not in out
    assert cited_sources("compare_accounts", out) == []


# ── 4. Fusion des sources ───────────────────────────────────────────────────


def test_merge_keeps_existing_sources_and_appends_the_new_ones():
    existing = [
        {"kind": "knowledge_doc", "label": "Playbook SNCF"},
        {"kind": "method_rule", "label": "Règle métier « score_compte_25 » — méthode Bellum"},
    ]
    merged = merge_sources(existing, [{"kind": "account_dossier", "label": "TF1", "as_of": "2026-03-12T10:00:00Z"}])
    assert merged[:2] == existing
    assert merged[2]["kind"] == "account_dossier"


def test_merge_deduplicates_on_kind_and_label():
    existing = [{"kind": "account_dossier", "label": "TF1", "as_of": "2026-03-12T10:00:00Z"}]
    merged = merge_sources(existing, [{"kind": "account_dossier", "label": "TF1"}])
    assert merged == existing  # la version datée gagne, pas de doublon


def test_merge_ignores_junk():
    assert merge_sources([], [{"kind": "", "label": ""}, "pas un dict", None]) == []


# ── 4bis. La méthode citée porte sa nature, pas sa mention de provenance ─────


def test_a_cited_method_rule_drops_the_provenance_suffix_from_its_label():
    """L'écran étiquette déjà la pastille « Méthode Bellum » (nature de source) ;
    répéter « — méthode Bellum » dans le libellé serait un doublon visuel. Le
    PROMPT, lui, garde le titre complet — c'est un autre chemin."""
    from app.services import method_knowledge

    chunks = method_knowledge.retrieve_method_chunks("on a déjà nos ESN partenaires")
    context = build_context_transparency(
        profile_data={"esn_name": "Skaizen"},
        account_data={"company_name": "TF1"},
        contacts_summary="",
        plan_summary="",
        knowledge_docs=None,
        method_chunks=chunks,
    )
    method_labels = [s["label"] for s in context["sources"] if s["kind"] == "method_rule"]
    assert method_labels, "au moins une règle méthode doit être citée pour ce test"
    assert all("méthode Bellum" not in label for label in method_labels)


# ── 5. Bout en bout : la source d'outil atteint la réponse ──────────────────


def test_tool_sources_reach_the_transparency_object(client: TestClient, monkeypatch) -> None:
    monkeypatch.delenv("CHAT_TOOLS_DISABLED", raising=False)

    async def _run(*_a, **_k):
        return (
            "Voici le point sur TF1.",
            [
                {
                    "tool": "get_account_briefing",
                    "input": {"account_id": _ACCOUNT_ID},
                    "status": "done",
                    "sources": [
                        {"kind": "account_dossier", "label": "TF1", "as_of": "2026-03-12T10:00:00Z"}
                    ],
                }
            ],
        )

    with (
        patch("app.services.chat_orchestrator.run_chat_with_tools", new=_run),
        patch(
            "app.services.rag_service.retrieve_knowledge_docs",
            new_callable=AsyncMock,
            return_value=[],
        ),
    ):
        res = client.post("/chat/message", json={"message": "où en est TF1 ?", "user_id": "u1"})

    context = _terminal_event(res.text)["data"]["context"]
    assert {"kind": "account_dossier", "label": "TF1", "as_of": "2026-03-12T10:00:00Z"} in context["sources"]


def test_a_tool_that_raises_marks_its_layer_unavailable_not_not_requested(client: TestClient, monkeypatch) -> None:
    """#3193.10 (recette prod 30/09) — `chat_orchestrator.py` pose `status="failed"`
    quand l'outil a LEVÉ une exception (panne réseau, timeout…), distinct de
    `status="error"` (l'outil a répondu, sans lever, avec un `{"error": ...}`).
    `chat.py` ne filtrait que `"error"` : un outil qui plante réellement — le cas
    le plus courant en prod — retombait donc sur `not_requested`, indiscernable
    d'un outil jamais appelé. D'où « Indisponible jamais observé en prod »."""
    monkeypatch.delenv("CHAT_TOOLS_DISABLED", raising=False)

    async def _run(*_a, **_k):
        return (
            "Je n'ai pas pu vérifier la mémoire marché.",
            [{"tool": "search_market_memory", "input": {"company_name": "TF1"}, "status": "failed"}],
        )

    with (
        patch("app.services.chat_orchestrator.run_chat_with_tools", new=_run),
        patch(
            "app.services.rag_service.retrieve_knowledge_docs",
            new_callable=AsyncMock,
            return_value=[],
        ),
    ):
        res = client.post("/chat/message", json={"message": "TF1 a-t-il des externes ?", "user_id": "u1"})

    receipt = _terminal_event(res.text)["data"]["context"]["knowledge_receipt"]
    assert receipt["market_memory"]["status"] == "unavailable"


def test_kill_switch_adds_no_tool_source(client: TestClient, monkeypatch) -> None:
    """Le contrat de repli : kill-switch posé, aucune source d'outil ne peut
    apparaître (l'orchestrateur n'est même pas importé)."""
    monkeypatch.setenv("CHAT_TOOLS_DISABLED", "true")
    with (
        patch("app.routers.chat.call_claude", new_callable=AsyncMock, return_value=("Réponse.", None)),
        patch(
            "app.services.rag_service.retrieve_knowledge_docs",
            new_callable=AsyncMock,
            return_value=[],
        ),
    ):
        res = client.post("/chat/message", json={"message": "salut", "user_id": "u1"})
    context = _terminal_event(res.text)["data"]["context"]
    assert all(s["kind"] != "account_dossier" for s in context["sources"])


def test_a_real_tool_failure_reaches_the_knowledge_receipt_as_unavailable(
    client: TestClient, monkeypatch
) -> None:
    """#3217 recette prod 29-30/09 (f2b66b17db) : un outil APPELÉ ce tour et
    tombé en panne doit se lire « indisponible », jamais « non demandée » —
    vérifié ici bout en bout (HTTP → `context["knowledge_receipt"]`), pas
    seulement sur `build_knowledge_receipt` en isolation (`test_knowledge_receipt.py`)."""
    monkeypatch.delenv("CHAT_TOOLS_DISABLED", raising=False)

    async def _run(*_a, **_k):
        return (
            "Je n'ai pas pu vérifier la mémoire marché.",
            [{"tool": "search_market_memory", "input": {"company_id": "tf1"}, "status": "error"}],
        )

    with (
        patch("app.services.chat_orchestrator.run_chat_with_tools", new=_run),
        patch(
            "app.services.rag_service.retrieve_knowledge_docs",
            new_callable=AsyncMock,
            return_value=[],
        ),
    ):
        res = client.post("/chat/message", json={"message": "que dit le marché sur TF1 ?", "user_id": "u1"})

    receipt = _terminal_event(res.text)["data"]["context"]["knowledge_receipt"]
    assert receipt["market_memory"]["status"] == "unavailable"
    assert receipt["market_memory"]["caveat"]


def test_the_kill_switch_reaches_the_knowledge_receipt_as_forbidden_by_mode(
    client: TestClient, monkeypatch
) -> None:
    """Même contrat que `test_kill_switch_adds_no_tool_source`, un cran plus loin :
    une couche outillée (`agenda`) se lit « interdite par le mode », pas « non
    demandée », quand D169/D243 coupe les actions du copilote."""
    monkeypatch.setenv("CHAT_TOOLS_DISABLED", "true")
    with (
        patch("app.routers.chat.call_claude", new_callable=AsyncMock, return_value=("Réponse.", None)),
        patch(
            "app.services.rag_service.retrieve_knowledge_docs",
            new_callable=AsyncMock,
            return_value=[],
        ),
    ):
        res = client.post("/chat/message", json={"message": "salut", "user_id": "u1"})
    receipt = _terminal_event(res.text)["data"]["context"]["knowledge_receipt"]
    assert receipt["agenda"]["status"] == "forbidden_by_mode"


# ── 6. L'orchestrateur porte la source sur l'action ─────────────────────────


@pytest.mark.asyncio
async def test_orchestrator_attaches_the_cited_source_to_the_executed_tool(monkeypatch):
    from types import SimpleNamespace

    from app.services import chat_orchestrator

    class _Throttle:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_a):
            return False

    class _Stream:
        def __init__(self, response):
            self._response = response

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_exc):
            return False

        async def __aiter__(self):
            for block in getattr(self._response, "content", None) or []:
                if getattr(block, "type", None) == "text":
                    yield SimpleNamespace(type="text", text=block.text)

        async def get_final_message(self):
            return self._response

    class _Client:
        def __init__(self, responses):
            self.messages = SimpleNamespace(stream=self._stream)
            self._responses = list(responses)

        def _stream(self, **_kw):
            return _Stream(self._responses.pop(0))

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _p: _Throttle())
    monkeypatch.setattr(
        chat_orchestrator,
        "execute_chat_tool",
        AsyncMock(return_value={"company_name": "TF1", "as_of": "2026-03-12T10:00:00Z"}),
    )
    responses = [
        SimpleNamespace(
            stop_reason="tool_use",
            content=[
                SimpleNamespace(
                    type="tool_use",
                    name="get_account_briefing",
                    input={"account_id": _ACCOUNT_ID},
                    id="toolu_1",
                )
            ],
        ),
        SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text="ok")]),
    ]
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: _Client(responses))

    _reply, actions = await chat_orchestrator.run_chat_with_tools(
        "sys", "user", user_id="user-1", profile_data=None
    )
    assert actions[0]["sources"] == [
        {"kind": "account_dossier", "label": "TF1", "as_of": "2026-03-12T10:00:00Z"}
    ]


def test_a_pure_text_check_turn_shows_no_source_block():
    """#3436 — « Vérifie ce message » : aucun document n'a servi au verdict."""
    from app.routers.chat import sources_that_served

    injected = [{"kind": "knowledge_doc", "label": f"Doc {i}", "as_of": "2026-09-11T00:00:00Z"} for i in range(7)]
    assert sources_that_served(injected, [{"tool": "check_message_before_send"}]) == []
    # Un autre outil dans le tour : les sources restent.
    assert sources_that_served(injected, [{"tool": "check_message_before_send"}, {"tool": "get_account_briefing"}]) == injected
    # #3562.1 — aucun outil ce tour (un simple conseil) : aucun bloc sources.
    assert sources_that_served(injected, []) == []
    # Une question posée ou des réponses proposées ne lisent rien non plus.
    assert sources_that_served(injected, [{"tool": "ask_clarification"}, {"tool": "offer_reply_options"}]) == []
    # Un outil de LECTURE a rendu quelque chose : sources inchangées.
    assert sources_that_served(injected, [{"tool": "get_account_briefing"}]) == injected


def test_a_reply_that_states_no_tool_result_shows_no_source_footer():
    """#3215 (recette prod 02/10, Y9) — « Précision : cette réponse ne s'appuie sur
    aucun résultat d'outil ce tour » ET « 3 sources » au pied = contradiction.
    Quand la réponse dit qu'aucun outil n'a répondu, les documents injectés ne
    sont pas des sources qui ont servi : le pied ne s'affiche pas."""
    from app.routers.chat import sources_consistent_with_reply
    from app.services.commercial_verifier import repair_addendum, EVIDENCE_REQUIRED_MISSING

    injected = [{"kind": "knowledge_doc", "label": f"Doc {i}", "as_of": "2026-09-11T00:00:00Z"} for i in range(3)]
    for lang in ("fr", "en"):
        reply = "Voici la reformulation." + repair_addendum([EVIDENCE_REQUIRED_MISSING], lang)
        assert sources_consistent_with_reply(injected, reply) == []
    # Le NON : une réponse sans cette précision garde ses sources.
    assert sources_consistent_with_reply(injected, "Voici la reformulation.") == injected
    # Une autre précision (pas « aucun outil ») ne retire rien.
    other = "x" + repair_addendum(["unknown_converted_to_zero"], "fr")
    assert sources_consistent_with_reply(injected, other) == injected
