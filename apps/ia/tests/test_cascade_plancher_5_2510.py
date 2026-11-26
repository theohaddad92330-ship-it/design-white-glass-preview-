"""CASCADE-PLANCHER-5 (Louis 25/10/2026) — plancher de 5 offres DU MÉTIER par compte, par paliers nommés.

Ce que ces tests tiennent (déterministes, sans réseau, chacun sait dire NON) :
1. 2 offres du métier au palier 0 → les paliers sont parcourus DANS L'ORDRE jusqu'à 5 ou épuisement ;
2. 7 offres du métier → aucune cascade, aucun appel payé en plus ;
3. ⛔ après toute la cascade, 3 offres du métier → on en rend 3 et on DIT pourquoi : AUCUNE offre hors métier
   n'entre « pour faire le compte » (le plancher est un objectif de recherche, pas une quantité à produire) ;
4. toutes les sources CONFIGURÉES sont interrogées (pas d'arrêt à la première qui répond) ; sans clé : ni
   appelée ni comptée ;
5. la même offre rendue par deux sources compte UNE fois ;
6. le plafond d'appels payés tient, cascade comprise ; les paliers non tentés sont comptés ;
7. deux régimes : 6 offres du métier au palier 0 → sans demande explicite, rien de plus ; AVEC, les paliers
   suivants sont parcourus et le nombre rendu est STRICTEMENT supérieur.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from unittest.mock import AsyncMock

import pytest

from app.services import offers_cascade as oc
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
    # Aucun réseau : les paliers « fenêtre » relisent TheirStack par la fonction non cachée.
    monkeypatch.setattr(agg, "_theirstack_search", AsyncMock(return_value={}))


def _dev(n: int, source: str = "x") -> dict:
    return {
        "title": f"Développeur Python {n}",
        "city": f"Ville{n}",
        "location": f"Ville{n}",
        "source": source,
        "url": f"https://o/{source}/{n}",
    }


def _off(n: int) -> dict:
    return {
        "title": f"Gérant de Magasin {n}",
        "city": f"Ville{n}",
        "location": f"Ville{n}",
        "source": "x",
        "url": f"https://h/{n}",
    }


def _is_it(title: str) -> bool:
    return "Développeur" in title or "DevOps" in title


Tier = Callable[[oc.PaidBudget], Awaitable[list[dict]]]


def _tiers(calls: list[str], rows: dict[str, list[dict]], *, paid: bool = False) -> dict[str, Tier]:
    def make(name: str) -> Tier:
        async def fetch(budget: oc.PaidBudget) -> list[dict]:
            calls.append(name)
            if paid and not budget.take():
                return []
            return rows.get(name, [])

        return fetch

    return {name: make(name) for name in oc.TIER_ORDER}


# ── 1. l'ordre des paliers, jusqu'à 5 ou épuisement ─────────────────────────────────────────────


async def test_two_offers_trigger_the_cascade_in_order_until_the_floor() -> None:
    calls: list[str] = []
    rows = {"sources": [_dev(10)], "terms": [_dev(11)], "window": [_dev(12), _dev(13)], "group": [_dev(14)]}
    out = await oc.run_cascade([_dev(1), _dev(2)], _tiers(calls, rows), keep=_is_it)
    assert calls == ["sources", "terms", "window"]  # le plancher (5) est atteint au palier 3 : le 4e n'est pas tenté
    assert len(out.offers) == 6
    assert [t.name for t in out.tiers] == list(oc.TIER_ORDER)
    assert [t.gained for t in out.tiers] == [1, 1, 2, 0]
    assert out.tiers[3].status == "plancher atteint"
    assert not out.below_floor


async def test_tier_order_is_the_decision_of_louis() -> None:
    assert oc.TIER_ORDER == ("sources", "terms", "window", "group")
    assert oc.OFFERS_FLOOR == 5


# ── 2. 7 offres du métier : aucune cascade ─────────────────────────────────────────────────────


async def test_seven_trade_offers_run_no_cascade_and_pay_nothing() -> None:
    calls: list[str] = []
    out = await oc.run_cascade([_dev(i) for i in range(7)], _tiers(calls, {}, paid=True), keep=_is_it)
    assert calls == []
    assert len(out.offers) == 7 and out.paid_total == 0
    assert all(t.status == "plancher atteint" for t in out.tiers)


# ── 3. ⛔ le plancher ne se tient JAMAIS en filtrant moins ────────────────────────────────────


async def test_floor_is_never_met_by_filtering_less() -> None:
    calls: list[str] = []
    # Chaque palier rend 4 offres hors métier pour 1 du métier : 1 + 3 = 3 offres du métier SEULEMENT.
    rows = {
        "sources": [_dev(10), _off(1), _off(2), _off(3), _off(4)],
        "terms": [_dev(11), _off(5), _off(6)],
        "window": [_dev(12), _off(7)],
        "group": [_off(8), _off(9)],
    }
    out = await oc.run_cascade([], _tiers(calls, rows), keep=_is_it)
    assert calls == list(oc.TIER_ORDER)  # tous parcourus : on a cherché mieux
    assert len(out.offers) == 3  # … et on en affiche 3, pas 5
    assert all(_is_it(o["title"]) for o in out.offers)
    assert not any("Gérant" in o["title"] for o in out.offers)
    assert out.below_floor
    assert out.reason == "sous le plancher après toute la cascade"
    # Un palier qui ne rapporte rien affiche 0 gagné mais reste NOMMÉ, jamais effacé.
    assert [t.gained for t in out.tiers] == [1, 1, 1, 0]


async def test_trade_filter_is_applied_to_the_base_too() -> None:
    out = await oc.run_cascade([_off(1), _dev(1)], _tiers([], {}), keep=_is_it)
    assert [o["title"] for o in out.offers] == ["Développeur Python 1"]


# ── 5. dédoublonnage ──────────────────────────────────────────────────────────────────────────


async def test_same_offer_from_two_sources_counts_once() -> None:
    twin = {**_dev(1, "jooble"), "url": "https://j/other"}  # même intitulé + même ville, autre URL
    rows = {"sources": [twin, _dev(2, "mantiks")]}
    out = await oc.run_cascade([_dev(1, "adzuna")], _tiers([], rows), keep=_is_it)
    assert len(out.offers) == 2
    assert out.tiers[0].gained == 1


# ── 6. plafond d'appels payés, cascade comprise ────────────────────────────────────────────────


def test_paid_cap_is_named_and_positive() -> None:
    assert isinstance(oc.CASCADE_PAID_CALLS_MAX, int) and oc.CASCADE_PAID_CALLS_MAX > 0


async def test_paid_cap_holds_across_the_cascade_and_counts_what_was_not_tried() -> None:
    calls: list[str] = []
    rows = {name: [_dev(i)] for i, name in enumerate(oc.TIER_ORDER, start=20)}
    budget = oc.PaidBudget(cap=2)
    out = await oc.run_cascade([], _tiers(calls, rows, paid=True), keep=_is_it, budget=budget)
    assert calls == list(oc.TIER_ORDER)
    assert out.paid_total == 2 == budget.used  # jamais plus que le plafond
    assert [t.paid for t in out.tiers] == [1, 1, 0, 0]
    assert [t.not_attempted for t in out.tiers] == [0, 0, 1, 1]  # compté, pas silencieux
    assert len(out.offers) == 2
    assert out.reason == "plafond d'appels payés atteint"


async def test_cache_hits_do_not_consume_the_paid_cap() -> None:
    async def fetch(budget: oc.PaidBudget) -> list[dict]:
        budget.cached()
        budget.cached()
        return [_dev(30)]

    out = await oc.run_cascade([], {"sources": fetch}, keep=_is_it, budget=oc.PaidBudget(cap=1))
    assert out.paid_total == 0 and out.tiers[0].cached == 2


# ── 7. les DEUX régimes ───────────────────────────────────────────────────────────────────────


async def test_explicit_request_goes_past_the_floor_and_returns_strictly_more() -> None:
    base = [_dev(i) for i in range(6)]
    rows = {"sources": [_dev(40)], "terms": [_dev(41), _dev(42)], "window": [_dev(43)], "group": [_dev(44)]}

    calls_plain: list[str] = []
    plain = await oc.run_cascade(base, _tiers(calls_plain, rows), keep=_is_it, explicit_request=False)
    calls_explicit: list[str] = []
    explicit = await oc.run_cascade(base, _tiers(calls_explicit, rows), keep=_is_it, explicit_request=True)

    assert calls_plain == [] and len(plain.offers) == 6
    assert calls_explicit == list(oc.TIER_ORDER)  # tous les paliers, dans l'ordre
    assert len(explicit.offers) == 11 > len(plain.offers)  # STRICTEMENT supérieur
    assert explicit.explicit and not plain.explicit


async def test_explicit_request_stays_bounded_by_the_paid_cap_and_the_trade_filter() -> None:
    base = [_dev(i) for i in range(6)]
    rows = {name: [_dev(50 + i), _off(i)] for i, name in enumerate(oc.TIER_ORDER)}
    out = await oc.run_cascade(
        base, _tiers([], rows, paid=True), keep=_is_it, explicit_request=True, budget=oc.PaidBudget(cap=3)
    )
    assert out.paid_total == 3  # « un max » = tout ce que le plafond permet, jamais « sans limite »
    assert len(out.offers) == 9 and not any("Gérant" in o["title"] for o in out.offers)


async def test_a_failing_tier_does_not_break_the_cascade() -> None:
    async def boom(budget: oc.PaidBudget) -> list[dict]:
        raise RuntimeError("source tombée")

    calls: list[str] = []
    tiers = _tiers(calls, {"terms": [_dev(60)]})
    tiers["sources"] = boom
    out = await oc.run_cascade([], tiers, keep=_is_it)
    assert out.tiers[0].status == "en échec" and len(out.offers) == 1


def test_public_payload_names_no_provider_and_no_zero_for_unknown() -> None:
    out = oc.CascadeResult(
        floor=5, explicit=False, offers=[_dev(1)], tiers=[], reason="sous le plancher après toute la cascade"
    )
    payload = out.public()
    assert payload["floor"] == 5 and payload["found"] == 1 and payload["belowFloor"] is True
    assert "provider" not in repr(payload).lower()


# ── 4. toutes les sources configurées sont interrogées ─────────────────────────────────────────


def _patch_sources(monkeypatch: pytest.MonkeyPatch, **rows: list[dict]) -> dict[str, AsyncMock]:
    mocks = {}
    for name in ("adzuna_jobs", "jooble_jobs", "fantastic_jobs", "mantiks_jobs", "theirstack_jobs"):
        mocks[name] = AsyncMock(return_value=rows.get(name, []))
        monkeypatch.setattr(agg, name, mocks[name])
    return mocks


async def test_every_configured_source_is_queried_not_just_the_first_that_answers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for env in _KEYS:
        monkeypatch.setenv(env, "k")
    mocks = _patch_sources(
        monkeypatch, adzuna_jobs=[_dev(1, "adzuna"), _dev(2, "adzuna")], jooble_jobs=[_dev(3, "jooble")]
    )
    out = await agg.it_job_signals_aggregators("Sanofi", keep_title=_is_it)
    for name, mock in mocks.items():
        # 3 offres du métier < 5 : les cinq sources sont interrogées (Fantastic.jobs l'est aussi au palier « fenêtre »).
        assert mock.await_count >= 1, name
    assert mocks["adzuna_jobs"].await_count == mocks["jooble_jobs"].await_count == 1
    assert len(out) == 3


async def test_a_source_without_key_is_neither_called_nor_counted(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MANTIKS_API_KEY", "k")
    cascade: dict = {}
    mocks = _patch_sources(monkeypatch, mantiks_jobs=[_dev(1, "mantiks")])
    await agg.it_job_signals_aggregators("Sanofi", keep_title=_is_it, cascade_out=cascade)
    assert mocks["mantiks_jobs"].await_count == 1
    assert mocks["theirstack_jobs"].await_count == 0  # pas de clé TheirStack
    sources_tier = next(t for t in cascade["tiers"] if t["tier"] == "sources")
    assert sources_tier["gained"] == 1


async def test_seven_trade_offers_buy_nothing_even_when_few_were_rendered(monkeypatch: pytest.MonkeyPatch) -> None:
    for env in _KEYS:
        monkeypatch.setenv(env, "k")
    mocks = _patch_sources(monkeypatch, adzuna_jobs=[_dev(i, "adzuna") for i in range(7)])
    out = await agg.it_job_signals_aggregators("Sanofi", keep_title=_is_it)
    assert len(out) == 7
    assert mocks["mantiks_jobs"].await_count == 0 and mocks["theirstack_jobs"].await_count == 0


async def test_many_rendered_offers_but_few_of_the_trade_still_open_the_paid_sources(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Le déséquilibre mesuré en prod : beaucoup rendu, presque rien du métier — l'ancien seuil comptait le RENDU."""
    for env in _KEYS:
        monkeypatch.setenv(env, "k")
    noise = [_off(i) for i in range(12)]
    mocks = _patch_sources(
        monkeypatch,
        adzuna_jobs=[*noise, _dev(1, "adzuna")],
        mantiks_jobs=[_dev(2, "mantiks")],
        theirstack_jobs=[_dev(3, "theirstack")],
    )
    out = await agg.it_job_signals_aggregators("Sanofi", keep_title=_is_it)
    assert mocks["mantiks_jobs"].await_count == 1 and mocks["theirstack_jobs"].await_count == 1
    assert len(out) == 3 and not any("Gérant" in o["title"] for o in out)


