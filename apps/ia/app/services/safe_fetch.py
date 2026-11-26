"""Garde SSRF partagée pour toute lecture d'une URL qui vient du web (audit IA M4/M5).

Deux défenses complémentaires :

1. ``resolve_public_ips`` / ``assert_public_host`` : refus rapide, AVANT la
   requête, de tout hôte (littéral ou résolu) qui n'est pas une adresse publique
   (loopback, privé, link-local, métadonnées cloud, CGNAT, multicast, IPv6 ULA,
   IPv4 mappée / NAT64 / 6to4 qui masquent une IPv4 privée). Utilisée à chaque
   saut de redirection par les appelants.
2. ``PinnedNetworkBackend`` : la résolution DNS et sa validation ont lieu AU
   MOMENT de la connexion, dans le backend réseau de httpcore, et la socket part
   vers l'IP validée — jamais vers un nom re-résolu. Un domaine à TTL 0 qui
   répond public à la garde puis privé à la connexion (DNS rebinding) échoue ici.
   Le nom d'hôte d'origine reste celui de l'URL : en-tête ``Host``, SNI et
   vérification du certificat sont donc inchangés.

La garde de ``progress.py`` AUTORISE volontairement les plages privées (callback
interne Railway) : elle ne convient pas aux URL venues du web.
"""

from __future__ import annotations

import asyncio
import ipaddress
import socket
from collections.abc import Iterable

import httpcore
import httpx


class UnsafeHostError(httpcore.ConnectError):
    """L'hôte est, ou résout vers, une adresse non publique."""


class DnsResolutionError(Exception):
    """Le nom ne se résout pas (distinct d'un refus de sécurité)."""


def is_public_ip(raw: str) -> bool:
    try:
        ip = ipaddress.ip_address(raw)
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.ipv4_mapped is not None:
            return is_public_ip(str(ip.ipv4_mapped))
        packed = ip.packed
        if packed[:12] == bytes.fromhex("0064ff9b0000000000000000"):  # NAT64 64:ff9b::/96
            return is_public_ip(str(ipaddress.IPv4Address(packed[12:])))
        if packed[:2] == b"\x20\x02":  # 6to4 2002::/16 : l'IPv4 est dans les bits 16..48
            return is_public_ip(str(ipaddress.IPv4Address(packed[2:6])))
        if packed[:12] == bytes(12):  # ::/96 (IPv4-compatible, déprécié) et ::
            return False
    return ip.is_global and not ip.is_multicast


async def _getaddrinfo_ips(host: str) -> list[str]:
    loop = asyncio.get_running_loop()
    infos = await loop.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    return [str(info[4][0]) for info in infos]


def _literal_ip(host: str) -> str | None:
    try:
        return str(ipaddress.ip_address(host.strip("[]")))
    except ValueError:
        return None


async def resolve_public_ips(host: str) -> list[str]:
    """Résout ``host`` UNE fois et rend ses IP, toutes publiques.

    ``UnsafeHostError`` si l'une d'elles ne l'est pas (une réponse mixte est
    refusée : l'attaquant choisirait la privée), ``DnsResolutionError`` si le
    nom ne se résout pas."""
    literal = _literal_ip(host)
    if literal is not None:
        if not is_public_ip(literal):
            raise UnsafeHostError(host)
        return [literal]
    try:
        addresses = await _getaddrinfo_ips(host)
    except OSError:
        raise DnsResolutionError(host) from None
    if not addresses or not all(is_public_ip(a) for a in addresses):
        raise UnsafeHostError(host)
    return list(dict.fromkeys(addresses))


async def assert_public_host(host: str) -> None:
    await resolve_public_ips(host)


class PinnedNetworkBackend(httpcore.AsyncNetworkBackend):
    """Backend httpcore : résout, valide, puis connecte à l'IP validée."""

    def __init__(self, inner: httpcore.AsyncNetworkBackend | None = None) -> None:
        self._inner = inner or httpcore.AnyIOBackend()

    async def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: float | None = None,
        local_address: str | None = None,
        socket_options: Iterable[tuple] | None = None,
    ) -> httpcore.AsyncNetworkStream:
        try:
            addresses = await resolve_public_ips(host)
        except DnsResolutionError as exc:
            raise httpcore.ConnectError(f"DNS: {exc}") from None
        last: Exception | None = None
        for ip in addresses:
            try:
                return await self._inner.connect_tcp(
                    ip, port, timeout=timeout, local_address=local_address, socket_options=socket_options
                )
            except (httpcore.ConnectError, httpcore.ConnectTimeout, OSError) as exc:
                last = exc
        raise last if last is not None else httpcore.ConnectError(host)

    async def connect_unix_socket(self, path, timeout=None, socket_options=None):  # type: ignore[override]
        raise httpcore.ConnectError("unix socket interdit")

    async def sleep(self, seconds: float) -> None:
        await self._inner.sleep(seconds)


def new_pinned_transport() -> httpx.AsyncHTTPTransport:
    transport = httpx.AsyncHTTPTransport()
    pool = transport._pool  # noqa: SLF001 — httpx n'expose pas network_backend
    transport._pool = httpcore.AsyncConnectionPool(  # noqa: SLF001
        ssl_context=pool._ssl_context,  # noqa: SLF001
        max_connections=pool._max_connections,  # noqa: SLF001
        max_keepalive_connections=pool._max_keepalive_connections,  # noqa: SLF001
        keepalive_expiry=pool._keepalive_expiry,  # noqa: SLF001
        http1=pool._http1,  # noqa: SLF001
        http2=pool._http2,  # noqa: SLF001
        network_backend=PinnedNetworkBackend(),
    )
    return transport


def new_pinned_client(*, timeout: float, headers: dict[str, str] | None = None) -> httpx.AsyncClient:
    """Client dont toute connexion passe par :class:`PinnedNetworkBackend`.

    Pas de proxy d'environnement (il contournerait l'épinglage) et redirections
    SUIVIES À LA MAIN par l'appelant (chaque saut est revalidé)."""
    return httpx.AsyncClient(
        transport=new_pinned_transport(),
        timeout=timeout,
        follow_redirects=False,
        trust_env=False,
        headers=headers,
    )


__all__ = [
    "DnsResolutionError",
    "PinnedNetworkBackend",
    "UnsafeHostError",
    "assert_public_host",
    "is_public_ip",
    "new_pinned_client",
    "new_pinned_transport",
    "resolve_public_ips",
]
