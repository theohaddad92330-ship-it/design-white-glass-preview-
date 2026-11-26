"""SIG-A (11/10) — TheirStack exploité à fond, coût de chaque agrégateur compté.

Audit publié sur #4016 : on payait 1 crédit par offre RENDUE puis on jetait
celles que le tri métier écartait ; seule la première page de 10 était lue ;
aucun agrégateur ne disait combien il avait rendu, gardé, coûté.

Ce que ces tests tiennent (chacun sait dire NON) :
- A1/A2 — REMPLACÉS le 15/10 (CACHE-SOURCES) : plus de filtre métier envoyé ni de
  pagination ; voir ``test_cache_sources_key_15_10.py`` ; reste le repli
  ``company_name_case_insensitive_or`` ;
- A3 — rendues / gardées / coût par fournisseur dans ``run_metrics`` ;
- A4 — ``technology_slugs`` et ``company_object`` alimentent la pile et
  l'effectif du compte, sans jamais écraser une valeur connue ;
- A5 — Mantiks sauté (et tracé) quand les autres ont déjà ≥ 5 offres gardées ;
- A6 — clé de cache = l'entreprise seule (15/10), jamais un compte ni un métier.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services.data_sources import job_aggregators as agg

_KEYS = (
    "ADZUNA_APP_ID",
    "ADZUNA_APP_KEY",
    "JOOBLE_API_KEY",
    "THEIRSTACK_API_KEY",
    "MANTIKS_API_KEY",
    "FANTASTIC_JOBS_API_KEY",
)


@pytest.fixture(autouse=True)
def _no_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    for k in _KEYS:
        monkeypatch.delenv(k, raising=False)


def _iso(days_ago: int) -> str:
    return (datetime.now(UTC) - timedelta(days=days_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")


def _resp(json_data: object, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json=json_data, request=httpx.Request("POST", "https://x"))


def _ts_hit(title: str, company: str = "Decathlon", **extra: object) -> dict:
    return {"job_title": title, "company": company, "date_posted": _iso(3)[:10], "url": f"https://t/{title}", **extra}


def _ts_client(*pages: dict) -> AsyncMock:
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(side_effect=[_resp(p) for p in pages])
    c.get = AsyncMock()
    return c


# ── A2 — repli insensible à la casse (une requête vide ne coûte aucun crédit) ──


def _page(titles: list[str], total: int | None = None, company: str = "Decathlon") -> dict:
    return {"data": [_ts_hit(t, company) for t in titles], "metadata": {"total_results": total}}


async def test_theirstack_falls_back_to_case_insensitive_names(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("THEIRSTACK_API_KEY", "tk")
    client = _ts_client(_page([]), _page([]), _page(["Développeur Java"], company="DECATHLON", total=1))
    out = await agg.theirstack_jobs("Decathlon", domain="decathlon.com", client=client)
    bodies = [c.kwargs["json"] for c in client.post.call_args_list]
    assert "company_domain_or" in bodies[0] and "company_name_or" in bodies[1]
    assert bodies[2]["company_name_case_insensitive_or"] == ["Decathlon"]
    assert "company_name_or" not in bodies[2]
    assert [o["title"] for o in out] == ["Développeur Java"]


async def test_theirstack_case_insensitive_fallback_not_sent_when_exact_names_answer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("THEIRSTACK_API_KEY", "tk")
    client = _ts_client(_page(["Développeur Java"], total=1))
    await agg.theirstack_jobs("Decathlon", client=client)
    assert client.post.call_count == 1


# ── A3 — rendues / gardées / coût par fournisseur ───────────────────────────

from app.middleware.correlation_id import _correlation_id  # noqa: E402
from app.services import provider_pricing, run_metrics  # noqa: E402


@pytest.fixture
def cid() -> str:
    value = "sig-a-run"
    run_metrics.clear_metrics(value)
    token = _correlation_id.set(value)
    yield value
    _correlation_id.reset(token)
    run_metrics.clear_metrics(value)


def test_record_results_adds_counts_without_reshaping_other_providers(cid: str) -> None:
    run_metrics.record_call(cid, "brave", duration_ms=5)
    run_metrics.record_results(cid, "theirstack", returned=25)
    run_metrics.record_results(cid, "theirstack", returned=10, kept=4)
    metrics = run_metrics.get_metrics(cid)
    assert metrics["theirstack"]["results_returned"] == 35
    assert metrics["theirstack"]["results_kept"] == 4
    # Un fournisseur qui ne compte pas d'offres garde sa forme d'avant, à l'octet.
    assert "results_returned" not in metrics["brave"] and "results_kept" not in metrics["brave"]


def _multi_client(get: list[httpx.Response] | None = None, post: list[httpx.Response] | None = None) -> AsyncMock:
    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock(side_effect=get or [])
    c.post = AsyncMock(side_effect=post or [])
    return c


async def test_every_aggregator_counts_what_it_returned(monkeypatch: pytest.MonkeyPatch, cid: str) -> None:
    for k in _KEYS:
        monkeypatch.setenv(k, "k")
    adzuna = {"results": [{"title": "Dev", "company": {"display_name": "Decathlon"}, "created": _iso(2)}] * 3}
    jooble = {"jobs": [{"title": "Dev", "company": "Autre"}] * 2}
    fantastic = [{"title": "Dev", "organization": "Decathlon", "date_posted": _iso(2)}] * 4
    mantiks_search = [{"id": 7, "name": "Decathlon"}]
    mantiks_jobs = {"jobs": [{"job_title": "Dev", "published_date": _iso(2)}] * 5}
    await agg.adzuna_jobs("Decathlon", client=_multi_client(get=[_resp(adzuna)]))
    await agg.jooble_jobs("Decathlon", client=_multi_client(post=[_resp(jooble)]))
    await agg.theirstack_jobs("Decathlon", client=_multi_client(post=[_resp(_page(["Dev", "Ops"], total=2))]))
    await agg.fantastic_jobs("Decathlon", client=_multi_client(get=[_resp(fantastic)]))
    await agg.mantiks_jobs("Decathlon", client=_multi_client(get=[_resp(mantiks_search)], post=[_resp(mantiks_jobs)]))
    metrics = run_metrics.get_metrics(cid)
    assert {
        p: metrics[p]["results_returned"] for p in ("adzuna", "jooble", "theirstack", "fantastic_jobs", "mantiks")
    } == {
        "adzuna": 3,
        "jooble": 2,  # rendues puis écartées (autre employeur) : comptées quand même
        "theirstack": 2,
        "fantastic_jobs": 4,
        "mantiks": 5,
    }
    assert metrics["theirstack"]["cost_usd"] == pytest.approx(
        2 * provider_pricing.unit_cost_per_result_usd("theirstack")
    )


async def test_merge_counts_kept_offers_per_provider(monkeypatch: pytest.MonkeyPatch, cid: str) -> None:
    def offer(title: str, source: str, url: str) -> dict:
        return {
            "title": title,
            "location": "Lille",
            "city": "Lille",
            "company": "Decathlon",
            "url": url,
            "source": source,
        }

    monkeypatch.setattr(agg, "adzuna_jobs", AsyncMock(return_value=[offer("Développeur", "adzuna", "a")]))
    monkeypatch.setattr(agg, "jooble_jobs", AsyncMock(return_value=[]))
    monkeypatch.setattr(
        agg,
        "theirstack_jobs",
        AsyncMock(return_value=[offer("Développeur", "theirstack", "t1"), offer("Vendeur", "theirstack", "t2")]),
    )
    monkeypatch.setattr(agg, "mantiks_jobs", AsyncMock(return_value=[]))
    monkeypatch.setattr(agg, "fantastic_jobs", AsyncMock(return_value=[]))
    # CASCADE-PLANCHER-5 : une source sans clé n'est pas appelée ; ces deux-là portent la leur, aucun réseau.
    for env in ("ADZUNA_APP_ID", "ADZUNA_APP_KEY", "THEIRSTACK_API_KEY"):
        monkeypatch.setenv(env, "k")
    monkeypatch.setattr(agg, "_theirstack_search", AsyncMock(return_value={}))
    await agg.it_job_signals_aggregators("Decathlon", keep_title=lambda t: "Développeur" in t)
    metrics = run_metrics.get_metrics(cid)
    assert metrics["adzuna"]["results_kept"] == 1
    # Même offre que chez Adzuna (doublon) + une écartée par le tri : 0 gardée, et c'est dit.
    assert metrics["theirstack"]["results_kept"] == 0
    # Un fournisseur qui n'a rien rendu (ou sans clé) n'apparaît pas : no-op strict.
    assert "jooble" not in metrics


# ── A5 — REMPLACÉ le 15/10 (DISCOVER-OFFRES) : l'ordre Fantastic → Mantiks → TheirStack
# est tenu par ``test_offres_15_10_fiche.py``.


# ── A4 — pile technique et effectif lus dans les offres publiées ────────────


def _ts_rich_hit(title: str, slugs: list[str], company: str = "Decathlon", **company_object: object) -> dict:
    return _ts_hit(title, company, technology_slugs=slugs, company_object={"name": company, **company_object})


async def test_theirstack_hands_back_employer_facts_of_attributed_offers(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("THEIRSTACK_API_KEY", "tk")
    page = {
        "data": [
            _ts_rich_hit(
                "Data Engineer", ["python", "kafka"], domain="decathlon.com", employee_count=105000, num_jobs=640
            ),
            _ts_rich_hit("Développeur", ["python", "react"], domain="decathlon.com", employee_count=105000),
            # Homonyme écarté : sa pile et son effectif n'entrent jamais.
            _ts_rich_hit("Dev", ["cobol"], company="Decathlon Plomberie", domain="dp.fr", employee_count=3),
        ],
        "metadata": {"total_results": 3},
    }
    facts: dict = {}
    out = await agg.theirstack_jobs("Decathlon", domain="decathlon.com", facts=facts, client=_ts_client(page))
    assert len(out) == 2
    assert facts["technologies"] == ["python", "kafka", "react"]  # fréquence d'abord, puis ordre d'apparition
    assert facts["employeeCount"] == 105000


async def test_theirstack_facts_without_company_object_stay_absent(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("THEIRSTACK_API_KEY", "tk")
    facts: dict = {}
    await agg.theirstack_jobs("Decathlon", facts=facts, client=_ts_client(_page(["Développeur"], total=1)))
    assert facts == {}


def test_published_technologies_complete_the_detected_stack_without_duplicates() -> None:
    merged = agg.merge_published_technologies(["React", "Cloudflare"], {"technologies": ["react", "kafka"]})
    assert merged == ["React", "Cloudflare", "kafka"]
    assert agg.merge_published_technologies(["React"], {}) == ["React"]


def test_published_headcount_never_overwrites_a_known_value() -> None:
    facts = {"employeeCount": 105000}
    assert agg.published_headcount_label("1000 à 1999 salariés", facts) is None
    assert (
        agg.published_headcount_label("Non identifie dans les sources", facts) == "105 000 salariés (offres publiées)"
    )
    assert agg.published_headcount_label("", facts) == "105 000 salariés (offres publiées)"
    # Valeur absente côté offres : rien n'est écrit.
    assert agg.published_headcount_label("", {}) is None
    assert agg.published_headcount_label("", {"employeeCount": 0}) is None


def test_phase1_feeds_stack_and_headcount_from_published_offers() -> None:
    import inspect

    from app.routers import phase1_research

    source = inspect.getsource(phase1_research)
    assert "employer_facts=_published_employer" in source
    assert "merge_published_technologies(_ok_list(tech), _published_employer)" in source
    assert 'published_headcount_label(result.get("employees"), _published_employer)' in source


async def test_every_provider_goes_through_the_shared_cache_hook(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[str] = []

    async def share(source: str, fetch):
        seen.append(source)
        return await fetch()

    monkeypatch.setattr(agg, "adzuna_jobs", AsyncMock(return_value=[]))
    monkeypatch.setattr(agg, "jooble_jobs", AsyncMock(return_value=[]))
    monkeypatch.setattr(agg, "theirstack_jobs", AsyncMock(return_value=[]))
    monkeypatch.setattr(agg, "fantastic_jobs", AsyncMock(return_value=[]))
    monkeypatch.setattr(agg, "mantiks_jobs", AsyncMock(return_value=[]))
    await agg.it_job_signals_aggregators("Decathlon", share=share)
    assert sorted(seen) == ["adzuna", "fantastic", "jooble", "mantiks", "theirstack"]
