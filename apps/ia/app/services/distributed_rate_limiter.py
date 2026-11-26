"""Distributed token bucket backed by Redis.

The in-process throttle in ``rate_limiter`` only bounds a single Python process.
With N IA workers the real outbound rate becomes N× the configured limit, which
trips third-party 429s (Brave, Apollo, Firecrawl) and inflates the Anthropic
bill. This module shares one token bucket per provider across every process by
storing the bucket state in Redis (the stack already runs Redis for BullMQ).

Algorithm — classic token bucket, evaluated atomically server-side via a Lua
script so concurrent processes never double-spend:

    state = hash {tokens: float, ts: int(ms)}
    refill = elapsed_seconds * (rpm / 60)            # tokens regenerated
    tokens = min(burst, tokens + refill)
    if tokens >= 1: tokens -= 1 -> granted, wait = 0
    else:           wait_ms = ceil((1 - tokens) / rate_per_ms)

The script reads the clock with ``redis.call('TIME')`` so all processes agree on
elapsed time regardless of host clock skew. ``burst`` defaults to one minute of
capacity (``rpm``) so a cold bucket allows a normal warm-up burst.

Queue / wait semantics: :meth:`RedisTokenBucket.acquire` loops — when the bucket
is empty it ``await asyncio.sleep`` for the script-returned wait (clamped) and
retries, until ``max_wait_s`` elapses, at which point it raises
:class:`RateLimitTimeout`. Callers therefore *wait for a slot* instead of failing
fast when the product gets popular.

Everything here is best-effort: connection/availability is probed lazily and any
Redis error is surfaced as :class:`RedisUnavailable` so ``rate_limiter`` can fall
back to the in-process limiter. Dev and the test suite run with zero Redis.
"""

from __future__ import annotations

import asyncio
import logging
import os

import redis.asyncio as aioredis
from redis.exceptions import RedisError

logger = logging.getLogger(__name__)

# Hard ceiling on a single sleep between bucket polls. Keeps the caller
# responsive (cancellation, deadline checks) even if the script over-estimates.
_MAX_POLL_SLEEP_S = 1.0
# Floor so a near-empty bucket does not busy-spin against Redis.
_MIN_POLL_SLEEP_S = 0.01
# Key prefix — namespaced so it never collides with BullMQ keys.
_KEY_PREFIX = "bellum:ratelimit:"

# Token-bucket Lua. Returns {granted (0|1), wait_ms}. KEYS[1] = bucket key.
# ARGV: rpm, burst, now_ms_override(unused, kept 0). Clock comes from TIME.
_BUCKET_LUA = """
local key = KEYS[1]
local rpm = tonumber(ARGV[1])
local burst = tonumber(ARGV[2])
local rate_per_ms = rpm / 60000.0

local t = redis.call('TIME')
local now_ms = (tonumber(t[1]) * 1000) + math.floor(tonumber(t[2]) / 1000)

local data = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts = tonumber(data[2])
if tokens == nil then
  tokens = burst
  ts = now_ms
end

local elapsed = now_ms - ts
if elapsed < 0 then elapsed = 0 end
tokens = math.min(burst, tokens + (elapsed * rate_per_ms))

local granted = 0
local wait_ms = 0
if tokens >= 1 then
  tokens = tokens - 1
  granted = 1
else
  wait_ms = math.ceil((1 - tokens) / rate_per_ms)
end

redis.call('HSET', key, 'tokens', tokens, 'ts', now_ms)
-- TTL > the time to fully refill an empty bucket; idle keys self-expire.
local ttl = math.ceil(burst / rate_per_ms / 1000) + 60
redis.call('EXPIRE', key, ttl)

return {granted, wait_ms}
"""


class RedisUnavailable(RuntimeError):
    """Redis could not be reached — caller should fall back to in-process."""


class RateLimitTimeout(RuntimeError):
    """A slot did not free up within ``max_wait_s``."""

    #: R23 — un limiteur plein est un aléa ATTENDU, rendu à l'écran comme une dégradation
    #: nommée : il ne part pas à Sentry (voir ``sentry_init._is_expected_failure``).
    sentry_expected = True

    def __init__(self, provider: str, max_wait_s: float) -> None:
        super().__init__(
            f"rate limit slot for provider {provider!r} not available within {max_wait_s:.1f}s"
        )
        self.provider = provider
        self.max_wait_s = max_wait_s


def redis_url() -> str | None:
    """Return ``REDIS_URL`` (empty string treated as unset)."""
    url = os.environ.get("REDIS_URL")
    return url or None


# One client per (url, event-loop) — redis.asyncio binds connections to a loop,
# and production runs a single loop while tests spin up many.
_clients: dict[tuple[str, int], aioredis.Redis] = {}


async def get_client(url: str) -> aioredis.Redis:
    """Return a cached redis.asyncio client for ``url`` on the current loop.

    Raises :class:`RedisUnavailable` if a connection cannot be opened / pinged.
    """
    loop_id = id(asyncio.get_running_loop())
    key = (url, loop_id)
    client = _clients.get(key)
    if client is not None:
        return client
    try:
        client = aioredis.from_url(
            url,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=2.0,
            socket_timeout=2.0,
        )
        await client.ping()
    except (RedisError, OSError) as exc:
        raise RedisUnavailable(str(exc)) from exc
    _clients[key] = client
    return client


class RedisTokenBucket:
    """Distributed token bucket for one provider, sharing state across processes."""

    def __init__(
        self,
        client: aioredis.Redis,
        provider: str,
        rpm: int,
        *,
        burst: int | None = None,
    ) -> None:
        self.client = client
        self.provider = provider
        self.rpm = rpm
        # A cold bucket may absorb one minute of traffic at once.
        self.burst = burst if burst is not None else max(1, rpm)
        self.key = f"{_KEY_PREFIX}{provider}"
        self._script = client.register_script(_BUCKET_LUA)

    async def try_acquire(self) -> float:
        """Attempt one token. Return 0.0 if granted, else seconds to wait.

        Raises :class:`RedisUnavailable` on any Redis error.
        """
        try:
            granted, wait_ms = await self._script(
                keys=[self.key], args=[self.rpm, self.burst, 0]
            )
        except (RedisError, OSError) as exc:
            raise RedisUnavailable(str(exc)) from exc
        if int(granted) == 1:
            return 0.0
        return max(0.0, float(wait_ms) / 1000.0)

    async def acquire(self, max_wait_s: float) -> None:
        """Block until a token is granted or ``max_wait_s`` elapses.

        Raises :class:`RateLimitTimeout` on deadline, :class:`RedisUnavailable`
        if Redis errors mid-wait.
        """
        loop = asyncio.get_running_loop()
        deadline = loop.time() + max_wait_s
        while True:
            wait = await self.try_acquire()
            if wait == 0.0:
                return
            remaining = deadline - loop.time()
            if remaining <= 0:
                raise RateLimitTimeout(self.provider, max_wait_s)
            sleep_for = min(wait, remaining, _MAX_POLL_SLEEP_S)
            sleep_for = max(sleep_for, _MIN_POLL_SLEEP_S)
            await asyncio.sleep(sleep_for)


def _reset_clients_for_tests() -> None:
    """Drop the cached clients. Tests inject fakeredis between cases."""
    _clients.clear()
