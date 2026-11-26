from __future__ import annotations

import ipaddress
import logging
import os
import socket
from typing import Literal
from urllib.parse import urlparse

import httpx

from app.models.progress import ProfilerProgressCallback, ProgressCallback

logger = logging.getLogger(__name__)

_TIMEOUT_S = 2.0
_HEADER = "X-Internal-Secret"


def _internal_secret() -> str:
    return os.environ.get("INTERNAL_API_SECRET", "")


def _is_safe_callback_url(url: str) -> bool:
    """Guard the progress callback against SSRF / internal-secret exfiltration.

    We forward ``X-Internal-Secret`` on this POST, so the target must never be a
    client-chosen host reaching cloud-metadata / loopback / link-local. The URL is
    normally built server-side by NestJS (``ia.client.ts``); this is defence in
    depth for any path that lets a request body set it. DNS is resolved so a
    hostname pointing at a blocked range is caught too. Private ranges
    (10/172.16/192.168, IPv6 ULA) are ALLOWED because the legitimate API callback
    runs over Railway internal DNS. Set ``INTERNAL_CALLBACK_ALLOWED_HOSTS`` (comma
    list) to pin the callback host exactly.
    """
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            return False
        allow = os.environ.get("INTERNAL_CALLBACK_ALLOWED_HOSTS", "")
        if allow:
            allowed = {h.strip().lower() for h in allow.split(",") if h.strip()}
            if parsed.hostname.lower() not in allowed:
                return False
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        for info in socket.getaddrinfo(parsed.hostname, port):
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_unspecified:
                return False
        return True
    except Exception:  # noqa: BLE001 — any resolution/parse failure = reject
        return False


async def emit_progress(
    callback: ProgressCallback | None,
    phase: str,
    step: str,
    percent: int,
    message: str = "",
) -> None:
    if callback is None or not callback.url:
        return
    if not _is_safe_callback_url(callback.url):
        logger.warning("progress callback URL rejected (unsafe target): %s", callback.url)
        return
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_S) as client:
            await client.post(
                callback.url,
                json={
                    "accountId": callback.account_id,
                    "jobId": callback.job_id,
                    "phase": phase,
                    "step": step,
                    "percent": percent,
                    "message": message,
                },
                headers={_HEADER: _internal_secret()},
            )
    except Exception as exc:  # noqa: BLE001 — best-effort
        logger.warning(
            "progress callback to API failed (continuing): phase=%s step=%s percent=%s url=%s error=%s",
            phase,
            step,
            percent,
            callback.url if callback else "",
            exc,
        )


ProfilerPhase = Literal["reading", "thinking", "writing", "done"]
ProfilerStatus = Literal["started", "complete", "error"]


async def emit_profiler_progress(
    callback: ProfilerProgressCallback | None,
    phase: ProfilerPhase,
    status: ProfilerStatus,
    message: str = "",
) -> None:
    if callback is None or not callback.url:
        return
    if not _is_safe_callback_url(callback.url):
        logger.warning("profiler progress callback URL rejected (unsafe target): %s", callback.url)
        return
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_S) as client:
            await client.post(
                callback.url,
                json={
                    "kind": "phase",
                    "userId": callback.user_id,
                    "phase": phase,
                    "status": status,
                    "message": message,
                },
                headers={_HEADER: _internal_secret()},
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "profiler progress callback failed: phase=%s status=%s error=%s",
            phase,
            status,
            exc,
        )


