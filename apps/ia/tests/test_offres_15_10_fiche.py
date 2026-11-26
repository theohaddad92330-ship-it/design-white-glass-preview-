"""DISCOVER-OFFRES (15/10, point B) — la fiche : Fantastic → Mantiks → TheirStack, France, hors stage.

Chaque test tient un paramètre de la décision de Louis (15/10) ; chacun sait dire NON.

CASCADE-PLANCHER-5 (25/10) — la PERTINENCE décide de l'appel payant : la source suivante ne part que sous
``OFFERS_FLOOR`` offres DU MÉTIER (le seuil de dix offres RENDUES n'est plus un interrupteur). L'ordre reste
séquentiel : jamais d'achat « au cas où ».
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services import run_metrics
from app.services.data_sources import job_aggregators as agg

_NOW = datetime.now(UTC)


def _iso(days_ago: int) -> str:
    return (_NOW - timedelta(days=days_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")


def _resp(json_data: object, status: int = 200, headers: dict | None = None) -> httpx.Response:
    return httpx.Response(status, json=json_data, headers=headers or {}, request=httpx.Request("GET", "https://x"))


@pytest.fixture(autouse=True)
def _keys(monkeypatch: pytest.MonkeyPatch) -> None:
    for k in ("ADZUNA_APP_ID", "ADZUNA_APP_KEY", "JOOBLE_API_KEY"):
        monkeypatch.delenv(k, raising=False)
    for k in ("FANTASTIC_JOBS_API_KEY", "MANTIKS_API_KEY", "THEIRSTACK_API_KEY"):
        monkeypatch.setenv(k, "k")  # sans clé une source n'est jamais appelée : les trois sont branchées


def _fj(i: int, org: str = "Decathlon") -> dict:
    return {
        "title": f"Développeur {i}",
        "organization": org,
        "date_posted": _iso(3),
        "url": f"https://workday/{i}",
        "locations_derived": ["Lille, France"],
        "ai_taxonomies_a": ["Technology"],
        "ai_hiring_manager_name": "Alice Martin" if i == 0 else None,
    }


# ── Fantastic ────────────────────────────────────────────────────────────────


async def test_fantastic_every_call_carries_france_and_no_intern() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(return_value=_resp([_fj(1)]))
    await agg.fantastic_jobs("Decathlon", domain="decathlon.fr", client=client)
    params = client.get.call_args.kwargs["params"]
    assert params["location"] == "France"
    assert params["ai_employment_type"] == "FULL_TIME,PART_TIME,CONTRACTOR,TEMPORARY,OTHER"
    assert "INTERN" not in params["ai_employment_type"] and "VOLUNTEER" not in params["ai_employment_type"]
    assert params["time_frame"] == "6m"
    assert params["limit"] == 25
    assert "description_format" not in params
    # ⚠️ NE PAS FIGER LA DATE ATTENDUE À L'IMPORT (29/10/2026). `_NOW` est calculé au chargement du
    # module, le code de production calcule la sienne à l'APPEL : le job `Test (IA / Python)` du run
    # 40790025243 a tourné de 23:52 à 00:04 UTC, a franchi minuit entre les deux, et a rendu
    # « assert '2026-07-31' == '2026-07-30' » — un faux rouge sur un lot qui ne touche pas apps/ia.
    # On mesure donc l'ÉCART en jours, avec la tolérance d'un jour que le franchissement impose.
    envoye = str(params["date_posted_gte"])[:10]
    ecart = (datetime.now(UTC).date() - datetime.strptime(envoye, "%Y-%m-%d").date()).days
    assert ecart in (90, 91), f"date_posted_gte = {envoye}, soit {ecart} jours en arrière au lieu de 90"


async def test_fantastic_domain_on_ats_first_then_job_boards_by_organization() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(side_effect=[_resp([]), _resp([]), _resp([_fj(1)])])
    offers = await agg.fantastic_jobs("decathlon", domain="decathlon.fr", client=client)
    calls = [(c.args[0], c.kwargs["params"]) for c in client.get.call_args_list]
    assert calls[0][0].endswith("/v1/active-ats") and calls[0][1]["domain"] == "decathlon.fr"
    assert calls[1][0].endswith("/v1/active-jb") and calls[1][1]["organization"] == "decathlon"
    assert calls[2][0].endswith("/v1/active-jb") and calls[2][1]["organization"] == "Decathlon"
    assert all(p["exclude_ats_duplicate"] == "true" for _u, p in calls[1:])
    assert "exclude_ats_duplicate" not in calls[0][1]
    assert len(offers) == 1


async def test_fantastic_ats_answer_stops_the_chain() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(return_value=_resp([_fj(1)]))
    await agg.fantastic_jobs("Decathlon", domain="decathlon.fr", client=client)
    assert client.get.call_count == 1


async def test_fantastic_keeps_origin_url_taxonomy_and_hiring_manager() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(return_value=_resp([_fj(0)]))
    (offer,) = await agg.fantastic_jobs("Decathlon", domain="decathlon.fr", client=client)
    assert offer["url"] == "https://workday/0"
    assert offer["city"] == "Lille, France"
    assert offer["categories"] == ["Technology"]
    assert offer["recruiters"] == [{"fullName": "Alice Martin"}]


async def test_fantastic_cost_is_read_from_the_response_header(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("COST_PER_RESULT_USD_FANTASTIC_JOBS", "0.01")
    recorded: list[tuple[str, float]] = []
    monkeypatch.setattr(run_metrics, "record_cost", lambda _cid, provider, usd: recorded.append((provider, usd)))
    client = AsyncMock(spec=httpx.AsyncClient)
    # 3 offres rendues mais l'en-tête dit 7 : c'est l'en-tête qui est facturé.
    client.get = AsyncMock(return_value=_resp([_fj(1), _fj(2), _fj(3)], headers={"x-api-jobs-this-request": "7"}))
    await agg.fantastic_jobs("Decathlon", domain="decathlon.fr", client=client)
    assert recorded == [("fantastic_jobs", pytest.approx(0.07))]


# ── Mantiks ──────────────────────────────────────────────────────────────────


def _mk_job(i: int, board: str = "linkedin", title: str | None = None, city: str = "Lille", days: int = 3) -> dict:
    return {
        "job_title": title or f"Développeur {i}",
        "job_url": f"https://{board}/{i}",
        "published_date": _iso(days),
        "location": {"city": city},
        "contract_types": ["permanent"],
        "job_board": board,
    }


def _mk_client(search: list, jobs: list) -> AsyncMock:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(return_value=_resp(search))
    client.post = AsyncMock(return_value=_resp({"jobs": jobs}))
    return client


async def test_mantiks_jobs_body_carries_france_90_days_and_no_internship() -> None:
    client = _mk_client([{"id": 7, "name": "Decathlon"}], [_mk_job(1)])
    await agg.mantiks_jobs("Decathlon", client=client)
    body = client.post.call_args.kwargs["json"]
    assert body["locations"] == [{"id": "3017382", "radius": None}]  # la doc exige ≥ 1 lieu
    assert body["published_date_window_days"] == 90
    assert body["contract_types_exclude"] == ["internship"]
    assert body["is_reposting"] is False


async def test_mantiks_searches_by_domain_first_then_by_name() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(side_effect=[_resp([]), _resp([{"id": 7, "name": "Decathlon"}])])
    client.post = AsyncMock(return_value=_resp({"jobs": [_mk_job(1)]}))
    offers = await agg.mantiks_jobs("Decathlon", domain="https://www.decathlon.fr/x", client=client)
    queries = [c.kwargs["params"]["query"] for c in client.get.call_args_list]
    assert queries == ["decathlon.fr", "Decathlon"]
    assert len(offers) == 1


async def test_mantiks_keeps_up_to_100_offers_and_dedups_across_job_boards() -> None:
    jobs = [_mk_job(i) for i in range(60)] + [_mk_job(i + 100, board="indeed", title=f"Développeur {i}", days=4) for i in range(60)]
    client = _mk_client([{"id": 7, "name": "Decathlon"}], jobs)
    offers = await agg.mantiks_jobs("Decathlon", client=client)
    # 60 doublons (même titre, même ville, date à ±3 j) retirés ; 60 restent, tous gardés (> 25).
    assert len(offers) == 60
    assert client.post.call_count == 1


async def test_mantiks_dedup_keeps_offers_further_apart_than_three_days() -> None:
    jobs = [_mk_job(1, days=3), _mk_job(2, board="indeed", title="Développeur 1", days=20)]
    client = _mk_client([{"id": 7, "name": "Decathlon"}], jobs)
    assert len(await agg.mantiks_jobs("Decathlon", client=client)) == 2


async def test_mantiks_maps_url_date_city_contract_board() -> None:
    client = _mk_client([{"id": 7, "name": "Decathlon"}], [_mk_job(1)])
    (offer,) = await agg.mantiks_jobs("Decathlon", client=client)
    assert offer["url"] == "https://linkedin/1"
    assert offer["city"] == "Lille"
    assert offer["contractType"] == "permanent"
    assert offer["board"] == "linkedin"


async def test_mantiks_homonym_is_never_bought() -> None:
    client = _mk_client([{"id": 9, "name": "Autre Société"}], [_mk_job(1)])
    assert await agg.mantiks_jobs("Decathlon", client=client) == []
    client.post.assert_not_awaited()


# ── Ordre Fantastic → Mantiks → TheirStack ──────────────────────────────────


def _offers(n: int, source: str) -> list[dict]:
    return [
        {"title": f"Développeur {source} {i}", "location": "Lille", "city": "Lille", "url": f"{source}/{i}", "source": source}
        for i in range(n)
    ]


def _stub(monkeypatch: pytest.MonkeyPatch, *, fantastic: int, mantiks: int, theirstack: int = 3) -> dict[str, AsyncMock]:
    stubs = {
        "adzuna_jobs": AsyncMock(return_value=[]),
        "jooble_jobs": AsyncMock(return_value=[]),
        "fantastic_jobs": AsyncMock(return_value=_offers(fantastic, "fantastic_jobs")),
        "mantiks_jobs": AsyncMock(return_value=_offers(mantiks, "mantiks")),
        "theirstack_jobs": AsyncMock(return_value=_offers(theirstack, "theirstack")),
        "_theirstack_search": AsyncMock(return_value=[]),  # le palier « fenêtre » : jamais de réseau en test
    }
    for name, stub in stubs.items():
        monkeypatch.setattr(agg, name, stub)
    return stubs


async def test_order_ten_fantastic_offers_stop_the_chain(monkeypatch: pytest.MonkeyPatch) -> None:
    stubs = _stub(monkeypatch, fantastic=10, mantiks=5)
    await agg.it_job_signals_aggregators("Decathlon")
    stubs["fantastic_jobs"].assert_awaited_once()
    stubs["mantiks_jobs"].assert_not_awaited()
    stubs["theirstack_jobs"].assert_not_awaited()


async def test_order_four_fantastic_call_mantiks_not_theirstack(monkeypatch: pytest.MonkeyPatch) -> None:
    stubs = _stub(monkeypatch, fantastic=4, mantiks=1)
    await agg.it_job_signals_aggregators("Decathlon")
    stubs["mantiks_jobs"].assert_awaited_once()  # 4 offres du métier < plancher 5
    stubs["theirstack_jobs"].assert_not_awaited()  # 4 + 1 = 5 : le plancher est tenu


async def test_order_nine_fantastic_offers_buy_nothing_more(monkeypatch: pytest.MonkeyPatch) -> None:
    stubs = _stub(monkeypatch, fantastic=9, mantiks=1)
    await agg.it_job_signals_aggregators("Decathlon")
    stubs["mantiks_jobs"].assert_not_awaited()  # le plancher est tenu dès le palier 0
    stubs["theirstack_jobs"].assert_not_awaited()


async def test_order_theirstack_only_when_both_hold_fewer_than_the_floor(monkeypatch: pytest.MonkeyPatch) -> None:
    stubs = _stub(monkeypatch, fantastic=2, mantiks=2)
    out = await agg.it_job_signals_aggregators("Decathlon")
    stubs["mantiks_jobs"].assert_awaited_once()
    stubs["theirstack_jobs"].assert_awaited_once()  # 2 + 2 = 4 offres du métier < plancher 5
    assert any(o["source"] == "theirstack" for o in out)


async def test_order_theirstack_skipped_when_the_floor_is_reached(monkeypatch: pytest.MonkeyPatch) -> None:
    stubs = _stub(monkeypatch, fantastic=1, mantiks=9)
    await agg.it_job_signals_aggregators("Decathlon")
    stubs["theirstack_jobs"].assert_not_awaited()


async def test_order_is_sequential_fantastic_before_the_others(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    stubs = _stub(monkeypatch, fantastic=0, mantiks=0)
    for name, stub in stubs.items():
        stub.side_effect = lambda *a, _n=name, **k: calls.append(_n) or []
    await agg.it_job_signals_aggregators("Decathlon")
    paid = [c for c in calls if c in ("fantastic_jobs", "mantiks_jobs", "theirstack_jobs")]
    # Le palier « fenêtre » relit Fantastic plus loin dans le temps : l'ordre se lit sur la PREMIÈRE venue de chacune,
    # et Mantiks / TheirStack ne partent qu'une fois (jamais deux achats pour la même carte).
    assert list(dict.fromkeys(paid)) == ["fantastic_jobs", "mantiks_jobs", "theirstack_jobs"]
    assert paid.count("mantiks_jobs") == 1 and paid.count("theirstack_jobs") == 1


async def test_mantiks_skip_is_not_traced_without_its_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MANTIKS_API_KEY")
    cid = "cid-offres-15-10"
    monkeypatch.setattr(agg, "get_correlation_id", lambda: cid)
    _stub(monkeypatch, fantastic=10, mantiks=0)
    await agg.it_job_signals_aggregators("Decathlon")
    assert "mantiks" not in run_metrics.get_metrics(cid)


# ── CASCADE-PLANCHER-5 (25/10) : la cascade compte les offres DU MÉTIER, pas les rendues ─────────────


async def test_mantiks_ninety_rendered_two_kept_still_reaches_theirstack(monkeypatch: pytest.MonkeyPatch) -> None:
    """DECATHLON : Mantiks rend 90 offres, le tri métier en garde 1 — 2 offres du métier < 5, TheirStack part UNE fois.
    (Avant le 25/10 les 91 rendues fermaient la porte : la pertinence passe avant le coût.)"""
    stubs = _stub(monkeypatch, fantastic=1, mantiks=90)
    out = await agg.it_job_signals_aggregators("Decathlon", keep_title=lambda t: t.endswith(" 0"))
    stubs["theirstack_jobs"].assert_awaited_once()
    assert len(out) == 3  # une de chaque source : le tri métier n'est jamais relâché
    assert all(o["title"].endswith(" 0") for o in out)


async def test_many_rendered_but_floor_of_the_trade_reached_never_calls_theirstack(monkeypatch: pytest.MonkeyPatch) -> None:
    """Le revers : 5 offres DU MÉTIER suffisent, quel que soit le nombre de rendues — rien n'est acheté en plus."""
    stubs = _stub(monkeypatch, fantastic=1, mantiks=90)
    out = await agg.it_job_signals_aggregators("Decathlon", keep_title=lambda t: int(t.rsplit(" ", 1)[1]) < 4)
    stubs["theirstack_jobs"].assert_not_awaited()
    assert len(out) >= 5


