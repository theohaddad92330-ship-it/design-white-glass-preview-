"""#3205.1 (épopée #3239) — sous-domaines du compte via crt.sh (logs
Certificate Transparency), décision Louis 02/10/2026 : gratuit, sans clé,
contrat public ; on liste les sous-domaines, on résout les CNAME vers des
prestataires CONNUS, le tout borné par compte ; un timeout est `unknown`, jamais
un échec ; sans réseau, no-op.

Les réponses ci-dessous sont des réponses ENREGISTRÉES au format public de
crt.sh (`?q=%.domaine&output=json` : une liste d'objets dont `name_value` porte
un ou plusieurs noms séparés par des sauts de ligne) — aucun test n'appelle le
réseau.
"""

from __future__ import annotations

import asyncio
import json

import pytest

from app.services import provider_footprint_subdomains as mod
from app.services.provider_footprint_subdomains import (
    collect_subdomain_partners,
    parse_ct_hostnames,
)

from app.services import provider_footprint_subdomains as pfs_module  # noqa: E402

_REAL_ENABLED = pfs_module._enabled


@pytest.fixture(autouse=True)
def _source_on(monkeypatch: pytest.MonkeyPatch) -> None:
    # `conftest.py` coupe la source pour toute la suite (aucun test d'une autre
    # route ne doit joindre crt.sh) ; ICI c'est elle, le sujet.
    monkeypatch.delenv("PROVIDER_FOOTPRINT_SUBDOMAINS", raising=False)
    monkeypatch.setattr(pfs_module, "_enabled", _REAL_ENABLED)


RECORDED = json.dumps(
    [
        {"name_value": "acme.fr\nwww.acme.fr", "issuer_name": "C=US, O=Let's Encrypt"},
        {"name_value": "*.acme.fr", "issuer_name": "C=US, O=Let's Encrypt"},
        {"name_value": "extranet.acme.fr", "issuer_name": "C=US, O=DigiCert"},
        {"name_value": "support.acme.fr\ncontact@acme.fr", "issuer_name": "C=US, O=DigiCert"},
        {"name_value": "autre.exemple.com", "issuer_name": "C=US, O=DigiCert"},
        {"name_value": "EXTRANET.ACME.FR", "issuer_name": "C=US, O=DigiCert"},
    ]
)


def test_parse_keeps_only_real_subdomains_of_the_account_host() -> None:
    assert parse_ct_hostnames(RECORDED, "acme.fr") == ["extranet.acme.fr", "support.acme.fr", "www.acme.fr"]


@pytest.mark.parametrize("body", ["", "not json", "{}", "null", "[1, 2]", '[{"name_value": 3}]'])
def test_unreadable_body_gives_no_hostname(body: str) -> None:
    assert parse_ct_hostnames(body, "acme.fr") == []


def _http(status: int = 200, body: str = RECORDED, calls: list[str] | None = None):
    async def get(url: str, *, timeout: float) -> tuple[int, str]:
        if calls is not None:
            calls.append(url)
        return status, body

    return get


def _cname(mapping: dict[str, str]):
    async def resolve(host: str) -> str | None:
        return mapping.get(host)

    return resolve


def test_a_cname_to_a_known_esn_domain_is_a_provider_mention() -> None:
    result = asyncio.run(
        collect_subdomain_partners(
            "https://www.acme.fr/",
            detected_at="2026-10-02",
            http_get=_http(),
            resolve_cname=_cname({"extranet.acme.fr": "acme.capgemini.com", "support.acme.fr": "acme.zendesk.com"}),
        )
    )
    assert result.status == "ok"
    assert [p["name"] for p in result.partners] == ["Capgemini"]
    entry = result.partners[0]
    assert entry["detectedAt"] == "2026-10-02"
    assert entry["certainty"] == "moyenne"
    assert "extranet.acme.fr" in entry["evidence"] and "acme.capgemini.com" in entry["evidence"]


def test_only_an_exact_domain_label_matches_never_a_substring() -> None:
    result = asyncio.run(
        collect_subdomain_partners(
            "https://acme.fr",
            detected_at="2026-10-02",
            http_get=_http(),
            # « capgeminiclone » contient « capgemini » : ce n'est pas lui.
            resolve_cname=_cname({"extranet.acme.fr": "x.capgeminiclone.com"}),
        )
    )
    assert result.partners == []


def test_a_cname_back_to_the_account_itself_is_not_a_provider() -> None:
    result = asyncio.run(
        collect_subdomain_partners(
            "https://acme.fr",
            detected_at=None,
            http_get=_http(),
            resolve_cname=_cname({"extranet.acme.fr": "edge.acme.fr"}),
        )
    )
    assert result.partners == []


def test_a_timeout_is_unknown_not_a_failure() -> None:
    async def slow(url: str, *, timeout: float) -> tuple[int, str]:
        raise TimeoutError

    result = asyncio.run(collect_subdomain_partners("https://acme.fr", detected_at=None, http_get=slow))
    assert result.status == "unknown"
    assert result.partners == []


def test_no_network_is_a_strict_noop() -> None:
    async def down(url: str, *, timeout: float) -> tuple[int, str]:
        raise OSError("network unreachable")

    result = asyncio.run(collect_subdomain_partners("https://acme.fr", detected_at=None, http_get=down))
    assert result.status == "skipped"
    assert result.partners == []


def test_an_http_error_from_crtsh_is_unknown() -> None:
    result = asyncio.run(
        collect_subdomain_partners("https://acme.fr", detected_at=None, http_get=_http(status=503, body=""))
    )
    assert result.status == "unknown"


@pytest.mark.parametrize("site", [None, "", "not a url", "ftp://acme.fr", "https://"])
def test_no_usable_official_site_makes_no_request(site: str | None) -> None:
    calls: list[str] = []
    result = asyncio.run(collect_subdomain_partners(site, detected_at=None, http_get=_http(calls=calls)))
    assert calls == []
    assert result.status == "skipped"


def test_one_request_and_a_capped_number_of_lookups_per_account() -> None:
    names = "\n".join(f"s{i}.acme.fr" for i in range(200))
    calls: list[str] = []
    looked_up: list[str] = []

    async def resolve(host: str) -> str | None:
        looked_up.append(host)
        return None

    asyncio.run(
        collect_subdomain_partners(
            "https://acme.fr",
            detected_at=None,
            http_get=_http(body=json.dumps([{"name_value": names}]), calls=calls),
            resolve_cname=resolve,
        )
    )
    assert len(calls) == 1
    assert "crt.sh" in calls[0] and "acme.fr" in calls[0]
    assert len(looked_up) == mod.MAX_HOSTS_RESOLVED


def test_the_switch_turns_the_whole_source_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PROVIDER_FOOTPRINT_SUBDOMAINS", "off")
    calls: list[str] = []
    result = asyncio.run(collect_subdomain_partners("https://acme.fr", detected_at=None, http_get=_http(calls=calls)))
    assert calls == []
    assert result.status == "skipped"
