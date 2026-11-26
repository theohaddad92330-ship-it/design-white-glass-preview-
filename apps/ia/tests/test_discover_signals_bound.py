"""`POST /discover/signals` — la borne de résolution DIT ce qu'elle n'a pas regardé.

Pourquoi ce fichier existe. `/discover/signals` moissonne jusqu'à ~126 entreprises
(mesuré : national, `limit=100`, 90 j) et résolvait jusqu'à **120 SIREN** derrière
un bucket à 50 rpm. Mesuré sur le limiteur réel : **85 s** (bucket plein) à **144 s**
(bucket déjà vidé — le cas de prod, DECP dépense ~81 appels registre sur le MÊME
bucket pendant la moisson). L'API NestJS, elle, coupe à **45 s**
(`DISCOVER_CALL_OPTS = { maxAttempts: 1, timeoutMs: 45_000 }`, sans retry).

Donc l'étape ne pouvait PAS finir : l'utilisateur ne voyait pas un écran lent, il
voyait un écran coupé — ou rien du tout.

Le point non négociable testé ici est le RAPPORT, pas la borne. #631 a corrigé
exactement cette classe de bug (un échec de rate-limit rendu comme « homonymie non
tranchée »). Une entreprise **jamais examinée** n'est pas une entreprise
**écartée** : ce sont deux affirmations différentes, et l'écran ne doit jamais les
fondre. « 3 résultats » quand 117 n'ont jamais été regardées est le même mensonge
dans un autre costume.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import pytest

from app.routers import discover_signals as mod
from app.services.company_filters import SIREN_AMBIGUOUS_REASON, SIREN_UNREACHABLE_REASON
from app.services.homonym_disambiguation import HomonymResolution, ScoredCandidate


def _iso(days_ago: int) -> str:
    return (datetime.now(UTC) - timedelta(days=days_ago)).date().isoformat()


def _row(name: str, days_ago: int) -> dict:
    return {
        "name": name,
        "siren": None,
        "department": "69",
        "city": None,
        "signal": {"type": "hiring", "label": f"offre {name}", "date": _iso(days_ago), "url": None, "detail": None},
    }


def _selected(siren: str, name: str) -> HomonymResolution:
    return HomonymResolution(
        status="selected",
        selectedSiren=siren,
        confidence=0.9,
        candidates=[
            ScoredCandidate(
                siren=siren, name=name, nafCode="62.02A", nafLabel="Conseil informatique",
                city="LYON", department="69", headcount=200, sizeClass="ETI",
                establishmentCount=1, isActive=True, score=0.9, reasons=[], source="test",
            )
        ],
    )


def _ambiguous() -> HomonymResolution:
    return HomonymResolution(status="ambiguous", selectedSiren=None, candidates=[])


@pytest.fixture()
def stub_sources(monkeypatch):
    """Branche les sources ; seul `hiring` (France Travail) produit des lignes
    (nom seul). #2616.1 — `list_hiring_companies_apec` est stubbée à vide elle
    aussi : sans ce stub, chaque test ferait un VRAI appel réseau vers apec.fr
    dès que `hiring` est sélectionné (le défaut de ces tests). Même raison
    pour `it_job_signals_wttj`/`it_job_signals_ats` (corroboration #2616.1) :
    ATS (Greenhouse/Lever) n'a besoin d'aucune clé et ferait un VRAI appel
    réseau par candidat `hiring` résolu."""

    def _install(rows: list[dict]):
        async def _hiring(dept, kw, days, lim, **_kwargs):  # profile= (signaux selon le secteur de l'ESN)
            return rows

        async def _empty(*a, **kw):
            return []

        monkeypatch.setattr(mod, "list_hiring_companies", _hiring)
        monkeypatch.setattr(mod, "list_hiring_companies_apec", _empty)
        monkeypatch.setattr(mod, "list_tender_buyers", _empty)
        monkeypatch.setattr(mod, "list_award_buyers", _empty)
        monkeypatch.setattr(mod, "it_job_signals_wttj", _empty)
        monkeypatch.setattr(mod, "it_job_signals_ats", _empty)

    return _install


def _coverage(resp) -> dict:
    cov = getattr(resp, "coverage", None)
    assert cov is not None, "la réponse doit porter un bloc `coverage` structuré"
    return cov.model_dump() if hasattr(cov, "model_dump") else dict(cov)


# ── 1. La borne tient le délai de l'API ────────────────────────────────────


def test_resolution_count_is_bounded_well_under_the_api_deadline(stub_sources, monkeypatch):
    """60 entreprises moissonnées → on n'en résout PAS 60.

    Mesuré : 60 résolutions = 72 s sur un bucket vidé, soit 27 s au-delà du
    couperet de 45 s de l'API. La borne existe pour que l'étape puisse finir.
    """
    stub_sources([_row(f"Entreprise {i}", i % 30) for i in range(90)])  # #4796 : MAX_RESOLUTIONS = 60
    attempted: list[str] = []

    async def _resolve(name, **kw):
        attempted.append(name)
        return _selected(f"{100000000 + len(attempted)}", name)

    monkeypatch.setattr(mod, "resolve_company_identity", _resolve)
    resp = asyncio.run(mod.discover_signals(mod.DiscoverSignalsRequest(sinceDays=90, limit=25)))

    assert len(attempted) <= mod.MAX_RESOLUTIONS
    assert len(attempted) < 90, "la borne doit mordre sur une moisson de 90"
    cov = _coverage(resp)
    assert cov["candidatesFound"] == 90
    assert cov["resolutionsAttempted"] == len(attempted)


# ── 2. LE test qui compte : non-examiné ≠ écarté ───────────────────────────


def test_never_examined_is_counted_apart_from_examined_and_rejected(stub_sources, monkeypatch):
    """Trois issues, trois compteurs — jamais fondus.

    C'est la règle de #631 portée à la borne : une entreprise que la borne a
    laissée de côté n'a PAS été jugée. La dire « écartée » serait inventer un
    verdict qu'on n'a jamais rendu.
    """
    stub_sources([_row(f"Entreprise {i}", i % 30) for i in range(80)])

    calls = {"n": 0}

    async def _resolve(name, **kw):
        calls["n"] += 1
        # 1 sur 2 résolue, 1 sur 2 homonyme non tranchée → un vrai mélange.
        return _selected(f"{200000000 + calls['n']}", name) if calls["n"] % 2 else _ambiguous()

    monkeypatch.setattr(mod, "resolve_company_identity", _resolve)
    resp = asyncio.run(mod.discover_signals(mod.DiscoverSignalsRequest(sinceDays=90, limit=25)))
    cov = _coverage(resp)

    attempted = cov["resolutionsAttempted"]
    assert cov["candidatesFound"] == 80
    assert cov["notExamined"] == 80 - attempted
    assert cov["notExamined"] > 0, "la borne doit mordre pour que le test prouve quelque chose"
    # Examinées = résolues + rejetées. Aucune fuite, aucun double compte.
    assert cov["resolved"] + cov["rejectedAmbiguous"] + cov["rejectedUnreachable"] == attempted
    # Et surtout : les non-examinées ne sont PAS dans les rejets.
    assert cov["rejectedAmbiguous"] < cov["notExamined"] + attempted
    assert cov["resolved"] + cov["rejectedAmbiguous"] + cov["rejectedUnreachable"] + cov["notExamined"] == 80


def test_unexamined_are_never_described_as_ecarte(stub_sources, monkeypatch):
    """Le mot compte. « Écarté » = jugé et rejeté ; la borne n'a rien jugé."""
    stub_sources([_row(f"Entreprise {i}", i % 30) for i in range(80)])

    async def _resolve(name, **kw):
        return _selected("123456789", name)

    monkeypatch.setattr(mod, "resolve_company_identity", _resolve)
    resp = asyncio.run(mod.discover_signals(mod.DiscoverSignalsRequest(sinceDays=90, limit=25)))

    entries = [d for d in resp.degraded if d.source == "siren-resolution"]
    unexamined = [d for d in entries if (d.count or 0) == _coverage(resp)["notExamined"]]
    assert unexamined, "le dépassement de borne doit être rapporté explicitement"
    for entry in unexamined:
        reason = entry.reason.lower()
        assert "écart" not in reason, f"non-examiné rendu comme écarté : {entry.reason!r}"
        assert "homonym" not in reason, f"non-examiné rendu comme homonymie : {entry.reason!r}"


def test_ambiguous_and_unreachable_stay_distinct_from_each_other(stub_sources, monkeypatch):
    """Régression #631 : un registre muet ne doit pas se lire « homonymie »."""
    stub_sources([_row(f"Entreprise {i}", i % 10) for i in range(6)])

    async def _resolve(name, **kw):
        # DISCOVER-ID (18/10) — keyé par NOM, plus par rang d'appel : la relance unique d'un registre muet
        # décale l'ordre des appels sans changer le verdict de chaque entreprise.
        if int(name.rsplit(" ", 1)[1]) % 2 == 0:
            return _ambiguous()
        raise RuntimeError("registre injoignable")

    monkeypatch.setattr(mod, "resolve_company_identity", _resolve)
    resp = asyncio.run(mod.discover_signals(mod.DiscoverSignalsRequest(sinceDays=90, limit=25)))
    cov = _coverage(resp)

    assert cov["rejectedAmbiguous"] == 3
    assert cov["rejectedUnreachable"] == 3
    # #2469 — deux CLÉS distinctes, plus deux phrases françaises : c'est l'écran
    # qui les rend, et la distinction porte sur l'identifiant, pas sur des mots.
    reasons = {d.reason for d in resp.degraded if d.source == "siren-resolution"}
    assert SIREN_AMBIGUOUS_REASON in reasons
    assert SIREN_UNREACHABLE_REASON in reasons


# ── 3. L'ordre de résolution est défendable : le plus frais d'abord ─────────


def test_bound_resolves_the_freshest_signals_first(stub_sources, monkeypatch):
    """La fraîcheur EST la valeur produit de cet écran (docstring du module).

    C'est aussi le SEUL critère de tri disponible AVANT résolution : le score a
    besoin des faits registre que la résolution elle-même produit. Donc trier par
    fraîcheur n'est pas un choix par défaut, c'est le seul ordre honnête.
    """
    # « Entreprise 0 » = 0 jour (la plus fraîche) … « Entreprise 59 » = 59 jours.
    stub_sources([_row(f"Entreprise {i}", i) for i in range(60)])
    attempted: list[str] = []

    async def _resolve(name, **kw):
        attempted.append(name)
        return _selected(f"{300000000 + len(attempted)}", name)

    monkeypatch.setattr(mod, "resolve_company_identity", _resolve)
    asyncio.run(mod.discover_signals(mod.DiscoverSignalsRequest(sinceDays=90, limit=25)))

    ranks = sorted(int(n.split()[-1]) for n in attempted)
    assert ranks == list(range(len(attempted))), (
        "la borne doit garder les signaux les plus frais, pas les premiers arrivés"
    )


# ── 4. Progressif : demander la suite sans re-payer le début ───────────────


def test_resolve_offset_continues_where_the_previous_page_stopped(stub_sources, monkeypatch):
    """L'utilisateur peut demander la suite — et c'est bien la SUITE."""
    stub_sources([_row(f"Entreprise {i}", i) for i in range(mod.MAX_RESOLUTIONS + 20)])  # #4796
    attempted: list[str] = []

    async def _resolve(name, **kw):
        attempted.append(name)
        return _selected(f"{400000000 + len(attempted)}", name)

    monkeypatch.setattr(mod, "resolve_company_identity", _resolve)

    asyncio.run(mod.discover_signals(mod.DiscoverSignalsRequest(sinceDays=90, limit=25)))
    first_page = list(attempted)
    attempted.clear()

    resp2 = asyncio.run(
        mod.discover_signals(
            mod.DiscoverSignalsRequest(sinceDays=90, limit=25, resolveOffset=len(first_page))
        )
    )
    assert attempted, "la page suivante doit résoudre quelque chose"
    assert not set(attempted) & set(first_page), "la page 2 ne doit pas re-résoudre la page 1"
    cov = _coverage(resp2)
    assert cov["resolveOffset"] == len(first_page)
    assert cov["hasMore"] is (cov["notExamined"] > 0)


def test_has_more_is_false_when_everything_was_examined(stub_sources, monkeypatch):
    """Pas de « il en reste » inventé quand la moisson tient dans la borne."""
    stub_sources([_row(f"Entreprise {i}", i) for i in range(5)])

    async def _resolve(name, **kw):
        return _selected("123456789", name)

    monkeypatch.setattr(mod, "resolve_company_identity", _resolve)
    resp = asyncio.run(mod.discover_signals(mod.DiscoverSignalsRequest(sinceDays=90, limit=25)))
    cov = _coverage(resp)

    assert cov["notExamined"] == 0
    assert cov["hasMore"] is False
    assert not [d for d in resp.degraded if "borne" in d.reason.lower() or "plafond" in d.reason.lower()]


# ── 5. La borne ne salit pas la confiance des candidats retenus ────────────


def test_the_bound_does_not_lower_confidence_of_the_candidates_it_did_resolve(stub_sources, monkeypatch):
    """`data_confidence` retire 10 points par entrée de `degraded`.

    Or ne pas avoir REGARDÉ 86 autres entreprises ne dit rien sur la qualité des
    faits registre de celles qu'on a bien résolues : elles sont exactement aussi
    sûres dans les deux cas. Laisser la borne les pénaliser ferait dire au badge
    de confiance quelque chose de faux — une panne imaginaire de plus.
    """
    rows = [_row(f"Entreprise {i}", i % 30) for i in range(80)]

    async def _resolve(name, **kw):
        return _selected("123456789", name)

    monkeypatch.setattr(mod, "resolve_company_identity", _resolve)

    stub_sources(rows)
    bounded = asyncio.run(mod.discover_signals(mod.DiscoverSignalsRequest(sinceDays=90, limit=25, profile_data={"placedRoles": ["offre"]})))
    assert _coverage(bounded)["notExamined"] > 0

    # Le même compte, mais avec une moisson qui tient entièrement dans la borne.
    stub_sources(rows[:3])
    unbounded = asyncio.run(mod.discover_signals(mod.DiscoverSignalsRequest(sinceDays=90, limit=25, profile_data={"placedRoles": ["offre"]})))
    assert _coverage(unbounded)["notExamined"] == 0

    assert bounded.candidates and unbounded.candidates
    assert bounded.candidates[0].dataConfidence == unbounded.candidates[0].dataConfidence


# ── 6. Le budget temps borne AUSSI, quand le registre traîne ───────────────


def test_slow_registry_stops_at_the_time_budget_and_reports_the_remainder(stub_sources, monkeypatch):
    """Le vrai risque de prod n'est pas le nombre, c'est le débit.

    Sur un bucket déjà vidé par la moisson DECP, chaque résolution attend son
    jeton. Le nombre seul ne protège pas du couperet 45 s : le budget temps si.
    Ce qui n'a pas été tenté est compté, jamais silencieusement perdu.
    """
    stub_sources([_row(f"Entreprise {i}", i % 30) for i in range(40)])
    monkeypatch.setattr(mod, "RESOLUTION_BUDGET_S", 0.25)

    async def _resolve(name, **kw):
        await asyncio.sleep(0.05)
        return _selected("123456789", name)

    monkeypatch.setattr(mod, "resolve_company_identity", _resolve)
    resp = asyncio.run(mod.discover_signals(mod.DiscoverSignalsRequest(sinceDays=90, limit=25)))
    cov = _coverage(resp)

    assert cov["resolutionsAttempted"] < 40, "le budget temps doit couper la résolution"
    assert cov["notExamined"] == 40 - cov["resolutionsAttempted"]
    assert cov["stoppedOn"] in {"time-budget", "max-resolutions"}
    # Ce qui a été tenté a bien été rendu — on ne jette pas le travail fait.
    assert cov["resolved"] > 0


# ── 7. DISCOVER-ID (18/10) — un 429 de rafale n'écarte pas l'entreprise ─────


def test_a_burst_429_is_retried_once_before_the_company_is_dropped_as_unreachable(stub_sources, monkeypatch):
    """Recette prod 18/10 : « 1 résultat sur 26 », bandeau « en panne : l'identification ». Le registre public
    plafonne à 7 req/s par IP ; 6 résolutions en parallèle prennent des 429 en rafale, chacun devenait un verdict
    `none` → `unreachable` → entreprise écartée, sans seconde chance. Une seule relance (derrière le recul
    partagé) rend ces entreprises ; ce qui reste muet après la relance reste compté `unreachable`."""
    stub_sources([_row(f"Entreprise {i}", i) for i in range(6)])
    calls: dict[str, int] = {}

    async def _resolve(name, **kw):
        calls[name] = calls.get(name, 0) + 1
        if calls[name] == 1:  # première tentative : 429 → liste vide → verdict `none`
            return HomonymResolution(status="none", selectedSiren=None, candidates=[])
        return _selected(f"{100000000 + len(calls)}", name)

    monkeypatch.setattr(mod, "resolve_company_identity", _resolve)
    resp = asyncio.run(mod.discover_signals(mod.DiscoverSignalsRequest(sinceDays=90, limit=25)))

    assert _coverage(resp)["resolved"] == 6
    assert not [d for d in resp.degraded if d.reason == SIREN_UNREACHABLE_REASON]


# ── #4319.2 — la LISTE des entreprises détectées mais non identifiées ───────


def test_coverage_names_the_companies_it_could_not_identify(stub_sources, monkeypatch):
    """#4319.2 (Louis, 19/10) : « Je veux voir la liste. » Le bloc `coverage` porte les NOMS — non examinées
    (au-delà de la borne), registre muet et homonymes — pas seulement leur nombre."""
    stub_sources([_row(f"Entreprise {i}", i) for i in range(60)])

    async def _resolve(name, **kw):
        if name == "Entreprise 0":
            return _ambiguous()
        return _selected(f"{100000000 + int(name.split()[-1])}", name)

    monkeypatch.setattr(mod, "resolve_company_identity", _resolve)
    cov = _coverage(asyncio.run(mod.discover_signals(mod.DiscoverSignalsRequest(sinceDays=90, limit=25))))

    names = cov["notIdentifiedNames"]
    assert "Entreprise 0" in names  # homonyme : examiné puis rejeté, nommé aussi
    assert len(names) == cov["notExamined"] + cov["rejectedAmbiguous"] + cov["rejectedUnreachable"]
    assert len(set(names)) == len(names)


def test_coverage_names_nothing_when_everything_was_identified(stub_sources, monkeypatch):
    """Une liste sans élément ne fait aucune ligne : tout identifié => aucun nom."""
    stub_sources([_row("Seule SA", 1)])

    async def _resolve(name, **kw):
        return _selected("100000001", name)

    monkeypatch.setattr(mod, "resolve_company_identity", _resolve)
    assert _coverage(asyncio.run(mod.discover_signals(mod.DiscoverSignalsRequest(sinceDays=90, limit=25))))[
        "notIdentifiedNames"
    ] == []
