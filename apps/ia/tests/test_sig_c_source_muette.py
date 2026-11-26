"""SIG-C (11/10) C4 — alerte « source muette ».

Un fournisseur EN ERREUR sur 5 appels consécutifs (compteur Redis PAR
fournisseur, remis à zéro au premier succès) remonte au canal d'alertes
back-office EXISTANT (``backoffice_alerts`` → API ``provider-silent``). Zéro
résultat n'est PAS une erreur. Redis absent = rien (best-effort, jamais une
exception). L'alerte nomme la CLÉ d'environnement (canal opérateur), et dit ce
qui manque sans nommer le fournisseur.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import fakeredis.aioredis
import httpx
import pytest

from app.services import backoffice_alerts as ba
from app.services import source_silence
from app.services.data_sources import job_aggregators as agg


@pytest.fixture
def redis():
    fake = fakeredis.aioredis.FakeRedis(decode_responses=True)
    with patch.object(source_silence, "_redis", AsyncMock(return_value=fake)):
        yield fake


@pytest.fixture
def report():
    with patch.object(source_silence.backoffice_alerts, "report_provider_silent", AsyncMock()) as mock:
        yield mock


async def _errors(n: int, provider: str = "theirstack", reason: str = "HTTP 403", status: int | None = None) -> None:
    for _ in range(n):
        await source_silence.record_outcome(provider, ok=False, reason=reason, status=status)


async def test_quatre_erreurs_ne_disent_rien(redis, report) -> None:
    await _errors(4)
    report.assert_not_called()


async def test_la_cinquieme_erreur_consecutive_alerte_une_fois(redis, report) -> None:
    await _errors(7)
    report.assert_awaited_once()
    kwargs = report.await_args.kwargs
    assert report.await_args.args[0] == "THEIRSTACK_API_KEY"
    assert kwargs["consecutive_errors"] == 5
    assert kwargs["last_reason"] == "HTTP 403"
    assert kwargs.get("resolved", False) is False
    assert "theirstack" not in kwargs["degraded"].lower()


async def test_un_succes_remet_a_zero(redis, report) -> None:
    await _errors(4)
    await source_silence.record_outcome("theirstack", ok=True)
    await _errors(4)
    report.assert_not_called()


async def test_le_retour_apres_alerte_ferme_le_sujet(redis, report) -> None:
    await _errors(5)
    await source_silence.record_outcome("theirstack", ok=True)
    assert report.await_count == 2
    assert report.await_args.kwargs["resolved"] is True
    await source_silence.record_outcome("theirstack", ok=True)
    assert report.await_count == 2  # un succès de plus ne re-résout rien


async def test_le_compteur_est_par_fournisseur(redis, report) -> None:
    await _errors(3, "theirstack")
    await _errors(3, "jooble")
    report.assert_not_called()


async def test_redis_absent_ne_fait_rien_et_ne_leve_jamais(report) -> None:
    with patch.object(source_silence, "_redis", AsyncMock(return_value=None)):
        await _errors(10)
    report.assert_not_called()


async def test_redis_en_panne_ne_leve_jamais(report) -> None:
    broken = AsyncMock()
    broken.hincrby.side_effect = ConnectionError("redis down")
    broken.hgetall.side_effect = ConnectionError("redis down")
    with patch.object(source_silence, "_redis", AsyncMock(return_value=broken)):
        await _errors(6)
        await source_silence.record_outcome("theirstack", ok=True)
    report.assert_not_called()


# ── branchement réel : `_request` des agrégateurs ────────────────────────────


def _client(status: int, json_data: object) -> AsyncMock:
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(return_value=httpx.Response(status, json=json_data, request=httpx.Request("POST", "https://x")))
    return c


async def test_cinq_appels_theirstack_en_erreur_alertent(redis, report, monkeypatch) -> None:
    monkeypatch.setenv("THEIRSTACK_API_KEY", "k")
    client = _client(503, {})
    for i in range(3):  # 2 requêtes par appel (domaine puis noms) → 6 erreurs
        await agg.theirstack_jobs(f"Sigc Muette {i}", domain="sigc.test", client=client)
    report.assert_awaited_once()
    assert report.await_args.args[0] == "THEIRSTACK_API_KEY"


async def test_zero_resultat_n_est_pas_une_erreur(redis, report, monkeypatch) -> None:
    monkeypatch.setenv("THEIRSTACK_API_KEY", "k")
    client = _client(200, {"data": []})
    for i in range(6):
        await agg.theirstack_jobs(f"Sigc Vide {i}", domain="sigc.test", client=client)
    report.assert_not_called()
    # ALERTES-402 (30/10/2026) — « aucune série d'erreurs », pas « aucune clé » : un appel TENTÉ
    # s'horodate désormais (`source_last_call:`), et c'est précisément ce qui rend visible une source
    # qu'on n'appelle plus. Le contrat testé ici reste le même : une réponse 2xx vide n'ouvre RIEN.
    assert [k for k in await redis.keys("*") if k.startswith("source_silence")] == []
    assert await redis.get("source_last_call:theirstack")


# ── le pont vers l'API ───────────────────────────────────────────────────────


async def test_le_pont_est_un_noop_sans_configuration(monkeypatch) -> None:
    monkeypatch.delenv("API_INTERNAL_URL", raising=False)
    with patch("httpx.AsyncClient.post", new=AsyncMock()) as post:
        await ba.report_provider_silent(
            "THEIRSTACK_API_KEY",
            since_iso="2026-10-11T08:00:00+00:00",
            consecutive_errors=5,
            last_reason="HTTP 403",
            degraded="x",
        )
    post.assert_not_called()


async def test_le_pont_poste_le_contrat_attendu(monkeypatch) -> None:
    monkeypatch.setenv("API_INTERNAL_URL", "http://api.internal")
    monkeypatch.setenv("INTERNAL_API_SECRET", "s")
    resp = httpx.Response(202, request=httpx.Request("POST", "http://api.internal"))
    with patch("httpx.AsyncClient.post", new=AsyncMock(return_value=resp)) as post:
        await ba.report_provider_silent(
            "THEIRSTACK_API_KEY",
            since_iso="2026-10-11T08:00:00+00:00",
            consecutive_errors=5,
            last_reason="HTTP 403",
            degraded="Des offres manquent.",
            resolved=True,
        )
    url = post.await_args.args[0]
    assert url == "http://api.internal/internal/admin/backoffice-alerts/provider-silent"
    assert post.await_args.kwargs["json"] == {
        "source": "THEIRSTACK_API_KEY",
        "sinceIso": "2026-10-11T08:00:00+00:00",
        "consecutiveErrors": 5,
        "lastReason": "HTTP 403",
        "degraded": "Des offres manquent.",
        "resolved": True,
    }


async def test_le_pont_du_silence_par_inaction_a_sa_propre_route(monkeypatch) -> None:
    """ALERTES-402 — « plus appelée depuis N jours » ne compte aucune erreur : elle part sur
    `provider-unused`, dont le contrat n'exige pas de compteur d'erreurs (celui de `provider-silent`
    en réclame au moins une, sinon la phrase serait fausse)."""
    monkeypatch.setenv("API_INTERNAL_URL", "http://api.internal")
    monkeypatch.setenv("INTERNAL_API_SECRET", "s")
    resp = httpx.Response(202, request=httpx.Request("POST", "http://api.internal"))
    with patch("httpx.AsyncClient.post", new=AsyncMock(return_value=resp)) as post:
        await ba.report_provider_unused(
            "THEIRSTACK_API_KEY",
            last_call_iso="2026-10-26T08:00:00+00:00",
            days=4,
            degraded="Des offres manquent.",
        )
    assert post.await_args.args[0] == "http://api.internal/internal/admin/backoffice-alerts/provider-unused"
    assert post.await_args.kwargs["json"] == {
        "source": "THEIRSTACK_API_KEY",
        "lastCallIso": "2026-10-26T08:00:00+00:00",
        "days": 4,
        "degraded": "Des offres manquent.",
    }


async def test_le_pont_ne_leve_jamais(monkeypatch) -> None:
    monkeypatch.setenv("API_INTERNAL_URL", "http://api.internal")
    monkeypatch.setenv("INTERNAL_API_SECRET", "s")
    with patch("httpx.AsyncClient.post", new=AsyncMock(side_effect=httpx.ConnectError("down"))):
        await ba.report_provider_silent(
            "THEIRSTACK_API_KEY",
            since_iso="2026-10-11T08:00:00+00:00",
            consecutive_errors=5,
            last_reason="HTTP 403",
            degraded="x",
        )


async def test_onze_rate_limit_timeout_ne_disent_rien(redis, report) -> None:
    """16/10 — notre limiteur n'est pas la source : aucun compteur, aucun e-mail."""
    await _errors(11, provider="adzuna", reason="RateLimitTimeout")
    await _errors(3, provider="adzuna", reason="rate limit slot 'x' not available")
    await _errors(3, provider="adzuna", reason="[time_budget] épuisé")
    report.assert_not_called()
    assert not await redis.hgetall("source_silence:adzuna")