async def test_explicit_request_opens_the_paid_sources_with_six_offers(monkeypatch: pytest.MonkeyPatch) -> None:
    for env in _KEYS:
        monkeypatch.setenv(env, "k")
    mocks = _patch_sources(
        monkeypatch, adzuna_jobs=[_dev(i, "adzuna") for i in range(6)], mantiks_jobs=[_dev(20, "mantiks")]
    )
    plain = await agg.it_job_signals_aggregators("Sanofi", keep_title=_is_it)
    assert len(plain) == 6 and mocks["mantiks_jobs"].await_count == 0
    explicit = await agg.it_job_signals_aggregators("Sanofi", keep_title=_is_it, explicit_request=True)
    assert mocks["mantiks_jobs"].await_count == 1
    assert len(explicit) == 7 > len(plain)


# ── la demande EXPLICITE vue du cadrage de l'analyse ───────────────────────────────────────────


def test_explicit_request_is_what_the_salesperson_typed_not_a_menu_pick() -> None:
    from app.services.run_cadrage import explicit_request, explicit_terms

    assert not explicit_request(None) and not explicit_request({})
    # Un objectif du menu fermé n'est pas une demande précise.
    assert not explicit_request({"objectives": ["open_account"]})
    assert explicit_request({"business_families": ["Développeur Vue.js"]})
    assert explicit_request({"angle": "Migration cloud"})
    assert explicit_request({"selected_angles": ["Cybersécurité"]})
    assert explicit_request({"included_entities": ["Orange Business"]})
    assert explicit_terms({"business_families": ["Vue.js"], "selected_angles": ["Nuxt"]}) == ("Vue.js", "Nuxt")


def test_neighbour_forms_come_from_the_referential_only() -> None:
    forms = oc_tiers().neighbour_forms("Vue.js")
    assert forms and all(isinstance(f, str) for f in forms)
    assert "vue" not in {f.lower() for f in forms}  # mot courant du français
    assert oc_tiers().neighbour_forms("zzz-compétence-inconnue") == []  # jamais un voisin deviné


def oc_tiers():
    from app.services import offers_cascade_tiers

    return offers_cascade_tiers
