"""LOT 14 — les ~46 outils de Laura non audités par GA-295 (LOT 3).

GA-295 (`test_chat_tool_output_bounds.py`) a borné HUIT outils de lecture.
Il en restait une cinquantaine, repérés en lecture mais jamais testés. Ce
fichier tient les DEUX gardes réservées à ce lot :

GA-317 — les outils fraîchement bornés (ou fraîchement flaggés) ici rendent un
COMPTE exact et disent quand ils coupent — même motif que GA-295 : `_capped()`
pour une liste jamais bornée en amont, ou un drapeau `truncated` dérivé d'un
`total` déjà porté par la réponse mais jusqu'ici lu et jeté (exactement le
défaut réparé sur `search_talents` par GA-295, retrouvé identique sur
`find_needs` et `search_dormant_network`).

GA-318 — TOUS les outils de `CHAT_TOOLS` sont CLASSÉS : bornés (comment), ou
exemptés (pourquoi une liste illimitée n'y est pas un risque), ou un GAP connu
et sciemment non corrigé ce lot (la raison renvoie au rapport du lot). La
classification est vérifiée contre le catalogue RÉEL, pas contre une copie :
un outil ajouté demain sans y penser fait échouer CE test plutôt que dormir
jusqu'au prochain audit — c'est exactement le sort qu'ont connu les huit
outils de GA-295 puis les cinq nommés de ce lot avant d'être vérifiés.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api, chat_tools
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool

USER = "22222222-2222-4222-8222-222222222222"


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)


async def _run(name: str, tool_input: dict | None = None) -> dict:
    return await execute_chat_tool(name, tool_input or {}, user_id=USER, profile_data=None)


# ── GA-317 — search_missions ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_search_missions_caps_an_unbounded_list_and_says_so(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _missions(*_a: object, **_k: object) -> dict:
        return {"missions": [{"id": f"m{i}", "label": f"Mission {i}"} for i in range(30)]}

    monkeypatch.setattr(bellum_api, "missions_ending", _missions)
    result = await _run("search_missions")
    assert len(result["missions"]) == 20
    assert result["truncated"] is True


@pytest.mark.asyncio
async def test_search_missions_does_not_flag_a_short_list(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _missions(*_a: object, **_k: object) -> dict:
        return {"missions": [{"id": "m1", "label": "M1"}]}

    monkeypatch.setattr(bellum_api, "missions_ending", _missions)
    result = await _run("search_missions")
    assert len(result["missions"]) == 1
    assert result["truncated"] is False


# ── GA-317 — get_timesheets ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_timesheets_caps_an_unbounded_list_and_says_so(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _timesheets(*_a: object, **_k: object) -> dict:
        return {"month": "2026-08", "items": [{"missionLabel": f"M{i}"} for i in range(25)], "summary": {}}

    monkeypatch.setattr(bellum_api, "timesheets_month", _timesheets)
    result = await _run("get_timesheets")
    assert len(result["lines"]) == 20
    assert result["truncated"] is True


@pytest.mark.asyncio
async def test_get_timesheets_does_not_flag_a_short_list(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _timesheets(*_a: object, **_k: object) -> dict:
        return {"month": "2026-08", "items": [{"missionLabel": "M1"}], "summary": {}}

    monkeypatch.setattr(bellum_api, "timesheets_month", _timesheets)
    result = await _run("get_timesheets")
    assert len(result["lines"]) == 1
    assert result["truncated"] is False


# ── GA-317 — get_invoice_blockers ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_invoice_blockers_caps_an_unbounded_list_and_says_so(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _blockers(*_a: object, **_k: object) -> dict:
        return {"month": "2026-08", "items": [{"missionLabel": f"M{i}"} for i in range(21)], "summary": {}}

    monkeypatch.setattr(bellum_api, "invoice_blockers", _blockers)
    result = await _run("get_invoice_blockers")
    assert len(result["blocked"]) == 20
    assert result["truncated"] is True


@pytest.mark.asyncio
async def test_get_invoice_blockers_does_not_flag_a_short_list(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _blockers(*_a: object, **_k: object) -> dict:
        return {"month": "2026-08", "items": [], "summary": {}}

    monkeypatch.setattr(bellum_api, "invoice_blockers", _blockers)
    result = await _run("get_invoice_blockers")
    assert result["blocked"] == []
    assert result["truncated"] is False


# ── GA-317 — get_overdue_payments ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_overdue_payments_caps_an_unbounded_list_and_says_so(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _overdue(*_a: object, **_k: object) -> dict:
        return {"month": "2026-08", "items": [{"accountName": f"A{i}"} for i in range(22)]}

    monkeypatch.setattr(bellum_api, "overdue_payments", _overdue)
    result = await _run("get_overdue_payments")
    assert len(result["items"]) == 20
    assert result["truncated"] is True


@pytest.mark.asyncio
async def test_get_overdue_payments_does_not_flag_a_short_list(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _overdue(*_a: object, **_k: object) -> dict:
        return {"month": "2026-08", "items": [{"accountName": "ACME"}]}

    monkeypatch.setattr(bellum_api, "overdue_payments", _overdue)
    result = await _run("get_overdue_payments")
    assert len(result["items"]) == 1
    assert result["truncated"] is False


# ── GA-317 — search_partners ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_search_partners_caps_an_unbounded_list_and_says_so(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _pipeline(*_a: object, **_k: object) -> dict:
        return {"partners": [{"name": f"ESN {i}"} for i in range(30)]}

    monkeypatch.setattr(bellum_api, "partner_pipeline", _pipeline)
    result = await _run("search_partners")
    assert len(result["partners"]) == 20
    assert result["truncated"] is True


@pytest.mark.asyncio
async def test_search_partners_does_not_flag_a_short_list(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _pipeline(*_a: object, **_k: object) -> dict:
        return {"partners": [{"name": "ESN 1"}]}

    monkeypatch.setattr(bellum_api, "partner_pipeline", _pipeline)
    result = await _run("search_partners")
    assert len(result["partners"]) == 1
    assert result["truncated"] is False


# ── GA-317 — find_needs : `total` était déjà lu et jeté (même défaut que
# `search_talents` avant GA-295) ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_find_needs_flags_truncation_from_the_total_already_carried(monkeypatch: pytest.MonkeyPatch) -> None:
    # #2872 — forme RÉELLE du pont (`openNeedsResponseSchema`) : `data` +
    # `pagination.totalItems`, jamais `items`/`total` (voir le docblock de
    # `find_needs` dans `chat_tools.py`).
    async def _find(*_a: object, **_k: object) -> dict:
        return {
            "data": [{"id": f"n{i}"} for i in range(20)],
            "pagination": {"totalItems": 57},
        }

    monkeypatch.setattr(bellum_api, "find_needs", _find)
    result = await _run("find_needs")
    assert len(result["needs"]) == 20
    assert result["truncated"] is True


@pytest.mark.asyncio
async def test_find_needs_does_not_flag_when_the_total_matches(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _find(*_a: object, **_k: object) -> dict:
        return {"data": [{"id": "n1"}], "pagination": {"totalItems": 1}}

    monkeypatch.setattr(bellum_api, "find_needs", _find)
    result = await _run("find_needs")
    assert result["truncated"] is False


@pytest.mark.asyncio
async def test_find_needs_surfaces_a_real_open_need_by_skill(monkeypatch: pytest.MonkeyPatch) -> None:
    """#2872 (reste, constat PRODUCTION 27/09 18:32) — RÉFUTÉ trois fois en
    recette réelle : le besoin « Développeur Java / Spring Boot » est OUVERT
    et visible sur `/projects/needs`, mais Laura répondait « aucun besoin
    ouvert en Java n'a été trouvé » (idem « Kafka »).

    Cause : ce dispatch lisait `result.get("items")` / `row.get("label")` /
    `row.get("starts_on")`, des clés que le pont ne rend JAMAIS —
    `OpenNeedsService.list` (`openNeedsResponseSchema`) rend `data` (pas
    `items`), et chaque ligne porte `title` (pas `label`) et `start_on` (pas
    `starts_on`). `needs` retombait donc à `[]` sur CHAQUE recherche, quel que
    soit le besoin réellement trouvé par le SQL — le correctif des mots vides
    (PR #3147) ne pouvait rien y changer, il agit un cran plus tôt. Ce test
    rejoue la forme RÉELLE du pont pour un besoin réel et une requête par
    compétence, comme la recette du 27/09."""

    async def _find(_user_id: str, *, query: str | None = None, limit: int = 20, need_id: str | None = None) -> dict:
        assert query == "Java"
        return {
            "data": [
                {
                    "id": "need-java",
                    "title": "Développeur Java / Spring Boot",
                    "account_name": "LVMH",
                    "status": "open",
                    "urgency": "high",
                    "skills": [{"term": "Java"}, {"term": "Spring Boot"}],
                    "start_on": None,
                    "deadline_at": None,
                    "source": "client",
                    "status_changed_at": None,
                    "project_id": "project-lvmh",
                    "contract_kind": "regie",
                }
            ],
            "pagination": {"totalItems": 1},
        }

    monkeypatch.setattr(bellum_api, "find_needs", _find)
    result = await _run("find_needs", {"query": "Java"})
    assert result["needs"] == [
        {
            "id": "need-java",
            "label": "Développeur Java / Spring Boot",
            "account": "LVMH",
            "status": "open",
            "historical": False,  # #3889.2 — un besoin ouvert n'est jamais historique
            "urgency": "high",
            "skills": [{"term": "Java"}, {"term": "Spring Boot"}],
            "starts_on": None,
            "deadline_at": None,
            "deadline_passed": None,
            "start_passed": None,
            "next_action": None,
            "source": "client",
            "status_changed_at": None,
            "project_id": "project-lvmh",
            # #3864 — recopié tel quel depuis la ligne API : le prompt (description
            # de `find_needs`, `need_discovery_block`) dit au modèle de LIRE ce
            # champ pour distinguer un recrutement d'une mission, jamais de le
            # deviner. Avant ce lot, la clé n'existait simplement pas ici.
            "contract_kind": "regie",
        }
    ]
    assert result["total"] == 1
    assert result["truncated"] is False


# ── #3349 — find_needs : un besoin PÉRIMÉ se dit, il ne se devine pas ──────


@pytest.mark.asyncio
async def test_find_needs_flags_a_deadline_and_start_date_already_passed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Recette 30/09 (#3349, cas AWS LVMH) : le besoin dont le démarrage
    (23/09) était dépassé se présentait comme « piste à vérifier en priorité »
    — `starts_on` voyageait déjà, mais RIEN ne disait au modèle qu'elle était
    déjà passée : il comparait lui-même une chaîne ISO à « aujourd'hui », le
    calcul qu'il ratait. `deadline_passed`/`start_passed` sont désormais
    CALCULÉS par l'outil, pas devinés par le modèle."""

    async def _find(_user_id: str, *, query: str | None = None, limit: int = 20, need_id: str | None = None) -> dict:
        return {
            "data": [
                {
                    "id": "need-aws-lvmh",
                    "title": "AWS Cloud Architect",
                    "account_name": "LVMH",
                    "status": "open",
                    "urgency": None,
                    "skills": [{"term": "AWS"}],
                    "start_on": "2026-09-23T00:00:00Z",
                    "deadline_at": "2026-09-20T00:00:00Z",
                    "source": None,
                    "status_changed_at": None,
                    "project_id": "project-lvmh",
                }
            ],
            "pagination": {"totalItems": 1},
        }

    monkeypatch.setattr(bellum_api, "find_needs", _find)
    result = await _run("find_needs", {"query": "AWS LVMH"})
    need = result["needs"][0]
    assert need["deadline_passed"] is True
    assert need["start_passed"] is True
    assert need["source"] is None


@pytest.mark.asyncio
async def test_find_needs_relays_the_screens_next_action_verdict(monkeypatch: pytest.MonkeyPatch) -> None:
    """#3348 (recette prod 30/09, cas « besoin LVMH Java ») : Laura disait
    « périmé » depuis `start_passed` pendant que la page des besoins ouverts
    affichait son `status` (« Matching à lancer ») sans jamais avoir regardé
    la même date — deux verdicts sur le même champ. `next_action` est
    désormais posé côté serveur par `needNextAction` (@bellum/contracts), LA
    MÊME dérivation que l'écran appelle pour sa colonne « Prochaine action » :
    ce test prouve que le pont le relaie tel quel, sans le recalculer."""

    async def _find(_user_id: str, *, query: str | None = None, limit: int = 20, need_id: str | None = None) -> dict:
        return {
            "data": [
                {
                    "id": "need-lvmh-java",
                    "title": "Java Backend Engineer",
                    "account_name": "LVMH",
                    "status": "to_match",
                    "urgency": None,
                    "skills": [{"term": "Java"}],
                    "start_on": "2026-08-01T00:00:00Z",
                    "deadline_at": None,
                    "source": None,
                    "status_changed_at": None,
                    "project_id": "project-lvmh-java",
                    "next_action": "decide_stale_start",
                }
            ],
            "pagination": {"totalItems": 1},
        }

    monkeypatch.setattr(bellum_api, "find_needs", _find)
    result = await _run("find_needs", {"query": "LVMH Java"})
    need = result["needs"][0]
    assert need["next_action"] == "decide_stale_start"


@pytest.mark.asyncio
async def test_find_needs_does_not_flag_a_future_date_as_passed(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _find(_user_id: str, *, query: str | None = None, limit: int = 20, need_id: str | None = None) -> dict:
        return {
            "data": [
                {
                    "id": "need-fresh",
                    "title": "Data Engineer",
                    "account_name": "ACME",
                    "status": "open",
                    "urgency": None,
                    "skills": [],
                    "start_on": "2099-01-01T00:00:00Z",
                    "deadline_at": "2099-01-01T00:00:00Z",
                    "source": "client",
                    "status_changed_at": "2026-09-29T00:00:00Z",
                    "project_id": None,
                }
            ],
            "pagination": {"totalItems": 1},
        }

    monkeypatch.setattr(bellum_api, "find_needs", _find)
    result = await _run("find_needs", {"query": "Data Engineer"})
    need = result["needs"][0]
    assert need["deadline_passed"] is False
    assert need["start_passed"] is False


# ── GA-317 — search_dormant_network : même défaut, `total` déjà présent ─────


@pytest.mark.asyncio
async def test_search_dormant_network_flags_truncation_from_the_total_already_carried(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _dormant(*_a: object, **_k: object) -> dict:
        return {"months": 6, "total": 40, "contacts": [{"contact_id": f"c{i}"} for i in range(20)]}

    monkeypatch.setattr(bellum_api, "dormant_contacts", _dormant)
    result = await _run("search_dormant_network")
    assert result["truncated"] is True


@pytest.mark.asyncio
async def test_search_dormant_network_does_not_flag_when_the_total_matches(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _dormant(*_a: object, **_k: object) -> dict:
        return {"months": 6, "total": 1, "contacts": [{"contact_id": "c1"}]}

    monkeypatch.setattr(bellum_api, "dormant_contacts", _dormant)
    result = await _run("search_dormant_network")
    assert result["truncated"] is False


# ── GA-317 — list_agenda / find_free_slots : la borne existait déjà (25 et 5),
# jamais le drapeau. La sur-lecture d'UN de plus est ce qui rend la coupe
# DÉTECTABLE — demander exactement la borne affichée ne dirait jamais si un
# élément de plus existe au-delà. ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_agenda_caps_display_and_says_the_exact_total(monkeypatch: pytest.MonkeyPatch) -> None:
    # #4064 — le total lu est EXACT (lecture par tranches), la coupe d'affichage reste à 25.
    async def _window(*_a: object, **_k: object) -> tuple[dict, None, None]:
        return {"events": [{"id": f"e{i}", "summary": f"RDV {i}", "cancelled": False} for i in range(30)], "unavailable": []}, None, None

    monkeypatch.setattr(bellum_api, "agenda_window", _window)
    result = await _run("list_agenda")
    assert len(result["events"]) == 25
    assert result["events_read"] == 30
    assert result["truncated"] is True


@pytest.mark.asyncio
async def test_list_agenda_does_not_flag_a_short_week(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _window(*_a: object, **_k: object) -> tuple[dict, None, None]:
        return {"events": [{"id": "e1", "summary": "RDV 1", "cancelled": False}], "unavailable": []}, None, None

    monkeypatch.setattr(bellum_api, "agenda_window", _window)
    result = await _run("list_agenda")
    assert len(result["events"]) == 1
    assert result["truncated"] is False


@pytest.mark.asyncio
async def test_find_free_slots_over_fetches_by_one_to_detect_truncation(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    async def _slots(*_a: object, limit: int = 5, **_k: object) -> list[dict[str, object]]:
        captured["limit"] = limit
        return [{"start": f"2026-09-{10 + i:02d}T09:00:00Z"} for i in range(limit)]

    monkeypatch.setattr(bellum_api, "find_free_slots", _slots)
    result = await _run("find_free_slots")
    assert captured["limit"] == 6
    assert len(result["slots"]) == 5
    assert result["truncated"] is True


@pytest.mark.asyncio
async def test_find_free_slots_does_not_flag_a_short_window(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _slots(*_a: object, **_k: object) -> list[dict[str, object]]:
        return [{"start": "2026-09-10T09:00:00Z"}]

    monkeypatch.setattr(bellum_api, "find_free_slots", _slots)
    result = await _run("find_free_slots")
    assert len(result["slots"]) == 1
    assert result["truncated"] is False


@pytest.mark.asyncio
async def test_find_free_slots_still_reports_an_empty_window(monkeypatch: pytest.MonkeyPatch) -> None:
    """Témoin : le message d'accompagnement d'une fenêtre vide survit à la coupe."""

    async def _slots(*_a: object, **_k: object) -> list[dict[str, object]]:
        return []

    monkeypatch.setattr(bellum_api, "find_free_slots", _slots)
    result = await _run("find_free_slots")
    assert result["slots"] == []
    assert result["truncated"] is False
    assert "note" in result


# ── #2271.19 — get_account_timeline : un compte peut porter jusqu'à 200
# événements (`AccountTimelineService.TIMELINE_MAX`) ; on ne les relaie jamais
# tels quels au modèle sans le dire (GA-318, même motif que GA-317).


@pytest.mark.asyncio
async def test_get_account_timeline_caps_an_unbounded_list_and_says_so(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _timeline(*_a: object, **_k: object) -> dict:
        return {
            "events": [
                {"id": f"action:{i}", "kind": "action", "at": "2026-07-03T09:00:00Z", "label": f"E{i}"}
                for i in range(30)
            ]
        }

    monkeypatch.setattr(bellum_api, "account_timeline", _timeline)
    result = await _run("get_account_timeline", {"account_id": "a-1"})
    assert len(result["events"]) == 20
    assert result["truncated"] is True


@pytest.mark.asyncio
async def test_get_account_timeline_does_not_flag_a_short_history(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _timeline(*_a: object, **_k: object) -> dict:
        return {"events": [{"id": "action:1", "kind": "action", "at": "2026-07-03T09:00:00Z", "label": "E1"}]}

    monkeypatch.setattr(bellum_api, "account_timeline", _timeline)
    result = await _run("get_account_timeline", {"account_id": "a-1"})
    assert len(result["events"]) == 1
    assert result["truncated"] is False


@pytest.mark.asyncio
async def test_get_account_timeline_still_reports_a_real_empty_history(monkeypatch: pytest.MonkeyPatch) -> None:
    """Témoin : un compte réellement sans historique rend `events: []`, jamais une erreur."""

    async def _timeline(*_a: object, **_k: object) -> dict:
        return {"events": []}

    monkeypatch.setattr(bellum_api, "account_timeline", _timeline)
    result = await _run("get_account_timeline", {"account_id": "a-1"})
    assert result["events"] == []
    assert result["truncated"] is False


@pytest.mark.asyncio
async def test_get_account_timeline_refuses_a_foreign_or_missing_account(monkeypatch: pytest.MonkeyPatch) -> None:
    """NON : un compte étranger ou introuvable ne rend jamais une carte."""

    async def _timeline(*_a: object, **_k: object) -> dict:
        return {"error": "account_not_found"}

    monkeypatch.setattr(bellum_api, "account_timeline", _timeline)
    result = await _run("get_account_timeline", {"account_id": "a-x"})
    assert "error" in result
    assert "events" not in result


# ── GA-318 — l'inventaire exhaustif : chaque outil du catalogue est classé ──

#: Classification de CHAQUE outil de `CHAT_TOOLS` — l'inventaire du LOT 14.
#: Trois familles, jamais une quatrième :
#:  - "bounded"  : une sortie liste est plafonnée ET le dit (drapeau ou compte
#:                 exact avant/après).
#:  - "exempt"   : rien n'y grossit sans borne — proposition sans lecture,
#:                 objet unique, catalogue FIXE tenu en code, ou cardinalité
#:                 bornée par un objet réel (un compte, une routine).
#:  - "reported" : une liste existe, n'est pas bornée ou l'est sans le dire, et
#:                 CE LOT ne la corrige pas — la raison renvoie au rapport du
#:                 lot (LOT 14) plutôt que de la cacher dans "exempt".
#: Chaque valeur est (famille, raison) ; la raison n'est jamais vide — une
#: classification sans raison n'en est pas une.
TOOL_BOUND_CLASSIFICATION: dict[str, tuple[str, str]] = {
    # ── Proposition ou lecture d'UN objet nommé par l'appelant : rien à borner
    "compare_accounts": ("exempt", "compare des account_ids EXPLICITEMENT nommés par l'appelant, jamais une recherche"),
    "get_account_briefing": ("exempt", "un dossier, jamais une liste"),
    # #3277.1 (épopée #3277) — un compte NOMMÉ, cinq dimensions FIXES (5P) —
    # jamais une liste qui grossit avec les données.
    "get_account_strategy_5p": ("exempt", "un compte nommé, cinq dimensions fixes du contrat — jamais une liste"),
    # #3258.14 (épopée #3362, lot E25 30/09) — un compte NOMMÉ, deux axes FIXES
    # (intérêt, pénétrabilité) — jamais une liste qui grossit avec les données.
    "get_account_interest_penetrability": (
        "exempt",
        "un compte nommé, deux axes fixes du contrat — jamais une liste",
    ),
    # #3919 — déjà plafonné côté pont (`CopilotBridgeController.accountSignals`) :
    # 5 comptes au plus sans `account_id`, 8 signaux au plus par compte. Relayé
    # tel quel, sans second plafond (même raison que `get_account_coverage_map`).
    "get_account_signals": (
        "exempt",
        "#3919 — 5 comptes / 8 signaux par compte déjà plafonnés côté pont NestJS, relayé tel quel",
    ),
    # #3895 — déjà plafonné côté pont (`CopilotBridgeController.accountNotes`) : 20 notes, 800 caractères
    # chacune, drapeau `truncated`. Relayé tel quel, sans second plafond.
    "get_account_notes": (
        "exempt",
        "#3895 — 20 notes / 800 caractères par note déjà plafonnés côté pont NestJS, drapeau `truncated`, relayé tel quel",
    ),
    # #4759 — page déjà bornée côté pont (`NEEDS_HISTORY_MAX_ROWS_PER_CALL`, `needs-history.limits.ts`), `hasMore`.
    "get_account_needs_history": (
        "exempt",
        "#4759 — 25 lignes par appel au plus, clampées côté pont NestJS, pagination `offset`/`hasMore`, relayé tel quel",
    ),
    # LOT (15/10) DATA-B — trois lectures du dossier déjà collecté, chacune plafonnée à la PROJECTION
    # (`laura_dossier_reads.py`) : jamais le dossier brut.
    "get_company_public_facts": (
        "bounded",
        "quatre natures, 8 lignes chacune (`_FACT_LIMIT`), `total` quand le cache en porte davantage (LOT DATA-B.2)",
    ),
    "get_account_firmographics": (
        "exempt",
        "LOT DATA-B.3 — rubriques de taille FIXE, listes plafonnées à la projection (20 technos détectées, 10 filiales, drapeaux `*_total`)",
    ),
    "get_account_org_chart": (
        "bounded",
        "LOT DATA-B.4 — 25 personnes / 15 liens / 12 sièges / 6 étapes plafonnés côté pont NestJS (`org-chart-projection.ts`), `people_not_shown` + `counts`",
    ),
    "complete_account": (
        "exempt",
        "#4055.4 — quatre sources de taille FIXE (comptes), personnes détectées plafonnées par l'organigramme (25, côté pont)",
    ),
    "dismiss_completion_person": (
        "exempt",
        "#4055.10 — écrit un écart (account_id + nom) et rend un accusé de taille fixe, aucune liste",
    ),
    "get_portfolio_sectors": (
        "bounded",
        "#4055.6 — au plus 8 pages de 25 comptes lues (`_SECTOR_MAX_PAGES`) ; `complete: false` + `accounts_read` quand le portefeuille dépasse",
    ),
    "get_reengagement_report": ("bounded", "_capped() ICI sur `accounts`, cap 20, drapeau `truncated` (#3903)"),
    "propose_people_search": ("exempt", "proposition pure : rôles de l'entrée, plafonnés à `_PEOPLE_SEARCH_MAX_ROLES` (#3869.a)"),
    "get_action_plan": (
        "bounded",
        "chaque geste coupé à ACTION_PLAN_GESTURE_CAP (20), drapeau `truncated` + `total` (#3904.1)",
    ),
    # BEL-SC-239 — un besoin NOMMÉ par l'appelant, dix sections FIXES
    # (`PROPOSAL_SECTION_ORDER`) : jamais une liste qui grossit avec les données.
    "prepare_proposal_pack": ("exempt", "un besoin nommé, dix sections fixes du contrat — jamais une liste"),
    "prepare_message_for_contact": ("exempt", "proposition pure, aucune lecture de liste"),
    "schedule_reminder_for_contact": ("exempt", "proposition pure"),
    # #1995 — une seule personne nommée par le CRM, aucune liste lue.
    "create_contact_from_crm_presence": ("exempt", "proposition pure"),
    # Épopée #2853 (#2157.1) — proposition résolue contre UN compte nommé,
    # aucune liste lue, même patron que `create_contact_from_crm_presence`.
    "create_target_list_from_account": ("exempt", "proposition résolue contre UN compte nommé"),
    # Épopée #2781 (#2150.30, LOT j1 26/09) — proposition pure, aucune écriture
    # ni lecture de liste : même famille que `create_target_list_from_account`.
    "add_account_to_portfolio": ("exempt", "proposition pure, aucune lecture de liste"),
    "enrich_contact": ("exempt", "proposition pure"),
    "export_contact_to_crm": ("exempt", "proposition pure"),
    # #3950.1 (décision Louis 09/10/2026, lot G01) — AUCUNE lecture, AUCUN appel
    # au pont ; `mode` est un vocabulaire fermé (ats/bulk) relayé tel quel vers
    # le MÊME bouton que l'écran Réglages › Export du vivier.
    "launch_vivier_export": ("exempt", "proposition pure, aucun appel au pont"),
    # #2433.7 (lot M10, 09/10) — AUCUNE lecture : le constat de la capture,
    # relayé tel quel vers `POST /feedback` au clic.
    "prepare_bug_report": ("exempt", "proposition pure, aucune lecture de liste"),
    "find_accounts": ("exempt", "prépare des CRITÈRES pour Découvrir, ne lit aucun compte"),
    "prepare_mail_draft": ("exempt", "proposition pure"),
    "prepare_calendar_event": ("exempt", "proposition pure"),
    "plan_account_analysis": ("exempt", "un plan pour UNE entreprise nommée, jamais une liste"),
    "start_account_analysis": ("exempt", "lance UNE analyse déjà planifiée"),
    "analyze_named_companies": ("bounded", "20 noms au plus ICI, 3 homonymes par nom (#4462.2)"),
    "ask_clarification": ("exempt", "options bornées en dur à 3 (`options[:3]`)"),
    "propose_guided_action": ("exempt", "proposition pure"),
    "prepare_consultant_record": ("exempt", "proposition pure, aucun appel au pont"),
    # Épopée #2872 (#2367.6, LOT c5 clôture 26/09) — même famille : une route
    # vers un écran déjà réel, aucune lecture, aucun appel au pont.
    "push_profile": ("exempt", "proposition pure, aucun appel au pont"),
    "toggle_routine": ("exempt", "proposition résolue contre UNE routine nommée"),
    "propose_settings_update": ("exempt", "proposition résolue contre UN champ nommé"),
    # #2124.49-.55 (intégration R) — UNE mission nommée par `mission_id`, quatre
    # champs au plus ; aucune liste lue, rien à couper.
    "propose_mission_proof": ("exempt", "proposition résolue contre UNE mission nommée"),
    # #2409.8 — UNE mission nommée par `mission_id` ; `items` est borné par le
    # CATALOGUE fixe `MISSION_START_ITEMS` (sept clés, `mission-start-
    # readiness.ts`), jamais par une requête qui pourrait grandir.
    "get_mission_start_readiness": ("exempt", "UNE mission nommée ; `items` borné par le catalogue fixe (7 clés)"),
    # #2423.9 — proposition résolue contre UNE mission nommée, aucune liste lue.
    "propose_mission_amendment": ("exempt", "proposition résolue contre UNE mission nommée"),
    # #2276 — ne lit rien : rend la fiche que le modèle a posée, bornée (20 étapes, 10 hypothèses).
    "plan_laura_job": ("exempt", "ne lit rien ; fiche bornée à 20 étapes, 10 hypothèses, 20 sources"),
    "propose_opportunity_update": ("exempt", "proposition résolue contre UNE opportunité nommée (#2324.39)"),
    # #2376 — proposition résolue contre UN contact nommé ; `next_questions` est
    # borné en code à quatre éléments (`next_questions[:4]`), aucune liste lue.
    "prepare_cold_call": ("exempt", "proposition résolue contre UN contact nommé, `next_questions` borné à 4"),
    "pin_memory_fact": ("exempt", "écrit une phrase, ne lit rien"),
    # #2391 — les créneaux libres SONT bornés (`bellum_api.find_free_slots`,
    # `limit=50`) ; les blocs candidats viennent du MODÈLE, jamais d'une
    # recherche, mais une liste écrite par un modèle n'est pas bornée pour
    # autant — même motif que `prepare_campaign`, bornés à 20
    # (`_FOCUS_PLAN_MAX_CANDIDATE_BLOCKS`).
    "propose_focus_plan": (
        "exempt",
        "créneaux plafonnés par find_free_slots (limit=50) ; blocs candidats bornés à 20 "
        "(`_FOCUS_PLAN_MAX_CANDIDATE_BLOCKS`)",
    ),
    # #2770 / #2852 (lot X14) — même moteur que `propose_focus_plan`, jour après jour :
    # blocs candidats bornés à 20, créneaux plafonnés par find_free_slots.
    "propose_weekly_plan": (
        "exempt",
        "créneaux plafonnés par find_free_slots (limit=50) ; blocs candidats bornés à 20 "
        "(`_FOCUS_PLAN_MAX_CANDIDATE_BLOCKS`), répartis sur 7 jours au plus",
    ),
    "prepare_campaign": (
        "exempt",
        "#1903.10 / #1935 — résout des contact_id EXPLICITEMENT nommés par l'appelant, "
        "jamais une recherche, et bornés à 25 (`_CAMPAIGN_MAX_CONTACTS`)",
    ),
    # #2470 — le tour d'horizon LIT une liste, et il la borne : `limit` est
    # ramené dans [1, _ACCOUNT_SEARCH_MAX_ITEMS] AVANT d'atteindre le registre,
    # puis la sortie est recoupée (`items[:limit]`). La borne n'est pas un prix,
    # c'est ce qu'une bulle peut se lire — et c'est aussi le maximum que la carte
    # `account_ranking` du contrat accepte (20 items).
    "run_account_search": (
        "bounded",
        "#2470 — `limit` borné à `_ACCOUNT_SEARCH_MAX_ITEMS` (20) à l'entrée ET la sortie "
        "recoupée `items[:limit]` ; la borne est annoncée dans la description de l'outil",
    ),
    "suggest_account_alternatives": (
        "bounded",
        "#3181.1 — pool interrogé via `_run_account_search` déjà borné à "
        "`_ALTERNATIVES_POOL_SIZE` (8), puis `alternatives` recoupée à `_ALTERNATIVES_MAX` "
        "(5) par le `break` de la boucle de filtrage — jamais plus de 5 alternatives rendues",
    ),
    "offer_reply_options": (
        "bounded",
        "#2679 — `_reply_options` recoupe à l'exécution : `precisions[:QUESTIONS_MAX]`, "
        "`options[:OPTIONS_MAX]` par précision, chaque libellé tronqué à OPTION_MAX et chaque "
        "question à QUESTION_MAX ; ne lit rien, et une précision sans deux réponses est lâchée "
        "plutôt que complétée",
    ),
    "note_unrouted_request": (
        "exempt",
        "#1949.23 — rend une catégorie FERMÉE (trois valeurs), ne lit rien et ne renvoie aucune liste",
    ),
    "note_thread_context": (
        "bounded",
        "#2268.1/.5/.10 — `excluded[:EXCLUDED_MAX]` et `decisions[:DECISIONS_MAX]` recoupées à l'exécution "
        "(`_thread_note_excluded` / `_thread_note_decisions`), `goal` une chaîne unique tronquée à GOAL_MAX ; "
        "ne lit rien, ne renvoie jamais de liste au-delà de ces plafonds",
    ),
    "get_account_access": (
        "exempt",
        "borné par la structure réelle d'UN compte (entités classées), pas par du volume de recherche",
    ),
    "get_esn_on_account": ("exempt", "borné par la structure réelle d'UN compte (partenaires observés dessus)"),
    # #3345.2 (LAU-FINAL-255, recette prod 30/09) — même famille que
    # `get_account_access`/`get_esn_on_account` : `QualificationLeadsService
    # .decisions` lit les décisions d'UN compte (workspace_id + account_id),
    # jamais une recherche à volume.
    "get_qualification_lead_decisions": (
        "exempt",
        "borné par la structure réelle d'UN compte (ses pistes à qualifier, jamais une recherche)",
    ),
    # #2910 (#2322.10) — le pont (`CopilotBridgeController.crmPresence`) et le
    # client HubSpot bornent déjà `contacts`/`open_deals` en amont (`PRESENCE_
    # PAGE`, `hubspot.client.ts`) : rien à recouper une seconde fois ici.
    "get_crm_presence": ("exempt", "contacts/affaires déjà bornés en amont par le pont (PRESENCE_PAGE)"),
    # Épopée #2872 (#2367.11) — le REX d'UN consultant : `ConsultantsService
    # .listFeedback` (pont NestJS) rend les pushs d'UNE fiche, jamais une
    # recherche à volume — même raison que `get_account_access`.
    # #2857 (#2201.31) — explique UNE demande d'approbation nommée par
    # `approval_request_id`, jamais une recherche : même famille que
    # `get_account_access`/`get_esn_on_account`.
    "explain_approval_card": ("exempt", "UNE demande d'approbation nommée par approval_request_id, jamais une liste"),
    "get_consultant_push_feedback": (
        "exempt",
        "borné par la structure réelle d'UN consultant (son historique de push), pas par du volume de recherche",
    ),
    "get_orientations_to_follow": (
        "exempt",
        "#3265.12 — borné à la source : `fetch_orientation_actions` plafonne à 5 lignes (limit), "
        "une par réorientation récente, jamais un volume de recherche",
    ),
    "explain_talent_duplicate": (
        "exempt",
        "#2327.26 — borné par la structure réelle d'UNE fiche talent (ses rapprochements "
        "possibles, déjà cloisonnés par `TalentIdentityService.reportForTalent`), pas par "
        "du volume de recherche — même raison que `get_account_access`.",
    ),
    "explain_approval_card": (
        "exempt",
        "#2857 (#2201.31, 26/09) — objet unique : UNE demande d'approbation, déjà bornée par "
        "`WorkflowRunnerService.explainApprovalRequest` — pas une liste, pas de volume.",
    ),
    "check_consultant_positioning": (
        "exempt",
        "#3182.3 (épopée #3248) — objet unique : UN consultant sur UN run déjà exécuté, "
        "`submissionPreflight` rend un nombre FIXE et petit de `checks`/`missing` (le catalogue "
        "des points de la porte G4), pas une liste à volume — même raison que "
        "`explain_talent_duplicate`.",
    ),
    "run_matching": (
        "bounded",
        "LOT 18 (GA-326) — `MatchingService.execute` (apps/api) classe TOUT le "
        "vivier contre le besoin, sans aucune borne sur ce qui est RENDU (seul le "
        "journal PERSISTÉ est plafonné à 500 lignes, question distincte gardée sous "
        "`journalTruncated`). `_capped()` ICI sur les quatre buckets "
        "(recommended/borderline/excluded/notEvaluable), `identities` réduit aux "
        "profils gardés — jamais un nom sans profil à côté.",
    ),
    # ── Catalogues FIXES tenus en code, pas des recherches sur du volume ────
    "get_routines": ("exempt", "catalogue FIXE tenu dans `routine-catalog.ts`, pas une recherche"),
    "get_settings_overview": ("exempt", "catalogue FIXE des écrans/champs de réglages"),
    "get_workspace_vocabulary": ("exempt", "lexique + listes métier curatées par l'espace, petite cardinalité admin"),
    "get_user_context": ("exempt", "objet unique"),
    "get_workspace_health": ("exempt", "objet unique, le score lui-même ne traverse pas (D50)"),
    # BEL-SC-224 (#3253) — objet unique ; `secondary_bottlenecks` borné à
    # MAX_SECONDARY_BOTTLENECKS (2), `supporting_evidence`/`contradictory_evidence`
    # à MAX_EVIDENCE_ITEMS (5), `not_evaluable_families` au catalogue FIXE des
    # quatre familles (`weakest-link-diagnosis.ts`) — jamais une recherche.
    "get_weakest_link_diagnosis": (
        "exempt",
        "objet unique ; toutes ses listes bornées par des constantes fixes du contrat (2/5/4)",
    ),
    "get_feature_adoption": ("exempt", "une ligne par famille de fonctionnalités, catalogue FIXE"),
    "get_blocking_issues": ("exempt", "une ligne par connecteur possible, catalogue FIXE"),
    # ── Objets uniques ou petites listes à cardinalité structurellement fixe ─
    "get_pipeline": ("exempt", "cinq colonnes fixes du pipeline, jamais une par affaire"),
    "get_probable_quarter": ("bounded", "_capped() ICI sur `deals`, cap 20, drapeau `truncated` + `deals_total` (#4016.1d)"),
    "get_revenue": ("exempt", "quatre lignes fixes (signé/produit/facturé/encaissé)"),
    # #2900 (#2415.10, 26/09) — objet unique (l'encaissé moins le contesté),
    # même famille que get_revenue/get_capacity juste au-dessus.
    "get_confirmed_revenue": ("exempt", "objet unique (encaissé moins contesté)"),
    "get_capacity": ("exempt", "objet unique (jours d'équipe)"),
    # #2425.8 (W43, 24/09) — get_forecast_horizons : chaque tableau
    # (components/scenarios/decisions/gap.causes) est un catalogue FIXE de
    # catégories connues à l'avance (sept composantes, quatre scénarios,
    # quatre causes) — jamais une ligne par mission ou par opportunité.
    "get_forecast_horizons": (
        "exempt",
        "quatre tableaux à cardinalité FIXE (composantes/scénarios/décisions/causes), jamais une ligne par affaire",
    ),
    # ── Déjà bornés (GA-295, LOT 3) ──────────────────────────────────────────
    "search_talents": (
        "bounded",
        "limit=20 côté NestJS (talentSearchQuerySchema), `truncated` depuis `total` (GA-295)",
    ),
    "search_proofs": ("bounded", "_capped() ICI, cap 20 (GA-295)"),
    "get_chain_blockers": (
        "bounded",
        "capWithTruncationFlag côté NestJS, limite 5 (GA-295) — PÉRIMÈTRE espace"
        " et non personnel malgré la description : voir rapport LOT 14 §4",
    ),
    "get_interventions": ("bounded", "_capped() ICI, cap 20 (GA-295) — SQL déjà à 100 sans le dire"),
    "get_mission_risks": ("bounded", "_capped() ICI, cap 20 (GA-295)"),
    "list_reactivation_pool": ("bounded", "_capped() ICI sur `entries` quand un segment est demandé (GA-295)"),
    "search_rfps": ("bounded", "_capped() ICI sur la forme liste, sans `rfp_id` (GA-295)"),
    "list_accounts_to_act": ("bounded", "capWithTruncationFlag côté NestJS, limite 20 (GA-295)"),
    "list_actions_awaiting_outcome": ("bounded", "capWithTruncationFlag côté NestJS, limite 20 (#3211.9)"),
    "select_message_template": ("bounded", "un modèle ; `rejected` plafonné à 10 côté NestJS avec `rejectedTotal` (#3427)"),
    "check_message_before_send": ("exempt", "un message soumis, une liste FIXE de règles tenue en code (#3422.20)"),
    "search_mailbox": ("bounded", "limit=20 transmis au pont, `truncated` relayé (déjà en place avant GA-295)"),
    "read_mail_thread": ("bounded", "6 messages × 4 000 caractères ICI, `truncated` relayé (#4016 L3)"),
    "read_beeper_conversation": ("bounded", "10 messages × 4 000 caractères ICI, liste limitée à 25 par l'API, `truncated` relayé (#4406.5)"),
    # ── Bornés ce lot (LOT 14, GA-317) ───────────────────────────────────────
    "search_missions": ("bounded", "_capped() ICI, cap 20 (LOT 14, GA-317)"),
    "get_timesheets": ("bounded", "_capped() ICI sur `lines`, cap 20 (LOT 14, GA-317)"),
    "get_invoice_blockers": ("bounded", "_capped() ICI sur `blocked`, cap 20 (LOT 14, GA-317)"),
    "get_overdue_payments": ("bounded", "_capped() ICI sur `items`, cap 20 (LOT 14, GA-317)"),
    "search_partners": ("bounded", "_capped() ICI sur `partners`, cap 20 (LOT 14, GA-317)"),
    "find_needs": ("bounded", "limit borné à 50 côté NestJS, `truncated` ICI depuis `total` (LOT 14, GA-317)"),
    "search_dormant_network": (
        "bounded",
        "limit borné à 50 côté NestJS, `truncated` ICI depuis `total` (LOT 14, GA-317)",
    ),
    "list_agenda": ("bounded", "lecture par tranches (#4064), total exact, puis _capped() à 25 ICI (LOT 14, GA-317)"),
    "list_records": (
        "bounded",
        "carte `file_export` coupée à MAX_ROWS (200, borne du contrat), `truncated` + total lu dits ICI (#4065)",
    ),
    "find_free_slots": ("bounded", "sur-lecture de 1 (limit=6) puis _capped() à 5 ICI (LOT 14, GA-317)"),
    # #3193.2 (épopée #3217, lot E3 28/09 suite) — même patron que
    # `find_free_slots` : sur-lecture d'UN (`top_k=6`) puis `_capped()` à 5 ICI.
    "search_sector_referential": (
        "bounded",
        "sur-lecture de 1 (top_k=6) puis _capped() à 5 ICI (lot E3 28/09 suite)",
    ),
    # #4281.1 / #4282.9 (19/10) — besoins : sur-lecture de 1 puis 15 ; radar : comptes ≤ 30,
    # empreinte ≤ 15 (`technology_radar.py`), besoins ≤ 20 (`dataforge_needs._DEFAULT_LIMIT`).
    "search_historical_needs": ("bounded", "sur-lecture de 1 puis 15 lignes, `truncated` dit ICI (#4281.1)"),
    "technology_radar": ("bounded", "comptes ≤ 30, empreinte ≤ 15, besoins ≤ 20 — bornes de technology_radar.py"),
    "search_job_offers": ("bounded", "offres ≤ 30, `truncated` dit ICI (job_offers_search.OFFERS_RETURNED_MAX)"),
    "search_our_base": ("bounded", "≤ 15 lignes par famille, `truncated`/`hasMore` + `total` mesuré dits ICI (#4792)"),
    # ── Gaps de LOT 14, VÉRIFIÉS et corrigés par LOT 18 (GA-326) ─────────────
    "get_daily_briefing": (
        "bounded",
        "LOT 18 — `accountsToWatch`/`actions` (BriefingService.buildAccountsToWatch, "
        "aucune borne) étaient déjà ENTIÈREMENT en mémoire ICI au moment de la lecture : "
        "`_capped()` sur les deux, `accounts_to_watch_truncated`/`actions_truncated`.",
    ),
    "prepare_day_brief": (
        "bounded",
        "LOT 18 — `limit: 25` en dur côté NestJS (`dayBrief`) est passé à 26 (sur-lecture "
        "d'UN, même motif que `list_agenda`/GA-317) ; `_capped()` à 25 ICI, `truncated` "
        "dérivé du témoin surnuméraire.",
    ),
    "get_import_overview": (
        "bounded",
        "LOT 18 — l'historique grandit avec le temps, mais était déjà DOUBLEMENT borné "
        "(SQL `take: 50` dans `ImportService.list`, puis `sessions.slice(0, 5)` dans "
        "`lauraImportOverview`, copilot-bridge.controller.ts) sans jamais le dire. "
        "`recent_sessions_truncated` ajouté à la source (comparaison déjà en mémoire, "
        "`sessions.length > 5`), relayé TEL QUEL ici.",
    ),
    "get_memory": (
        "bounded",
        "LOT 18 — le registre grandit ligne à ligne au fil des tours ; une seule couche "
        "(`MemoryService.listFacts`) porte déjà un plafond dur à 200, jamais dit. "
        "`_capped()` ICI sur `entries` (les six couches fusionnées), cap 20.",
    ),
    "get_territory_overview": (
        "bounded",
        "LOT 18 — `market.technologies`/`hiringAccounts`, `overflow.esn`, "
        "`accessible.tenders`/`awards` n'ont toujours aucun `.max()` au contrat partagé "
        "(le calcul vit dans apps/ia/app/routers, hors périmètre, et l'écran /territory "
        "a besoin de sa pleine largeur) : `_capped()` sur les cinq ICI, au dernier point "
        "propre à Laura — sans toucher au contrat ni à `ia.client.ts`.",
    ),
    "get_job_changes": (
        "reported",
        "chaque requête SQL brute est déjà `LIMIT 20` (`contactMovesAccountsSql` / "
        "`contactMovesEsnSql`, crm-routines.service.ts) mais ne le dit jamais — un "
        "drapeau exact demanderait de monter la LIMIT à 21 dans un service métier "
        "hors du périmètre autorisé de ce lot ; voir rapport LOT 14 §6. PÉRIMÈTRE "
        "espace (workspace_id seul) sous une description qui dit « portefeuille », "
        "comme `search_dormant_network` qui, LUI, filtre par userId : voir rapport §4. "
        "Hors périmètre de LOT 18 également (un autre agent y écrit).",
    ),
    "search_market_memory": (
        "bounded",
        "LOT 18 — plafond dur à 50 côté NestJS (`MARKET_SEARCH_MAX_LIMIT`) inchangé ; "
        "`searchByFilters` sur-lit désormais d'UN (51) et porte `truncated` — même motif "
        "que `list_agenda`/GA-317 — relayé TEL QUEL ici.",
    ),
    # #2271.19 — l'historique d'un compte peut porter jusqu'à 200 événements
    # (`AccountTimelineService.TIMELINE_MAX`, apps/api) : `_capped()` ICI sur
    # `events`, cap 20 (`_LIST_TOOL_CAP`), même motif que GA-317.
    "get_account_timeline": (
        "bounded",
        "#2271.19 — `AccountTimelineService.forAccount` (apps/api) peut rendre jusqu'à "
        "200 événements ; `_capped()` ICI sur `events`, cap 20 (`_LIST_TOOL_CAP`).",
    ),
    # #2623.1 — le classement complet d'un compte peut compter des dizaines de
    # contacts ; le pont (`CopilotBridgeController.accountContacts`) plafonne
    # DÉJÀ à cinq et rend `truncated` — relayé tel quel ici, jamais recalculé.
    "get_account_contacts": (
        "bounded",
        "#2623.1 — `CopilotBridgeController.accountContacts` (apps/api) plafonne À CINQ "
        "et rend `truncated` ; relayé tel quel, sans second plafond côté IA.",
    ),
    # #2301 — la prélecture de compte lit QUATRE listes potentiellement non
    # bornées (filiales, contacts, signaux, observations structurelles) : les
    # trois lues directement sur la ligne `accounts` sont plafonnées PAR
    # `compile_account_preflight` (`_LIST_CAP`, même valeur que `_LIST_TOOL_CAP`)
    # et portent chacune leur `truncated`/`subsidiaries_truncated` ; les contacts
    # relaient tel quel le plafond et le `truncated` déjà posés par
    # `get_account_contacts` (#2623.1), sans second calcul (GA-26).
    "get_account_preflight": (
        "bounded",
        "#2301 — `compilers/account_preflight.py` plafonne filiales/signaux/observations à "
        "`_LIST_CAP` (20) et le dit (`truncated`/`subsidiaries_truncated`) ; les contacts "
        "relaient tel quel le plafond ET le `truncated` déjà posés par `get_account_contacts`.",
    ),
    # #2300 — compile un contrat à partir de champs EXPLICITEMENT fournis par
    # l'appelant (raw_goal, exclusions, hypothèses, sous-tâches) et d'un
    # catalogue FIXE de dix-sept objectifs tenu en code
    # (`CANONICAL_ACCOUNT_GOALS`, `app/services/compilers/account_work_contract.py`) ;
    # aucune recherche, rien à couper.
    "get_account_work_contract": (
        "exempt",
        "#2300 — champs EXPLICITEMENT fournis par l'appelant plus un catalogue FIXE de "
        "dix-sept objectifs tenu en code ; aucune recherche, rien à couper",
    ),
    "get_account_suitability_verdict": (
        "exempt",
        "#3179 — `account_suitability.compute_account_suitability` rend AU PLUS cinq axes "
        "mesurés (dominant_reasons/blocking_factors n'en citent jamais plus) et un registre "
        "FIXE de neuf axes non évalués (`UNEVALUATED_AXES`, jamais dérivé d'une liste "
        "utilisateur) ; aucune recherche, rien qui grandit avec le compte.",
    ),
    # #2302 — DÉFAUT D'INTÉGRATION mesuré à la fusion de la vague 14 (22/09) : le
    # lot #2302 n'a pas classé son propre outil dans ce registre GA-318. Lecture
    # de `raw_analysis.entities_exhaustive` (une entité par entrée du graphe
    # d'organisation) SANS aucun `_capped()` ni `truncated` — ni dans
    # `resolve_commercial_territory` (`compilers/territory_resolver.py`) ni dans
    # l'exécuteur (`chat_tools.py`). `excluded` en particulier peut grossir sans
    # borne. Corrigible par un `_LIST_CAP` comme `get_account_preflight`, mais
    # hors périmètre de cette intégration (un correctif de plafond change une
    # sortie déjà en prod ailleurs) : "reported", pas "exempt".
    "resolve_account_territory": (
        "reported",
        "lit entities_exhaustive (raw_analysis) sans aucun plafond ni drapeau `truncated` ; "
        "`excluded` peut grossir sans borne — non classé par #2302, ajouté à l'intégration "
        "vague 14 (22/09).",
    ),
    # #2308 — trois axes de TAILLE FIXE (10 familles de rôle, 6 périmètres, 8
    # étapes commerciales, toujours nommés en entier) plus les gaps, DÉJÀ
    # plafonnés côté API (`MAX_CHAT_COVERAGE_GAPS` = 8,
    # `chat-coverage-map.ts::buildGaps`) — borné par la structure fixe de la
    # carte, jamais par du volume de recherche, même raison que
    # `get_account_access`.
    "get_account_coverage_map": (
        "exempt",
        "#2308 — trois axes de taille FIXE (10/6/8, toujours nommés en entier) et des gaps "
        "déjà plafonnés côté API (`MAX_CHAT_COVERAGE_GAPS`) ; relayé tel quel, sans second "
        "plafond côté IA — borné par la structure d'UN compte, pas par du volume de recherche.",
    ),
    # #2324 — le compilateur d'opportunité (chantier CHAT-3).
    "compile_opportunity": (
        "exempt",
        "#2324 — proposition résolue contre UN compte EXPLICITEMENT nommé "
        "(`account_id`), aucune liste lue : `_owned_account_dossiers` rend au plus "
        "la fiche de ce compte.",
    ),
    "get_pipeline_health": (
        "bounded",
        "#2324.40/43/44/46/47/48 — `_capped()` ICI sur `needsAttention` ET "
        "`recommendedToClose` (cap 20 chacune, `_LIST_TOOL_CAP`), `truncated` "
        "vrai si l'une ou l'autre a mordu. #2325 (23/09/2026) — même filet posé "
        "sur `priorityDeals`/`dealsToWatch`, DÉJÀ bornés à cinq/trois côté pur "
        "(`opportunity-pipeline-health.ts`) : `_capped()` ici ne coupe rien de "
        "plus, il tient la même promesse que ses deux voisins.",
    ),
    # #4611 — l'état du travail lancé : sept familles au plus (`WORK_FAMILIES`), cinq raisons d'échec au plus
    # par famille (`WORK_FAILURES_PER_FAMILY`), bornés côté API par la structure du contrat, pas par du volume.
    "get_work_progress": (
        "exempt",
        "#4611 — la forme est FIXE : sept familles × quatre compteurs, et au plus `WORK_FAILURES_PER_FAMILY` "
        "(5) raisons d'échec par famille, plafonnées côté API (`workFamilyProgress`) ; relayé tel quel, sans "
        "second plafond côté IA — borné par le contrat, jamais par du volume de lecture.",
    ),
    # #2322 — le compilateur de besoin : `account_candidates` ne rend jamais la
    # liste brute des comptes ressemblants. Classifié "bounded" par le fix
    # #2322 de la vague 16 (9df8b7c86) après lecture du code — la version
    # "reported" de la vague 15 décrivait un gap déjà refermé par ce fix,
    # gardée le temps de l'audit, pas après.
    "compile_need": (
        "bounded",
        "#2322 — `_accounts_named_like` plafonne sa requête à "
        "`_NEED_ACCOUNT_MATCH_LIMIT` (50) ; `resolve_account` filtre ensuite ce "
        "lot sur une correspondance EXACTE de nom normalisé avant de le rendre "
        "dans `account_candidates` — deux plafonds, jamais la liste brute des "
        "comptes ressemblants.",
    ),
    # #2721 — Laura EXÉCUTE une recherche web plutôt que d'expliquer comment la
    # faire (retour Loïc Inacio, 22/09/2026).
    "web_search": (
        "bounded",
        "#2721 — `execute_web_search` (web_search_tool.py) recoupe ICI à "
        "`hits[:_MAX_RESULTS]` (8) avant de rendre `results` ; aucun `truncated` "
        "n'est nécessaire, la source (`search_web`) rend déjà au plus `count` "
        "résultats et ce n'est pas un tour d'horizon exhaustif à annoncer coupé.",
    ),
    # #2294 — une personne à travers TOUS les comptes de l'espace.
    "search_workspace_contacts": (
        "bounded",
        "#2294 — `limit` plafonné à 25 ICI (`_WORKSPACE_CONTACTS_MAX`) ET par le DTO "
        "NestJS (`CopilotContactsSearchDto`, max 25) ; `truncated` porté par le pont "
        "depuis `pagination.totalItems`.",
    ),
    # #2148.4 (#2848) — un compte déjà analysé, à travers TOUT le portefeuille.
    "search_workspace_accounts": (
        "bounded",
        "#2148.4 — `limit` plafonné à 25 ICI (`_WORKSPACE_ACCOUNTS_MAX`) ET par le "
        "DTO NestJS (`CopilotAccountsSearchDto`, max 25) ; `truncated` porté par le "
        "pont depuis `pagination.totalItems`, même construction que "
        "`search_workspace_contacts`.",
    ),
    # #3094 — l'inverse de `search_workspace_accounts` : on part du MEMBRE.
    "get_accounts_by_owner": (
        "bounded",
        "#3094 — `limit` plafonné à 25 ICI (`_WORKSPACE_ACCOUNTS_MAX`, même "
        "constante que `search_workspace_accounts`) ET par le DTO NestJS "
        "(`CopilotAccountsByOwnerDto`, max 25) ; pas de `truncated` — le pont ne "
        "rend jamais plus que `limit` comptes pour un seul membre, aucune page "
        "au-delà à signaler.",
    ),
    # #2313 — RELATION-FIRST ACCOUNT ENTRY. Pur relais vers
    # `relation_first_entry` (GA-26) : aucune liste lue, sans I/O ni
    # persistance — le checklist, la capacité et la séquence sont calculées
    # sur les champs déjà nommés par l'appelant dans `tool_input`.
    "declare_known_contact": (
        "exempt",
        "#2313 — proposition pure, aucune lecture de liste : relais direct vers "
        "`relation_first_entry.verify_before_recommend`/`relational_capability`/"
        "`can_introduce`, appliqués aux champs fournis par l'appelant.",
    ),
    # #2337 — le terrain de jeu multi-talents.
    "plan_talent_territory": (
        "bounded",
        "#2337 — `compile_territory_plan` coupe ICI : au plus `MAX_ACTIVE_CAPACITY` (10) "
        "comptes actifs et `RESERVE_SIZE` (5) en réserve, le reste COMPTÉ dans "
        "`beyond_capacity` ; deux à quatre talents ; le pont borne les besoins lus à 200 "
        "et relaie `truncated`.",
    ),
    # #2392 — la clôture de fin de journée, relayée telle que NestJS la compile.
    "compile_day_closure": (
        "bounded",
        "#2392 — bornée côté NestJS : `TasksService.openForUser` (100) et "
        "`closedOrCreatedSince` (100), les fils sortants par `buildMailBlock` "
        "(`limit: 10`), les cartes à valider par `DAY_CLOSURE_CARDS_MAX` (10). "
        "Le relais ne recompose rien.",
    ),
    # #2338.8 — UNE mission nommée par `mission_id` ; `missing`/`reserves` ne
    # peuvent jamais dépasser les 7 entrées de `MISSION_START_ITEMS` (catalogue
    # FIXE tenu en code, `mission-start-readiness.ts:25-36`), jamais une
    # recherche ni une liste qui grossirait avec les données.
    "get_mission_start_readiness": (
        "exempt",
        "UNE mission nommée par mission_id ; missing/reserves bornés par le catalogue FIXE "
        "MISSION_START_ITEMS (7 entrées au plus)",
    ),
    # #1950.4 / .7 / .12 / .13 — le résumé du plan : ne lit rien, borne ce que
    # le modèle a nommé.
    "describe_plan": (
        "bounded",
        "`_plan_brief` recoupe à l'exécution : objectif tronqué à PLAN_BRIEF_TEXT_MAX, chaque "
        "liste coupée à PLAN_BRIEF_ITEMS_MAX et chaque entrée à PLAN_BRIEF_ITEM_MAX ; une liste "
        "vide sort, et un plan sans objectif est refusé plutôt que complété",
    ),
    # #2792 — le compilateur d'expansion de compte (épopée Account Expansion).
    "compile_account_expansion": (
        "bounded",
        "`leads` en entrée est borné par le schéma (`maxItems` = huit, une par piste du "
        "catalogue) ; `execute_compile_account_expansion` ne lit AUCUNE liste externe — une "
        "seule fiche compte via `resolve_account` — et rend au plus EXPANSION_MAX_PROPOSALS "
        "(trois) pistes retenues, `rejected` restant borné par la taille de l'entrée elle-même.",
    ),
    # #2273 (LAU-FINAL-015, épopée #2959, LOT g10 26/09) — les 5 filtres de
    # qualification commerciale : `QUALIFICATION_FILTERS` (5 clés FIXES tenues
    # en code, `compilers/sales_qualification_filters.py`) ; aucune liste
    # externe lue, rien qui grossit avec le volume de données du compte.
    "evaluate_account_qualification_filters": (
        "exempt",
        "#2273 — cinq filtres FIXES tenus en code (`QUALIFICATION_FILTERS`), jamais un volume "
        "qui dépend de la taille du compte ; rien à couper.",
    ),
    # #2319 (revue manager) — `actionsCompleted`/`actionsStalled`/`risks`
    # viennent de TOUS les items/missions d'UN compte (`copilot-bridge.controller.ts
    # ::accountManagerReview`), sans plafond côté API ni second plafond ICI :
    # un compte à l'historique long peut rendre les trois listes en entier.
    # Corrigible par un `_capped()` comme `get_account_timeline`, mais hors
    # périmètre de cette intégration (un correctif de plafond change une
    # sortie déjà en prod ailleurs) : "reported", pas "bounded".
    "get_account_manager_review": (
        "reported",
        "#2319 — `actionsCompleted`/`actionsStalled`/`risks` relayés tels que "
        "`accountManagerReview` (NestJS) les rend, sans plafond : un compte à l'historique "
        "long peut les rendre en entier. Non corrigé ce lot.",
    ),
    # #2320.24 (épopée #2967) — `CommercialTransitionsService.history()` ne
    # borne pas sa requête (aucun `LIMIT`, tri ASC sur `occurred_at`) : un
    # besoin qui oscillerait entre statuts (veille/réactivation) un grand
    # nombre de fois rendrait sa chronologie en entier. Non corrigé ce lot,
    # même raison que `get_account_manager_review` juste au-dessus.
    "get_need_transition_history": (
        "reported",
        "#2320.24 — `transitions` relayée telle que `CommercialTransitionsService.history()` "
        "la rend, sans plafond ni `LIMIT` côté requête. Non corrigé ce lot.",
    ),
    # #2320.26/.27 (épopée #2967) — proposition pure, aucune liste lue : le
    # verdict (`needTransitionCheck`) porte sur UN besoin nommé par `need_id`.
    "propose_need_transition": (
        "exempt",
        "#2320.26/.27 — proposition sur UN besoin nommé par need_id, aucune liste lue.",
    ),
    # #2339.1 (épopée #2795) — même dette que `get_need_transition_history`
    # juste au-dessus, ÉLARGIE : `journal()` fusionne jusqu'à QUATRE appels de
    # `CommercialTransitionsService.history()` (besoin, shortlist,
    # positionnement, mission), chacun sans `LIMIT`. Non corrigé ce lot, même
    # raison — corriger `history()` changerait une sortie déjà en prod
    # ailleurs (`get_need_transition_history`, `needStatusHistory`).
    "get_need_journal": (
        "reported",
        "#2339.1 — `entries` fusionne jusqu'à quatre journaux `CommercialTransitionsService."
        "history()` (besoin/shortlist/positionnement/mission), aucun n'a de `LIMIT`. Non corrigé "
        "ce lot, même dette que `get_need_transition_history`.",
    ),
    # #2339.2 — verdict sur UN besoin nommé par need_id : `missing` est bornée
    # par les DEUX seules clés possibles (`consultant_engaged`,
    # `mission_already_exists`), jamais une liste qui grossirait avec la donnée.
    "get_need_mission_handoff_check": (
        "exempt",
        "#2339.2 — UN besoin nommé ; `missing` bornée par les deux seules clés possibles.",
    ),
    # #2339.3 — `fields` a la taille FIXE de `_need_compiler.FIELD_SHAPES`
    # (27 entrées, catalogue tenu en code) : elle ne grossit jamais avec la
    # donnée du besoin, seule la VALEUR de chaque ligne varie.
    "get_need_field_overview": (
        "exempt",
        "#2339.3 — `fields` a la taille FIXE de `_need_compiler.FIELD_SHAPES` (27 entrées), "
        "jamais une liste qui dépend du volume de données du besoin.",
    ),
    # #2339.5/.6 — `candidates` est bornée par `NEED_COMMERCIAL_STATE_LIST_MAX`
    # (20, `need-commercial-state.service.ts`), posée dans CE lot plutôt que
    # laissée en dette.
    "find_need_duplicates": (
        "bounded",
        "#2339.5/.6 — `candidates` coupée à 20 côté NestJS (`NEED_COMMERCIAL_STATE_LIST_MAX`), "
        "posée dans ce lot.",
    ),
    # #2339.8 — même patron que `get_mission_start_readiness` juste au-dessus :
    # `items` a la taille FIXE du catalogue (sept entrées, quatre bloquantes +
    # trois calculées), jamais une liste qui grossit avec la donnée.
    "get_mission_start_checklist": (
        "exempt",
        "#2339.8 — UNE mission nommée ; `items` bornée par le catalogue FIXE (sept entrées), "
        "même patron que `get_mission_start_readiness`.",
    ),
    # #2339.10 — `known`/`unknown` recoupent la même taille FIXE de 27 champs
    # que `get_need_field_overview` juste au-dessus.
    "get_need_summary": (
        "exempt",
        "#2339.10 — `known`/`unknown` recoupent la taille FIXE de 27 champs de "
        "`get_need_field_overview`, jamais un volume qui dépend de la donnée.",
    ),
    # #2339.11 — `missions` est bornée par `NEED_COMMERCIAL_STATE_LIST_MAX`
    # (20), même borne que `find_need_duplicates` juste au-dessus.
    "get_need_conversion_result": (
        "bounded",
        "#2339.11 — `missions` coupée à 20 côté NestJS (`NEED_COMMERCIAL_STATE_LIST_MAX`), "
        "posée dans ce lot.",
    ),
    # #2339.13 — verdict sur UN besoin nommé par need_id : `reasons` est bornée
    # par les TROIS seules clés possibles du calcul, jamais une liste qui
    # grossirait avec la donnée.
    "get_need_no_go_state": (
        "exempt",
        "#2339.13 — UN besoin nommé ; `reasons` bornée par les trois seules clés possibles.",
    ),
    # #2987.56 — `reports` vient de `CopilotBridgeController.expensesPending`
    # (apps/api), déjà `pageSize: 50` côté bridge, mais ce plafond n'est jamais
    # dit à l'appelant (aucun `truncated`/`total`) — même motif que
    # `get_job_changes` : borné à la source, sans le dire, correctif de drapeau
    # hors périmètre de cette intégration.
    "list_expense_reports_awaiting_decision": (
        "reported",
        "`reports` relaie `CopilotBridgeController.expensesPending` (apps/api), déjà "
        "`pageSize: 50` côté bridge, mais sans `truncated`/`total` — même motif que "
        "`get_job_changes` : borné à la source, jamais dit, hors périmètre de ce correctif CI.",
    ),
    # #2987.56 — proposition résolue contre UNE note nommée (`expense_report_id`,
    # via `list_expense_reports_awaiting_decision`) ; `items[0]` seul est lu,
    # aucune liste rendue à l'appelant.
    "propose_expense_report_decision": (
        "exempt",
        "proposition résolue contre UNE note nommée (`expense_report_id`) ; seul `items[0]` "
        "est lu, aucune liste rendue à l'appelant.",
    ),
    # Épopée #2955 (#2394.6/.19/.43) — proposition de note résolue contre UN
    # contact nommé (`contact_id`) ; aucune liste lue, l'écriture est le clic.
    "propose_crm_note": (
        "exempt",
        "proposition résolue contre UN contact nommé (`contact_id`) ; aucune liste lue, "
        "la note s'écrit au clic de l'utilisateur.",
    ),
    # #3871.1 (lot V11, 07/10) — proposition résolue contre UN contact nommé
    # (`contact_id`) ; aucune liste lue, l'archivage s'écrit au clic.
    "propose_contact_departure": (
        "exempt",
        "proposition résolue contre UN contact nommé (`contact_id`) ; aucune liste lue, "
        "le passage en historique s'écrit au clic de l'utilisateur.",
    ),
    # #3209 (LAU-FINAL-215) — la règle de répartition (4 catégories, plafond
    # `FOCUS_MAX_ACCOUNTS`, diversité `GROUP_DIVERSITY_MAX`) vit côté NestJS
    # (`derivePortfolioPriorities`, apps/api/src/modules/accounts/portfolio-priorities.ts) ;
    # relayé TEL QUEL, sans second calcul (GA-26).
    "get_portfolio_priorities": (
        "bounded",
        "#3209 — `derivePortfolioPriorities` (apps/api) applique déjà le plafond des quatre "
        "catégories et la règle de diversité ; relayé TEL QUEL par `bellum_api.portfolio_priorities`.",
    ),
    # #3210 (LAU-FINAL-216) — la règle de similarité vit côté NestJS
    # (`deriveSimilarCases`, apps/api/src/modules/capitalisation/similar-cases.ts),
    # bornée en dur à `MAX_CASES = 3` ; relayé TEL QUEL.
    "find_similar_cases": (
        "bounded",
        "#3210 — `deriveSimilarCases` (apps/api) borne déjà à `MAX_CASES = 3` "
        "(`.slice(0, MAX_CASES)`) ; relayé TEL QUEL par `bellum_api.similar_cases`.",
    ),
    # #3278.3 (#3259.7) — trois canaux au plus (`CHANNEL_PERFORMANCE_CHANNELS`,
    # packages/contracts) : la liste ne grossit pas avec la donnée.
    "get_channel_performance": (
        "bounded",
        "#3278.3 — `CHANNEL_PERFORMANCE_CHANNELS` (packages/contracts) borne la liste à trois "
        "canaux ; relayé TEL QUEL par `bellum_api.channel_performance`.",
    ),
    # #3214/#220 (LAU-FINAL-220) — scénarios NOMMÉS par le modèle dans l'appel
    # d'outil TYPÉ (comme `ask_clarification`), bornés par le schéma d'entrée
    # (`minItems: 2, maxItems: 4`) et par `scenario_comparison.MAX_SCENARIOS` ;
    # aucune liste qui grossirait avec la donnée.
    "compare_scenarios": (
        "exempt",
        "#3214 — scénarios NOMMÉS par le modèle, bornés par le schéma d'entrée "
        "(2 à 4) et `scenario_comparison.MAX_SCENARIOS` ; rien n'est lu depuis une liste "
        "qui grandit avec la donnée (GA-318, même carte que compare_accounts).",
    ),
    # #3262.23 (épopée #3284) — UN compte, UN objet plat (`applicable`, `stale`,
    # `daysInFocus`, `recommendation`, `suggestedLevel`) : aucune liste qui
    # grandirait avec la donnée.
    "get_focus_review": (
        "exempt",
        "#3262.23 — un objet plat sur UN compte nommé par `account_id` ; aucune liste rendue "
        "à l'appelant (relayé TEL QUEL par `bellum_api.focus_review`).",
    ),
    # #3441/#3442/#3444/#3445 (lot C20, 30/09) — même patron que `search_proofs`
    # juste au-dessus : `_capped()` ICI, cap 20, sur un corpus fixe de 26
    # entrées (`content_library.CONTENT_LIBRARY_ENTRIES`, aucun pont externe).
    "search_content_library": ("bounded", "_capped() ICI, cap 20 — corpus fixe de 26 entrées, aucun pont externe"),
    # #3289 (lot P09, 30/09) — au plus quatre canaux (`SEND_TIMING_CHANNELS`), un créneau chacun.
    "get_send_timing": ("bounded", "au plus 4 canaux, un seul créneau par canal — borné par le contrat, jamais une liste ouverte"),
    # #1952.3 / #1952.7 (lot P07, 30/09) — une proposition (carte), jamais une liste lue :
    # les besoins listés sont ceux de l'entrée, plafonnés à `_LONG_JOB_MAX_NEEDS`.
    "propose_qualification_lead_decision": ("exempt", "proposition pure : une piste, un motif ou une échéance, aucune liste rendue"),
    "propose_long_job": ("exempt", "proposition pure : besoins de l'entrée, plafonnés à `_LONG_JOB_MAX_NEEDS`"),
    "propose_bulk_enrichment": ("exempt", "proposition pure : contacts de l'entrée, plafonnés à `_BULK_ENRICHMENT_MAX_CONTACTS`"),
    # #3816.1 — comptes plafonnés à `TALENT_ACCOUNTS_MAX` (10), homonymes à 6.
    "find_accounts_for_talent": (
        "bounded",
        "#3816.1 — `compile_talent_accounts` coupe ICI à `TALENT_ACCOUNTS_MAX` (10) comptes, le reste COMPTÉ "
        "dans `limits` ; homonymes plafonnés à six ; le pont borne déjà les recruteurs (réglage d espace).",
    ),
    # #3865.2 — chacun des quatre compartiments (recommandé/limite/écarté/non évaluable) passe
    # par `_capped()` ICI, même borne que `run_matching` ; homonymes plafonnés à six, même patron
    # que `find_accounts_for_talent` juste au-dessus.
    "find_needs_for_talent": (
        "bounded",
        "#3865.2 — `_capped()` ICI sur CHAQUE compartiment (recommandé/limite/écarté/non évaluable), "
        "même borne que `run_matching` ; homonymes plafonnés à six, même patron que find_accounts_for_talent.",
    ),
    # #3889 (épopée #3977) — chacun des cinq compartiments passe par `_capped()` ICI ; les documents
    # lus sont bornés à `_DOCS_PER_PASS` par passe et leur texte à `_SCAN_CHARS` (`document_projects.py`).
    # #3219 (#190.2 côté contact) — UN contact : au plus une ligne par champ journalisé (une contradiction
    # par champ, `FieldConflictService` ne garde que la dernière paire), plus trois lignes fixes au plus.
    "get_contact_preflight": (
        "bounded",
        "#3219 — borné par construction : une ligne par champ du contact au plus (dernière paire du journal), "
        "plus entreprise OU poste, plus périmètre OU homonyme ; relayé tel quel depuis le pont.",
    ),
    "search_document_projects": (
        "bounded",
        "#3889 — `_capped()` ICI sur CHAQUE compartiment (ouverts/anciens/missions/projets/non établis) ; "
        "documents bornés à `_DOCS_PER_PASS` par passe, extraits à `_EXCERPT_CHARS`.",
    ),
}


def test_every_tool_in_the_catalogue_is_classified() -> None:
    """GA-318 — un outil sans classification est un outil qu'on a oublié
    d'auditer. Le premier membre de cette comparaison est le catalogue RÉEL
    (`CHAT_TOOLS`), pas une copie figée : un outil ajouté demain sans y penser
    fait échouer CE test plutôt que dormir jusqu'au prochain audit."""
    declared = {tool["name"] for tool in CHAT_TOOLS}
    classified = set(TOOL_BOUND_CLASSIFICATION)
    missing = declared - classified
    extra = classified - declared
    assert not missing, f"Outils du catalogue sans classification : {sorted(missing)}"
    assert not extra, f"Classifications orphelines (outil retiré ?) : {sorted(extra)}"


def test_the_classification_corpus_is_not_vacuous() -> None:
    """Une garde qui parcourt un corpus VIDE est verte pour toujours — le
    défaut n°1 des gardes de ce dépôt (voir CLAUDE.md, « Une garde protège une
    règle... »). Ici le corpus a la taille RÉELLE du catalogue, jamais zéro,
    et les trois familles sont TOUTES représentées — sinon la classification
    n'aurait servi à rien distinguer."""
    assert len(CHAT_TOOLS) >= 50
    assert len(TOOL_BOUND_CLASSIFICATION) == len(CHAT_TOOLS)
    families = {family for family, _reason in TOOL_BOUND_CLASSIFICATION.values()}
    assert families == {"bounded", "exempt", "reported"}


def test_every_classification_carries_a_written_reason() -> None:
    for name, (family, reason) in TOOL_BOUND_CLASSIFICATION.items():
        assert family in ("bounded", "exempt", "reported"), name
        assert reason.strip(), f"{name} n'a pas de raison écrite"


def test_the_coverage_check_can_say_no_on_an_unclassified_tool() -> None:
    """GA-318 sait dire NON : un catalogue AUGMENTÉ d'un outil inconnu de la
    classification fait échouer la même vérification que le test principal —
    la preuve qu'elle attrape vraiment un oubli, et pas seulement qu'elle
    relit une liste qu'on lui a fournie déjà correcte."""
    augmented = {tool["name"] for tool in CHAT_TOOLS} | {"a_tool_nobody_classified"}
    missing = augmented - set(TOOL_BOUND_CLASSIFICATION)
    assert missing == {"a_tool_nobody_classified"}


def test_a_legitimately_unbounded_tool_does_not_turn_the_guard_red() -> None:
    """Témoin : `pin_memory_fact` ne lit rien et ne rend aucune liste — la
    famille 'exempt' ne doit jamais se confondre avec un oubli, et un vrai
    oubli (test ci-dessus) doit rester détectable À CÔTÉ de ce témoin."""
    family, reason = TOOL_BOUND_CLASSIFICATION["pin_memory_fact"]
    assert family == "exempt"
    assert reason.strip()


def test_reported_gaps_stay_visible_and_are_not_silently_reclassified() -> None:
    """Les GAPS connus de LOT 14 restent au registre — les faire disparaître
    de 'reported' sans les corriger reviendrait à les déclarer résolus sans
    l'être, exactement le défaut d'un tracker qui ment (voir MEMORY.md,
    « un total est un argument »).

    ⚠️ LOT 18 (GA-326/GA-327) a AUDITÉ et corrigé sept des huit gaps nommés ici
    à l'origine (`get_daily_briefing`, `prepare_day_brief`, `get_import_overview`,
    `get_memory`, `get_territory_overview`, `search_market_memory`,
    `run_matching`) — voir `test_chat_tool_output_bounds_lot18.py`. Les faire
    disparaître de CE set n'est donc pas un affaiblissement de la garde : c'est
    exactement l'inverse d'un tracker qui ment, la même règle appliquée dans
    l'autre sens — un gap corrigé qui resterait listé ici mentirait sur ce qui
    est vraiment corrigé. Seul `get_job_changes` reste un gap : hors périmètre
    des deux lots (un autre agent y écrit)."""
    known_gaps = {"get_job_changes"}
    for name in known_gaps:
        family, _reason = TOOL_BOUND_CLASSIFICATION[name]
        assert family == "reported", name
