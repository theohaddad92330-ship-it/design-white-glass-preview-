"""#3916.a / #3921.a — la collecte CONTINUE des registres publics (BODACC, Sirene).

Ce que ces tests tiennent :
- BODACC se lit sur une PLAGE DE DATES, page après page, et s'arrête dès que la
  page sort de la plage — jamais « les 8 dernières » comme à l'analyse ;
- le plafond d'offset de l'API est NOMMÉ (`truncated`), jamais un silence ;
- une panne n'est jamais un relevé vide (`failed`) : sans ça, l'API avancerait
  son curseur et perdrait les annonces de la fenêtre ;
- le rattachement est par SIREN, jamais par nom.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import httpx
import pytest

from app.routers import public_registry
from app.services.data_sources import bodacc as bodacc_module
from app.services.data_sources.bodacc import announcements_between, classify_announcement_kind

SIREN = "403355726"


def _resp(json_data: object, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json=json_data, request=httpx.Request("GET", "https://x"))


def _record(date: str, family: str, *, code: str = "", ref: str = "", siren: str = SIREN) -> dict:
    return {
        "recordid": f"rec-{ref or date}",
        "fields": {
            "id": ref or f"A{date.replace('-', '')}",
            "dateparution": date,
            "familleavis": code,
            "familleavis_lib": family,
            "commercant": "ACME",
            "registre": [siren],
            "tribunal": "GREFFE DU TRIBUNAL DE COMMERCE DE PARIS",
            "url_complete": f"https://www.bodacc.fr/pages/annonce-visualisation/?q.id=id:{ref or date}",
        },
    }


def _paged_client(pages: list[list[dict]]) -> AsyncMock:
    calls: list[dict] = []

    async def _get(_url: str, params: dict | None = None) -> httpx.Response:
        calls.append(dict(params or {}))
        idx = int((params or {}).get("start", "0")) // int((params or {}).get("rows", "1"))
        records = pages[idx] if idx < len(pages) else []
        return _resp({"nhits": sum(len(p) for p in pages), "records": records})

    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock(side_effect=_get)
    c.calls = calls  # type: ignore[attr-defined]
    return c


@pytest.mark.asyncio
async def test_bodacc_reads_every_page_of_the_window_and_stops_past_it() -> None:
    pages = [
        [_record("2026-10-05", "Procédures collectives", code="collective", ref="A1"), _record("2026-09-20", "Ventes et cessions", code="vente", ref="A2")],
        [_record("2026-09-01", "Créations", code="creation", ref="A3"), _record("2026-07-30", "Dépôts des comptes", code="dpc", ref="A4")],
        [_record("2026-06-01", "Modifications diverses", code="modification", ref="A5")],
    ]
    client = _paged_client(pages)
    out = await announcements_between(SIREN, since="2026-08-01", until="2026-10-09", page_size=2, client=client)
    assert out["failed"] is False
    assert out["truncated"] is False
    # Les trois annonces DANS la plage, aucune avant `since`.
    assert [a["ref"] for a in out["announcements"]] == ["A1", "A2", "A3"]
    assert [a["kind"] for a in out["announcements"]] == ["collective_proceeding", "sale", "creation"]
    assert out["announcements"][0]["url"].startswith("https://www.bodacc.fr/")
    # La deuxième page contenait déjà une date hors plage : la troisième n'est jamais lue.
    assert len(client.calls) == 2
    assert client.calls[1]["start"] == "2"


@pytest.mark.asyncio
async def test_bodacc_names_the_offset_cap_instead_of_going_silent(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bodacc_module, "_MAX_OFFSET", 4)
    pages = [[_record(f"2026-10-0{9 - i}", "Modifications diverses", ref=f"R{p}{i}") for i in range(2)] for p in range(5)]
    out = await announcements_between(SIREN, since="2026-01-01", until="2026-10-09", page_size=2, client=_paged_client(pages))
    assert out["truncated"] is True
    assert len(out["announcements"]) == 4


@pytest.mark.asyncio
async def test_bodacc_outage_is_never_an_empty_reading() -> None:
    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock(side_effect=httpx.ConnectError("boom"))
    out = await announcements_between(SIREN, since="2026-01-01", until="2026-10-09", client=c)
    assert out == {"announcements": [], "truncated": False, "failed": True}


@pytest.mark.asyncio
async def test_bodacc_window_keeps_only_the_followed_siren() -> None:
    pages = [[_record("2026-10-01", "Ventes et cessions", ref="MINE"), _record("2026-10-01", "Ventes et cessions", ref="HOMONYM", siren="111222333")]]
    out = await announcements_between(SIREN, since="2026-01-01", until="2026-10-09", client=_paged_client(pages))
    assert [a["ref"] for a in out["announcements"]] == ["MINE"]


@pytest.mark.asyncio
async def test_bodacc_window_rejects_a_bad_siren_without_calling() -> None:
    c = AsyncMock(spec=httpx.AsyncClient)
    out = await announcements_between("123", since="2026-01-01", until="2026-10-09", client=c)
    assert out["failed"] is True
    c.get.assert_not_called()


def test_announcement_kind_reads_the_code_then_the_label() -> None:
    assert classify_announcement_kind("collective", "") == "collective_proceeding"
    assert classify_announcement_kind("", "Procédures de rétablissement professionnel") == "collective_proceeding"
    assert classify_announcement_kind("dpc", "Dépôts des comptes") == "accounts_filing"
    assert classify_announcement_kind("immatriculation", "Immatriculations") == "creation"
    assert classify_announcement_kind("radiation", "Radiations") == "deregistration"
    assert classify_announcement_kind("", "Quelque chose d'inconnu") == "other"


@pytest.mark.asyncio
async def test_router_bodacc_returns_the_window(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict = {}

    async def _fake(siren: str, *, since: str, until: str, **_: object) -> dict:
        seen.update(siren=siren, since=since, until=until)
        return {"announcements": [{"ref": "A1"}], "truncated": False, "failed": False}

    monkeypatch.setattr(public_registry, "announcements_between", _fake)
    out = await public_registry.bodacc_window(public_registry.BodaccWindowRequest(siren=SIREN, since="2026-01-01", until="2026-10-09"))
    assert seen == {"siren": SIREN, "since": "2026-01-01", "until": "2026-10-09"}
    assert out["announcements"] == [{"ref": "A1"}]


# ─── #3921.a / #3921.b — le relevé Sirene du jour ─────────────────────────────

from app.services.insee_sirene import InseeEtablissement, InseeUniteLegale  # noqa: E402


def _etab(siret: str, *, city: str = "Lyon", active: bool = True, start: str | None = "2026-10-01") -> InseeEtablissement:
    return InseeEtablissement(
        siret=siret,
        city=city,
        postal_code="69001",
        is_headquarters=False,
        headcount_range="12",
        is_active=active,
        closure_date=None,
        period_start_date=start,
    )


def _unit(tranche: str | None) -> InseeUniteLegale:
    return InseeUniteLegale(
        siren=SIREN, denomination="ACME", naf_code="62.02A", naf_is_it=True, headcount_range=tranche, legal_category="5710", is_active=True
    )


@pytest.mark.asyncio
async def test_sirene_snapshot_is_a_strict_noop_without_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(public_registry, "insee_api_key", lambda: "")
    called = AsyncMock()
    monkeypatch.setattr(public_registry, "etablissements_reading", called)
    out = await public_registry.sirene_snapshot(public_registry.SireneSnapshotRequest(siren=SIREN))
    assert out == {"configured": False, "failed": False, "establishments": [], "headcountRange": None, "openings": []}
    called.assert_not_called()


@pytest.mark.asyncio
async def test_sirene_snapshot_turns_a_new_siret_into_a_dated_linked_opening(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(public_registry, "insee_api_key", lambda: "k")
    monkeypatch.setattr(
        public_registry, "etablissements_reading", AsyncMock(return_value=[_etab("40335572600010"), _etab("40335572600044")])
    )
    monkeypatch.setattr(public_registry, "unite_legale_by_siren", AsyncMock(return_value=_unit("21")))
    previous = [{"siret": "40335572600010", "isActive": True, "periodStartDate": "2010-01-01", "city": "Paris"}]
    out = await public_registry.sirene_snapshot(public_registry.SireneSnapshotRequest(siren=SIREN, previous=previous))
    assert out["configured"] is True and out["failed"] is False
    assert out["headcountRange"] == "21"
    assert len(out["establishments"]) == 2
    assert out["openings"] == [
        {
            "siret": "40335572600044",
            "date": "2026-10-01",
            "label": "Nouvel établissement — Lyon",
            "url": "https://annuaire-entreprises.data.gouv.fr/etablissement/40335572600044",
        }
    ]


@pytest.mark.asyncio
async def test_sirene_first_snapshot_never_takes_every_site_for_an_opening(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(public_registry, "insee_api_key", lambda: "k")
    monkeypatch.setattr(public_registry, "etablissements_reading", AsyncMock(return_value=[_etab("40335572600044")]))
    monkeypatch.setattr(public_registry, "unite_legale_by_siren", AsyncMock(return_value=None))
    out = await public_registry.sirene_snapshot(public_registry.SireneSnapshotRequest(siren=SIREN, previous=None))
    assert out["openings"] == []
    # Un effectif que le registre ne rend pas reste « non mesuré », jamais 0.
    assert out["headcountRange"] is None


@pytest.mark.asyncio
async def test_sirene_outage_is_never_an_empty_snapshot(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(public_registry, "insee_api_key", lambda: "k")
    monkeypatch.setattr(public_registry, "etablissements_reading", AsyncMock(return_value=None))
    monkeypatch.setattr(public_registry, "unite_legale_by_siren", AsyncMock(return_value=_unit("21")))
    out = await public_registry.sirene_snapshot(public_registry.SireneSnapshotRequest(siren=SIREN, previous=[]))
    assert out["failed"] is True
    assert out["establishments"] == [] and out["openings"] == []


# ─── #3920.8 — marchés attribués lus EN CONTINU ──────────────────────────────


@pytest.mark.asyncio
async def test_awards_route_returns_dated_stable_refs_and_drops_undated(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = [
        {
            "title": "TMA du SI achats",
            "buyer": "Mairie X",
            "winner": "Acme SA",
            "role": "buyer",
            "notifiedDate": "2026-10-02",
            "url": "https://x.example/m1",
        },
        {"title": "Sans date", "buyer": "Mairie X", "winner": None, "notifiedDate": None},
        {"title": "Lien douteux", "buyer": "Mairie Y", "notifiedDate": "2026-09-01", "url": "javascript:alert(1)"},
    ]
    # #3915.decp — la lecture continue passe par le SIREN seul (`awards_for_siren`).
    monkeypatch.setattr(public_registry, "awards_for_siren", AsyncMock(return_value=rows))
    req = public_registry.AwardsRequest(siren=SIREN, name="Mairie X")
    first = await public_registry.awards_snapshot(req)
    second = await public_registry.awards_snapshot(req)
    assert first["failed"] is False
    assert [a["date"] for a in first["awards"]] == ["2026-10-02", "2026-09-01"]
    assert first["awards"][0]["url"] == "https://x.example/m1"
    assert first["awards"][1]["url"] is None  # un lien non http(s) n'est jamais gardé
    assert [a["ref"] for a in first["awards"]] == [a["ref"] for a in second["awards"]]  # idempotent
    assert first["awards"][0]["winner"] == "Acme SA"


@pytest.mark.asyncio
async def test_awards_route_says_failed_when_the_source_errored(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services.data_sources.signal_errors import SignalSourceUnavailable

    async def _boom(*_a: object, **_k: object) -> list[dict]:
        raise SignalSourceUnavailable("DECP", "http_5xx")

    monkeypatch.setattr(public_registry, "awards_for_siren", _boom)
    out = await public_registry.awards_snapshot(public_registry.AwardsRequest(siren=SIREN, name="Mairie X"))
    assert out["failed"] is True and out["awards"] == []  # un vide qui cache une panne n'est pas un relevé
