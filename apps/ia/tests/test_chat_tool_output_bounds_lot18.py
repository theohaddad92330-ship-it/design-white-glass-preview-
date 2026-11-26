"""LOT 18 — les sept derniers outils de Laura, classés par LOT 14 sur une
raison FAIBLE (« pas eu le périmètre pour vérifier »). Ce fichier tient les
deux gardes réservées à ce lot :

GA-326 — les SIX vraies corrections (`get_memory`, `run_matching`,
`get_daily_briefing`, `prepare_day_brief`, `get_territory_overview`,
`search_market_memory`) rendent un COMPTE exact et disent quand elles
coupent — même motif que GA-317 (LOT 14) : un fixture qui dépasse la borne
affichée d'UN (ou plus), et un fixture qui n'atteint jamais la borne. Le
septième, `get_import_overview`, se corrige côté NestJS
(`copilot-bridge.controller.ts`, prouvé par `copilot-bridge.controller.spec.ts`)
— ce fichier tient seulement la fidélité du RELAIS jusqu'au modèle.

GA-327 — la classification des sept est VÉRIFIÉE, pas supposée : chacun porte
désormais une raison qui cite CE QUI borne réellement, jamais « pas eu le
temps » ni « taille non vérifiée ce lot ». La garde sait dire NON (une raison
qui régresse au motif faible se détecte), lit un corpus non vide (les sept,
jamais zéro), et n'attrape pas ce qu'elle ne vise pas (`get_job_changes`,
seul gap qui reste légitimement `reported` — hors périmètre de ce lot).
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import execute_chat_tool
from tests.test_chat_tool_output_bounds_lot14 import TOOL_BOUND_CLASSIFICATION

USER = "44444444-4444-4444-8444-444444444444"


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    # Le cache de réutilisation de la mémoire marché est un module global : sans
    # ce nettoyage, la réponse `truncated: True` d'un test précédent (mêmes
    # filtres, même utilisateur) est resservie au suivant.
    from app.services import market_memory_reuse_cache

    market_memory_reuse_cache.clear()


async def _run(name: str, tool_input: dict | None = None) -> dict:
    return await execute_chat_tool(name, tool_input or {}, user_id=USER, profile_data=None)


# ── GA-326 — get_memory : le registre grandit ligne à ligne ─────────────────


@pytest.mark.asyncio
async def test_get_memory_caps_an_unbounded_ledger_and_says_so(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _ledger(*_a: object, **_k: object) -> dict:
        return {
            "entries": [{"id": f"f{i}", "layer": "facts", "text": f"Fait {i}"} for i in range(21)],
            "unreadable_layers": [],
        }

    monkeypatch.setattr(bellum_api, "laura_memory_ledger", _ledger)
    result = await _run("get_memory")
    assert len(result["entries"]) == 20
    assert result["truncated"] is True


@pytest.mark.asyncio
async def test_get_memory_does_not_flag_a_short_ledger(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _ledger(*_a: object, **_k: object) -> dict:
        return {"entries": [{"id": "f1", "layer": "facts", "text": "Fait"}], "unreadable_layers": ["preferences"]}

    monkeypatch.setattr(bellum_api, "laura_memory_ledger", _ledger)
    result = await _run("get_memory")
    assert len(result["entries"]) == 1
    assert result["truncated"] is False
    # Témoin : la coupe ne doit jamais effacer une couche illisible NOMMÉE.
    assert result["unreadable_layers"] == ["preferences"]


# ── GA-326 — run_matching : chaque bucket suit le VIVIER, pas le besoin ─────


@pytest.mark.asyncio
async def test_run_matching_caps_each_bucket_and_keeps_identities_in_sync(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _match(*_a: object, **_k: object) -> dict:
        recommended = [{"consultantId": f"r{i}", "correspondenceScore": 90} for i in range(25)]
        borderline = [{"consultantId": f"b{i}", "correspondenceScore": 50} for i in range(3)]
        excluded = [{"consultantId": "e0"}]
        identities = (
            [{"consultantId": f"r{i}", "fullName": f"R{i}"} for i in range(25)]
            + [{"consultantId": f"b{i}", "fullName": f"B{i}"} for i in range(3)]
            + [{"consultantId": "e0", "fullName": "E0"}]
        )
        return {
            "runId": "run-1",
            "need": {"needId": "n1"},
            "evaluatedCount": 29,
            "prefilteredCount": 0,
            # Le plafond du JOURNAL persisté (500 lignes) — SANS rapport avec la
            # coupe d'affichage : ce fixture le laisse à `False` pour prouver
            # que les deux drapeaux ne se confondent pas.
            "truncated": False,
            "recommended": recommended,
            "borderline": borderline,
            "excluded": excluded,
            "notEvaluable": [],
            "identities": identities,
            "exclusionCounts": [],
            "createdAt": "2026-09-12T00:00:00Z",
        }

    monkeypatch.setattr(bellum_api, "run_matching", _match)
    result = await _run("run_matching", {"need_id": "n1"})

    assert len(result["recommended"]) == 20
    assert result["truncated"] is True
    # Le drapeau du journal reste LISIBLE, sous son propre nom.
    assert result["journalTruncated"] is False
    # `identities` ne garde QUE les profils encore présents dans un bucket
    # rendu — cinq des vingt-cinq « recommandés » sont tombés, leur identité
    # avec eux : jamais un nom sans profil à côté.
    kept_ids = {entry["consultantId"] for entry in result["identities"]}
    expected_ids = (
        {entry["consultantId"] for entry in result["recommended"]}
        | {entry["consultantId"] for entry in result["borderline"]}
        | {entry["consultantId"] for entry in result["excluded"]}
    )
    assert kept_ids == expected_ids
    assert len(result["identities"]) == 24


@pytest.mark.asyncio
async def test_run_matching_does_not_flag_a_short_ranking(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _match(*_a: object, **_k: object) -> dict:
        return {
            "runId": "run-1",
            "need": {"needId": "n1"},
            "evaluatedCount": 1,
            "prefilteredCount": 0,
            "truncated": False,
            "recommended": [{"consultantId": "r1"}],
            "borderline": [],
            "excluded": [],
            "notEvaluable": [],
            "identities": [{"consultantId": "r1", "fullName": "R1"}],
            "exclusionCounts": [],
            "createdAt": "2026-09-12T00:00:00Z",
        }

    monkeypatch.setattr(bellum_api, "run_matching", _match)
    result = await _run("run_matching", {"need_id": "n1"})
    assert len(result["recommended"]) == 1
    assert result["truncated"] is False


@pytest.mark.asyncio
async def test_run_matching_leaves_the_single_consultant_explanation_untouched(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`consultant_id` fourni change la FORME de la réponse (`matchNeed`
    délègue à `explain`, `{run, need, result}` — jamais de buckets). La coupe
    ne doit jamais y injecter des listes vides qui n'existaient pas."""

    async def _match(*_a: object, **_k: object) -> dict:
        return {"run": {"id": "run-1"}, "need": {"needId": "n1"}, "result": {"consultantId": "r1", "axes": []}}

    monkeypatch.setattr(bellum_api, "run_matching", _match)
    result = await _run("run_matching", {"need_id": "n1", "consultant_id": "r1"})
    assert "recommended" not in result
    assert "identities" not in result
    assert result["result"]["consultantId"] == "r1"