async def test_l_attente_limiteur_est_neutre_ni_compte_ni_remise_a_zero(redis, report) -> None:
    await _errors(4, provider="adzuna", reason="HTTP 503")
    await _errors(5, provider="adzuna", reason="RateLimitTimeout")
    assert int((await redis.hgetall("source_silence:adzuna"))["count"]) == 4
    await _errors(1, provider="adzuna", reason="HTTP 503")
    report.assert_awaited_once()
    assert report.await_args.kwargs["consecutive_errors"] == 5


@pytest.fixture
def credits():
    with patch.object(source_silence.backoffice_alerts, "report_provider_credits_exhausted", AsyncMock()) as mock:
        yield mock


async def test_le_premier_402_dit_les_credits_pas_une_panne(redis, report, credits) -> None:
    """ALERTES-402 — un 402 ne se confirme pas : le canal « crédits épuisés » part au PREMIER, nomme la
    clé d'environnement et dit ce qui manque sans nommer le fournisseur."""
    await _errors(1, reason="HTTP 402", status=402)
    credits.assert_awaited_once()
    source, degraded = credits.await_args.args
    assert source == "THEIRSTACK_API_KEY"
    assert "offres d'emploi" in degraded
    report.assert_not_called()  # la série « muette » n'en est qu'à 1


