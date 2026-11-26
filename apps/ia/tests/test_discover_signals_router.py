"""`POST /discover/signals` — agrégation des trois sources de signal.

Vérifie le contrat `agent_docs/discover-v2-contract.md` : dédoublonnage par SIREN
puis par nom normalisé, fusion des signaux d'une même entreprise, tri par
fraîcheur, ZÉRO candidat sans SIREN réel, ZÉRO source HS masquée.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.routers import discover_signals as mod
from app.services.company_filters import (
    KIND_AMBIGUOUS,
    SIREN_AMBIGUOUS_REASON,
    SIREN_UNREACHABLE_REASON,
    UNKNOWN_SECTOR_REASON,
    DegradeReason,
)
from app.services.data_sources.signal_errors import SignalSourceUnavailable
from app.services.homonym_disambiguation import HomonymResolution, ScoredCandidate


def _iso(days_ago: int) -> str:
    return (datetime.now(UTC) - timedelta(days=days_ago)).date().isoformat()


def _row(name: str, kind: str, days_ago: int, *, siren: str | None = None, **extra) -> dict:
    row = {
        "name": name,
        "siren": siren,
        "department": extra.pop("department", "69"),
        "city": extra.pop("city", None),
        "signal": {
            "type": kind,
            "label": extra.pop("label", f"Développeur {name}" if kind == "hiring" else f"{kind} {name}"),
            "date": _iso(days_ago),
            "url": extra.pop("url", None),
            "detail": extra.pop("detail", None),
        },
    }
    row.update(extra)
    return row


def _resolution(siren: str | None, name: str = "ACME", **facts) -> HomonymResolution:
    if siren is None:
        return HomonymResolution(status="none", selectedSiren=None, candidates=[])
    return HomonymResolution(
        status="selected",
        selectedSiren=siren,
        confidence=0.9,
        candidates=[
            ScoredCandidate(
                siren=siren,
                name=name,
                nafCode=facts.get("naf", "84.11Z"),
                nafLabel=facts.get("nafLabel", "Administration publique"),
                city=facts.get("city", "LYON"),
                department=facts.get("department", "69"),
            )
        ],
    )


@pytest.fixture
def sources(monkeypatch):
    """Stub the four list functions; each test fills in the rows it needs.

    #2616.1 — ``hiring_apec``/``hiring_wttj``/``hiring_search`` par défaut à
    ``[]`` : sans ce stub, chaque test existant ferait un VRAI appel réseau
    vers apec.fr / l'index Algolia WTTJ / le waterfall de recherche dès que
    `hiring` est demandé (le défaut de `_post`), ce qui casserait la suite en
    CI/sandbox. Même raison pour ``corroborate_wttj``/``hiring_ats`` (la
    CORROBORATION par candidat) : sans clé, WTTJ est un no-op strict (`[]`),
    mais ATS (Greenhouse/Lever) ferait un VRAI appel réseau par candidat
    corroboré.
    """
    state: dict[str, object] = {
        "tender": [],
        "award": [],
        "capital": [],
        "deal": [],  # #4732.1
        "hiring": [],
        "hiring_apec": [],
        "hiring_wttj": [],
        "hiring_search": [],
        "hiring_ats": [],
        "corroborate_wttj": [],
    }

    def _install(key):
        async def _fn(*_args, **_kwargs):
            value = state[key]
            if isinstance(value, Exception):
                raise value
            return value

        return _fn

    monkeypatch.setattr(mod, "list_tender_buyers", _install("tender"))
    monkeypatch.setattr(mod, "list_award_buyers", _install("award"))
    monkeypatch.setattr(mod, "list_capital_increase_companies", _install("capital"))
    monkeypatch.setattr(mod, "list_takeover_companies", _install("deal"))
    monkeypatch.setattr(mod, "list_hiring_companies", _install("hiring"))
    monkeypatch.setattr(mod, "list_hiring_companies_apec", _install("hiring_apec"))
    monkeypatch.setattr(mod, "list_hiring_companies_wttj", _install("hiring_wttj"))
    monkeypatch.setattr(mod, "list_hiring_companies_search", _install("hiring_search"))
    monkeypatch.setattr(mod, "it_job_signals_wttj", _install("corroborate_wttj"))
    monkeypatch.setattr(mod, "it_job_signals_ats", _install("hiring_ats"))
    return state


@pytest.fixture
def registry(monkeypatch):
    """Stub the exact-SIREN registry lookup with a SIREN → row mapping.

    Always installed alongside ``resolver`` so no test can reach the network:
    DECP rows arrive with a SIRET and no name, and take this path.
    """
    table: dict[str, dict] = {}

    async def _lookup(siren: str) -> dict | None:
        return table.get("".join(ch for ch in str(siren or "") if ch.isdigit())[:9])

    monkeypatch.setattr(mod, "identity_by_siren", _lookup)
    return table


@pytest.fixture
def resolver(monkeypatch, registry):
    """Stub the SIREN resolver with a name → HomonymResolution mapping."""
    table: dict[str, HomonymResolution] = {}

    async def _resolve(company_name: str, **_kwargs) -> HomonymResolution:
        return table.get(company_name, _resolution(None))

    monkeypatch.setattr(mod, "resolve_company_identity", _resolve)
    return table


_SCOPE_ROLES = ["développeur", "dev", "ingénieur", "engineer", "data", "devops", "architecte", "chef de projet", "consultant", "technicien", "admin", "product owner"]


def _post(client, **body):
    # #3901.p — Découvrir ne retient une offre que si elle recoupe un métier de l'ESN (déclaré ou déduit).
    profile = dict(body.pop("profile_data", None) or {})
    profile["placedRoles"] = [*_SCOPE_ROLES, *profile.get("placedRoles", [])]
    payload = {"department": "69", "sinceDays": 90, "limit": 25, "profile_data": profile}
    payload.update(body)
    return client.post("/discover/signals", json=payload)


# ── agrégation / dédoublonnage / fusion ────────────────────────────────────


def test_dedupes_by_siren_and_merges_signals(client, sources, resolver) -> None:
    """Deux sources, la même entité (même SIREN) → UN candidat, DEUX signaux."""
    sources["tender"] = [_row("VILLE DE LYON", "tender", 5, siren="216901234")]
    sources["award"] = [_row("Ville de Lyon (mairie)", "award", 20, siren="21690123400015")]
    resolver["VILLE DE LYON"] = _resolution("216901234", "VILLE DE LYON")

    data = _post(client).json()

    assert len(data["candidates"]) == 1
    cand = data["candidates"][0]
    assert cand["siren"] == "216901234"
    assert sorted(s["type"] for s in cand["signals"]) == ["award", "tender"]


def test_dedupes_by_normalized_name_when_source_has_no_siren(client, sources, resolver) -> None:
    sources["tender"] = [_row("Acme Industrie", "tender", 3)]
    sources["hiring"] = [_row("ACME INDUSTRIE", "hiring", 8)]
    resolver["Acme Industrie"] = _resolution("552100554", "ACME INDUSTRIE")
    resolver["ACME INDUSTRIE"] = _resolution("552100554", "ACME INDUSTRIE")

    data = _post(client).json()

    assert len(data["candidates"]) == 1
    assert data["candidates"][0]["siren"] == "552100554"
    assert len(data["candidates"][0]["signals"]) == 2


def test_merges_distinct_names_resolving_to_the_same_siren(client, sources, resolver) -> None:
    """Deux libellés différents, une seule entité légale → un seul candidat."""
    sources["tender"] = [_row("CD69", "tender", 2)]
    sources["hiring"] = [_row("Conseil Departemental du Rhone", "hiring", 6)]
    resolver["CD69"] = _resolution("226900019", "DEPARTEMENT DU RHONE")
    resolver["Conseil Departemental du Rhone"] = _resolution("226900019", "DEPARTEMENT DU RHONE")

    data = _post(client).json()
    assert len(data["candidates"]) == 1
    assert len(data["candidates"][0]["signals"]) == 2


def test_multiple_hiring_offers_collapse_into_one_candidate(client, sources, resolver) -> None:
    sources["hiring"] = [
        _row("ACME", "hiring", 1, label="Dev Python"),
        _row("ACME", "hiring", 4, label="Data Engineer"),
        _row("ACME", "hiring", 9, label="Admin Cloud"),
    ]
    resolver["ACME"] = _resolution("552100554", "ACME")

    data = _post(client).json()
    assert len(data["candidates"]) == 1
    assert len(data["candidates"][0]["signals"]) == 3


# ── tri par fraîcheur ──────────────────────────────────────────────────────


def test_candidates_sorted_freshest_signal_first(client, sources, resolver) -> None:
    sources["tender"] = [
        _row("OLD CORP", "tender", 60),
        _row("FRESH CORP", "tender", 2),
        _row("MID CORP", "tender", 20),
    ]
    for i, name in enumerate(("OLD CORP", "FRESH CORP", "MID CORP")):
        resolver[name] = _resolution(f"55210055{i}", name)

    data = _post(client).json()
    assert [c["name"] for c in data["candidates"]] == ["FRESH CORP", "MID CORP", "OLD CORP"]
    # Les signaux d'un candidat sont eux aussi du plus frais au plus ancien.
    sources["hiring"] = [_row("FRESH CORP", "hiring", 1)]
    fresh = _post(client).json()["candidates"][0]
    assert fresh["signals"][0]["type"] == "hiring"


def test_limit_caps_the_candidate_list(client, sources, resolver) -> None:
    sources["tender"] = [_row(f"CORP {i}", "tender", i + 1) for i in range(10)]
    for i in range(10):
        resolver[f"CORP {i}"] = _resolution(f"55210050{i}", f"CORP {i}")

    data = _post(client, limit=3).json()
    assert len(data["candidates"]) == 3
    assert [c["name"] for c in data["candidates"]] == ["CORP 0", "CORP 1", "CORP 2"]


# ── SIREN : jamais inventé, jamais silencieux ──────────────────────────────


def test_unresolved_siren_is_never_emitted_and_is_reported(client, sources, resolver) -> None:
    sources["tender"] = [
        _row("ENTITE RESOLUE", "tender", 3),
        _row("Fabricant Fenetres / Industrie", "tender", 4),
        _row("Truc Machin", "tender", 5),
    ]
    resolver["ENTITE RESOLUE"] = _resolution("552100554", "ENTITE RESOLUE")

    data = _post(client).json()

    assert [c["name"] for c in data["candidates"]] == ["ENTITE RESOLUE"]
    assert all(c["siren"] for c in data["candidates"])
    unresolved = [d for d in data["degraded"] if d["source"] == "siren-resolution"]
    assert len(unresolved) == 1
    assert unresolved[0]["count"] == 2
    # #2469 — le CHIFFRE voyage dans `count`, la raison est une clé : c'est
    # l'écran qui écrit « 2 entreprises … », accordé et traduit.
    assert unresolved[0]["reason"] == SIREN_UNREACHABLE_REASON


def test_ambiguous_resolution_is_not_emitted(client, sources, resolver) -> None:
    """Homonymes non tranchés → aucun SIREN choisi au hasard."""
    sources["tender"] = [_row("SOCIETE GENERALE", "tender", 3)]
    resolver["SOCIETE GENERALE"] = HomonymResolution(
        status="ambiguous",
        selectedSiren=None,
        candidates=[ScoredCandidate(siren="552120222", name="SOCIETE GENERALE")],
    )

    data = _post(client).json()
    assert data["candidates"] == []
    assert any(d["source"] == "siren-resolution" for d in data["degraded"])


def test_resolution_failure_does_not_crash_the_run(client, sources, monkeypatch) -> None:
    sources["tender"] = [_row("ACME", "tender", 3)]

    async def _boom(*_a, **_kw):
        raise RuntimeError("registry down")

    monkeypatch.setattr(mod, "resolve_company_identity", _boom)

    resp = _post(client)
    assert resp.status_code == 200
    assert resp.json()["candidates"] == []
    assert any(d["source"] == "siren-resolution" for d in resp.json()["degraded"])


# ── #2616.1 : « hiring » lu sur DEUX registres, pas un seul ────────────────


def test_apec_widens_hiring_beyond_france_travail(client, sources, resolver) -> None:
    """APEC contribue au MÊME bucket `hiring`, en plus de France Travail — pas
    une quatrième source sélectionnable (`query.sources` ne bouge pas)."""
    sources["hiring"] = [_row("FT CORP", "hiring", 3)]
    sources["hiring_apec"] = [_row("APEC CORP", "hiring", 2, sourceLabel="APEC")]
    resolver["FT CORP"] = _resolution("552100554", "FT CORP")
    resolver["APEC CORP"] = _resolution("552100555", "APEC CORP")

    data = _post(client).json()

    assert {c["name"] for c in data["candidates"]} == {"FT CORP", "APEC CORP"}
    assert data["query"]["sources"] == ["tender", "award", "hiring"]


def test_apec_row_is_attributed_to_apec_not_france_travail(client, sources, resolver) -> None:
    """#1912.11 — une source citée à l'écran doit être la VRAIE. Sans
    `sourceLabel`, une ligne APEC hériterait du libellé par défaut du bucket
    (« France Travail ») — un fournisseur mal cité, pas juste un détail."""
    sources["hiring_apec"] = [_row("APEC CORP", "hiring", 2, sourceLabel="APEC")]
    resolver["APEC CORP"] = _resolution("552100555", "APEC CORP")

    cand = _post(client).json()["candidates"][0]
    assert [s["name"] for s in cand["sources"]] == ["APEC"]


def test_apec_hiring_signals_survive_a_france_travail_outage(client, sources, resolver) -> None:
    """Le cœur de #2616.1 : France Travail HS ne doit plus vouloir dire
    « aucun signal de recrutement » — APEC continue de contribuer, et la
    panne France Travail reste quand même visible (aucune source HS masquée)."""
    sources["hiring"] = SignalSourceUnavailable("France Travail", DegradeReason.MISSING_API_KEY)
    sources["hiring_apec"] = [_row("APEC ONLY CORP", "hiring", 1, sourceLabel="APEC")]
    resolver["APEC ONLY CORP"] = _resolution("552100556", "APEC ONLY CORP")

    data = _post(client).json()

    assert [c["name"] for c in data["candidates"]] == ["APEC ONLY CORP"]
    ft = [d for d in data["degraded"] if d["source"] == "France Travail"]
    assert len(ft) == 1


def test_apec_never_runs_when_hiring_is_not_requested(client, sources, resolver, monkeypatch) -> None:
    calls: list[object] = []

    async def _spy(*args, **_kwargs):
        calls.append(args)
        return []

    monkeypatch.setattr(mod, "list_hiring_companies_apec", _spy)
    sources["tender"] = [_row("TENDER CORP", "tender", 3)]
    resolver["TENDER CORP"] = _resolution("552100554", "TENDER CORP")

    _post(client, sources=["tender"])

    assert calls == []


def test_wttj_widens_hiring_beyond_france_travail_and_apec(client, sources, resolver) -> None:
    """Mesure en production le 22/09/2026 : 58 liens « Voir la source »,
    38 apec.fr + 20 candidat.francetravail.fr, ZÉRO WTTJ — la fonction
    n'était jamais appelée depuis ce routeur. WTTJ contribue au MÊME bucket
    `hiring`, en plus de France Travail et APEC — pas une quatrième source
    sélectionnable (`query.sources` ne bouge pas)."""
    sources["hiring"] = [_row("FT CORP", "hiring", 3)]
    sources["hiring_apec"] = [_row("APEC CORP", "hiring", 2, sourceLabel="APEC")]
    sources["hiring_wttj"] = [_row("WTTJ CORP", "hiring", 1, sourceLabel="Welcome to the Jungle")]
    resolver["FT CORP"] = _resolution("552100554", "FT CORP")
    resolver["APEC CORP"] = _resolution("552100555", "APEC CORP")
    resolver["WTTJ CORP"] = _resolution("552100557", "WTTJ CORP")

    data = _post(client).json()

    assert {c["name"] for c in data["candidates"]} == {"FT CORP", "APEC CORP", "WTTJ CORP"}
    assert data["query"]["sources"] == ["tender", "award", "hiring"]


def test_wttj_row_is_attributed_to_wttj_not_france_travail(client, sources, resolver) -> None:
    """#1912.11 — une source citée à l'écran doit être la VRAIE. Sans
    `sourceLabel`, une ligne WTTJ hériterait du libellé par défaut du bucket
    (« France Travail »)."""
    sources["hiring_wttj"] = [_row("WTTJ CORP", "hiring", 1, sourceLabel="Welcome to the Jungle")]
    resolver["WTTJ CORP"] = _resolution("552100557", "WTTJ CORP")

    cand = _post(client).json()["candidates"][0]
    assert [s["name"] for s in cand["sources"]] == ["Welcome to the Jungle"]


def test_wttj_hiring_signals_survive_a_france_travail_outage(client, sources, resolver) -> None:
    """France Travail HS ne doit plus vouloir dire « aucun signal de
    recrutement » — WTTJ continue de contribuer (comme APEC), et la panne
    reste visible (aucune source HS masquée)."""
    sources["hiring"] = SignalSourceUnavailable("France Travail", DegradeReason.MISSING_API_KEY)
    sources["hiring_wttj"] = [_row("WTTJ ONLY CORP", "hiring", 1, sourceLabel="Welcome to the Jungle")]
    resolver["WTTJ ONLY CORP"] = _resolution("552100558", "WTTJ ONLY CORP")

    data = _post(client).json()

    assert [c["name"] for c in data["candidates"]] == ["WTTJ ONLY CORP"]
    ft = [d for d in data["degraded"] if d["source"] == "France Travail"]
    assert len(ft) == 1


def test_wttj_never_runs_when_hiring_is_not_requested(client, sources, resolver, monkeypatch) -> None:
    calls: list[object] = []

    async def _spy(*args, **_kwargs):
        calls.append(args)
        return []

    monkeypatch.setattr(mod, "list_hiring_companies_wttj", _spy)
    sources["tender"] = [_row("TENDER CORP", "tender", 3)]
    resolver["TENDER CORP"] = _resolution("552100554", "TENDER CORP")

    _post(client, sources=["tender"])

    assert calls == []


def test_search_widens_hiring_beyond_france_travail_apec_and_wttj(client, sources, resolver) -> None:
    """La recherche (Welcome to the Jungle + ATS publics, moteur déjà branché)
    contribue au MÊME bucket `hiring`, en plus de France Travail, APEC et
    WTTJ — pas une cinquième source sélectionnable (`query.sources` ne bouge
    pas)."""
    sources["hiring"] = [_row("FT CORP", "hiring", 3)]
    sources["hiring_search"] = [_row("SEARCH CORP", "hiring", 1, sourceLabel="Lever")]
    resolver["FT CORP"] = _resolution("552100554", "FT CORP")
    resolver["SEARCH CORP"] = _resolution("552100559", "SEARCH CORP")

    data = _post(client).json()

    assert {c["name"] for c in data["candidates"]} == {"FT CORP", "SEARCH CORP"}
    assert data["query"]["sources"] == ["tender", "award", "hiring"]


def test_search_row_is_attributed_to_its_own_platform(client, sources, resolver) -> None:
    """#1912.11 — une source citée à l'écran doit être la VRAIE. Sans
    `sourceLabel`, une ligne trouvée par recherche hériterait du libellé par
    défaut du bucket (« France Travail »)."""
    sources["hiring_search"] = [_row("SEARCH CORP", "hiring", 1, sourceLabel="Lever")]
    resolver["SEARCH CORP"] = _resolution("552100559", "SEARCH CORP")

    cand = _post(client).json()["candidates"][0]
    assert [s["name"] for s in cand["sources"]] == ["Lever"]


def test_search_hiring_signals_survive_a_france_travail_outage(client, sources, resolver) -> None:
    """France Travail HS ne doit plus vouloir dire « aucun signal de
    recrutement » — la recherche continue de contribuer (comme APEC/WTTJ), et
    la panne reste visible (aucune source HS masquée)."""
    sources["hiring"] = SignalSourceUnavailable("France Travail", DegradeReason.MISSING_API_KEY)
    sources["hiring_search"] = [_row("SEARCH ONLY CORP", "hiring", 1, sourceLabel="Greenhouse")]
    resolver["SEARCH ONLY CORP"] = _resolution("552100560", "SEARCH ONLY CORP")

    data = _post(client).json()

    assert [c["name"] for c in data["candidates"]] == ["SEARCH ONLY CORP"]
    ft = [d for d in data["degraded"] if d["source"] == "France Travail"]
    assert len(ft) == 1


def test_search_never_runs_when_hiring_is_not_requested(client, sources, resolver, monkeypatch) -> None:
    calls: list[object] = []

    async def _spy(*args, **_kwargs):
        calls.append(args)
        return []

    monkeypatch.setattr(mod, "list_hiring_companies_search", _spy)
    sources["tender"] = [_row("TENDER CORP", "tender", 3)]
    resolver["TENDER CORP"] = _resolution("552100554", "TENDER CORP")

    _post(client, sources=["tender"])

    assert calls == []


# ── #2616.1 (suite) : WTTJ et les ATS boards CORROBORENT un candidat déjà
# trouvé — elles ne savent pas balayer un territoire (`it_job_signals_wttj`
# et `it_job_signals_ats` sont ANCRÉES sur un nom d'entreprise, comme dans
# l'analyse de compte), donc elles n'ajoutent jamais de compte, seulement des
# signaux sur ceux que France Travail/APEC ont déjà remontés. ──────────────


def test_wttj_and_ats_corroborate_a_hiring_candidate(client, sources, resolver) -> None:
    """Un compte trouvé par France Travail voit ses signaux enrichis par WTTJ
    et un board ATS (Greenhouse) une fois son nom REGISTRE connu — « plusieurs
    plateformes » (#2616) devient vrai sur le MÊME candidat, pas un quatrième
    bucket sélectionnable."""
    sources["hiring"] = [_row("FT CORP", "hiring", 10)]
    resolver["FT CORP"] = _resolution("552100557", "FT CORP")
    sources["corroborate_wttj"] = [
        {
            "title": "Lead Data Engineer",
            "location": "Lyon",
            "date": _iso(2),
            "contractType": "CDI",
            "skills": [],
            "company": "FT CORP",
            "city": "Lyon",
            "url": "https://welcometothejungle.com/fr/companies/ft-corp/jobs/1",
            "source": "wttj",
        }
    ]
    sources["hiring_ats"] = [
        {
            "title": "Ingénieur DevOps",
            "location": "Lyon",
            "date": _iso(1),
            "contractType": None,
            "skills": [],
            "company": "FT CORP",
            "city": "Lyon",
            "url": "https://boards.greenhouse.io/ftcorp/jobs/2",
            "source": "greenhouse",
        }
    ]

    data = _post(client, sources=["hiring"]).json()

    assert {c["name"] for c in data["candidates"]} == {"FT CORP"}
    cand = data["candidates"][0]
    assert len(cand["signals"]) == 3
    # La corroboration ARRIVE APRÈS la moisson territoriale : le signal le
    # plus frais des trois (ATS, iso(1)) doit gagner le tri, sinon l'enrichi
    # n'atteint jamais l'écran qui trie par fraîcheur.
    assert cand["signals"][0]["date"] == _iso(1)


def test_wttj_and_ats_are_attributed_to_their_own_platform(client, sources, resolver) -> None:
    """Même règle que #1912.11 pour APEC : la plateforme citée doit être la
    VRAIE, jamais le libellé par défaut du bucket (« France Travail »)."""
    sources["hiring"] = [_row("FT CORP", "hiring", 10)]
    resolver["FT CORP"] = _resolution("552100557", "FT CORP")
    sources["corroborate_wttj"] = [
        {
            "title": "Lead Data Engineer",
            "location": "Lyon",
            "date": _iso(2),
            "contractType": "CDI",
            "skills": [],
            "company": "FT CORP",
            "city": "Lyon",
            "url": "https://welcometothejungle.com/fr/companies/ft-corp/jobs/1",
            "source": "wttj",
        }
    ]
    sources["hiring_ats"] = [
        {
            "title": "Ingénieur DevOps",
            "location": "Lyon",
            "date": _iso(1),
            "contractType": None,
            "skills": [],
            "company": "FT CORP",
            "city": "Lyon",
            "url": "https://boards.greenhouse.io/ftcorp/jobs/2",
            "source": "greenhouse",
        }
    ]

    cand = _post(client, sources=["hiring"]).json()["candidates"][0]

    names = {s["name"] for s in cand["sources"]}
    assert names == {"France Travail", "Welcome to the Jungle", "Greenhouse"}


def test_wttj_and_ats_never_run_when_hiring_is_not_requested(client, sources, resolver, monkeypatch) -> None:
    calls: list[object] = []

    async def _spy(*args, **_kwargs):
        calls.append(args)
        return []

    monkeypatch.setattr(mod, "it_job_signals_wttj", _spy)
    monkeypatch.setattr(mod, "it_job_signals_ats", _spy)
    sources["tender"] = [_row("TENDER CORP", "tender", 3)]
    resolver["TENDER CORP"] = _resolution("552100554", "TENDER CORP")

    _post(client, sources=["tender"])

    assert calls == []


def test_ats_outage_does_not_swallow_wttj_corroboration(client, sources, resolver) -> None:
    """Gracieux : une panne d'un corroborateur n'efface pas ce que l'autre a
    trouvé (même doctrine que la survie APEC/France Travail)."""
    sources["hiring"] = [_row("FT CORP", "hiring", 10)]
    resolver["FT CORP"] = _resolution("552100557", "FT CORP")
    sources["hiring_ats"] = RuntimeError("greenhouse HTTP 500")
    sources["corroborate_wttj"] = [
        {
            "title": "Lead Data Engineer",
            "location": "Lyon",
            "date": _iso(2),
            "contractType": "CDI",
            "skills": [],
            "company": "FT CORP",
            "city": "Lyon",
            "url": "https://welcometothejungle.com/fr/companies/ft-corp/jobs/1",
            "source": "wttj",
        }
    ]

    cand = _post(client, sources=["hiring"]).json()["candidates"][0]

    assert len(cand["signals"]) == 2
    assert "Welcome to the Jungle" in {s["name"] for s in cand["sources"]}


def test_apec_wttj_and_ats_are_all_called_and_a_failure_does_not_cancel_the_others(
    client, sources, resolver, monkeypatch
) -> None:
    """Preuve CONSOLIDÉE de #2616.1 : les TROIS sources branchées en plus de
    France Travail (APEC en moisson, WTTJ en moisson, ATS en corroboration)
    sont bien APPELÉES dans une même requête `hiring` — et une panne de l'une
    d'elles (ici APEC) ne prive jamais l'écran de ce que les deux autres ont
    trouvé. Réunit dans un seul test ce que les tests de survie unitaires
    ci-dessus prouvent séparément (APEC/FT, WTTJ/FT, ATS/WTTJ)."""
    calls = {"apec": 0, "wttj": 0, "ats": 0}

    async def _apec_fails(*_args, **_kwargs):
        calls["apec"] += 1
        raise RuntimeError("apec.fr HTTP 500")

    async def _wttj_harvest(*_args, **_kwargs):
        calls["wttj"] += 1
        return [_row("WTTJ CORP", "hiring", 1, sourceLabel="Welcome to the Jungle")]

    async def _ats_corroborate(*_args, **_kwargs):
        calls["ats"] += 1
        return [
            {
                "title": "Ingénieur DevOps",
                "location": "Lyon",
                "date": _iso(1),
                "contractType": None,
                "skills": [],
                "company": "WTTJ CORP",
                "city": "Lyon",
                "url": "https://boards.greenhouse.io/wttjcorp/jobs/1",
                "source": "greenhouse",
            }
        ]

    monkeypatch.setattr(mod, "list_hiring_companies_apec", _apec_fails)
    monkeypatch.setattr(mod, "list_hiring_companies_wttj", _wttj_harvest)
    monkeypatch.setattr(mod, "it_job_signals_ats", _ats_corroborate)
    resolver["WTTJ CORP"] = _resolution("552100559", "WTTJ CORP")

    data = _post(client, sources=["hiring"]).json()

    # Les trois sources ont bien été SOLLICITÉES, indépendamment de l'issue.
    assert calls == {"apec": 1, "wttj": 1, "ats": 1}
    # La panne APEC n'a effacé ni le candidat trouvé par WTTJ ni sa
    # corroboration ATS : les deux autres sources survivent intactes.
    assert {c["name"] for c in data["candidates"]} == {"WTTJ CORP"}
    cand = data["candidates"][0]
    platforms = {s["name"] for s in cand["sources"]}
    assert {"Welcome to the Jungle", "Greenhouse"} <= platforms


# ── #2616.2 : distinguer les employeurs publics d'un signal « hiring » ─────


def test_hiring_signal_names_a_public_employer(client, sources, resolver, registry) -> None:
    sources["hiring"] = [_row("COMMUNE DE X", "hiring", 3, siren="216901234")]
    resolver["COMMUNE DE X"] = _resolution("216901234", "COMMUNE DE X")
    registry["216901234"] = {
        "siren": "216901234",
        "name": "COMMUNE DE X",
        "legalCategory": "7210",
    }

    cand = _post(client).json()["candidates"][0]
    assert cand["signals"][0]["publicEmployer"] is True


def test_hiring_signal_names_a_private_employer_too(client, sources, resolver, registry) -> None:
    sources["hiring"] = [_row("ACME SAS", "hiring", 3, siren="552100554")]
    resolver["ACME SAS"] = _resolution("552100554", "ACME SAS")
    registry["552100554"] = {"siren": "552100554", "name": "ACME SAS", "legalCategory": "5710"}

    cand = _post(client).json()["candidates"][0]
    assert cand["signals"][0]["publicEmployer"] is False


def test_hiring_signal_leaves_public_employer_unset_without_legal_category(client, sources, resolver, registry) -> None:
    """Catégorie juridique non résolue (registre muet sur ce champ, ou SIREN
    non résolu) → jamais deviné (GA-18/GA-19)."""
    sources["hiring"] = [_row("MYSTERE SARL", "hiring", 3, siren="552100554")]
    resolver["MYSTERE SARL"] = _resolution("552100554", "MYSTERE SARL")
    registry["552100554"] = {"siren": "552100554", "name": "MYSTERE SARL"}  # pas de legalCategory

    cand = _post(client).json()["candidates"][0]
    assert cand["signals"][0]["publicEmployer"] is None


def test_tender_signal_is_never_labelled_public_employer(client, sources, resolver, registry) -> None:
    """Un acheteur BOAMP/DECP se nomme déjà comme public par la source elle-
    même — cette question ne s'ajoute qu'aux signaux `hiring`."""
    sources["tender"] = [_row("VILLE DE X", "tender", 3, siren="216901234")]
    resolver["VILLE DE X"] = _resolution("216901234", "VILLE DE X")
    registry["216901234"] = {"siren": "216901234", "name": "VILLE DE X", "legalCategory": "7210"}

    cand = _post(client).json()["candidates"][0]
    assert cand["signals"][0]["publicEmployer"] is None


# ── degraded : aucune source HS masquée ────────────────────────────────────


def test_source_failure_is_reported_in_degraded(client, sources, resolver) -> None:
    sources["tender"] = [_row("ACME", "tender", 3)]
    sources["hiring"] = SignalSourceUnavailable("France Travail", DegradeReason.MISSING_API_KEY)
    resolver["ACME"] = _resolution("552100554", "ACME")

    data = _post(client).json()

    assert len(data["candidates"]) == 1  # les sources saines contribuent quand même
    ft = [d for d in data["degraded"] if d["source"] == "France Travail"]
    assert len(ft) == 1
    assert ft[0]["reason"] == DegradeReason.MISSING_API_KEY


def test_unexpected_source_error_is_reported_too(client, sources, resolver) -> None:
    sources["award"] = ValueError("payload illisible")
    data = _post(client).json()
    assert [d["source"] for d in data["degraded"]] == ["DECP"]
    assert "payload illisible" in data["degraded"][0]["reason"]


def test_all_sources_down_returns_empty_and_three_degraded(client, sources, resolver) -> None:
    sources["tender"] = SignalSourceUnavailable("BOAMP", "HTTP 503")
    sources["award"] = SignalSourceUnavailable("DECP", "HTTP 503")
    sources["hiring"] = SignalSourceUnavailable("France Travail", "pas de clé")

    data = _post(client).json()
    assert data["candidates"] == []
    assert sorted(d["source"] for d in data["degraded"]) == ["BOAMP", "DECP", "France Travail"]


# ── requête : critères normalisés + sélection de sources ───────────────────


def test_query_echoes_the_normalized_criteria(client, sources, resolver) -> None:
    data = _post(client, department="  69 ", sinceDays=45, keywords=["Data", " cloud "], limit=7).json()
    assert data["query"] == {
        "department": "69",
        "sinceDays": 45,
        "keywords": ["data", "cloud"],
        "sources": ["tender", "award", "hiring"],
        "limit": 7,
        # Le retournement (tome 4) : « all » par défaut — un filtre de nature
        # qu'on n'a pas demandé ne doit rien retirer.
        "entityType": "all",
        # Rendu même VIDE : c'est ce qui permet à l'écran de vérifier que son
        # critère a été appliqué. Son absence était le défaut — rien ne partait,
        # donc rien ne revenait, donc rien ne pouvait le signaler.
        "sectors": [],
        # #2616.1 — même raison, même convention.
        "contractTypes": [],
        # #3096 — même raison, même convention.
        "remotePolicies": [],
        # #3097 — même raison, même convention.
        "seniorities": [],
        # #3226 (#3203.6) — même raison, même convention.
        "deliveryFitFilter": [],
    }


def test_sources_filter_only_runs_the_requested_sources(client, sources, resolver) -> None:
    sources["tender"] = [_row("TENDER CORP", "tender", 3)]
    sources["award"] = [_row("AWARD CORP", "award", 3)]
    sources["hiring"] = SignalSourceUnavailable("France Travail", "pas de clé")
    resolver["TENDER CORP"] = _resolution("552100554", "TENDER CORP")
    resolver["AWARD CORP"] = _resolution("552100555", "AWARD CORP")

    data = _post(client, sources=["tender"]).json()

    assert [c["name"] for c in data["candidates"]] == ["TENDER CORP"]
    # France Travail n'a pas tourné → elle n'a pas à apparaître en dégradé.
    assert data["degraded"] == []
    assert data["query"]["sources"] == ["tender"]


def test_unknown_source_name_is_rejected(client, sources, resolver) -> None:
    assert _post(client, sources=["twitter"]).status_code == 422


def test_since_days_is_bounded(client, sources, resolver) -> None:
    assert _post(client, sinceDays=0).status_code == 422
    assert _post(client, sinceDays=5000).status_code == 422


# ── forme du candidat (contrat) ────────────────────────────────────────────


def test_candidate_matches_the_shared_contract_shape(client, sources, resolver, registry) -> None:
    sources["award"] = [
        _row(
            "VILLE DE LYON",
            "award",
            12,
            siren="216901234",
            vendor="SOPRA STERIA",
            detail="Titulaire : SOPRA STERIA",
            url="https://decp/1",
        )
    ]
    registry["216901234"] = {
        "siren": "216901234",
        "name": "VILLE DE LYON",
        "nafCode": "84.11Z",
        "nafLabel": "Administration publique",
        "city": "LYON",
        "department": "69",
    }

    cand = _post(client).json()["candidates"][0]

    for key in (
        "name",
        "siren",
        "nafCode",
        "sector",
        "city",
        "department",
        "headcountRange",
        "creationDate",
        "score",
        "scoreFactors",
        "signals",
        "angle",
        "suggestedRoles",
        "portfolioState",
        "accountId",
        "sources",
    ):
        assert key in cand, f"champ contrat manquant: {key}"

    assert cand["nafCode"] == "84.11Z"
    assert cand["sector"] == "Administration publique"
    assert cand["city"] == "LYON"
    assert cand["portfolioState"] == "new"
    assert cand["accountId"] is None
    # Le titulaire du marché (= concurrent en place) survit jusqu'au candidat.
    assert cand["signals"][0]["detail"] == "Titulaire : SOPRA STERIA"
    assert cand["sources"][0]["name"] == "DECP"
    assert cand["sources"][0]["fetchedAt"]


# #3907 — « la carte ne dit pas ce que fait la boîte » : quand la source ne
# publie que le CODE NAF (sans libellé), le candidat ne doit jamais remonter
# ce code brut — la nomenclature publique est décodée côté IA plutôt que de
# laisser l'écran afficher « 6202A ».
def test_a_naf_code_without_a_source_label_is_decoded_not_left_raw(client, sources, resolver, registry) -> None:
    sources["award"] = [
        _row(
            "KICKLOX",
            "award",
            12,
            siren="552100554",
            vendor="SOPRA STERIA",
            detail="Titulaire : SOPRA STERIA",
            url="https://decp/1",
        )
    ]
    registry["552100554"] = {
        "siren": "552100554",
        "name": "KICKLOX",
        "nafCode": "6202A",
        # ⚠️ Aucun `nafLabel` ici — exactement le cas gouv.fr sans libellé.
        "city": "PARIS",
        "department": "75",
    }

    cand = _post(client).json()["candidates"][0]

    assert cand["nafCode"] == "6202A"
    assert cand["sector"] == "Conseil en systèmes et logiciels informatiques"


def test_a_naf_code_outside_the_decodable_table_leaves_sector_absent_not_raw(client, sources, resolver, registry) -> None:
    sources["award"] = [_row("FERME DU LAC", "award", 12, siren="552100554")]
    registry["552100554"] = {
        "siren": "552100554",
        "name": "FERME DU LAC",
        # Hors des deux tables de décodage (IT précise, division générique) :
        # jamais un libellé fabriqué, jamais le code brut non plus.
        "nafCode": "99.99Z",
        "city": "PARIS",
    }

    cand = _post(client).json()["candidates"][0]

    assert cand["nafCode"] == "99.99Z"
    assert cand["sector"] is None


def test_every_signal_carries_a_date(client, sources, resolver) -> None:
    sources["tender"] = [_row("ACME", "tender", 3)]
    resolver["ACME"] = _resolution("552100554", "ACME")
    for signal in _post(client).json()["candidates"][0]["signals"]:
        assert signal["date"]


# ── score (le chemin Signaux notait TOUT LE MONDE 0/100) ───────────────────
#
# Le routeur déclarait « le score n'est pas produit ici, la couche scoring le
# renseigne » — sauf qu'aucune couche aval ne le faisait : le placeholder neutre
# (`score = 0`, `scoreFactors = []`) arrivait tel quel dans l'UI. Le scoreur
# déterministe existe déjà (`app.services.discover_scoring`) et le chemin Signaux
# dispose de tout ce qu'il lui faut : les signaux datés (le bloc le plus lourd),
# les faits registre du résolveur, et le département demandé.


def test_signals_path_produces_a_real_score_from_its_dated_signals(client, sources, resolver) -> None:
    """Un candidat porté par un signal frais ne peut pas sortir à 0 : le signal
    EST la valeur produit de cet écran."""
    sources["tender"] = [_row("ACME", "tender", 5)]
    resolver["ACME"] = _resolution("552100554", "ACME")

    cand = _post(client).json()["candidates"][0]

    assert cand["score"] is not None
    assert cand["score"] > 0
    assert cand["scoreFactors"], "un score sans facteur est un score inauditable"
    assert cand["score"] == sum(f["points"] for f in cand["scoreFactors"])


def test_score_factors_carry_their_evidence(client, sources, resolver) -> None:
    """Contrat : chaque point est rattaché à un facteur nommé portant sa donnée
    brute. C'est ce qui distingue ce score du `X/10` inventé de la v1."""
    sources["hiring"] = [_row("ACME", "hiring", 10, label="5 postes data ouverts")]
    resolver["ACME"] = _resolution("552100554", "ACME")

    factors = _post(client).json()["candidates"][0]["scoreFactors"]

    assert factors
    for factor in factors:
        assert factor["label"].strip()
        assert factor["points"] > 0
        assert factor["evidence"].strip()


def test_unmeasurable_criteria_are_declared_not_scored_as_zero(client, sources, resolver) -> None:
    """Le chemin Signaux n'a pas de date de création : le bloc ancienneté doit
    se DIRE non mesuré et sortir du dénominateur, jamais valoir « 0 sur 5 »."""
    sources["tender"] = [_row("ACME", "tender", 5)]
    resolver["ACME"] = _resolution("552100554", "ACME")

    cand = _post(client).json()["candidates"][0]

    assert "age" in cand["scoreUnmeasured"]
    assert cand["scoreMax"] < 100
    assert cand["score"] <= cand["scoreMax"]


def test_requested_department_scores_on_the_signals_path(client, sources, resolver) -> None:
    """Le département demandé à l'écran est un critère : il doit peser, comme
    sur le chemin registre."""
    sources["tender"] = [_row("ACME", "tender", 5)]
    resolver["ACME"] = _resolution("552100554", "ACME", department="69", city="LYON")

    in_zone = _post(client, department="69").json()["candidates"][0]
    out_of_zone = _post(client, department="75").json()["candidates"][0]

    assert in_zone["score"] > out_of_zone["score"]


def test_esn_profile_reaches_the_scorer(client, sources, resolver) -> None:
    """L'API résout le profil ESN server-side et l'envoie en `profile_data` — le
    routeur le laissait tomber (champ non déclaré), donc les blocs secteur /
    effectif ne pouvaient jamais être évalués."""
    sources["tender"] = [_row("ACME", "tender", 5)]
    resolver["ACME"] = _resolution("552100554", "ACME", nafLabel="Conseil en systèmes informatiques")

    without = _post(client).json()["candidates"][0]
    with_profile = _post(client, profile_data={"sectors": ["Informatique"]}).json()["candidates"][0]

    assert "activity" in without["scoreUnmeasured"]
    assert "activity" not in with_profile["scoreUnmeasured"]
    assert with_profile["score"] > without["score"]


def test_data_confidence_travels_with_the_candidate(client, sources, resolver) -> None:
    """Second axe du contrat, déjà produit par le chemin registre : à quel point
    la donnée sous-jacente est sûre."""
    sources["tender"] = [_row("ACME", "tender", 5)]
    resolver["ACME"] = _resolution("552100554", "ACME")

    cand = _post(client).json()["candidates"][0]
    assert 0 <= cand["dataConfidence"] <= 100


# ── message `degraded` : dire la VRAIE cause ───────────────────────────────


def test_registry_unreachable_is_not_reported_as_homonymy(client, sources, monkeypatch) -> None:
    """« 62 entreprises non rattachées (homonymie non tranchée) » est FAUX quand
    le registre n'a simplement pas répondu. Deux causes, deux messages — sinon
    l'utilisateur croit à un problème de données là où il y a une panne."""

    async def _boom(*_a, **_k):
        raise RuntimeError("429 Too Many Requests")

    monkeypatch.setattr(mod, "resolve_company_identity", _boom)
    sources["tender"] = [_row("ACME", "tender", 5)]

    degraded = _post(client).json()["degraded"]
    resolution = [d for d in degraded if d["source"] == "siren-resolution"]

    assert resolution, "une résolution impossible doit être dite"
    # #2469 — deux CLÉS, plus deux phrases françaises : la distinction se lit
    # sur l'identifiant, ce qui la rend vérifiable sans lire du texte.
    assert any(d["reason"] == SIREN_UNREACHABLE_REASON for d in resolution)
    assert not any(d["reason"] == SIREN_AMBIGUOUS_REASON for d in resolution)


def test_ambiguous_resolution_is_still_reported_as_homonymy(client, sources, resolver) -> None:
    """L'homonymie réelle (plusieurs entités crédibles, aucune dominante) garde
    son message : la règle « aucun SIREN inventé » est porteuse."""
    sources["tender"] = [_row("ACME", "tender", 5)]
    resolver["ACME"] = HomonymResolution(status="ambiguous", selectedSiren=None, candidates=[])

    entries = [d for d in _post(client).json()["degraded"] if d["source"] == "siren-resolution"]
    assert [d["reason"] for d in entries] == [SIREN_AMBIGUOUS_REASON]
    assert [d["kind"] for d in entries] == [KIND_AMBIGUOUS]


# ── le piège du cabinet de recrutement (tome 2 §13) ────────────────────────


def test_a_recruitment_agency_keeps_its_offers_but_they_stop_scoring(client, sources, resolver) -> None:
    """« Une offre publiée par Michael Page pour un client n'est pas un signal
    sur Michael Page. » Sans ce filtre, les cabinets remontent en tête de
    Découvrir — ce sont eux qui publient le plus d'offres IT du pays."""
    sources["hiring"] = [_row("MICHAEL PAGE", "hiring", 3, siren="404434439")]
    resolver["MICHAEL PAGE"] = _resolution(
        "404434439", name="MICHAEL PAGE", naf="78.10Z", nafLabel="Agences de placement"
    )

    body = _post(client).json()
    candidate = body["candidates"][0]

    signal = candidate["signals"][0]
    assert signal["intermediated"] is True
    assert "cabinet de recrutement" in signal["detail"]
    # Le signal est AFFICHÉ, mais le bloc « signaux datés » n'est plus mesurable :
    # il n'y a aucune offre qui parle du besoin de cet employeur.
    assert "signals" in candidate["scoreUnmeasured"]


def test_a_temp_agency_makes_no_hiring_line_but_an_it_employer_stays(client, sources, resolver) -> None:
    """Recette 21/10 B.6 (S.14) — Manpower / Adecco / Randstad (intérim, 78.20Z) ne sont pas des comptes qui
    recrutent ; l'employeur IT, lui, reste."""
    sources["hiring"] = [
        _row("MANPOWER FRANCE", "hiring", 1, siren="311100000"),
        _row("ADECCO", "hiring", 2, siren="311200000"),
        _row("ACME LOGICIEL", "hiring", 3, siren="311300000"),
    ]
    resolver["MANPOWER FRANCE"] = _resolution("311100000", name="MANPOWER FRANCE", naf="78.20Z", nafLabel="Intérim")
    resolver["ADECCO"] = _resolution("311200000", name="ADECCO", naf="78.20Z", nafLabel="Intérim")
    resolver["ACME LOGICIEL"] = _resolution("311300000", name="ACME LOGICIEL", naf="62.01Z", nafLabel="Programmation")

    names = [c["name"] for c in _post(client).json()["candidates"]]

    assert names == ["ACME LOGICIEL"]


def test_a_platform_keeps_its_offers_but_they_stop_scoring(client, sources, resolver) -> None:
    """#2265.4 / #2265.9 — même piège pour une plateforme de mise en relation :
    Collective.work ne doit JAMAIS être présentée sans cette classification."""
    sources["hiring"] = [_row("COLLECTIVE.WORK", "hiring", 3, siren="815342564")]
    resolver["COLLECTIVE.WORK"] = _resolution(
        "815342564", name="COLLECTIVE.WORK", naf="70.22Z", nafLabel="Conseil pour les affaires"
    )

    body = _post(client).json()
    candidate = body["candidates"][0]

    signal = candidate["signals"][0]
    assert signal["intermediated"] is True
    assert "plateforme de mise en relation" in signal["detail"]
    assert "signals" in candidate["scoreUnmeasured"]


def test_a_real_employer_keeps_its_hiring_signal_intact(client, sources, resolver) -> None:
    sources["hiring"] = [_row("DOCTOLIB", "hiring", 3, siren="794598813")]
    resolver["DOCTOLIB"] = _resolution(
        "794598813", name="DOCTOLIB", naf="62.01Z", nafLabel="Programmation informatique"
    )

    candidate = _post(client).json()["candidates"][0]
    assert candidate["signals"][0]["intermediated"] is False
    assert "signals" not in candidate["scoreUnmeasured"]


# ── Le retournement NAF (tome 4 §20.1) ──────────────────────────────────────


def test_entity_type_esn_keeps_only_the_service_companies(client, sources, resolver) -> None:
    """La même moisson, deux marchés. Le filtre porte sur le NAF RÉSOLU : les
    sources d'offres ne rendent ni SIREN ni NAF, contrairement à ce que le tome
    suppose."""
    sources["hiring"] = [_row("ESN CORP", "hiring", 2), _row("USINE SA", "hiring", 3)]
    resolver["ESN CORP"] = _resolution("552100554", "ESN CORP", naf="6202A")
    resolver["USINE SA"] = _resolution("552100555", "USINE SA", naf="2313Z")

    data = _post(client, entityType="esn").json()
    assert [c["name"] for c in data["candidates"]] == ["ESN CORP"]
    # Ce que le filtre a retiré est COMPTÉ : le taire ferait croire que le
    # territoire est plus pauvre qu'il ne l'est.
    assert data["coverage"]["filteredByEntityType"] == 1


def test_entity_type_client_keeps_the_final_accounts(client, sources, resolver) -> None:
    sources["hiring"] = [_row("ESN CORP", "hiring", 2), _row("USINE SA", "hiring", 3)]
    resolver["ESN CORP"] = _resolution("552100554", "ESN CORP", naf="6202A")
    resolver["USINE SA"] = _resolution("552100555", "USINE SA", naf="2313Z")

    data = _post(client, entityType="client").json()
    assert [c["name"] for c in data["candidates"]] == ["USINE SA"]


def test_an_ambiguous_naf_appears_in_both_readings_and_says_so(client, sources, resolver) -> None:
    """70.22Z couvre autant d'ESN que de cabinets de conseil qui n'en sont pas."""
    sources["hiring"] = [_row("CONSEIL & CO", "hiring", 2)]
    resolver["CONSEIL & CO"] = _resolution("552100554", "CONSEIL & CO", naf="7022Z")

    for wanted in ("esn", "client"):
        data = _post(client, entityType=wanted).json()
        assert [c["name"] for c in data["candidates"]] == ["CONSEIL & CO"], wanted
        assert data["candidates"][0]["nafAmbiguous"] is True
        # #2265.1 — le même NAF ambigu porte le type ambigu de la typologie.
        assert data["candidates"][0]["actorType"] == "ambigu — cabinet de conseil ou ESN, NAF partagé"


# ── #2265.1/.3 — la typologie unifiée, calculée sur les mêmes preuves ───────


def test_actor_type_names_the_esn_and_the_client_final(client, sources, resolver) -> None:
    sources["hiring"] = [_row("ESN CORP", "hiring", 2), _row("USINE SA", "hiring", 3)]
    resolver["ESN CORP"] = _resolution("552100554", "ESN CORP", naf="6202A")
    resolver["USINE SA"] = _resolution("552100555", "USINE SA", naf="2313Z")

    data = _post(client, entityType="all").json()
    by_name = {c["name"]: c["actorType"] for c in data["candidates"]}
    assert by_name["ESN CORP"] == "ESN"
    assert by_name["USINE SA"] == "client final"


def test_actor_type_names_the_recruitment_cabinet_and_the_platform(client, sources, resolver) -> None:
    sources["hiring"] = [
        _row("MICHAEL PAGE", "hiring", 2, siren="552144503"),
        _row("COLLECTIVE.WORK", "hiring", 3, siren="815342564"),
    ]
    resolver["MICHAEL PAGE"] = _resolution("552144503", name="MICHAEL PAGE", naf="78.10Z")
    resolver["COLLECTIVE.WORK"] = _resolution(
        "815342564", name="COLLECTIVE.WORK", naf="70.22Z", nafLabel="Conseil pour les affaires"
    )

    data = _post(client).json()
    by_name = {c["name"]: c["actorType"] for c in data["candidates"]}
    assert by_name["MICHAEL PAGE"] == "cabinet de recrutement"
    assert by_name["COLLECTIVE.WORK"] == "plateforme de mise en relation"


def test_is_intermediary_names_the_two_intermediary_types_only(client, sources, resolver) -> None:
    """#2265.14 — le badge « intermédiaire, pas client final » a besoin d'un
    signal STABLE côté contrat : `actorType` porte la prose française (déjà
    testée ci-dessus), donc pas traduisible côté client sans un second calcul
    (GA-26). `isIntermediary` dérive du MÊME jugement — aucun second appel."""
    sources["hiring"] = [
        _row("MICHAEL PAGE", "hiring", 2, siren="552144503"),
        _row("ESN CORP", "hiring", 3, siren="552100554"),
    ]
    resolver["MICHAEL PAGE"] = _resolution("552144503", name="MICHAEL PAGE", naf="78.10Z")
    resolver["ESN CORP"] = _resolution("552100554", name="ESN CORP", naf="6202A")

    data = _post(client).json()
    by_name = {c["name"]: c["isIntermediary"] for c in data["candidates"]}
    assert by_name["MICHAEL PAGE"] is True
    assert by_name["ESN CORP"] is False


# ── #3757 — une ESN n'est pas un client final ──────────────────────────────


def test_is_esn_peer_flags_the_esn_and_never_the_ambiguous_naf(client, sources, resolver) -> None:
    """#3757.2 — Accenture, Sopra… remontent de /discover : le badge « concurrent
    ou partenaire rang 2 » a besoin d'un signal STABLE (même jugement
    qu'`actorType`, GA-26). Un NAF ambigu n'est PAS déclaré ESN : il garde son
    doute (`nafAmbiguous`)."""
    sources["hiring"] = [
        _row("SOPRA STERIA GROUP", "hiring", 2),
        _row("CONSEIL & CO", "hiring", 3),
        _row("USINE SA", "hiring", 4),
    ]
    resolver["SOPRA STERIA GROUP"] = _resolution("326820065", name="SOPRA STERIA GROUP", naf="6202A")
    resolver["CONSEIL & CO"] = _resolution("552100554", name="CONSEIL & CO", naf="7022Z")
    resolver["USINE SA"] = _resolution("552100555", name="USINE SA", naf="2313Z")

    data = _post(client).json()
    by_name = {c["name"]: c["isEsnPeer"] for c in data["candidates"]}
    assert by_name == {"SOPRA STERIA GROUP": True, "CONSEIL & CO": False, "USINE SA": False}


def test_esn_peers_rank_after_final_clients_without_dropping_any(client, sources, resolver) -> None:
    """#3757.1 — le rôle change l'ORDRE, jamais le CONTENU : l'ESN, pourtant la
    plus fraîche, passe après le client final ; rien n'est retiré (entityType
    `all`), et l'ordre de fraîcheur est gardé au sein de chaque groupe."""
    sources["hiring"] = [
        _row("ESN CORP", "hiring", 1),
        _row("USINE SA", "hiring", 3),
        _row("FERME SA", "hiring", 5),
    ]
    resolver["ESN CORP"] = _resolution("552100554", name="ESN CORP", naf="6202A")
    resolver["USINE SA"] = _resolution("552100555", name="USINE SA", naf="2313Z")
    resolver["FERME SA"] = _resolution("552100556", name="FERME SA", naf="0111Z")

    data = _post(client, entityType="all").json()
    names = [c["name"] for c in data["candidates"]]
    assert names[-1] == "ESN CORP"
    assert sorted(names) == ["ESN CORP", "FERME SA", "USINE SA"]
    assert data["coverage"]["filteredByEntityType"] == 0


def test_declared_partner_siren_is_named_partner_not_esn_peer(client, sources, resolver) -> None:
    """#3757 (reste) — un SIREN que l'espace a déclaré partenaire
    (`declaredPartnerSirens`, résolu par l'API depuis `partner_relations`)
    classe le candidat `PARTENAIRE`, jamais `ESN`/`ESN concurrente` : le fait
    déclaré prime sur l'hypothèse NAF, et les deux badges ne se cumulent pas."""
    sources["hiring"] = [
        _row("SOPRA STERIA GROUP", "hiring", 2),
        _row("ESN CORP", "hiring", 3),
    ]
    resolver["SOPRA STERIA GROUP"] = _resolution("326820065", name="SOPRA STERIA GROUP", naf="6202A")
    resolver["ESN CORP"] = _resolution("552100554", name="ESN CORP", naf="6202A")

    data = _post(client, declaredPartnerSirens=["326820065"]).json()
    by_name = {c["name"]: (c["isDeclaredPartner"], c["isEsnPeer"], c["actorType"]) for c in data["candidates"]}
    assert by_name["SOPRA STERIA GROUP"] == (True, False, "partenaire")
    assert by_name["ESN CORP"] == (False, True, "ESN")


def test_declared_partner_siren_is_matched_on_digits_only(client, sources, resolver) -> None:
    """Même normalisation que la résolution registre (`_digits9`) : un SIRET ou
    un SIREN espacé déclaré côté API matche le SIREN à 9 chiffres résolu ici."""
    sources["hiring"] = [_row("SOPRA STERIA GROUP", "hiring", 2, siren="326820065")]
    resolver["SOPRA STERIA GROUP"] = _resolution("326820065", name="SOPRA STERIA GROUP", naf="6202A")

    data = _post(client, declaredPartnerSirens=["326 820 065 00012"]).json()
    assert data["candidates"][0]["isDeclaredPartner"] is True


def test_no_declared_partner_sirens_keeps_esn_peer_behaviour(client, sources, resolver) -> None:
    """Vide = comportement inchangé — même garde que tout filtre optionnel ici."""
    sources["hiring"] = [_row("SOPRA STERIA GROUP", "hiring", 2)]
    resolver["SOPRA STERIA GROUP"] = _resolution("326820065", name="SOPRA STERIA GROUP", naf="6202A")

    data = _post(client).json()
    assert data["candidates"][0]["isDeclaredPartner"] is False
    assert data["candidates"][0]["isEsnPeer"] is True


# ── Le filtre SECTEUR (retour du 31/08 : « des entreprises qui n'ont rien à
#    voir avec ce qu'il cherchait dans les filtres ») ──────────────────────────
#
# Le rail de Découvrir affiche les mêmes pastilles de secteur dans les DEUX
# modes. En mode Signaux, `sector` n'était lu nulle part ici, et le front ne le
# sérialisait même pas : l'utilisateur cochait « Industrie » et il ne se passait
# rien — sans note, sans entrée `degraded`, en silence complet.


def test_sector_keeps_only_the_companies_of_that_naf_section(client, sources, resolver) -> None:
    sources["hiring"] = [_row("USINE SA", "hiring", 2), _row("EDITEUR SAS", "hiring", 3)]
    resolver["USINE SA"] = _resolution("552100554", "USINE SA", naf="2313Z")  # section C
    resolver["EDITEUR SAS"] = _resolution("552100555", "EDITEUR SAS", naf="6202A")  # section J

    data = _post(client, sectors=["industry"]).json()

    assert [c["name"] for c in data["candidates"]] == ["USINE SA"]
    # Ce que le filtre retire est COMPTÉ — même règle que le filtre de nature :
    # le taire ferait croire que le territoire est plus pauvre qu'il ne l'est.
    assert data["coverage"]["filteredBySector"] == 1


def test_several_sectors_are_crossed_with_an_OR(client, sources, resolver) -> None:
    sources["hiring"] = [_row("USINE SA", "hiring", 2), _row("EDITEUR SAS", "hiring", 3), _row("CLINIQUE", "hiring", 4)]
    resolver["USINE SA"] = _resolution("552100554", "USINE SA", naf="2313Z")  # C
    resolver["EDITEUR SAS"] = _resolution("552100555", "EDITEUR SAS", naf="6202A")  # J
    resolver["CLINIQUE"] = _resolution("552100556", "CLINIQUE", naf="8610Z")  # Q

    data = _post(client, sectors=["industry", "it"]).json()

    assert sorted(c["name"] for c in data["candidates"]) == ["EDITEUR SAS", "USINE SA"]
    assert data["coverage"]["filteredBySector"] == 1


def test_no_sector_removes_nothing(client, sources, resolver) -> None:
    """Une recherche non restreinte ne doit RIEN retirer — ni `[]`, ni « all »."""
    sources["hiring"] = [_row("USINE SA", "hiring", 2), _row("EDITEUR SAS", "hiring", 3)]
    resolver["USINE SA"] = _resolution("552100554", "USINE SA", naf="2313Z")
    resolver["EDITEUR SAS"] = _resolution("552100555", "EDITEUR SAS", naf="6202A")

    for sectors in ([], ["all"]):
        data = _post(client, sectors=sectors).json()
        assert sorted(c["name"] for c in data["candidates"]) == ["EDITEUR SAS", "USINE SA"]
        assert data["coverage"]["filteredBySector"] == 0


# #2489.3 — sans secteur coché, mode Signaux orienté vers les secteurs du profil


def test_no_sector_with_aerospace_profile_orients_toward_the_profile_sector(client, sources, resolver) -> None:
    """`_resolution` rend par défaut un NAF d'administration publique (84.11Z) —
    c'est la fixture qui REND MESURABLE « ça ne renvoie que des acheteurs
    publics ». Un profil qui vise l'aéronautique doit faire remonter la ligne
    qui y répond, même si son signal est plus ancien."""
    sources["hiring"] = [
        _row("MAIRIE DE TOULOUSE", "hiring", 2),  # signal plus FRAIS, hors profil
        _row("AIRBUS OPERATIONS", "hiring", 20),  # signal plus ANCIEN, dans le profil
    ]
    resolver["MAIRIE DE TOULOUSE"] = _resolution("219311888", "MAIRIE DE TOULOUSE")  # 84.11Z par défaut
    resolver["AIRBUS OPERATIONS"] = _resolution("420916918", "AIRBUS OPERATIONS", naf="30.30Z")

    data = _post(client, profile_data={"sectors": ["Aéronautique & Défense"]}).json()

    assert [c["name"] for c in data["candidates"]] == ["AIRBUS OPERATIONS", "MAIRIE DE TOULOUSE"]
    # Orienter n'est pas filtrer : rien n'est retiré.
    assert data["coverage"]["filteredBySector"] == 0


def test_no_sector_without_a_usable_profile_keeps_the_freshness_order(client, sources, resolver) -> None:
    """Sans profil exploitable, l'ordre reste celui d'avant #2489.3 (fraîcheur
    seule) — l'orientation ne s'invente jamais un secteur."""
    sources["hiring"] = [
        _row("MAIRIE DE TOULOUSE", "hiring", 2),
        _row("AIRBUS OPERATIONS", "hiring", 20),
    ]
    resolver["MAIRIE DE TOULOUSE"] = _resolution("219311888", "MAIRIE DE TOULOUSE")
    resolver["AIRBUS OPERATIONS"] = _resolution("420916918", "AIRBUS OPERATIONS", naf="30.30Z")

    data = _post(client).json()

    assert [c["name"] for c in data["candidates"]] == ["MAIRIE DE TOULOUSE", "AIRBUS OPERATIONS"]


def test_a_checked_sector_takes_precedence_over_the_profile_orientation(client, sources, resolver) -> None:
    """Un secteur COCHÉ reste un filtre dur — le profil n'oriente qu'en son
    absence, il ne se substitue jamais à un choix explicite."""
    sources["hiring"] = [
        _row("MAIRIE DE TOULOUSE", "hiring", 2),
        _row("AIRBUS OPERATIONS", "hiring", 20),
    ]
    resolver["MAIRIE DE TOULOUSE"] = _resolution("219311888", "MAIRIE DE TOULOUSE")  # 84.11Z — section O
    resolver["AIRBUS OPERATIONS"] = _resolution("420916918", "AIRBUS OPERATIONS", naf="30.30Z")  # section C

    data = _post(client, sectors=["public"], profile_data={"sectors": ["Aéronautique & Défense"]}).json()

    assert [c["name"] for c in data["candidates"]] == ["MAIRIE DE TOULOUSE"]
    assert data["coverage"]["filteredBySector"] == 1


def test_a_company_whose_naf_is_unreadable_is_dropped_AND_counted(client, sources, resolver) -> None:
    """Quand un secteur est demandé, on ne peut pas affirmer qu'un NAF illisible
    en fait partie. Elle est écartée — et comptée, jamais avalée."""
    sources["hiring"] = [_row("USINE SA", "hiring", 2), _row("SANS NAF", "hiring", 3)]
    resolver["USINE SA"] = _resolution("552100554", "USINE SA", naf="2313Z")
    resolver["SANS NAF"] = _resolution("552100555", "SANS NAF", naf=None)

    data = _post(client, sectors=["industry"]).json()

    assert [c["name"] for c in data["candidates"]] == ["USINE SA"]
    assert data["coverage"]["filteredBySector"] == 1


def test_an_unknown_sector_label_filters_NOTHING_and_says_so(client, sources, resolver) -> None:
    """Un libellé d'écran sans entrée dans la table ne doit pas vider la liste en
    silence — c'est le pire des deux échecs possibles. Il est DIT en `degraded`."""
    sources["hiring"] = [_row("USINE SA", "hiring", 2), _row("EDITEUR SAS", "hiring", 3)]
    resolver["USINE SA"] = _resolution("552100554", "USINE SA", naf="2313Z")
    resolver["EDITEUR SAS"] = _resolution("552100555", "EDITEUR SAS", naf="6202A")

    data = _post(client, sectors=["licorne"]).json()

    assert sorted(c["name"] for c in data["candidates"]) == ["EDITEUR SAS", "USINE SA"]
    assert data["coverage"]["filteredBySector"] == 0
    # #2469 — le LIBELLÉ refusé voyage dans `fields`, pas noyé dans une phrase.
    unknown = [d for d in data["degraded"] if d["reason"] == UNKNOWN_SECTOR_REASON]
    assert [d["fields"] for d in unknown] == [["licorne"]]
    assert unknown[0]["count"] == 1


def test_sectors_are_echoed_in_the_normalized_query(client, sources, resolver) -> None:
    """L'écran doit pouvoir VÉRIFIER que son critère a été appliqué. C'est
    précisément ce qui manquait : rien ne partait, donc rien ne revenait."""
    data = _post(client, sectors=["  Industry ", "all", "industry"]).json()

    assert data["query"]["sectors"] == ["industry"]


# ── Le CDI distinguable, filtrable (#2616.1) ──────────────────────────────


def test_hiring_signal_carries_its_contract_type_when_the_source_has_a_verified_code(client, sources, resolver) -> None:
    sources["hiring"] = [
        _row("ACME", "hiring", 2, contractCode="CDI"),
        _row("AUTRE", "hiring", 3, contractCode="CDD"),
        _row("MISSION", "hiring", 3, contractCode="MIS"),
        _row("LIBERAL", "hiring", 3, contractCode="LIB"),
        _row("CDINTERIM", "hiring", 3, contractCode="DIN"),
    ]
    resolver["CDINTERIM"] = _resolution("552100558", "CDINTERIM")
    resolver["ACME"] = _resolution("552100554", "ACME")
    resolver["AUTRE"] = _resolution("552100555", "AUTRE")
    resolver["MISSION"] = _resolution("552100556", "MISSION")
    resolver["LIBERAL"] = _resolution("552100557", "LIBERAL")

    data = _post(client).json()

    by_name = {c["name"]: c for c in data["candidates"]}
    assert by_name["ACME"]["signals"][0]["contractType"] == "CDI"
    # #5000 — le CDD est une valeur à part ; l'intérim (MIS) aussi, il n'est PLUS compté freelance.
    assert by_name["AUTRE"]["signals"][0]["contractType"] == "CDD"
    assert by_name["MISSION"]["signals"][0]["contractType"] == "INTERIM"
    # #4999 — profession libérale (LIB) : le CONTRAT réel de la source dit freelance.
    assert by_name["LIBERAL"]["signals"][0]["contractType"] == "FREELANCE"
    # Louis 01/11 — DIN (« CDI Intérimaire ») est un CDI, pas de l'intérim.
    assert by_name["CDINTERIM"]["signals"][0]["contractType"] == "CDI"


def test_contract_types_filter_accepts_cdd_and_interim_5000(client, sources, resolver) -> None:
    """#5000 — le filtre `contractTypes` (jusqu'ici CDI seul) retient CDD et intérim, chacun à part."""
    sources["hiring"] = [
        _row("ACME", "hiring", 2, contractCode="CDI"),
        _row("AUTRE", "hiring", 3, contractCode="CDD"),
        _row("MISSION", "hiring", 3, contractCode="MIS"),
    ]
    resolver["ACME"] = _resolution("552100554", "ACME")
    resolver["AUTRE"] = _resolution("552100555", "AUTRE")
    resolver["MISSION"] = _resolution("552100556", "MISSION")

    cdd = _post(client, contractTypes=["CDD"]).json()
    assert [c["name"] for c in cdd["candidates"]] == ["AUTRE"]
    interim = _post(client, contractTypes=["INTERIM"]).json()
    assert [c["name"] for c in interim["candidates"]] == ["MISSION"]


def test_apec_never_confirms_a_contract_type_its_code_is_unreadable(client, sources, resolver) -> None:
    """APEC ne porte aucun code de contrat lisible (`contractType: None`,
    voir `apec.py`) — jamais une valeur devinée à sa place."""
    sources["hiring_apec"] = [_row("ACME", "hiring", 2, sourceLabel="APEC", contractType=None)]
    resolver["ACME"] = _resolution("552100554", "ACME")

    data = _post(client).json()

    assert data["candidates"][0]["signals"][0]["contractType"] is None


def test_contract_types_filter_keeps_only_confirmed_cdi(client, sources, resolver) -> None:
    sources["hiring"] = [
        _row("ACME", "hiring", 2, contractCode="CDI"),
        _row("AUTRE", "hiring", 3, contractCode="CDD"),
    ]
    resolver["ACME"] = _resolution("552100554", "ACME")
    resolver["AUTRE"] = _resolution("552100555", "AUTRE")

    data = _post(client, contractTypes=["CDI"]).json()

    assert [c["name"] for c in data["candidates"]] == ["ACME"]
    # Ce que le filtre retire est COMPTÉ — même règle que secteur/nature.
    assert data["coverage"]["filteredByContractType"] == 1


def test_no_contract_type_filter_removes_nothing(client, sources, resolver) -> None:
    sources["hiring"] = [
        _row("ACME", "hiring", 2, contractCode="CDI"),
        _row("AUTRE", "hiring", 3, contractCode="MIS"),
    ]
    resolver["ACME"] = _resolution("552100554", "ACME")
    resolver["AUTRE"] = _resolution("552100555", "AUTRE")

    data = _post(client).json()

    assert sorted(c["name"] for c in data["candidates"]) == ["ACME", "AUTRE"]
    assert data["coverage"]["filteredByContractType"] == 0


def test_contract_types_are_echoed_in_the_normalized_query(client, sources, resolver) -> None:
    data = _post(client, contractTypes=["CDI"]).json()
    assert data["query"]["contractTypes"] == ["CDI"]


# ── La politique de télétravail, filtrable (#3096) ────────────────────────


def test_hiring_signal_carries_its_remote_policy_only_when_the_offer_says_so(client, sources, resolver) -> None:
    sources["hiring"] = [
        _row("ACME", "hiring", 2, label="Développeur", detail="Poste en full remote"),
        _row("AUTRE", "hiring", 3, label="Chef de projet", detail="Vous pilotez le programme."),
    ]
    resolver["ACME"] = _resolution("552100554", "ACME")
    resolver["AUTRE"] = _resolution("552100555", "AUTRE")

    data = _post(client).json()

    by_name = {c["name"]: c for c in data["candidates"]}
    assert by_name["ACME"]["signals"][0]["remoteWorkPolicy"] == "full_remote"
    # Silence sur le télétravail ⇒ non évalué, jamais « sur_site » par défaut.
    assert by_name["AUTRE"]["signals"][0]["remoteWorkPolicy"] is None


def test_remote_policies_filter_keeps_only_the_requested_policy(client, sources, resolver) -> None:
    sources["hiring"] = [
        _row("ACME", "hiring", 2, label="Développeur", detail="Poste en full remote"),
        _row("AUTRE", "hiring", 3, label="Technicien", detail="Poste sur site, présentiel obligatoire"),
    ]
    resolver["ACME"] = _resolution("552100554", "ACME")
    resolver["AUTRE"] = _resolution("552100555", "AUTRE")

    data = _post(client, remotePolicies=["full_remote"]).json()

    assert [c["name"] for c in data["candidates"]] == ["ACME"]
    assert data["coverage"]["filteredByRemotePolicy"] == 1


def test_no_remote_policy_filter_removes_nothing(client, sources, resolver) -> None:
    sources["hiring"] = [
        _row("ACME", "hiring", 2, label="Développeur", detail="Poste en full remote"),
        _row("AUTRE", "hiring", 3, label="Technicien", detail="Poste sur site, présentiel obligatoire"),
    ]
    resolver["ACME"] = _resolution("552100554", "ACME")
    resolver["AUTRE"] = _resolution("552100555", "AUTRE")

    data = _post(client).json()

    assert sorted(c["name"] for c in data["candidates"]) == ["ACME", "AUTRE"]
    assert data["coverage"]["filteredByRemotePolicy"] == 0


def test_remote_policies_are_echoed_in_the_normalized_query(client, sources, resolver) -> None:
    data = _post(client, remotePolicies=["full_remote"]).json()
    assert data["query"]["remotePolicies"] == ["full_remote"]


# ── La catégorie commerciale d'une offre, jamais un besoin certain (#3204) ──


def test_a_cdi_is_classified_internal_hiring_never_contracting(client, sources, resolver) -> None:
    sources["hiring"] = [_row("ACME", "hiring", 2, contractCode="CDI")]
    resolver["ACME"] = _resolution("552100554", "ACME")

    signal = _post(client).json()["candidates"][0]["signals"][0]
    assert signal["hiringSignalClass"] == "internal_hiring"


def test_a_freelance_code_is_classified_contracting(client, sources, resolver) -> None:
    sources["hiring"] = [_row("ACME", "hiring", 2, contractCode="LIB")]
    resolver["ACME"] = _resolution("552100554", "ACME")

    signal = _post(client).json()["candidates"][0]["signals"][0]
    assert signal["hiringSignalClass"] == "contracting"


def test_an_unverified_contract_code_never_guesses_a_stronger_category(client, sources, resolver) -> None:
    # RÈGLE explicite : « stage ≠ budget prestation ». Un code non vérifié
    # retombe sur `skill_demand_signal`, jamais `contracting`/`internal_hiring`.
    sources["hiring"] = [_row("ACME", "hiring", 2, contractCode="STG")]
    resolver["ACME"] = _resolution("552100554", "ACME")

    signal = _post(client).json()["candidates"][0]["signals"][0]
    assert signal["hiringSignalClass"] == "skill_demand_signal"


def test_an_agency_posting_overrides_the_hiring_signal_class(client, sources, resolver) -> None:
    sources["hiring"] = [_row("MICHAEL PAGE", "hiring", 3, siren="404434439", contractCode="LIB")]
    resolver["MICHAEL PAGE"] = _resolution(
        "404434439", name="MICHAEL PAGE", naf="78.10Z", nafLabel="Agences de placement"
    )

    signal = _post(client).json()["candidates"][0]["signals"][0]
    assert signal["hiringSignalClass"] == "agency_posting"


# ── Le delivery fit externe, distinct de la politique de télétravail (#3203) ─


def test_a_bare_remote_mention_never_qualifies_delivery_fit_as_compatible(client, sources, resolver) -> None:
    sources["hiring"] = [
        _row("ACME", "hiring", 2, label="Développeur", detail="Poste en full remote pour nos salariés")
    ]
    resolver["ACME"] = _resolution("552100554", "ACME")

    signal = _post(client).json()["candidates"][0]["signals"][0]
    assert signal["remoteWorkPolicy"] == "full_remote"
    assert signal["deliveryFit"] == "unknown"


def test_an_explicit_external_delivery_constraint_is_classified_incompatible(client, sources, resolver) -> None:
    sources["hiring"] = [
        _row(
            "ACME",
            "hiring",
            2,
            label="Développeur",
            detail="Intervention uniquement en France, aucune prestation hors de France",
        )
    ]
    resolver["ACME"] = _resolution("552100554", "ACME")

    signal = _post(client).json()["candidates"][0]["signals"][0]
    assert signal["deliveryFit"] == "incompatible"


# ── Le delivery fit externe (#3226/#3203, DISTINCT de remoteWorkPolicy) ────


def test_hiring_signal_carries_delivery_fit_only_when_the_offer_says_so(client, sources, resolver) -> None:
    sources["hiring"] = [
        _row("ACME", "hiring", 2, label="Développeur", detail="Ouverts à la sous-traitance"),
        _row("AUTRE", "hiring", 3, label="Chef de projet", detail="Poste en télétravail total"),
    ]
    resolver["ACME"] = _resolution("552100554", "ACME")
    resolver["AUTRE"] = _resolution("552100555", "AUTRE")

    data = _post(client).json()

    by_name = {c["name"]: c for c in data["candidates"]}
    assert by_name["ACME"]["signals"][0]["deliveryFit"] == "compatible"
    # Le mot « télétravail » (politique salariés) seul ne qualifie RIEN ici —
    # exactement le NO-GO explicite de #3203 (« remote » ≠ nearshore compatible).
    assert by_name["AUTRE"]["signals"][0]["deliveryFit"] == "unknown"


def test_delivery_fit_is_distinct_from_remote_work_policy() -> None:
    from app.services.delivery_fit import classify_delivery_fit
    from app.services.remote_policy import derive_remote_policy

    text = "Poste en télétravail total, aucun sous-traitant."
    assert derive_remote_policy(text) == "full_remote"
    assert classify_delivery_fit(text) == "incompatible"


def test_delivery_fit_filter_keeps_only_the_requested_level(client, sources, resolver) -> None:
    sources["hiring"] = [
        _row("ACME", "hiring", 2, label="Développeur", detail="Ouverts à la sous-traitance"),
        _row("AUTRE", "hiring", 3, label="Chef de projet", detail="Aucun sous-traitant, poste sur site"),
    ]
    resolver["ACME"] = _resolution("552100554", "ACME")
    resolver["AUTRE"] = _resolution("552100555", "AUTRE")

    data = _post(client, deliveryFitFilter=["compatible"]).json()

    assert [c["name"] for c in data["candidates"]] == ["ACME"]
    assert data["coverage"]["filteredByDeliveryFit"] == 1


def test_no_delivery_fit_filter_removes_nothing(client, sources, resolver) -> None:
    sources["hiring"] = [
        _row("ACME", "hiring", 2, label="Développeur", detail="Ouverts à la sous-traitance"),
        _row("AUTRE", "hiring", 3, label="Chef de projet", detail="Aucun sous-traitant, poste sur site"),
    ]
    resolver["ACME"] = _resolution("552100554", "ACME")
    resolver["AUTRE"] = _resolution("552100555", "AUTRE")

    data = _post(client).json()

    assert sorted(c["name"] for c in data["candidates"]) == ["ACME", "AUTRE"]
    assert data["coverage"]["filteredByDeliveryFit"] == 0


def test_delivery_fit_filter_is_echoed_in_the_normalized_query(client, sources, resolver) -> None:
    data = _post(client, deliveryFitFilter=["compatible"]).json()
    assert data["query"]["deliveryFitFilter"] == ["compatible"]


def test_tender_signal_also_carries_delivery_fit(client, sources, resolver) -> None:
    """#3226 (#3203.8) — un avis de marché public peut aussi porter une
    mention explicite (« intervention sur site exclusivement ») : deliveryFit
    n'est plus réservé aux offres d'emploi."""
    sources["tender"] = [
        _row("ACME", "tender", 2, label="AO IT publié — aucun sous-traitant accepté pour ce marché"),
    ]
    resolver["ACME"] = _resolution("552100554", "ACME")

    data = _post(client).json()

    signal = data["candidates"][0]["signals"][0]
    assert signal["type"] == "tender"
    assert signal["deliveryFit"] == "incompatible"
    from app.services.delivery_fit import DELIVERY_FIT_AXES

    assert set(signal["deliveryFitAxes"]) == set(DELIVERY_FIT_AXES)


def test_hiring_signal_carries_the_thirteen_delivery_fit_axes(client, sources, resolver) -> None:
    """#3226 (#3203.4) — les treize axes accompagnent deliveryFit sur un
    signal hiring, toujours les treize clés, distinctes du niveau global."""
    from app.services.delivery_fit import DELIVERY_FIT_AXES

    sources["hiring"] = [
        _row("ACME", "hiring", 2, label="Développeur", detail="Présence obligatoire sur site tous les jours"),
    ]
    resolver["ACME"] = _resolution("552100554", "ACME")

    data = _post(client).json()

    axes = data["candidates"][0]["signals"][0]["deliveryFitAxes"]
    assert set(axes) == set(DELIVERY_FIT_AXES)
    assert axes["site_presence"] == "incompatible"


def test_hiring_signal_reads_the_six_newly_branched_axes_from_its_text(client, sources, resolver) -> None:
    """#3237 (#3203.4) — `languages`, `timezones`, `security`, `mandated_equipment`,
    `presence_frequency`, `contractual_status` lisent le MÊME texte que les six
    premiers ; l'appelant réel (le routeur) les rend, sans second calcul."""
    sources["hiring"] = [
        _row(
            "ACME",
            "hiring",
            2,
            label="Développeur",
            detail="Langue de travail anglais. Chevauchement horaire de 4 heures. Freelances acceptés. BYOD accepté.",
        ),
    ]
    resolver["ACME"] = _resolution("552100554", "ACME")

    axes = _post(client).json()["candidates"][0]["signals"][0]["deliveryFitAxes"]

    assert axes["languages"] == "compatible"
    assert axes["timezones"] == "potentially_compatible"
    assert axes["contractual_status"] == "compatible"
    assert axes["mandated_equipment"] == "compatible"
    # Aucun marqueur pour ces deux-là : NOMMÉS, `unknown`, jamais devinés.
    assert axes["security"] == "unknown"
    assert axes["presence_frequency"] == "unknown"


def test_stale_hiring_signal_carries_a_potentially_compatible_source_freshness_axis(client, sources, resolver) -> None:
    """#3237 (reste de #3203.4 — « source et fraîcheur ») : un signal hiring
    au-delà de la fenêtre d'archive (180 jours, `recrutement`) porte
    `source_freshness = potentially_compatible` — jamais `incompatible`
    (une donnée périmée est un doute, pas une preuve de refus)."""
    sources["hiring"] = [
        _row("ACME", "hiring", 200, label="Développeur", detail="Nearshore accepté"),
    ]
    resolver["ACME"] = _resolution("552100554", "ACME")

    data = _post(client).json()

    axes = data["candidates"][0]["signals"][0]["deliveryFitAxes"]
    assert axes["source_freshness"] == "potentially_compatible"


def test_fresh_hiring_signal_never_promotes_source_freshness_to_compatible(client, sources, resolver) -> None:
    sources["hiring"] = [
        _row("ACME", "hiring", 2, label="Développeur", detail="Nearshore accepté"),
    ]
    resolver["ACME"] = _resolution("552100554", "ACME")

    data = _post(client).json()

    axes = data["candidates"][0]["signals"][0]["deliveryFitAxes"]
    assert axes["source_freshness"] == "unknown"


def test_stale_tender_signal_also_carries_the_source_freshness_axis(client, sources, resolver) -> None:
    """La même fenêtre s'applique à `tender` (`appel_offres`, 180 jours) —
    `deliveryFitAxes` couvre déjà hiring ET tender (#3203.8)."""
    sources["tender"] = [
        _row("ACME", "tender", 200, label="AO IT publié — nearshore accepté"),
    ]
    resolver["ACME"] = _resolution("552100554", "ACME")

    data = _post(client).json()

    axes = data["candidates"][0]["signals"][0]["deliveryFitAxes"]
    assert axes["source_freshness"] == "potentially_compatible"


# ── La séniorité recherchée, filtrable (#3097) ────────────────────────────


def test_hiring_signal_carries_its_seniority_only_when_the_offer_says_so(client, sources, resolver) -> None:
    sources["hiring"] = [
        _row("ACME", "hiring", 2, label="Développeur Senior"),
        _row("AUTRE", "hiring", 3, label="Chef de projet"),
    ]
    resolver["ACME"] = _resolution("552100554", "ACME")
    resolver["AUTRE"] = _resolution("552100555", "AUTRE")

    data = _post(client).json()

    by_name = {c["name"]: c for c in data["candidates"]}
    assert by_name["ACME"]["signals"][0]["seniority"] == "senior"
    # Silence sur le titre ET l'expérience ⇒ non évalué, jamais deviné.
    assert by_name["AUTRE"]["signals"][0]["seniority"] is None


def test_seniorities_filter_keeps_only_the_requested_level(client, sources, resolver) -> None:
    sources["hiring"] = [
        _row("ACME", "hiring", 2, label="Développeur Senior"),
        _row("AUTRE", "hiring", 3, label="Développeur Junior"),
    ]
    resolver["ACME"] = _resolution("552100554", "ACME")
    resolver["AUTRE"] = _resolution("552100555", "AUTRE")

    data = _post(client, seniorities=["senior"]).json()

    assert [c["name"] for c in data["candidates"]] == ["ACME"]
    assert data["coverage"]["filteredBySeniority"] == 1


def test_no_seniority_filter_removes_nothing(client, sources, resolver) -> None:
    sources["hiring"] = [
        _row("ACME", "hiring", 2, label="Développeur Senior"),
        _row("AUTRE", "hiring", 3, label="Développeur Junior"),
    ]
    resolver["ACME"] = _resolution("552100554", "ACME")
    resolver["AUTRE"] = _resolution("552100555", "AUTRE")

    data = _post(client).json()

    assert sorted(c["name"] for c in data["candidates"]) == ["ACME", "AUTRE"]
    assert data["coverage"]["filteredBySeniority"] == 0


def test_seniorities_are_echoed_in_the_normalized_query(client, sources, resolver) -> None:
    data = _post(client, seniorities=["senior"]).json()
    assert data["query"]["seniorities"] == ["senior"]


def test_hiring_signal_carries_the_salary_label_only_when_the_source_shows_it(client, sources, resolver) -> None:
    sources["hiring"] = [_row("ACME", "hiring", 2, salaryLabel="Mensuel de 3000 à 3500 Euros")]
    resolver["ACME"] = _resolution("552100554", "ACME")

    data = _post(client).json()

    assert data["candidates"][0]["signals"][0]["salaryLabel"] == "Mensuel de 3000 à 3500 Euros"


# ── `keywords` : la recherche par TECHNOLOGIE (retour du 31/08 n°5) ──────────
#
# « recherche par approche technologies — j'ai des consultants de cette stack ».
#
# Le champ existait à l'écran, le front le sérialisait… et le DTO de l'API le
# RETIRAIT (il n'était pas déclaré au schéma partagé, et zod retire les clés
# inconnues). Il n'a donc jamais atteint ce routeur.
#
# En le débranchant, on découvre la seconde moitié du défaut : le front envoie
# une CHAÎNE (« java spring », un champ de saisie libre) et ce modèle déclarait
# `list[str]`. Sans le validateur ci-dessous, débloquer le transport aurait
# transformé un champ inerte en 422 — et itérer une chaîne aurait découpé
# « java » en ['j','a','v','a'].


def test_keywords_accept_the_free_text_string_the_screen_sends(client, sources, resolver) -> None:
    data = _post(client, keywords="Java Spring").json()

    assert data["query"]["keywords"] == ["java", "spring"]


def test_keywords_also_accept_a_list(client, sources, resolver) -> None:
    """Le chemin historique — un appelant interne peut déjà envoyer une liste."""
    data = _post(client, keywords=["Java", " Spring "]).json()

    assert data["query"]["keywords"] == ["java", "spring"]


def test_keywords_split_on_commas_too(client, sources, resolver) -> None:
    data = _post(client, keywords="java, spring , kafka").json()

    assert data["query"]["keywords"] == ["java", "spring", "kafka"]


def test_empty_keywords_stay_empty(client, sources, resolver) -> None:
    for value in ("", "   ", []):
        assert _post(client, keywords=value).json()["query"]["keywords"] == []


# ── #2291.2 — le modèle de contrat OBSERVÉ, sur la moisson déjà faite ──────


def test_2291_2_hiring_harvest_observes_the_employer_contract_model(client, sources, resolver) -> None:
    """Les offres moissonnées PORTENT l'employeur (France Travail le nomme) et
    le code natif de contrat : l'observation se lit dessus, zéro appel de plus."""
    sources["hiring"] = [
        _row("ACME", "hiring", 3, contractCode="LIB"),
        _row("ACME", "hiring", 10, contractCode="CDI"),
        _row("ACME", "hiring", 20, contractCode="CDI"),
    ]
    resolver["ACME"] = _resolution("552100554", "ACME", naf="62.01Z")

    cand = _post(client).json()["candidates"][0]
    offers = cand["contractModel"]["jobOffers"]
    # #4074 revient sur #2291.3 (18/09), délibérément — décision Louis 12/10 : aucune source ne se nomme.
    assert offers["source"] == "Offres d'emploi publiques"
    assert offers["total"] == 3
    assert offers["counts"]["freelance"] == 1
    assert offers["counts"]["permanent"] == 2
    assert cand["contractModel"]["publicContracts"] is None


def test_2291_2_a_candidate_found_only_by_decp_has_no_contract_model(client, sources, resolver) -> None:
    """Trouvé par un marché ATTRIBUÉ (DECP) seulement : ni ses offres ni ses
    avis BOAMP n'ont été LUS — clé absente (« jamais cherché »), jamais un
    ``null`` qui dirait « cherché ». DECP nomme le TITULAIRE (le concurrent en
    place), jamais le mode de contractualisation de l'acheteur."""
    sources["award"] = [_row("VILLE DE LYON", "award", 5, siren="216901234")]
    resolver["VILLE DE LYON"] = _resolution("216901234", "VILLE DE LYON")

    cand = _post(client).json()["candidates"][0]
    assert "contractModel" not in cand


def test_2291_2_a_recruitment_firm_says_nothing_of_its_own_contract_model(client, sources, resolver) -> None:
    """Un cabinet publie POUR ses clients : ses offres ne disent pas comment
    LUI contractualise — cherché, non observé (``None``)."""
    sources["hiring"] = [_row("TALENTS PLUS", "hiring", 3, contractCode="LIB")]
    resolver["TALENTS PLUS"] = _resolution("552100554", "TALENTS PLUS", naf="78.10Z")

    cand = _post(client).json()["candidates"][0]
    assert cand["contractModel"] is None


def test_2291_2_r_boamp_regie_wording_is_read_in_signals_mode_with_the_same_rule_as_registry_mode(
    client, sources, resolver
) -> None:
    """#2291.2 (lot R, 19/09/2026) — les avis BOAMP DÉJÀ moissonnés par le mode
    signaux (``list_tender_buyers``) sont lus avec la MÊME règle que le mode
    registre (``contract_model.py::_public_contracts``) : « assistance
    technique », « en régie », « au forfait »/« forfaitaire », cible =
    l'acheteur. Trouvé par un avis SEUL — pas besoin d'offre d'emploi."""
    sources["tender"] = [
        _row("VILLE DE LYON", "tender", 5, siren="216901234", label="AO IT publié — Développement en régie"),
        _row("VILLE DE LYON", "tender", 30, siren="216901234", label="AO IT publié — TMA au forfait"),
    ]
    resolver["VILLE DE LYON"] = _resolution("216901234", "VILLE DE LYON")

    cand = _post(client).json()["candidates"][0]
    contracts = cand["contractModel"]["publicContracts"]
    assert contracts["source"] == "Avis de marchés publics"
    assert contracts["total"] == 2
    assert contracts["regie"] == 1
    assert contracts["fixedPrice"] == 1
    assert cand["contractModel"]["jobOffers"] is None


def test_2291_2_r_a_tender_silent_on_the_mode_is_still_observed_with_zero_stated_mode(
    client, sources, resolver
) -> None:
    """Un avis trouvé mais qui ne DIT pas le mode : compté dans ``total``,
    zéro régie/forfait — jamais un ``None`` global qui perdrait le volume lu."""
    sources["tender"] = [_row("VILLE DE LYON", "tender", 5, siren="216901234", label="AO IT publié — Maintenance")]
    resolver["VILLE DE LYON"] = _resolution("216901234", "VILLE DE LYON")

    cand = _post(client).json()["candidates"][0]
    contracts = cand["contractModel"]["publicContracts"]
    assert contracts["total"] == 1
    assert contracts["regie"] == 0
    assert contracts["fixedPrice"] == 0


def test_2291_2_r_an_intermediated_employers_own_tenders_are_still_observed(client, sources, resolver) -> None:
    """Un cabinet de recrutement PEUT être, par ailleurs, un acheteur public réel
    (BOAMP). L'exclusion « cabinet » ne porte que sur SES OFFRES D'EMPLOI (elles
    parlent pour ses clients) — jamais sur ses propres avis de marché."""
    sources["hiring"] = [_row("TALENTS PLUS", "hiring", 3, contractCode="LIB")]
    sources["tender"] = [
        _row("TALENTS PLUS", "tender", 5, siren="552100554", label="AO IT publié — Prestations en régie")
    ]
    resolver["TALENTS PLUS"] = _resolution("552100554", "TALENTS PLUS", naf="78.10Z")

    cand = _post(client).json()["candidates"][0]
    model = cand["contractModel"]
    assert model["jobOffers"] is None
    assert model["publicContracts"]["regie"] == 1


def test_2291_2_r_reading_boamp_in_signals_mode_costs_zero_extra_network_call(
    client, sources, resolver, monkeypatch
) -> None:
    """#2291.2 (lot R) — la lecture régie se fait sur les lignes DÉJÀ moissonnées
    par ``list_tender_buyers`` : aucun appel réseau de plus."""
    calls = {"tender": 0}
    sources["tender"] = [
        _row("VILLE DE LYON", "tender", 5, siren="216901234", label="AO IT publié — Développement en régie")
    ]

    async def _counting(*_args, **_kwargs):
        calls["tender"] += 1
        return sources["tender"]

    monkeypatch.setattr(mod, "list_tender_buyers", _counting)
    resolver["VILLE DE LYON"] = _resolution("216901234", "VILLE DE LYON")

    _post(client)

    assert calls["tender"] == 1


# ── #3204.2 (épopée #3238) — EXTRACTION, les champs manquants ─────────────


def test_technologies_are_extracted_from_the_offer_text(client, sources, resolver) -> None:
    sources["hiring"] = [_row("ACME", "hiring", 2, label="Développeur Java", detail="Stack Kubernetes, AWS")]
    resolver["ACME"] = _resolution("552100554", "ACME")

    signal = _post(client).json()["candidates"][0]["signals"][0]
    assert signal["technologies"] == ["Java", "AWS", "Kubernetes"]


def test_job_family_is_derived_from_the_title_only(client, sources, resolver) -> None:
    sources["hiring"] = [
        _row("ACME", "hiring", 2, label="Ingénieur DevOps"),
        _row("AUTRE", "hiring", 3, label="Rejoignez l'aventure", siren="552100555"),
    ]
    resolver["ACME"] = _resolution("552100554", "ACME")
    resolver["AUTRE"] = _resolution("552100555", "AUTRE")

    by_name = {c["name"]: c for c in _post(client, profile_data={"placedRoles": ["rejoignez"]}).json()["candidates"]}
    assert by_name["ACME"]["signals"][0]["jobFamily"] == "infrastructure_cloud"
    assert by_name["AUTRE"]["signals"][0]["jobFamily"] is None


def test_team_and_reporting_line_only_when_an_explicit_marker_names_them(client, sources, resolver) -> None:
    sources["hiring"] = [
        _row(
            "ACME",
            "hiring",
            2,
            label="Développeur",
            detail="Vous rejoignez l'équipe Data, rattaché(e) au CTO",
        ),
        _row("AUTRE", "hiring", 3, label="Chef de projet", siren="552100555"),
    ]
    resolver["ACME"] = _resolution("552100554", "ACME")
    resolver["AUTRE"] = _resolution("552100555", "AUTRE")

    by_name = {c["name"]: c for c in _post(client).json()["candidates"]}
    assert by_name["ACME"]["signals"][0]["team"] == "data"
    assert by_name["ACME"]["signals"][0]["reportsTo"] == "cto"
    assert by_name["AUTRE"]["signals"][0]["team"] is None
    assert by_name["AUTRE"]["signals"][0]["reportsTo"] is None


def test_still_open_is_true_within_the_recruitment_freshness_window(client, sources, resolver) -> None:
    sources["hiring"] = [
        _row("ACME", "hiring", 30),
        _row("AUTRE", "hiring", 400, siren="552100555"),
    ]
    resolver["ACME"] = _resolution("552100554", "ACME")
    resolver["AUTRE"] = _resolution("552100555", "AUTRE")

    by_name = {c["name"]: c for c in _post(client).json()["candidates"]}
    # RÈGLE : « une offre retirée ne reste pas un signal actuel » — même
    # fenêtre que `signal_freshness` pour le type « recrutement » (180 jours).
    assert by_name["ACME"]["signals"][0]["stillOpen"] is True
    assert by_name["AUTRE"]["signals"][0]["stillOpen"] is False


def test_similar_offer_count_counts_other_offers_of_the_same_job_family(client, sources, resolver) -> None:
    sources["hiring"] = [
        _row("ACME", "hiring", 2, label="Développeur Java"),
        _row("ACME", "hiring", 5, label="Développeur Python"),
        _row("ACME", "hiring", 8, label="Product Owner"),
    ]
    resolver["ACME"] = _resolution("552100554", "ACME")

    signals = _post(client).json()["candidates"][0]["signals"]
    by_label = {s["label"]: s for s in signals}
    # Deux offres "developpement" : chacune compte l'AUTRE, jamais elle-même.
    assert by_label["Développeur Java"]["similarOfferCount"] == 1
    assert by_label["Développeur Python"]["similarOfferCount"] == 1
    # Seule offre "produit_design" : aucune récurrence.
    assert by_label["Product Owner"]["similarOfferCount"] == 0


def test_site_city_is_the_offers_own_city_not_the_groups_resolved_one(client, sources, resolver) -> None:
    # #3204.2 (épopée #3238, reste) — ENTITÉ PRÉCISE, au-delà du nom déjà
    # résolu : un employeur multi-sites (même SIREN) peut publier des offres
    # dans des villes DIFFÉRENTES — le nom résolu du groupe ne les distingue
    # pas. `siteCity` porte le fait BRUT de CETTE ligne, jamais la ville du
    # premier signal absorbé (`group.city`).
    sources["hiring"] = [
        _row("ACME", "hiring", 2, label="Développeur Lyon", city="Lyon"),
        _row("ACME", "hiring", 5, label="Développeur Marseille", city="Marseille"),
        _row("ACME", "hiring", 8, label="Développeur sans ville", city=None),
    ]
    resolver["ACME"] = _resolution("552100554", "ACME")

    signals = _post(client).json()["candidates"][0]["signals"]
    by_label = {s["label"]: s for s in signals}
    assert by_label["Développeur Lyon"]["siteCity"] == "Lyon"
    assert by_label["Développeur Marseille"]["siteCity"] == "Marseille"
    assert by_label["Développeur sans ville"]["siteCity"] is None


# ── #4182 (EX-12) — de l'offre RH à l'équipe métier demandeuse, avec preuve ──


def test_requester_names_the_supported_manager_and_keeps_the_offer_site(client, sources, resolver) -> None:
    sources["hiring"] = [
        _row(
            "ACME",
            "hiring",
            2,
            label="Développeur",
            detail="Vous rejoignez l'équipe Data, rattaché(e) au CTO",
            city="Lyon",
        ),
    ]
    resolver["ACME"] = _resolution("552100554", "ACME")

    signal = _post(client).json()["candidates"][0]["signals"][0]
    requester = signal["requester"]
    assert requester["status"] == "etaye"
    assert requester["possibleManager"] == {"function": "cto", "entity": "Lyon", "evidence": "texte_de_l_offre"}
    assert requester["team"] == "data"
    assert requester["openFreelanceMission"] is False
    # La date et le lieu de l'offre restent sur le signal, intacts.
    assert signal["siteCity"] == "Lyon" and signal["date"]


def test_requester_without_a_stated_service_is_a_role_to_identify_with_a_method(client, sources, resolver) -> None:
    sources["hiring"] = [_row("AUTRE", "hiring", 3, label="Chef de projet", siren="552100555")]
    resolver["AUTRE"] = _resolution("552100555", "AUTRE")

    requester = _post(client).json()["candidates"][0]["signals"][0]["requester"]
    assert requester["status"] == "a_identifier"
    assert requester["possibleManager"] is None
    assert requester["method"]


def test_requester_never_rides_a_non_hiring_signal(client, sources, resolver) -> None:
    sources["tender"] = [_row("ACME", "tender", 2, label="AO IT")]
    resolver["ACME"] = _resolution("552100554", "ACME")

    signal = _post(client).json()["candidates"][0]["signals"][0]
    assert "requester" not in signal or signal["requester"] is None


# ── #3204.6/.7 (épopée #3238) — AGRÉGATION : TEAM_GROWTH_SIGNAL ───────────


def test_two_internal_hiring_offers_of_the_same_family_aggregate_into_team_growth(client, sources, resolver) -> None:
    sources["hiring"] = [
        _row("ACME", "hiring", 2, label="Data Engineer", contractCode="CDI"),
        _row("ACME", "hiring", 10, label="Data Scientist", contractCode="CDI"),
    ]
    resolver["ACME"] = _resolution("552100554", "ACME")

    cand = _post(client).json()["candidates"][0]
    assert len(cand["aggregatedSignals"]) == 1
    aggregate = cand["aggregatedSignals"][0]
    assert aggregate["aggregateClass"] == "team_growth_signal"
    assert aggregate["jobFamily"] == "data_ia"
    assert [o["label"] for o in aggregate["supportingOffers"]] == ["Data Engineer", "Data Scientist"]


def test_a_single_offer_never_aggregates_into_team_growth(client, sources, resolver) -> None:
    sources["hiring"] = [_row("ACME", "hiring", 2, label="Data Engineer", contractCode="CDI")]
    resolver["ACME"] = _resolution("552100554", "ACME")

    cand = _post(client).json()["candidates"][0]
    assert cand["aggregatedSignals"] == []


def test_a_single_explicit_replacement_offer_aggregates_into_replacement_signal(client, sources, resolver) -> None:
    # #3204.7 (épopée #3238, reste du 30/09) — REPLACEMENT_SIGNAL : à la
    # différence de TEAM_GROWTH_SIGNAL, UNE offre suffit quand son texte nomme
    # explicitement un départ.
    sources["hiring"] = [
        _row("ACME", "hiring", 2, label="Développeur", detail="Poste en remplacement d'un départ"),
    ]
    resolver["ACME"] = _resolution("552100554", "ACME")

    body = _post(client).json()["candidates"][0]
    assert body["signals"][0]["replacementSignal"] is True
    assert len(body["aggregatedSignals"]) == 1
    aggregate = body["aggregatedSignals"][0]
    assert aggregate["aggregateClass"] == "replacement_signal"
    assert aggregate["supportingOffers"][0]["label"] == "Développeur"


def test_an_offer_silent_on_departure_never_aggregates_into_replacement_signal(client, sources, resolver) -> None:
    sources["hiring"] = [_row("ACME", "hiring", 2, label="Développeur", detail="5 postes ouverts")]
    resolver["ACME"] = _resolution("552100554", "ACME")

    body = _post(client).json()["candidates"][0]
    assert body["signals"][0]["replacementSignal"] is False
    assert body["aggregatedSignals"] == []


# ── #3205.1 (épopée #3239) — prestataire tiers mentionné dans une offre ───


def test_third_party_provider_mention_only_when_an_explicit_marker_names_it(client, sources, resolver) -> None:
    sources["hiring"] = [
        _row("ACME", "hiring", 2, label="Développeur", detail="Poste en partenariat avec Sopra Steria"),
        _row("AUTRE", "hiring", 3, label="Chef de projet", siren="552100555"),
    ]
    resolver["ACME"] = _resolution("552100554", "ACME")
    resolver["AUTRE"] = _resolution("552100555", "AUTRE")

    by_name = {c["name"]: c for c in _post(client).json()["candidates"]}
    assert by_name["ACME"]["signals"][0]["thirdPartyProviderMention"] == "sopra steria"
    assert by_name["AUTRE"]["signals"][0]["thirdPartyProviderMention"] is None


def test_a_data_provider_never_appears_as_a_prospect(client, sources, resolver) -> None:
    """#2265.7 — un fournisseur de données d'entreprise (ici Pappers) qui
    publie des offres n'est pas un compte à conquérir : aucune ligne, et les
    autres candidats restent intacts (la garde sait dire NON)."""
    sources["hiring"] = [
        _row("PAPPERS", "hiring", 2, siren="834631005"),
        _row("ESN CORP", "hiring", 3, siren="552100554"),
    ]
    resolver["PAPPERS"] = _resolution("834631005", name="PAPPERS", naf="6312Z")
    resolver["ESN CORP"] = _resolution("552100554", name="ESN CORP", naf="6202A")

    data = _post(client).json()
    assert [c["name"] for c in data["candidates"]] == ["ESN CORP"]


# ── #3814.2 — l'effectif voyage comme LABEL canonique, pas une fabrication ──
#
# Recette prod 08/10 : le tri « Taille (effectif) » n'était pas monotone
# (4 999 avant 10 000+). `_headcount_range` fabriquait un libellé ad hoc
# (`f"{employees}+ salariés"`, SANS séparateur de milliers et TOUJOURS
# « + », même pour une tranche FERMÉE comme « 2 000 à 4 999 ») au lieu de
# rendre le libellé CANONIQUE de la tranche INSEE — la même table que
# partout ailleurs (`company_filters.HEADCOUNT_TRANCHE_LABELS`).
def test_headcount_range_is_the_canonical_tranche_label_not_a_fabricated_string() -> None:
    # Tranche FERMÉE (« 51 » = 2 000 à 4 999) : jamais un « + » qui la ferait
    # lire comme une tranche OUVERTE — ni côté humain, ni côté tri.
    assert mod._headcount_range({"headcount": 2000, "headcountTranche": "51"}) == "2 000 à 4 999 salariés"
    # Tranche OUVERTE (« 53 » = 10 000 et plus) : le mot « plus », jamais un
    # signe fabriqué.
    assert mod._headcount_range({"headcount": 10000, "headcountTranche": "53"}) == "10 000 salariés et plus"
    # Tranche inconnue mais une taille catégorielle connue (GE/ETI/PME/TPE) :
    # repli inchangé, aucune régression sur ce chemin.
    assert mod._headcount_range({"headcount": None, "headcountTranche": None, "sizeClass": "ETI"}) == "ETI"
    assert mod._headcount_range(None) is None


# ── #3941.5 (Louis 17/10) — l'augmentation de capital, critère de recherche ────


def test_capital_is_opt_in_the_default_search_does_not_ask_bodacc(client, sources, resolver) -> None:
    """Sans sélection, les trois sources d'origine : une augmentation de capital n'est pas un signal d'ESN
    par défaut (n'importe quelle société en publie) — elle se COCHE."""
    sources["capital"] = RuntimeError("ne doit pas être appelée")
    resp = _post(client)
    assert resp.status_code == 200
    body = resp.json()
    assert body["query"]["sources"] == ["tender", "award", "hiring"]
    assert not any(d["source"] == "BODACC" for d in body["degraded"])


def test_capital_selected_returns_the_company_with_a_dated_augmentation_signal(client, sources, resolver, registry) -> None:
    sources["capital"] = [
        _row("EUGENIE", "business", 3, siren="102099819", department="68", label="Augmentation de capital", url="https://www.bodacc.fr/a"),
    ]
    registry["102099819"] = {"name": "EUGENIE", "siren": "102099819", "nafCode": "64.20Z", "city": "WITTELSHEIM", "department": "68"}
    resp = _post(client, sources=["capital"], department="68")
    assert resp.status_code == 200
    body = resp.json()
    assert body["query"]["sources"] == ["capital"]
    (candidate,) = body["candidates"]
    assert candidate["siren"] == "102099819"
    (signal,) = candidate["signals"]
    assert signal["label"] == "Augmentation de capital"
    assert signal["date"] == _iso(3)
    assert "levée" not in str(body).lower()


# ── #4732.1 — « Rachat ou fusion », critère qui se coche (jumeau du capital) ────


def test_deal_is_opt_in_and_selected_returns_a_dated_rachat_ou_fusion_signal(client, sources, resolver, registry) -> None:
    sources["deal"] = RuntimeError("ne doit pas être appelée")
    assert _post(client).json()["query"]["sources"] == ["tender", "award", "hiring"]
    sources["deal"] = [
        _row("EUGENIE", "business", 3, siren="102099819", department="68", label="Rachat ou fusion", url="https://www.bodacc.fr/a"),
    ]
    registry["102099819"] = {"name": "EUGENIE", "siren": "102099819", "nafCode": "64.20Z", "city": "WITTELSHEIM", "department": "68"}
    body = _post(client, sources=["deal"], department="68").json()
    assert body["query"]["sources"] == ["deal"]
    (candidate,) = body["candidates"]
    (signal,) = candidate["signals"]
    assert signal["label"] == "Rachat ou fusion"
    assert signal["date"] == _iso(3)


def test_deal_outage_is_a_degraded_source_not_an_empty_success(client, sources, resolver) -> None:
    sources["deal"] = SignalSourceUnavailable("BODACC", "timeout")
    body = _post(client, sources=["deal"]).json()
    assert body["candidates"] == []
    assert any(d["source"] == "BODACC" for d in body["degraded"])


def test_capital_outage_is_a_degraded_source_not_an_empty_success(client, sources, resolver) -> None:
    sources["capital"] = SignalSourceUnavailable("BODACC", "timeout")
    body = _post(client, sources=["capital"]).json()
    assert body["candidates"] == []
    assert any(d["source"] == "BODACC" for d in body["degraded"])