# ── GA-326 — get_daily_briefing : `accountsToWatch`/`actions` sans borne ────


@pytest.mark.asyncio
async def test_get_daily_briefing_caps_accounts_to_watch_and_actions(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _briefing(*_a: object, **_k: object) -> dict:
        return {
            "agenda": {"state": "ready", "needsPreparation": [], "conflicts": []},
            "mail": {"state": "ready", "awaitingReply": [], "positiveReplies": []},
            "accountsToWatch": [{"companyName": f"Compte {i}"} for i in range(21)],
            "actions": [{"id": f"a{i}"} for i in range(21)],
        }

    monkeypatch.setattr(bellum_api, "daily_briefing", _briefing)
    result = await _run("get_daily_briefing")
    assert len(result["accounts_to_watch"]) == 20
    assert result["accounts_to_watch_truncated"] is True
    assert len(result["actions"]) == 20
    assert result["actions_truncated"] is True


@pytest.mark.asyncio
async def test_get_daily_briefing_does_not_flag_a_short_day(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _briefing(*_a: object, **_k: object) -> dict:
        return {
            "agenda": {"state": "ready", "needsPreparation": [], "conflicts": []},
            "mail": {"state": "ready", "awaitingReply": [], "positiveReplies": []},
            "accountsToWatch": [{"companyName": "ACME"}],
            "actions": [],
        }

    monkeypatch.setattr(bellum_api, "daily_briefing", _briefing)
    result = await _run("get_daily_briefing")
    assert result["accounts_to_watch"] == ["ACME"]
    assert result["accounts_to_watch_truncated"] is False
    assert result["actions"] == []
    assert result["actions_truncated"] is False


# ── GA-326 — prepare_day_brief : sur-lecture d'UN, même motif que list_agenda


@pytest.mark.asyncio
async def test_prepare_day_brief_over_fetches_by_one_to_detect_truncation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _day_brief(*_a: object, **_k: object) -> dict:
        # NestJS sur-lit déjà d'UN (`copilot-bridge.controller.ts`, `dayBrief`,
        # `limit: 26`) : ce fixture simule la réponse déjà sur-lue.
        return {"day": "2026-09-15", "events": [{"title": f"RDV {i}"} for i in range(26)]}

    monkeypatch.setattr(bellum_api, "day_brief", _day_brief)
    result = await _run("prepare_day_brief", {"day": "2026-09-15"})
    assert len(result["events"]) == 25
    assert result["truncated"] is True


@pytest.mark.asyncio
async def test_prepare_day_brief_does_not_flag_a_short_day(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _day_brief(*_a: object, **_k: object) -> dict:
        return {"day": "2026-09-15", "events": [{"title": "RDV 1"}]}

    monkeypatch.setattr(bellum_api, "day_brief", _day_brief)
    result = await _run("prepare_day_brief", {"day": "2026-09-15"})
    assert len(result["events"]) == 1
    assert result["truncated"] is False


# ── GA-326 — get_territory_overview : cinq listes sans `.max()` au contrat ──


@pytest.mark.asyncio
async def test_get_territory_overview_caps_each_unbounded_bloc_and_says_so(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _overview(*_a: object, **_k: object) -> dict:
        return {
            "department": "31",
            "sinceDays": 90,
            "market": {
                "state": "ready",
                "offers": 900,
                "technologies": [{"term": f"tech{i}", "count": i} for i in range(21)],
                "hiringAccounts": [{"name": f"Compte {i}", "offers": 1} for i in range(21)],
            },
            "competition": {"state": "ready", "esnPresent": 10},
            "overflow": {"state": "ready", "esn": [{"name": f"ESN {i}", "offers": 1} for i in range(21)]},
            "accessible": {
                "state": "ready",
                "openTenders": 21,
                "tenders": [{"name": f"Marché {i}"} for i in range(21)],
                "awards": [{"name": f"Attribution {i}"} for i in range(21)],
            },
            "unknowns": ["Les panels privés."],
        }

    monkeypatch.setattr(bellum_api, "territory_overview", _overview)
    result = await _run("get_territory_overview", {"department": "31"})

    assert len(result["market"]["technologies"]) == 20
    assert result["market"]["technologiesTruncated"] is True
    assert len(result["market"]["hiringAccounts"]) == 20
    assert result["market"]["hiringAccountsTruncated"] is True
    assert len(result["overflow"]["esn"]) == 20
    assert result["overflow"]["esnTruncated"] is True
    assert len(result["accessible"]["tenders"]) == 20
    assert result["accessible"]["tendersTruncated"] is True
    assert len(result["accessible"]["awards"]) == 20
    assert result["accessible"]["awardsTruncated"] is True


@pytest.mark.asyncio
async def test_get_territory_overview_does_not_flag_a_short_territory(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _overview(*_a: object, **_k: object) -> dict:
        return {
            "department": "15",
            "sinceDays": 90,
            "market": {"state": "ready", "offers": 4, "technologies": [{"term": "java", "count": 2}]},
            "competition": {"state": "ready", "esnPresent": 1},
            "overflow": {"state": "unavailable", "reason": "la source d’offres n’a pas répondu"},
            "accessible": {"state": "empty"},
            "unknowns": ["Les panels privés."],
        }

    monkeypatch.setattr(bellum_api, "territory_overview", _overview)
    result = await _run("get_territory_overview", {"department": "15"})
    assert result["market"]["technologies"] == [{"term": "java", "count": 2}]
    assert result["market"]["technologiesTruncated"] is False
    # Témoin : un bloc muet garde son état, la coupe ne lui invente rien.
    assert result["overflow"]["state"] == "unavailable"
    assert result["overflow"].get("esn") in (None, [])
    assert "tendersTruncated" not in result["accessible"]


# ── GA-326 — search_market_memory : le plafond dur (50) le dit désormais ───


@pytest.mark.asyncio
async def test_search_market_memory_relays_the_truncation_flag_set_by_the_bridge(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """La coupe elle-même vit dans `MarketMemoryService.searchByFilters`
    (sur-lecture d'UN, plafond dur 50 inchangé) — prouvée par
    `market-memory-search.spec.ts`. Ce test tient le RELAIS jusqu'au modèle."""

    async def _search(*_a: object, **_k: object) -> dict:
        return {
            "status": "ok",
            "truncated": True,
            "matches": [
                {
                    "companyName": "ACME",
                    "coverage": {
                        "marketPaths": 12,
                        "esnObserved": [],
                        "observedStack": [],
                        "roleFamilies": [],
                        "exEsnPresent": None,
                        "observedZone": None,
                    },
                }
            ],
        }

    monkeypatch.setattr(bellum_api, "search_market_memory", _search)
    result = await _run("search_market_memory", {"technology": "java"})
    assert result["truncated"] is True
    assert result["matches"][0]["company_name"] == "ACME"


@pytest.mark.asyncio
async def test_search_market_memory_does_not_flag_when_not_truncated(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _search(*_a: object, **_k: object) -> dict:
        return {"status": "ok", "truncated": False, "matches": []}

    monkeypatch.setattr(bellum_api, "search_market_memory", _search)
    result = await _run("search_market_memory", {"technology": "java"})
    assert result["truncated"] is False


# ── GA-326 — get_import_overview : la coupe vit côté NestJS, ICI le RELAIS ──


@pytest.mark.asyncio
async def test_get_import_overview_relays_the_truncation_flag_set_by_the_bridge(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`sessions.slice(0, 5)` existait déjà côté `copilot-bridge.controller.ts`
    (`take: 50` en SQL, `import.service.ts`) sans jamais dire si l'historique
    RÉEL dépasse les cinq lignes montrées. Le calcul est prouvé par
    `copilot-bridge.controller.spec.ts` ; ce test tient seulement que rien,
    ICI, ne laisse tomber le drapeau en route."""

    async def _overview(*_a: object, **_k: object) -> dict:
        return {
            "sources": [],
            "recent_sessions": [{"object_type": "contact"}] * 5,
            "recent_sessions_truncated": True,
        }

    monkeypatch.setattr(bellum_api, "laura_import_overview", _overview)
    result = await _run("get_import_overview")
    assert len(result["recent_sessions"]) == 5
    assert result["recent_sessions_truncated"] is True


@pytest.mark.asyncio
async def test_get_import_overview_does_not_flag_a_short_history(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _overview(*_a: object, **_k: object) -> dict:
        return {"sources": [], "recent_sessions": [{"object_type": "contact"}], "recent_sessions_truncated": False}

    monkeypatch.setattr(bellum_api, "laura_import_overview", _overview)
    result = await _run("get_import_overview")
    assert result["recent_sessions_truncated"] is False


# ── GA-327 — la classification des sept est VÉRIFIÉE, pas supposée ─────────

#: Les sept outils audités par ce lot — le périmètre EXACT donné par LOT 14.
_LOT18_AUDITED = (
    "search_market_memory",
    "get_territory_overview",
    "prepare_day_brief",
    "get_daily_briefing",
    "get_import_overview",
    "get_memory",
    "run_matching",
)

#: Les formulations FAIBLES que LOT 14 utilisait pour ces sept, faute d'avoir
#: vérifié — une classification qui les porte ENCORE après ce lot n'a pas été
#: auditée, elle a été recopiée.
_WEAK_REASON_MARKERS = (
    "pas eu le périmètre",
    "hors des cinq suspects nommés",
    "taille non vérifiée ce lot",
    "sans rapport",  # jamais la formulation d'un doute, seulement d'un fait
)


def _assert_no_weak_reason(classification: dict[str, tuple[str, str]]) -> None:
    for name in _LOT18_AUDITED:
        family, reason = classification[name]
        assert family in ("bounded", "exempt", "reported"), name
        assert reason.strip(), f"{name} n'a pas de raison écrite"
        for marker in _WEAK_REASON_MARKERS:
            assert marker not in reason, f"{name} garde encore une raison FAIBLE : {reason!r}"


def test_the_seven_weakly_classified_tools_now_carry_a_verified_reason() -> None:
    """Les sept étaient classés sur « pas eu le périmètre pour vérifier ». Ce
    lot les a vérifiés dans le CODE — chaque raison doit maintenant citer ce
    qui borne réellement, jamais la formulation d'un doute non résolu."""
    _assert_no_weak_reason(TOOL_BOUND_CLASSIFICATION)


def test_the_six_genuinely_fixed_tools_are_reclassified_bounded() -> None:
    """Six des sept sont RÉELLEMENT bornés maintenant (le septième,
    `get_import_overview`, l'est aussi mais côté NestJS — même famille)."""
    for name in _LOT18_AUDITED:
        family, _reason = TOOL_BOUND_CLASSIFICATION[name]
        assert family == "bounded", f"{name} devrait être reclassé « bounded », reste {family!r}"


def test_the_corpus_of_audited_tools_is_not_vacuous() -> None:
    """GA-327 lit vraiment quelque chose : sept noms, jamais zéro, et chacun
    existe dans le registre réel (pas une copie locale)."""
    assert len(_LOT18_AUDITED) == 7
    assert set(_LOT18_AUDITED) <= set(TOOL_BOUND_CLASSIFICATION)


def test_the_check_can_say_no_on_a_reason_that_regresses_to_the_weak_wording() -> None:
    """Preuve que GA-327 sait dire NON : une raison qui régresse au motif
    faible de LOT 14 fait échouer `_assert_no_weak_reason`, exactement comme
    un oubli d'audit le ferait."""
    regressed = dict(TOOL_BOUND_CLASSIFICATION)
    regressed["get_memory"] = ("reported", "taille non vérifiée ce lot ; voir rapport LOT 14 §6")
    with pytest.raises(AssertionError):
        _assert_no_weak_reason(regressed)


def test_the_check_does_not_flag_get_job_changes_which_stays_out_of_scope() -> None:
    """Témoin : `get_job_changes` — le HUITIÈME gap de LOT 14 — reste hors du
    périmètre de CE lot (un autre agent y écrit) et donc hors de
    `_LOT18_AUDITED`. La garde ne doit jamais le réclamer ni le pénaliser."""
    assert "get_job_changes" not in _LOT18_AUDITED
    family, reason = TOOL_BOUND_CLASSIFICATION["get_job_changes"]
    assert family == "reported"
    assert reason.strip()