async def test_une_panne_ne_parle_jamais_de_credits(redis, report, credits) -> None:
    await _errors(5, reason="HTTP 503", status=503)
    credits.assert_not_called()
    report.assert_called_once()


async def test_le_402_sans_redis_dit_quand_meme_les_credits(credits) -> None:
    """Le canal « crédits » ne dépend pas du compteur partagé : Redis absent, il part."""
    with patch.object(source_silence, "_redis", AsyncMock(return_value=None)):
        await _errors(1, reason="HTTP 402", status=402)
    credits.assert_awaited_once()


async def test_le_resolu_sort_meme_si_la_serie_a_disparu(redis, report) -> None:
    """ALERTES-402 point 5 — la série d'erreurs s'oublie (7 j) ou part avec un redémarrage de Redis.
    Le fait « on a alerté » vit à part, donc le [RÉSOLU] sort quand la source répond de nouveau —
    mesuré : trois alertes Mantiks en trois jours, aucun [RÉSOLU] entre elles."""
    await _errors(5)
    report.assert_called_once()
    await redis.delete("source_silence:theirstack")  # la série perdue
    report.reset_mock()
    await source_silence.record_outcome("theirstack", ok=True)
    report.assert_called_once()
    assert report.call_args.kwargs["resolved"] is True
    # Et une seule fois : le marqueur est consommé.
    report.reset_mock()
    await source_silence.record_outcome("theirstack", ok=True)
    report.assert_not_called()


@pytest.fixture
def unused():
    with patch.object(source_silence.backoffice_alerts, "report_provider_unused", AsyncMock()) as mock:
        yield mock


async def test_une_source_jamais_appelee_finit_par_le_dire(redis, unused) -> None:
    """ALERTES-402 point 1 — le premier passage AMORCE (aucune alerte : un déploiement neuf ne juge pas
    un silence qu'il n'a pas mesuré) ; un silence plus vieux que le seuil se dit, une fois par jour."""
    assert await source_silence.warn_unused(["theirstack"]) == []
    assert await redis.get("source_last_call:theirstack")  # amorcé

    vieux = (datetime.now(UTC) - timedelta(days=4)).isoformat()
    await redis.set("source_last_call:theirstack", vieux)
    assert await source_silence.warn_unused(["theirstack"]) == [("theirstack", 4)]
    source, kwargs = unused.await_args.args[0], unused.await_args.kwargs
    assert source == "THEIRSTACK_API_KEY" and kwargs["days"] == 4

    # Une fois par jour et par fournisseur : le second passage se tait.
    unused.reset_mock()
    assert await source_silence.warn_unused(["theirstack"]) == []
    unused.assert_not_called()


async def test_un_appel_recent_ne_dit_rien(redis, unused) -> None:
    await source_silence.note_call("theirstack")
    assert await source_silence.warn_unused(["theirstack"]) == []
    unused.assert_not_called()
