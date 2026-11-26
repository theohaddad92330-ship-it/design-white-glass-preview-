"""GitHub — un quota qui se recharge tout seul ≠ une clé morte.

#638 a posé un bucket (5 rpm / 1 concurrent) sur `api.github.com` après avoir vu,
en live pendant son propre run : ``API rate limit exceeded for 79.95.127.174``.
Il a aussi noté que la suite contrat classait ça « UPSTREAM OUTAGE — no action
needed ». C'est faux, et la même erreur existait dans le code produit :

- **quota anonyme épuisé** (60 req/HEURE) → se répare TOUT SEUL à l'heure pile.
  L'action utile est d'attendre, ou de poser `GITHUB_TOKEN` (→ 5000/h) ;
- **credential morte** (401 : token révoqué, expiré, faute de frappe) → ne se
  répare JAMAIS toute seule. Il faut un humain.

Les deux renvoyaient `None` avec un message indistinct. Ce fichier verrouille la
distinction là où elle compte : dans le code produit.
"""

from __future__ import annotations

import time

import httpx
import pytest

from app.services.data_sources import github_org as mod


def _client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


@pytest.fixture(autouse=True)
def _reset_breaker(monkeypatch):
    """Le disjoncteur est un état de processus — jamais partagé entre tests."""
    mod.reset_quota_state()
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    yield
    mod.reset_quota_state()


@pytest.fixture()
def degradations(monkeypatch):
    seen: list[dict] = []
    monkeypatch.setattr(
        mod, "record_degradation",
        lambda cid, *, source, reason, code="": seen.append({"source": source, "reason": reason, "code": code}),
    )
    return seen


# ── 1. Quota épuisé : self-heals, et on le DIT ─────────────────────────────


@pytest.mark.anyio
async def test_exhausted_anon_quota_is_reported_as_self_healing_not_as_a_dead_key(degradations):
    reset_at = int(time.time()) + 900

    def handler(request):
        return httpx.Response(
            403,
            headers={"x-ratelimit-remaining": "0", "x-ratelimit-reset": str(reset_at)},
            json={"message": "API rate limit exceeded for 79.95.127.174"},
        )

    async with _client(handler) as http:
        assert await mod.org_tech_signals("Doctolib", client=http) is None

    assert degradations, "un quota épuisé ne doit jamais être un silence"
    entry = degradations[-1]
    assert entry["code"] == "rate_limited"
    assert "credential" not in entry["reason"].lower()
    # Le message doit porter l'action utile : attendre / poser un token.
    assert "GITHUB_TOKEN" in entry["reason"]


@pytest.mark.anyio
async def test_dead_credential_is_reported_as_needing_a_human(degradations, monkeypatch):
    monkeypatch.setenv("GITHUB_TOKEN", "ghp_revoked")

    def handler(request):
        return httpx.Response(401, json={"message": "Bad credentials"})

    async with _client(handler) as http:
        assert await mod.org_tech_signals("Doctolib", client=http) is None

    entry = degradations[-1]
    assert entry["code"] == "unauthorized"
    reason = entry["reason"].lower()
    assert "quota" not in reason, "une clé morte n'est pas un quota"
    # Une clé morte ne se répare pas en attendant : le message doit le dire.
    assert "token" in reason or "credential" in reason


@pytest.mark.anyio
async def test_403_that_is_not_a_rate_limit_is_not_called_a_quota(degradations):
    """Un 403 sans `x-ratelimit-remaining: 0` est un refus, pas un quota."""

    def handler(request):
        return httpx.Response(403, headers={"x-ratelimit-remaining": "42"}, json={"message": "Forbidden"})

    async with _client(handler) as http:
        assert await mod.org_tech_signals("Doctolib", client=http) is None

    assert degradations[-1]["code"] != "rate_limited"


# ── 2. Le disjoncteur : ne pas re-taper un mur qu'on connaît ───────────────


@pytest.mark.anyio
async def test_once_the_quota_wall_is_known_no_further_request_goes_out(degradations):
    """`org_tech_signals` dépense 3-4 requêtes par entreprise. Une fois le mur
    connu, continuer à taper ne fait que rallonger la file — pour rien."""
    reset_at = int(time.time()) + 900
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        return httpx.Response(
            403,
            headers={"x-ratelimit-remaining": "0", "x-ratelimit-reset": str(reset_at)},
            json={"message": "API rate limit exceeded"},
        )

    async with _client(handler) as http:
        await mod.org_tech_signals("Doctolib", client=http)
        after_first = calls["n"]
        await mod.org_tech_signals("Qonto", client=http)
        await mod.org_tech_signals("Alan", client=http)

    assert calls["n"] == after_first, "aucune requête ne doit partir tant que le quota n'est pas rechargé"
    # …mais chaque entreprise reste rapportée comme non couverte : le disjoncteur
    # coupe le réseau, PAS la transparence.
    assert len([d for d in degradations if d["code"] == "rate_limited"]) >= 3


@pytest.mark.anyio
async def test_breaker_reopens_once_the_reset_time_has_passed(degradations):
    """Un quota se recharge : le disjoncteur doit être temporaire, pas définitif."""
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(
                403,
                headers={"x-ratelimit-remaining": "0", "x-ratelimit-reset": str(int(time.time()) - 1)},
                json={"message": "API rate limit exceeded"},
            )
        return httpx.Response(200, json={"items": []})

    async with _client(handler) as http:
        await mod.org_tech_signals("Doctolib", client=http)
        await mod.org_tech_signals("Qonto", client=http)

    assert calls["n"] >= 2, "passé l'heure de reset, la source doit être retentée"


@pytest.mark.anyio
async def test_dead_credential_also_stops_the_fan_out(degradations, monkeypatch):
    """Une clé morte le reste jusqu'à intervention : marteler 401 est du bruit."""
    monkeypatch.setenv("GITHUB_TOKEN", "ghp_revoked")
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        return httpx.Response(401, json={"message": "Bad credentials"})

    async with _client(handler) as http:
        await mod.org_tech_signals("Doctolib", client=http)
        after_first = calls["n"]
        await mod.org_tech_signals("Qonto", client=http)

    assert calls["n"] == after_first
    assert degradations[-1]["code"] == "unauthorized"


# ── 3. Sans token, la source est structurellement maigre — le produit le dit ─


def test_anonymous_mode_is_declared_as_a_known_limitation():
    """60 req/h ÷ ~3,5 req/entreprise ≈ 17 entreprises par heure pour TOUTE
    l'instance. Ce n'est pas une panne, c'est une contrainte permanente du mode
    anonyme — le produit doit la nommer plutôt que « ne rien contribuer »."""
    assert mod.anonymous_mode() is True
    note = mod.coverage_note()
    assert note is not None
    assert "GITHUB_TOKEN" in note
    assert "60" in note


def test_token_mode_has_no_coverage_warning(monkeypatch):
    monkeypatch.setenv("GITHUB_TOKEN", "ghp_live")
    assert mod.anonymous_mode() is False
    assert mod.coverage_note() is None


# ── 4. La réciproque : un vrai vide reste un vrai vide ─────────────────────


@pytest.mark.anyio
async def test_no_matching_org_records_no_degradation(degradations):
    """Excuser une absence réelle par une panne imaginaire est le bug symétrique."""

    def handler(request):
        return httpx.Response(200, json={"items": [{"login": "totalement-autre-chose"}]})

    async with _client(handler) as http:
        assert await mod.org_tech_signals("Doctolib", client=http) is None

    assert degradations == [], "aucune org correspondante n'est un FAIT, pas une panne"
