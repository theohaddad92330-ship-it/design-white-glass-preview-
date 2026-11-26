"""CACHE-LLM (Louis 15/10) — le cache de RÉPONSE des appels LLM NEUTRES (classe A).

« Du cache sur Mistral et Anthropic — souvent des appels (ou des parties) sont
neutres. » Le cache est COMMUN à tous les espaces (jamais une clé par
utilisateur) et ne sert QUE les appels d'une liste blanche explicite : un appel
de classe C (chat, brouillons, corps de messages, notes) n'y passe jamais.

Ce que ces tests prouvent, dans l'ordre de la demande :

* classe A appelée deux fois → UN appel réseau ;
* deux espaces différents → UN appel (la clé ne porte aucun espace) ;
* prompt modifié → nouvel appel (l'empreinte du prompt est dans la clé) ;
* classe C → jamais en cache (refus explicite, et garde sur la liste blanche) ;
* sortie invalide / tronquée / en échec → jamais écrite ;
* chaque appel écrit sa ligne « llm <rôle> cache_réponse=… » sans contenu.
"""

from __future__ import annotations

import logging
from typing import Any

import pytest
from pydantic import BaseModel

from app.services import claude_service, llm_response_cache
from app.services.claude_service import CallMetadata, TokenUsage, call_claude

_ROLE = "bellum_search_entity_extract"


class _MemoryCache:
    """Le stockage partagé (`provider_cache`), en mémoire : un seul dictionnaire
    pour TOUS les espaces — exactement la promesse « commun à tout le monde »."""

    def __init__(self) -> None:
        self.store: dict[tuple[str, str], Any] = {}
        self.writes = 0

    async def get_json(self, namespace: str, key: str) -> Any:
        return self.store.get((namespace, key))

    async def set_json(self, namespace: str, key: str, value: Any, ttl: int | None = None) -> None:
        self.writes += 1
        self.ttl = ttl
        self.store[(namespace, key)] = value


class _Gateway:
    """Le réseau : compte les appels réellement partis."""

    def __init__(self, result: Any = "ACME", *, stop_reason: str | None = "end_turn", fail: bool = False) -> None:
        self.calls = 0
        self.result = result
        self.stop_reason = stop_reason
        self.fail = fail
        self.metadata: list[CallMetadata] = []

    async def complete(self, task, system_prompt, user_prompt, **kwargs):  # noqa: ANN001, ANN003
        self.calls += 1
        self.metadata.append(kwargs["metadata"])
        if self.fail:
            raise RuntimeError("panne fournisseur")
        usage = TokenUsage(
            input_tokens=10, output_tokens=2, model=kwargs["model"], cost_usd=0.001, stop_reason=self.stop_reason
        )
        return self.result, usage


@pytest.fixture
def cache(monkeypatch: pytest.MonkeyPatch) -> _MemoryCache:
    memory = _MemoryCache()
    monkeypatch.setattr(llm_response_cache.provider_cache, "get_json", memory.get_json)
    monkeypatch.setattr(llm_response_cache.provider_cache, "set_json", memory.set_json)
    return memory


def _gateway(monkeypatch: pytest.MonkeyPatch, **kwargs: Any) -> _Gateway:
    gateway = _Gateway(**kwargs)
    monkeypatch.setattr("app.services.llm_gateway.complete", gateway.complete)
    return gateway


async def _call(user: str = "fais-moi le point sur ACME", system: str = "Extrais le nom.", **kwargs: Any):
    kwargs.setdefault("response_model", None)
    return await call_claude(system, user, prompt_name=_ROLE, max_tokens=40, response_cache=True, **kwargs)


# ── classe A : un appel, puis le cache ───────────────────────────────────────


@pytest.mark.asyncio
async def test_a_neutral_call_made_twice_goes_out_once(monkeypatch, cache) -> None:
    gateway = _gateway(monkeypatch)
    first, _ = await _call()
    second, usage = await _call()
    assert first == second == "ACME"
    assert gateway.calls == 1, "le second appel identique ne doit pas repartir sur le réseau"
    assert usage.input_tokens == 0 and usage.output_tokens == 0, "un hit ne consomme aucun jeton"
    assert cache.ttl == llm_response_cache.CACHE_TTL_LLM_S


@pytest.mark.asyncio
async def test_two_workspaces_share_one_network_call(monkeypatch, cache) -> None:
    """La clé ne porte NI espace NI utilisateur : deux espaces, deux corrélations,
    une seule sortie réseau."""
    gateway = _gateway(monkeypatch)
    await _call(correlation_id="espace-A-run-1")
    await _call(correlation_id="espace-B-run-9")
    assert gateway.calls == 1


@pytest.mark.asyncio
async def test_a_changed_prompt_goes_back_to_the_network(monkeypatch, cache) -> None:
    gateway = _gateway(monkeypatch)
    await _call(system="Extrais le nom.")
    await _call(system="Extrais le nom de l'entreprise, sans guillemets.")
    assert gateway.calls == 2, "l'empreinte du prompt est dans la clé : un prompt modifié invalide"


@pytest.mark.asyncio
async def test_output_changing_parameters_are_in_the_key(monkeypatch, cache) -> None:
    gateway = _gateway(monkeypatch)
    await _call()
    await call_claude(
        "Extrais le nom.", "fais-moi le point sur ACME", prompt_name=_ROLE, max_tokens=80, response_cache=True
    )
    await _call(model="claude-haiku-4-5")
    assert gateway.calls == 3


