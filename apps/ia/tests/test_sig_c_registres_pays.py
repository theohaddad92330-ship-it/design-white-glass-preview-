"""SIG-C (11/10) C2 — les registres pays BE/CH/CA/US passent par ``provider_cache``.

Aucun d'eux n'était caché : chaque analyse d'un compte belge, suisse, canadien ou
américain re-interrogeait le registre pour une identité qui bouge au trimestre.
Clé = l'IDENTIFIANT LÉGAL (BCE, UID, numéro de société, CIK) — jamais un nom
cherché. Une erreur (non-2xx, exception) n'est jamais cachée. LU n'appelle
aucun réseau : rien à cacher.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.services import provider_cache
from app.services.country_packs import be as be_mod
from app.services.country_packs import ca as ca_mod
from app.services.country_packs.be import BelgianPack
from app.services.country_packs.ca import CanadaPack
from app.services.country_packs.ch import SwissPack
from app.services.country_packs.lu import LuxembourgPack
from app.services.country_packs.us import UsPack

_DAY = 24 * 3600


class FakeRedis:
    def __init__(self) -> None:
        self.store: dict[str, str] = {}
        self.ttls: list[int | None] = []

    async def get(self, key: str):
        return self.store.get(key)

    async def set(self, key: str, value: str, ex: int | None = None):
        self.store[key] = value
        self.ttls.append(ex)


def _client(status: int, *, json_data: object = None, text: str = "") -> AsyncMock:
    req = httpx.Request("GET", "https://registre.test")
    resp = (
        httpx.Response(status, json=json_data, request=req)
        if json_data is not None
        else httpx.Response(status, text=text, request=req)
    )
    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock(return_value=resp)
    c.post = AsyncMock(return_value=resp)
    return c


def _assert_30_days(fake: FakeRedis) -> None:
    assert fake.ttls and all(0.89 * 30 * _DAY <= t <= 1.11 * 30 * _DAY for t in fake.ttls)


async def _twice(call) -> tuple[object, object]:
    with patch.object(provider_cache, "_redis", AsyncMock(return_value=FakeRedis())) as redis:
        first = await call()
        second = await call()
        fake = await redis()
    return first, second, fake


async def test_be_detail_par_numero_bce_cache_30_jours() -> None:
    entity = {"source": "kbo", "country": "BE", "name": "Sigc SA", "registryId": "0403.170.701"}
    http = _client(200, text="<html/>")
    with patch.object(be_mod, "_parse_detail", return_value=entity):
        first, second, fake = await _twice(lambda: BelgianPack()._lookup_by_number(http, "0403170701"))
    assert first == entity and second == entity
    assert http.get.await_count == 1
    _assert_30_days(fake)


async def test_be_erreur_jamais_cachee() -> None:
    http = _client(503, text="")
    _, _, fake = await _twice(lambda: BelgianPack()._lookup_by_number(http, "0403170701"))
    assert http.get.await_count == 2 and fake.store == {}


async def test_ch_detail_par_uid_cache_30_jours() -> None:
    raw = [{"uid": "CHE-101.329.561", "name": "Sigc AG"}]
    http = _client(200, json_data=raw)
    first, second, fake = await _twice(lambda: SwissPack()._get_by_uid(http, "CHE101329561", ("u", "p")))
    assert first == raw[0] and second == raw[0]
    assert http.get.await_count == 1
    _assert_30_days(fake)


async def test_ch_erreur_jamais_cachee() -> None:
    http = _client(401, json_data={})
    _, _, fake = await _twice(lambda: SwissPack()._get_by_uid(http, "CHE101329561", ("u", "p")))
    assert http.get.await_count == 2 and fake.store == {}


async def test_ca_detail_federal_par_numero_cache_30_jours() -> None:
    entity = {"registryId": "1234567", "region": "CC", "detailUrl": "https://ised-isde.canada.ca/x"}
    detail = {"registeredOffice": "Ottawa"}
    http = _client(200, text="<html/>")
    with patch.object(ca_mod, "_parse_federal_detail", return_value=detail):
        first, second, fake = await _twice(lambda: CanadaPack()._federal_detail(http, entity))
    assert first == detail and second == detail
    assert http.get.await_count == 1
    _assert_30_days(fake)


async def test_us_profil_financier_par_cik_cache_30_jours() -> None:
    profile = {"revenue": {"value": 1, "fy": 2025}}
    with patch.object(UsPack, "_fetch_financial_profile", AsyncMock(return_value=profile)) as fetch:
        first, second, fake = await _twice(lambda: UsPack()._financial_profile(AsyncMock(), "0000320193"))
    assert first == profile and second == profile
    assert fetch.await_count == 1
    _assert_30_days(fake)


async def test_us_submissions_par_cik_cache_tier_signaux() -> None:
    """Le flux ``submissions`` porte AUSSI les dépôts datés (signaux légaux) — il prend le
    tier des signaux (30 j depuis #3989, Louis 15/10)."""
    raw = {"cik": "320193", "name": "Sigc Inc"}
    http = _client(200, json_data=raw)
    first, second, fake = await _twice(lambda: UsPack()._get_submissions(http, "0000320193"))
    assert first == raw and second == raw
    assert http.get.await_count == 1
    assert fake.ttls and all(0.89 * 30 * _DAY <= t <= 1.11 * 30 * _DAY for t in fake.ttls)


async def test_lu_interroge_gleif_sur_son_contrat_documente_et_un_vide_ne_resout_rien() -> None:
    """#4016 L13a (Louis 11/10) — le Luxembourg quitte « n'appelle rien » : il lit GLEIF,
    sur un contrat DOCUMENTÉ. Une réponse vide ne résout aucune société (jamais d'invention)."""
    http = _client(200, json_data={})
    fake = FakeRedis()
    with patch.object(provider_cache, "_redis", AsyncMock(return_value=fake)):
        assert await LuxembourgPack().registry_lookup("B12345", client=http) is None
    http.get.assert_called_once()
    assert "gleif.org" in http.get.call_args.args[0]


@pytest.mark.parametrize("ident", ["", "   "])
async def test_identifiant_vide_jamais_de_cle(ident: str) -> None:
    """Pas d'identifiant légal ⇒ pas de clé : aucune entrée commune « vide »."""
    http = _client(200, json_data=[{"uid": "CHE-1", "name": "x"}])
    fake = FakeRedis()
    with patch.object(provider_cache, "_redis", AsyncMock(return_value=fake)):
        await SwissPack()._get_by_uid(http, ident, ("u", "p"))
    assert fake.store == {}