async def test_nothing_of_the_trade_still_reaches_theirstack(monkeypatch: pytest.MonkeyPatch) -> None:
    stubs = _stub(monkeypatch, fantastic=3, mantiks=4)
    await agg.it_job_signals_aggregators("Decathlon", keep_title=lambda t: False)
    stubs["theirstack_jobs"].assert_awaited_once()


async def test_internships_do_not_count_as_rendered(monkeypatch: pytest.MonkeyPatch) -> None:
    stubs = _stub(monkeypatch, fantastic=0, mantiks=0)
    stage = [{"title": f"Stage développeur {i}", "organization": "Decathlon", "source": "fantastic_jobs"} for i in range(12)]
    stubs["fantastic_jobs"].return_value = stage
    await agg.it_job_signals_aggregators("Decathlon")
    stubs["mantiks_jobs"].assert_awaited_once()


# ── OFFRES-VEILLE (16/10) : la recherche Mantiks reçoit le nom NETTOYÉ ────────────────────────


async def test_mantiks_search_strips_the_department_suffix() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(
        side_effect=lambda url, params=None, **k: _resp(
            [{"id": 3, "name": "DHL Express France"}] if params["query"] == "DHL Express" else []
        )
    )
    client.post = AsyncMock(return_value=_resp({"jobs": [_mk_job(1)]}))
    offers = await agg.mantiks_jobs("DHL Express France — Direction des systèmes d'information", client=client)
    queries = [c.kwargs["params"]["query"] for c in client.get.call_args_list]
    assert all("Direction" not in q and "—" not in q for q in queries)
    assert len(offers) == 1


async def test_mantiks_cleaning_keeps_same_employer_strict() -> None:
    client = _mk_client([{"id": 9, "name": "DHL Supply Chain"}], [_mk_job(1)])
    assert await agg.mantiks_jobs("DHL Express France - Direction des SI", client=client) == []
    client.post.assert_not_awaited()
