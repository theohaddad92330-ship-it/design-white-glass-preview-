"""Audit IA (M4/M5) — garde SSRF partagée : IP privées refusées, connexion épinglée.

Le DNS rebinding : un nom répond public à la vérification puis privé à la
connexion. Ici la résolution et la validation ont lieu DANS le backend réseau,
au moment de la connexion, et la socket part vers l'IP validée.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.services import safe_fetch


@pytest.mark.parametrize(
    "ip",
    [
        "127.0.0.1",
        "10.0.0.5",
        "172.16.3.4",
        "192.168.1.1",
        "169.254.169.254",  # métadonnées cloud
        "100.64.0.1",  # CGNAT
        "0.0.0.0",
        "::1",
        "fe80::1",
        "fc00::1",
        "fd00:ec2::254",  # métadonnées AWS IPv6
        "::ffff:127.0.0.1",  # IPv4-mappée
        "::ffff:169.254.169.254",
        "64:ff9b::a00:1",  # NAT64 vers 10.0.0.1
        "2002:a9fe:a9fe::1",  # 6to4 vers 169.254.169.254
        "224.0.0.1",
        "pas une ip",
    ],
)
def test_ip_non_publique_refusee(ip: str) -> None:
    assert safe_fetch.is_public_ip(ip) is False


@pytest.mark.parametrize("ip", ["93.184.216.34", "8.8.8.8", "2606:2800:220:1:248:1893:25c8:1946"])
def test_ip_publique_acceptee(ip: str) -> None:
    assert safe_fetch.is_public_ip(ip) is True


async def test_resolution_mixte_refusee(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(safe_fetch, "_getaddrinfo_ips", AsyncMock(return_value=["93.184.216.34", "10.0.0.1"]))
    with pytest.raises(safe_fetch.UnsafeHostError):
        await safe_fetch.resolve_public_ips("example.com")


async def test_ip_litterale_privee_refusee_sans_dns(monkeypatch: pytest.MonkeyPatch) -> None:
    dns = AsyncMock(return_value=["93.184.216.34"])
    monkeypatch.setattr(safe_fetch, "_getaddrinfo_ips", dns)
    with pytest.raises(safe_fetch.UnsafeHostError):
        await safe_fetch.resolve_public_ips("169.254.169.254")
    dns.assert_not_called()


async def test_echec_dns_distinct(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(safe_fetch, "_getaddrinfo_ips", AsyncMock(side_effect=OSError("nxdomain")))
    with pytest.raises(safe_fetch.DnsResolutionError):
        await safe_fetch.resolve_public_ips("introuvable.example")


class _FakeInner:
    def __init__(self) -> None:
        self.connected: list[tuple[str, int]] = []

    async def connect_tcp(self, host, port, timeout=None, local_address=None, socket_options=None):
        self.connected.append((host, port))
        return "stream"


async def test_connexion_epinglee_sur_ip_validee_une_seule_resolution(monkeypatch: pytest.MonkeyPatch) -> None:
    """Rebinding : un 2e appel DNS répondrait privé — il ne doit jamais avoir lieu."""
    answers = iter([["93.184.216.34"], ["169.254.169.254"]])
    dns = AsyncMock(side_effect=lambda _h: next(answers))
    monkeypatch.setattr(safe_fetch, "_getaddrinfo_ips", dns)
    inner = _FakeInner()
    backend = safe_fetch.PinnedNetworkBackend(inner)  # type: ignore[arg-type]

    assert await backend.connect_tcp("rebind.example", 443) == "stream"

    assert inner.connected == [("93.184.216.34", 443)]
    assert dns.await_count == 1


async def test_connexion_refusee_si_le_nom_rebascule_en_prive(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(safe_fetch, "_getaddrinfo_ips", AsyncMock(return_value=["169.254.169.254"]))
    inner = _FakeInner()
    backend = safe_fetch.PinnedNetworkBackend(inner)  # type: ignore[arg-type]
    with pytest.raises(safe_fetch.UnsafeHostError):
        await backend.connect_tcp("rebind.example", 80)
    assert inner.connected == []


async def test_connexion_ip_litterale_privee_refusee() -> None:
    inner = _FakeInner()
    backend = safe_fetch.PinnedNetworkBackend(inner)  # type: ignore[arg-type]
    with pytest.raises(safe_fetch.UnsafeHostError):
        await backend.connect_tcp("127.0.0.1", 80)
    assert inner.connected == []


def test_client_public_sans_proxy_env_ni_redirection_auto() -> None:
    client = safe_fetch.new_pinned_client(timeout=5.0)
    assert client.follow_redirects is False
    assert client.trust_env is False


async def test_client_epingle_refuse_une_ip_privee_pour_de_vrai() -> None:
    """Pas de mock réseau : le vrai transport refuse 127.0.0.1 avant toute socket."""
    import httpx

    async with safe_fetch.new_pinned_client(timeout=2.0) as client:
        with pytest.raises(httpx.ConnectError):
            await client.get("http://127.0.0.1:9/")