@pytest.mark.asyncio
async def test_the_input_is_normalised_before_keying(monkeypatch, cache) -> None:
    gateway = _gateway(monkeypatch)
    await _call(user="fais-moi le point sur ACME")
    await _call(user="  fais-moi   le point\r\nsur ACME  ")
    assert gateway.calls == 1


# ── jamais écrit : échec, troncature, sortie invalide ────────────────────────


@pytest.mark.asyncio
async def test_a_failed_call_is_never_written(monkeypatch, cache) -> None:
    _gateway(monkeypatch, fail=True)
    with pytest.raises(RuntimeError):
        await _call()
    assert cache.writes == 0


@pytest.mark.asyncio
async def test_a_truncated_output_is_never_written(monkeypatch, cache) -> None:
    gateway = _gateway(monkeypatch, stop_reason="max_tokens")
    await _call()
    await _call()
    assert cache.writes == 0
    assert gateway.calls == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("result", ["", "   ", None])
async def test_an_empty_text_output_is_never_written(monkeypatch, cache, result) -> None:
    _gateway(monkeypatch, result=result)
    await _call()
    assert cache.writes == 0


@pytest.mark.asyncio
async def test_an_invalid_json_output_is_never_written(monkeypatch, cache) -> None:
    _gateway(monkeypatch, result="pas un objet")
    await _call(response_model=dict)
    _gateway(monkeypatch, result={})
    await _call(response_model=dict, user="autre entrée")
    assert cache.writes == 0


@pytest.mark.asyncio
async def test_a_caller_validator_refusing_the_output_blocks_the_write(monkeypatch, cache) -> None:
    _gateway(monkeypatch, result={"company": None})
    await _call(response_model=dict, response_cache_validate=lambda out: bool(out.get("company")))
    assert cache.writes == 0


class _Company(BaseModel):
    name: str


@pytest.mark.asyncio
async def test_a_structured_output_round_trips_through_its_schema(monkeypatch, cache) -> None:
    gateway = _gateway(monkeypatch, result=_Company(name="ACME"))
    await _call(response_model=_Company)
    again, _ = await _call(response_model=_Company)
    assert isinstance(again, _Company) and again.name == "ACME"
    assert gateway.calls == 1


@pytest.mark.asyncio
async def test_a_cached_entry_that_no_longer_fits_the_schema_is_a_miss(monkeypatch, cache) -> None:
    gateway = _gateway(monkeypatch, result=_Company(name="ACME"))
    await _call(response_model=_Company)
    for key in list(cache.store):
        cache.store[key] = {"v": {"autre": 1}}
    await _call(response_model=_Company)
    assert gateway.calls == 2


# ── classe C : jamais par le cache ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_a_role_outside_the_allowlist_is_refused(monkeypatch, cache) -> None:
    gateway = _gateway(monkeypatch)
    with pytest.raises(ValueError, match="liste blanche"):
        await call_claude("s", "u", prompt_name="bellum_chat_title", response_cache=True)
    assert gateway.calls == 0 and cache.writes == 0


@pytest.mark.asyncio
async def test_without_opt_in_nothing_touches_the_cache(monkeypatch, cache) -> None:
    gateway = _gateway(monkeypatch)
    await call_claude("Extrais le nom.", "ACME", prompt_name=_ROLE)
    await call_claude("Extrais le nom.", "ACME", prompt_name=_ROLE)
    assert gateway.calls == 2 and cache.writes == 0
    assert all(meta.response_cache == "exclu" for meta in gateway.metadata)


def test_the_allowlist_and_the_private_calls_never_meet() -> None:
    """La garde : aucun rôle de classe C n'est dans la liste blanche, et la liste
    des rôles privés n'est pas vide (sinon la garde serait verte pour rien)."""
    assert llm_response_cache.PRIVATE_ROLES, "la garde ne lit rien"
    assert not set(llm_response_cache.RESPONSE_CACHE_ALLOWLIST) & llm_response_cache.PRIVATE_ROLES
    for role, reason in llm_response_cache.RESPONSE_CACHE_ALLOWLIST.items():
        assert reason.strip(), f"{role} : un appel en liste blanche dit POURQUOI il est neutre"


def test_the_guard_says_no() -> None:
    with pytest.raises(ValueError):
        llm_response_cache.require_allowed("bellum_chat")
    with pytest.raises(ValueError):
        llm_response_cache.require_allowed("rôle-inconnu")
    llm_response_cache.require_allowed(_ROLE)


# ── mesure ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_each_call_logs_its_cache_line_without_content(monkeypatch, cache, caplog) -> None:
    _gateway(monkeypatch)
    secret = "Jean Dupont chez ACME"
    with caplog.at_level(logging.INFO):
        await _call(user=secret)
        await _call(user=secret)
    lines = [r.getMessage() for r in caplog.records if r.getMessage().startswith("llm ")]
    assert any(f"llm {_ROLE} cache_réponse=hit cache_prompt_lu=0 écrit=0" == line for line in lines), lines
    assert all("Dupont" not in r.getMessage() for r in caplog.records)


def test_log_usage_reports_prompt_cache_reads_and_the_response_cache_status(caplog) -> None:
    usage = TokenUsage(
        input_tokens=5,
        output_tokens=1,
        model="claude-sonnet-4-6",
        cost_usd=0.0,
        cache_read_tokens=1200,
        cache_creation_tokens=300,
    )
    with caplog.at_level(logging.INFO):
        claude_service._log_usage(usage, CallMetadata(prompt_name="bellum_chat"))
    assert "llm bellum_chat cache_réponse=exclu cache_prompt_lu=1200 écrit=300" in caplog.text
