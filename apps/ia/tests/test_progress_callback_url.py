"""Tests for the progress-callback SSRF guard (app/services/progress.py)."""

from __future__ import annotations

import pytest

from app.services.progress import _is_safe_callback_url


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/cb",          # loopback
        "http://169.254.169.254/latest/meta-data/",  # cloud metadata (link-local)
        "http://[::1]/cb",              # IPv6 loopback
        "http://0.0.0.0/cb",            # unspecified
        "ftp://8.8.8.8/cb",             # non-http scheme
        "file:///etc/passwd",           # non-http scheme
        "not-a-url",                    # unparseable / no host
        "",                             # empty
    ],
)
def test_rejects_unsafe_targets(url):
    assert _is_safe_callback_url(url) is False


@pytest.mark.parametrize(
    "url",
    [
        "http://8.8.8.8/cb",     # public IPv4
        "https://1.1.1.1/cb",    # public IPv4, https
        "http://10.0.0.5:3000/cb",   # private range — allowed (Railway internal DNS)
        "http://172.16.0.9/cb",      # private range
        "http://192.168.1.20/cb",    # private range
    ],
)
def test_allows_public_and_private_ranges(url):
    # Private ranges are allowed on purpose: the legitimate API callback runs over
    # Railway internal networking. Loopback / link-local / metadata stay blocked.
    assert _is_safe_callback_url(url) is True


def test_host_allowlist_pins_exact_host(monkeypatch):
    monkeypatch.setenv("INTERNAL_CALLBACK_ALLOWED_HOSTS", "8.8.8.8, api.internal")
    assert _is_safe_callback_url("http://8.8.8.8/cb") is True
    # Public but not in the allowlist → rejected.
    assert _is_safe_callback_url("http://1.1.1.1/cb") is False
