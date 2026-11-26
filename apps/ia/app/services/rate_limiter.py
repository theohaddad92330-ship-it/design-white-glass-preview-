"""Per-provider outbound throttling.

Each external provider is gated by a token bucket (rate, requests per minute)
plus an ``asyncio.Semaphore`` (concurrency, in-flight requests). The public API is
a single async context manager::

    async with throttle("claude"):
        ... call the provider ...

When ``REDIS_URL`` is set **and** Redis is reachable, the rate gate is a
**distributed** token bucket (``distributed_rate_limiter``) shared by every IA
process, so the real outbound rate stays at the configured limit no matter how
many workers run. Otherwise — dev, the test suite, or a Redis outage — it
transparently falls back to the **in-process** ``aiolimiter.AsyncLimiter``. The
fallback is logged once per provider so it is observable.

Queue / wait semantics: both paths make the caller *wait* for a slot rather than
fail fast, and **both stop at the same deadline** — ``{PROVIDER}_MAX_WAIT``
seconds (default 30), then ``RateLimitTimeout``. The in-process fallback used to
wait without any bound, which meant a Redis outage did not degrade latency, it
removed the budget: measured on ``POST /api/ia/chat`` (#1191), 502 after 120 076
ms — the *caller's* budget, never the turn's 90 s guard. Concurrency is always
capped locally, and is taken only once a rate token is in hand, so a caller that
times out here frees nothing it never held.

Defaults (from the ENG-57 ticket plus the new data sources):

    Claude                 50 req/min,  10 concurrent
    Claude (copilote)      30 req/min,   4 concurrent   (seau séparé, interactif)
    Brave                  60 req/min   (1 req/s),       5 concurrent
    Apollo                 60 req/min,  10 concurrent
    Pappers               600 req/min   (10 req/s),     20 concurrent
    Firecrawl              20 req/min,   5 concurrent
    Insee                  30 req/min,   5 concurrent   (Sirene API cap)
    France Travail         60 req/min,   5 concurrent
    INPI                   30 req/min,   3 concurrent
    BODACC                 60 req/min,   5 concurrent
    Recherche Entreprises  50 req/min,   5 concurrent
    DECP / BOAMP           30 req/min,   3 concurrent
    GitHub                  5 req/min,   1 concurrent   (anon quota = 60/HOUR)

A key listed here is a PROMISE about our outbound rate, and a promise nothing
enforces is worse than no promise: ``bodacc``, ``insee``, ``france_travail`` and
``inpi`` sat in this table with a documented rpm and **zero call sites**, so the
budget everyone read here was applied nowhere. ``tests/
test_upstream_throttle_coverage.py`` now fails on any key that loses its last
call site — remove the key if the provider goes away, don't leave the promise.

Each value can be overridden through environment variables of the form
``{PROVIDER}_RPM``, ``{PROVIDER}_CONCURRENCY`` and ``{PROVIDER}_MAX_WAIT``.
Invalid values fall back to the defaults with a warning so a typo can never
disable the throttle.

#2521 — a provider that publishes a PER-SECOND cap (``PUBLIC_RATE_PER_SECOND``)
also gets its request starts SPACED (``{PROVIDER}_RPS``), because a one-minute
bucket lets a whole minute out at once. And a caller with its own time budget
wraps its work in ``wait_deadline(...)``: every wait (token, slot, cooldown)
is then bounded by that budget and fails fast instead of sleeping past it.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar

from aiolimiter import AsyncLimiter

from app.services.distributed_rate_limiter import (
    RateLimitTimeout,
    RedisTokenBucket,
    RedisUnavailable,
    get_client,
    redis_url,
)

logger = logging.getLogger(__name__)

WAIT_WARNING_THRESHOLD_S = 2.0
DEFAULT_MAX_WAIT_S = 30.0

_DEFAULTS: dict[str, dict[str, int]] = {
    # concurrency MUST stay >= the widest parallel fan-out we issue, or the tail
    # of that fan-out serialises behind the semaphore for a full round-trip.
    # Phase 4 fires 11 calls at once (5 plan phases + 5 sections + messages,
    # phase4_plan.py) — at 10 the 11th waited for a Sonnet call to finish, adding
    # a whole extra round-trip to EVERY analysis. 12 leaves one slot of headroom.
    "claude": {"rpm": 50, "concurrency": 12},
    # Le COPILOTE a son propre seau (16/08/2026). Il prenait ses jetons dans
    # ``claude``, celui du fan-out d'analyse : pendant un run, chaque appel d'un
    # tour attendait derrière des lots de fond de 60 à 105 s, jusqu'à 30 s de
    # queue par appel — un clic de commercial se réglait donc sur le rythme d'un
    # traitement par lots, et le tour dépassait le budget de l'appelant. Un seau
    # séparé ne change rien au plafond réel du compte Anthropic ; il empêche le
    # travail de fond de manger la file de l'interactif. Volumes sans commune
    # mesure (quelques appels par message contre des centaines par run), d'où des
    # valeurs basses : elles protègent, elles ne bornent pas l'usage.
    "claude_chat": {"rpm": 30, "concurrency": 4},
    # #3085.1 (18/10) — ``claude_chat`` est désormais le budget d'UN utilisateur (``throttle("claude_chat@<id>")``) ; ce seau
    # GLOBAL au-dessus tient le plafond réel du compte fournisseur, tous utilisateurs confondus. Large : il protège,
    # il ne fait pas attendre deux membres l'un derrière l'autre.
    "claude_chat_global": {"rpm": 120, "concurrency": 16},
    "brave": {"rpm": 60, "concurrency": 5},
    "apollo": {"rpm": 60, "concurrency": 10},
    # SalesQL — second source in the contact-enrichment cascade (env-gated).
    # Conservative; the real cap depends on the plan.
    "salesql": {"rpm": 60, "concurrency": 5},
    "pappers": {"rpm": 600, "concurrency": 20},
    "firecrawl": {"rpm": 20, "concurrency": 10},
    # New parallel data sources (conservative; insee uses its real Sirene cap).
    "insee": {"rpm": 30, "concurrency": 5},
    # #4045 (14/10) — Découvrir interroge désormais une PAGE entière en
    # parallèle (`SIGNALS_CONCURRENCY`, discover.py) : à `concurrency: 5`,
    # les candidats de fin de page faisaient la queue derrière ce seau plus
    # qu'une page ne tient dans `SIGNALS_SOURCE_BUDGET_S` (6 s) et perdaient
    # leur recrutement — mesuré (`tests/perf/mesure_decouvrir_profondeur_14_10.py`) :
    # à 1,5 s/requête, seules les 9 premières cartes sur 24 gardaient leur
    # signal. Monter la CONCURRENCE n'élargit pas la promesse de débit
    # (`rpm`, inchangé) : elle laisse tourner en parallèle ce que le seau de
    # débit autorisait déjà en rafale (``AsyncLimiter`` démarre plein).
    "france_travail": {"rpm": 60, "concurrency": 20},
    "inpi": {"rpm": 30, "concurrency": 3},
    "bodacc": {"rpm": 60, "concurrency": 5},
    # Public, unauthenticated, per-IP budget shared by EVERY run on the instance.
    # #4419.30 — 120/min : revient sur #631 (50/5), décision Louis 25/10. La source
    # publie 7 req/s par IP ; la vraie borne reste l'espacement par processus
    # (`PUBLIC_RATE_PER_SECOND` 2/s = 120/min, ×2 répliques = 4/s, trois requêtes
    # de marge). À 50/min, /discover/signals (jusqu'à 120 noms) faisait 2,4 min de
    # file pure. Concurrence inchangée.
    "recherche_entreprises": {"rpm": 120, "concurrency": 5},
    # Opendatasoft portals (data.economie.gouv.fr / BOAMP): free, no key, per-IP.
    # Single-shot per analysis, so a modest bucket costs no latency.
    "decp": {"rpm": 30, "concurrency": 3},
    # Découpage administratif (geo.api.gouv.fr) : libre, sans clé, per-IP. Il est
    # appelé à la frappe dans le champ « ville » de Territoire — donc plus souvent
    # que les autres — mais chaque réponse est mise en cache 24 h (le découpage ne
    # bouge qu'aux arrêtés de fusion), si bien que le trafic réel est celui des
    # noms DISTINCTS cherchés, pas des frappes.
    "geo-communes": {"rpm": 120, "concurrency": 5},
    # #4361.2 — index ouvert des sociétés cotées : une requête par jour et par process (index en
    # mémoire 24 h) ; l'enveloppe est celle d'un service public gratuit, jamais un débit.
    "listed-companies": {"rpm": 6, "concurrency": 1},
    "boamp": {"rpm": 30, "concurrency": 3},
    # #4116 — API TED (UE) : publique, sans clé, per-IP ; même enveloppe que BOAMP.
    # DISCOVER-PARTIEL-2 (16/10) — SÉRIE : dix candidats d'une page en parallèle sur TED
    # récoltaient des 429 en rafale (mesuré le 16/10). Le débit (`rpm`) ne bouge pas.
    "ted": {"rpm": 30, "concurrency": 1},
    # GitHub ANONYMOUS is 60 requests/HOUR — the lowest ceiling in the stack by an
    # order of magnitude, and org_tech_signals spends 3-4 of them per company.
    # concurrency=1 is the load-bearing setting: it stops the per-company burst,
    # which is what actually trips the quota wall. rpm=5 keeps us from spending
    # the whole hour in the first minute without stalling the pipeline behind a
    # 30 s MAX_WAIT. With GITHUB_TOKEN the real ceiling is 5000/h — raise
    # GITHUB_RPM alongside the token.
    "github": {"rpm": 5, "concurrency": 1},
    # IA v2 Data Gateway search providers (conservative — real caps depend on plan).
    "serper": {"rpm": 60, "concurrency": 5},
    "tavily": {"rpm": 60, "concurrency": 5},
    # Sources emploi complémentaires (roadmap §8) — gentle: free public portal
    # (APEC, opt-in) / operator-supplied Algolia creds (WTTJ, no-op by default).
    # #4045 (14/10) — même correctif que ``france_travail`` ci-dessus : à
    # `concurrency: 3`, une page Découvrir pleine (24 candidats en parallèle,
    # `SIGNALS_CONCURRENCY`) vidait ce seau en quelques rangs et le reste de
    # la page dépassait `SIGNALS_SOURCE_BUDGET_S` avant de recevoir une
    # réponse. `rpm` (la promesse de débit publique) reste 20 — seule la
    # concurrence monte, jusqu'au burst que ce débit autorisait déjà.
    "apec": {"rpm": 20, "concurrency": 12},
    # Boards ATS publics (Greenhouse, Lever) : sans authentification et sans
    # quota publié. On reste poli — un board se lit en une requête, et une
    # entreprise sans board répond 404 tout de suite.
    "greenhouse": {"rpm": 60, "concurrency": 5},
    "lever": {"rpm": 60, "concurrency": 5},
    # #3925 — cinq ATS publics de plus (`ats_boards_more`), même politesse.
    "workable": {"rpm": 60, "concurrency": 5},
    "smartrecruiters": {"rpm": 60, "concurrency": 5},
    "recruitee": {"rpm": 60, "concurrency": 5},
    "teamtailor": {"rpm": 60, "concurrency": 5},
    "personio": {"rpm": 60, "concurrency": 5},
    "wttj": {"rpm": 30, "concurrency": 3},
    # #3885 — agrégateurs d'offres à API officielle (`job_aggregators.py`), un
    # appel par compte analysé. Adzuna : quota développeur bas, on reste sous
    # 25/min ; TheirStack est payant au résultat, la cadence n'en change pas le coût.
    "adzuna": {"rpm": 20, "concurrency": 2},
    "jooble": {"rpm": 30, "concurrency": 3},
    "theirstack": {"rpm": 30, "concurrency": 3},
    # #3885 (lot RAV) — Mantiks (2 appels / compte, dont 1 crédit) et Fantastic.jobs.
    # ALERTES-402 (30/10/2026) — MÊME correctif que `ted` ci-dessus : à `concurrency: 3`, Mantiks rendait
    # des 429 en RAFALE (mesuré sur les alertes « source muette » : 5 erreurs consécutives en moins de
    # 2 s, trois fois en trois jours — 28/10 17:57, 29/10 16:03, 30/10 11:37). Deux requêtes sont déjà
    # parties quand le premier 429 revient, et le refroidissement de `back_off_provider` est PAR
    # PROCESSUS. `rpm` (la promesse de débit) ne bouge pas : seule la rafale disparaît.
    "mantiks": {"rpm": 30, "concurrency": 1},
    "fantastic_jobs": {"rpm": 30, "concurrency": 3},
    # Pages carrières publiques (#3925.1) : cadence interne ≥ 1 s par hôte en plus.
    # #3925.a — budget PAR DOMAINE (`throttle_per_domain`), jamais un seau global.
    "careers_pages": {"rpm": 30, "concurrency": 2},
    # #3925.a — flux RSS de presse : budget PAR DOMAINE de média, en plus de l'écart
    # ≥ 1 s par hôte et du cache 30 min de `press_rss`.
    "press_rss": {"rpm": 20, "concurrency": 2},
    # Country-pack registries (conservative; free public portals — stay gentle).
    "zefix": {"rpm": 30, "concurrency": 5},  # Zefix free API (CH)
    "kbo": {"rpm": 20, "concurrency": 3},  # KBO Public Search portal (BE)
    "sec_edgar": {"rpm": 120, "concurrency": 5},  # SEC fair-access cap = 10 req/s (US)
    "cbr": {"rpm": 30, "concurrency": 3},  # Canada's Business Registries search (CA)
    # #4016 L13a — GLEIF public API (LU), documented cap 60 req/min per user.
    "gleif": {"rpm": 50, "concurrency": 3},
}

# #2521 — les sources qui publient une limite PAR SECONDE, et le débit auquel on
# ESPACE nos départs vers elles (par processus).
#
# Le seau par minute ne suffit pas : sa rafale vaut une minute entière (50
# jetons), si bien que 50 requêtes partent d'un coup, bornées par la seule
# concurrence — mesuré en production le 17/09/2026, « Ta cible » (5 secteurs) a
# reçu un 429 du registre public pendant qu'une sonde extérieure obtenait un 200
# en 0,2 s. C'est la RAFALE qui est refusée, pas le volume.
#
# `recherche_entreprises` : « L'API accepte au maximum 7 requêtes par seconde
# par adresse IP » (openapi.json de l'API, lu le 17/09/2026). La limite est par
# IP, l'espacement par PROCESSUS : `apps/ia/railway.json` déclare 2 répliques
# (1 travailleur uvicorn chacune).
#
# #2521 (suite) — 3/s laissait 3×2=6/s, UNE requête de marge sous la limite de
# 7/s. Mesuré en production le 17/09/2026 (recette 13, ~13:30) : une recherche
# SIMPLE (un secteur + une ville) a quand même reçu un 429. La marge d'une
# requête ne suffit pas — l'adresse de sortie est PARTAGÉE par d'autres
# appelants du même processus (préremplissage, `/discover/signals`, d'autres
# utilisateurs en même temps), qui consomment leur propre part du même 7/s sans
# que ce limiteur les voie. 2/s laisse 2×2=4/s, trois requêtes de marge — assez
# pour que ces appelants voisins n'y ramènent pas un 429.
#
# Monter les répliques impose de baisser ce nombre —
# `tests/test_registry_public_rate.py` le vérifie. Surcharge :
# `RECHERCHE_ENTREPRISES_RPS` (une valeur illisible ou ≤ 0 garde le défaut).
#
# `france_travail` — #4045 (commit fd04306e97, 14/10 matin) avait monté la
# CONCURRENCE (5→20) pour qu'une page Découvrir pleine (24 candidats en
# parallèle) ne perde plus son recrutement en fin de page. Mesuré en prod le
# 14/10 l'après-midi (429335a9c8, `/discover?sectors=fintech,aerospace&
# headcount=250-999`) : `rate_limit_backoff provider=france_travail` ×14 par
# recherche — la concurrence laisse désormais partir jusqu'à 20 requêtes
# QUASI SIMULTANÉMENT (``AsyncLimiter`` démarre plein, #2521 ci-dessus), une
# rafale que France Travail refuse même si le débit MOYEN (``rpm``) reste
# inchangé. Le portail développeur (francetravail.io) n'étant pas accessible
# pour vérifier son quota exact, et deux sources tierces se contredisant (3
# appels/s cité comme quota par défaut ; 10 appels/s cité ailleurs comme
# limite publiée) — un contrat qu'on ne peut pas vérifier ne se devine pas
# (même doctrine que `list_hiring_companies`, plus haut dans ce fichier) —
# l'espacement choisi tient la promesse DÉJÀ faite par `rpm: 60` (1 req/s en
# moyenne, `_DEFAULTS` ci-dessus) de façon INSTANTANÉE au lieu de la laisser
# vérifiée seulement sur la minute : il ne BAISSE rien, il empêche la rafale
# de dépasser ce qui était déjà promis. Sous la plus basse des deux bornes
# citées, marge comprise une fois les 2 répliques comptées (1/s × 2 = 2/s).
# La CONCURRENCE (20) reste inchangée : elle laisse les candidats de fin de
# page ENTRER dans la file sans attendre un sémaphore étroit (#4045), c'est
# l'espacement ci-dessous qui borne maintenant le débit RÉEL de départ.
# Surcharge : `FRANCE_TRAVAIL_RPS` (une valeur illisible ou ≤ 0 garde le défaut).
PUBLIC_RATE_PER_SECOND: dict[str, float] = {"recherche_entreprises": 2.0, "france_travail": 1.0}

# #2521 — l'échéance de l'APPELANT, portée par le contexte : une recherche
# interactive (Découvrir) n'attend jamais un jeton, un créneau ou un
# refroidissement au-delà de son propre budget. Hors d'un bloc `wait_deadline`,
# rien ne change : le plafond reste `{PROVIDER}_MAX_WAIT`.
_WAIT_DEADLINE: ContextVar[float | None] = ContextVar("throttle_wait_deadline", default=None)


@contextmanager
def wait_deadline(deadline: float | None) -> Iterator[None]:
    """Borne toute attente de ``throttle()`` à ``deadline`` (horloge monotone).

    Les tâches créées dans le bloc (``asyncio.gather``) héritent de l'échéance.
    Une attente qui ne tient pas dans ce qui reste lève ``RateLimitTimeout``
    TOUT DE SUITE — dormir pour échouer ensuite ne sert personne.
    """
    token = _WAIT_DEADLINE.set(deadline)
    try:
        yield
    finally:
        _WAIT_DEADLINE.reset(token)


def wait_budget_active() -> bool:
    """Vrai quand l'appelant a posé une échéance (``wait_deadline``)."""
    return _WAIT_DEADLINE.get() is not None


def wait_time_left() -> float | None:
    """#4518.15 — le temps qui reste avant l'échéance de l'appelant, ``None`` sans échéance posée."""
    deadline = _WAIT_DEADLINE.get()
    return None if deadline is None else deadline - time.monotonic()


# Fallback config for an unknown provider: conservative so a typo throttles
# rather than disables. ``throttle()`` still warns once when it hits this.
_UNKNOWN_DEFAULT: dict[str, int] = {"rpm": 30, "concurrency": 5}


class ProviderThrottle:
    """In-process rate (AsyncLimiter) + concurrency (Semaphore) gate.

    Reusable as an async context manager — ``throttle()`` caches one per
    (provider, event loop). When a Redis bucket is attached, ``__aenter__`` uses
    it for the rate gate and falls back to the local AsyncLimiter on any Redis
    failure; the concurrency semaphore is always local.
    """

    def __init__(
        self,
        name: str,
        rpm: int,
        concurrency: int,
        *,
        max_wait_s: float = DEFAULT_MAX_WAIT_S,
        rate_per_second: float | None = None,
    ) -> None:
        self.name = name
        self.rpm = rpm
        self.concurrency = concurrency
        self.max_wait_s = max_wait_s
        # #2521 — intervalle minimal entre deux départs (0 = pas d'espacement).
        self.min_interval_s = 1.0 / rate_per_second if rate_per_second and rate_per_second > 0 else 0.0
        self._next_slot = 0.0
        self.limiter = AsyncLimiter(max_rate=rpm, time_period=60)
        self.semaphore = asyncio.Semaphore(concurrency)
        # Set by throttle() when REDIS_URL is configured and reachable.
        self.bucket: RedisTokenBucket | None = None
        # ALERTES-402 (30/10/2026) point 3 — la tâche qui attache le seau partagé. `get_throttle` est
        # synchrone et ne peut pas l'attendre ; le PREMIER appel, lui, l'attend (borné) au lieu de
        # partir hors budget commun — c'est exactement la rafale de démarrage qu'on cherche à éviter.
        self._bucket_task: asyncio.Task[None] | None = None
        self._fallback_logged = False
        # Jusqu'à quand ce fournisseur nous a demandé de nous taire.
        self._cooldown_until = 0.0

    def back_off(self, seconds: float) -> None:
        """Le fournisseur a répondu « trop de requêtes » — on se tait.

        Un seau à jetons empêche de DÉPASSER un débit qu'on a supposé. Il ne
        sait rien du débit réel : si le fournisseur est plus strict que notre
        hypothèse, on lui envoie exactement le même flux, on récolte des 429 en
        rafale, et le seau ne s'en aperçoit jamais.

        Mesuré le 23/08/2026 sur `recherche-entreprises` : réglé à 50 req/min,
        il recevait des 429 groupés à la seconde. Le refroidissement est le
        seul retour d'information que le fournisseur nous donne — l'ignorer,
        c'est décider que notre hypothèse vaut mieux que sa réponse.

        Le plus long l'emporte : deux 429 rapprochés ne raccourcissent pas
        l'attente.
        """
        until = time.monotonic() + max(0.0, seconds)
        if until > self._cooldown_until:
            self._cooldown_until = until
            logger.warning("rate_limit_backoff provider=%s pausing=%.1fs", self.name, seconds)

    def _wait_limit(self) -> float:
        """Ce qu'on peut encore attendre : ``max_wait_s``, borné par l'échéance
        de l'appelant quand il en a posé une (#2521)."""
        deadline = _WAIT_DEADLINE.get()
        if deadline is None:
            return self.max_wait_s
        return min(self.max_wait_s, deadline - time.monotonic())

    def _within_budget(self, delay: float) -> float:
        """Le temps qu'on s'autorise à attendre, ou ``RateLimitTimeout`` si
        l'attente ne tient pas dans le budget de l'appelant (#2521)."""
        limit = self._wait_limit()
        if _WAIT_DEADLINE.get() is not None and (limit <= 0 or delay > limit):
            raise RateLimitTimeout(self.name, max(0.0, limit))
        return limit

    def _reserve_slot(self) -> float:
        """#2521 — réserve le prochain créneau de départ et rend le délai avant
        lui. Un créneau hors budget n'est PAS réservé : il lève avant."""
        if self.min_interval_s <= 0:
            return 0.0
        now = time.monotonic()
        slot = max(now, self._next_slot)
        self._within_budget(slot - now)
        self._next_slot = slot + self.min_interval_s
        return slot - now

    async def _acquire_rate(self) -> None:
        """Acquire one rate token — distributed if available, else in-process."""
        # Le refroidissement est attendu AVANT le jeton : après, on aurait
        # consommé un jeton pour une requête qu'on ne partait pas encore faire.
        remaining = self._cooldown_until - time.monotonic()
        if remaining > 0:
            # #2521 — sous budget, un refroidissement plus long que ce qui reste
            # lève tout de suite : chaque sous-requête de Découvrir attendait
            # les 30 s entières, pour un budget de 20 s.
            self._within_budget(remaining)
            await asyncio.sleep(min(remaining, self.max_wait_s))
        wait_limit = self._within_budget(0.0)
        if self.bucket is not None:
            try:
                await self.bucket.acquire(wait_limit)
                return
            except RedisUnavailable as exc:
                # Detach the broken bucket and degrade to in-process so the
                # request still goes out. Logged once per provider instance.
                self.bucket = None
                if not self._fallback_logged:
                    self._fallback_logged = True
                    logger.warning(
                        "rate_limit_redis_unavailable provider=%s falling back to in-process limiter: %s",
                        self.name,
                        exc,
                    )
            # RateLimitTimeout deliberately propagates — the queue is genuinely full.
        # Le repli est borné COMME le chemin distribué (#1191). Il ne l'était pas,
        # et c'est une différence qui se voit en production : `POST /api/ia/chat`
        # rendu en 502 après 120 076 ms, c'est-à-dire au budget de l'APPELANT
        # (120 s côté NestJS) et non à celui du tour (90 s) — la garde intérieure
        # n'avait jamais eu la main. Le budget du tour ne borne que l'aller-retour
        # Anthropic ; l'attente du jeton le PRÉCÈDE. Un `AsyncLimiter` vidé fait
        # dormir jusqu'à une minute avant qu'on parle au modèle, et on emprunte ce
        # chemin dès que Redis manque — DÉFINITIVEMENT pour ce processus, puisque
        # le seau se détache juste au-dessus. Une panne Redis doit dégrader la
        # LATENCE, pas supprimer le budget.
        try:
            await asyncio.wait_for(self.limiter.acquire(), timeout=wait_limit)
        except TimeoutError as exc:  # asyncio.TimeoutError en est l'alias depuis 3.11
            raise RateLimitTimeout(self.name, wait_limit) from exc

    async def _acquire_concurrency(self) -> None:
        if _WAIT_DEADLINE.get() is None:
            await self.semaphore.acquire()
            return
        limit = self._within_budget(0.0)
        try:
            await asyncio.wait_for(self.semaphore.acquire(), timeout=limit)
        except TimeoutError as exc:
            raise RateLimitTimeout(self.name, limit) from exc

    async def acquire(self) -> float:
        """Acquire rate token + concurrency slot. Returns the seconds waited."""
        t0 = time.monotonic()
        await self._acquire_rate()
        await self._acquire_concurrency()
        # #2521 — l'espacement se prend EN DERNIER, emplacement de concurrence en
        # main : pris avant, deux requêtes bloquées derrière la semaphore
        # repartiraient ensemble, et la rafale reviendrait par la porte arrière.
        try:
            delay = self._reserve_slot()
            if delay > 0:
                await asyncio.sleep(delay)
        except BaseException:
            self.semaphore.release()
            raise
        waited = time.monotonic() - t0
        if waited > WAIT_WARNING_THRESHOLD_S:
            logger.warning(
                "rate_limit_wait provider=%s waited=%.2fs rpm=%d concurrency=%d",
                self.name,
                waited,
                self.rpm,
                self.concurrency,
            )
        return waited

    def release(self) -> None:
        self.semaphore.release()

    # Still a usable async CM on its own (acquire/release, no metrics). Callers
    # go through ``throttle()``, which wraps this in a measured pass; this bare
    # form keeps the primitive self-contained.
    async def __aenter__(self) -> ProviderThrottle:
        await self.acquire()
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        self.release()


class _ThrottledCall:
    """One measured pass through a provider throttle.

    A fresh instance per ``async with`` — ``ProviderThrottle`` is a shared
    per-loop singleton, so it cannot hold the start time of a call without
    concurrent tasks overwriting each other's.

    Every outbound call in the codebase is wrapped in ``async with throttle(x)``,
    which makes this the one place that can measure them all: time in the call,
    time queued on our own limiter, and whether it failed. That is what feeds
    :mod:`app.services.run_metrics` and, through it, the real cost per analysis.
    """

    __slots__ = ("_throttle", "_correlation_id", "_waited", "_t0")

    def __init__(self, throttle_instance: ProviderThrottle) -> None:
        self._throttle = throttle_instance
        self._correlation_id = ""
        self._waited = 0.0
        self._t0 = 0.0

    async def __aenter__(self) -> ProviderThrottle:
        # Imported lazily: at module scope this would make rate_limiter depend on
        # the correlation-id middleware, which imports back into services.
        from app.middleware.correlation_id import get_correlation_id

        self._correlation_id = get_correlation_id() or ""
        await _await_bucket(self._throttle)
        self._waited = await self._throttle.acquire()
        self._t0 = time.monotonic()
        return self._throttle

    async def __aexit__(self, exc_type: object, *_rest: object) -> None:
        self._throttle.release()
        from app.services.run_metrics import record_call

        record_call(
            self._correlation_id,
            self._throttle.name,
            duration_ms=int((time.monotonic() - self._t0) * 1000),
            wait_ms=int(self._waited * 1000),
            ok=exc_type is None,
        )


def _read_env_int(provider: str, key: str, default: int) -> int:
    raw = os.environ.get(f"{provider.upper()}_{key}")
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError:
        logger.warning(
            "invalid %s_%s=%r, using default %d",
            provider.upper(),
            key,
            raw,
            default,
        )
        return default


def _read_env_float(provider: str, key: str, default: float) -> float:
    raw = os.environ.get(f"{provider.upper()}_{key}")
    if raw is None or raw == "":
        return default
    try:
        return float(raw)
    except ValueError:
        logger.warning(
            "invalid %s_%s=%r, using default %s",
            provider.upper(),
            key,
            raw,
            default,
        )
        return default


def _rate_per_second(provider: str) -> float | None:
    """#2521 — le débit d'espacement : `{PROVIDER}_RPS`, sinon le défaut publié.
    Une valeur ≤ 0 ou illisible garde le défaut : une faute de frappe ne coupe
    jamais l'espacement d'une source qui limite par seconde."""
    default = PUBLIC_RATE_PER_SECOND.get(provider)
    if default is None:
        return None
    value = _read_env_float(provider, "RPS", default)
    return value if value > 0 else default


# AsyncLimiter and redis.asyncio clients bind to their creating event loop; cache
# per (provider, loop id) so we never reuse across loops (production runs one
# loop, tests run many).
_throttles: dict[tuple[str, int], ProviderThrottle] = {}
_unknown_warned: set[str] = set()


def _config_for(provider: str) -> dict[str, int]:
    if provider in _DEFAULTS:
        return _DEFAULTS[provider]
    if provider not in _unknown_warned:
        _unknown_warned.add(provider)
        logger.warning(
            "throttle: unknown provider %r, using conservative default rpm=%d concurrency=%d",
            provider,
            _UNKNOWN_DEFAULT["rpm"],
            _UNKNOWN_DEFAULT["concurrency"],
        )
    return _UNKNOWN_DEFAULT


#: #3085.1 (18/10) — seaux PAR PORTÉE : ``"claude_chat@<utilisateur>"`` = le budget déclaré de ``claude_chat`` appliqué
#: à CET utilisateur seul. Bornés (le plus ancien sort) ; en mémoire du processus, sans seau Redis par utilisateur.
SCOPE_SEPARATOR = "@"
_scoped_throttles: dict[tuple[str, int], ProviderThrottle] = {}
_MAX_SCOPED_BUCKETS = 2048


def _scoped_throttle(provider: str) -> ProviderThrottle:
    """Le seau d'une portée. L'instance garde le nom du fournisseur : les mesures (``run_metrics``) ne portent
    jamais un identifiant d'utilisateur. Fournisseur de base non déclaré → ``KeyError`` (jamais un défaut muet)."""
    base = provider.split(SCOPE_SEPARATOR, 1)[0]
    if base not in _DEFAULTS:
        raise KeyError(base)
    key = (provider, id(asyncio.get_running_loop()))
    instance = _scoped_throttles.get(key)
    if instance is None:
        d = _DEFAULTS[base]
        instance = ProviderThrottle(
            base,
            rpm=_read_env_int(base, "RPM", d["rpm"]),
            concurrency=_read_env_int(base, "CONCURRENCY", d["concurrency"]),
            max_wait_s=_read_env_float(base, "MAX_WAIT", DEFAULT_MAX_WAIT_S),
        )
        while len(_scoped_throttles) >= _MAX_SCOPED_BUCKETS:
            _scoped_throttles.pop(next(iter(_scoped_throttles)))
        _scoped_throttles[key] = instance
    return instance


def get_throttle(provider: str) -> ProviderThrottle:
    """The shared per-event-loop ``ProviderThrottle`` for ``provider``.

    Same public API as before — used as ``async with throttle(provider): ...``.
    Unknown providers fall back to a conservative default (logged once) instead
    of disabling the throttle. Must be called from inside a running event loop.

    When ``REDIS_URL`` is set the throttle is wired to a distributed Redis token
    bucket on first use (scheduled lazily so the synchronous factory stays sync);
    if Redis is unreachable it degrades to the in-process limiter.
    """
    if SCOPE_SEPARATOR in provider:
        return _scoped_throttle(provider)
    loop = asyncio.get_running_loop()
    loop_id = id(loop)
    key = (provider, loop_id)
    cached = _throttles.get(key)
    if cached is not None:
        return cached

    d = _config_for(provider)
    instance = ProviderThrottle(
        provider,
        rpm=_read_env_int(provider, "RPM", d["rpm"]),
        concurrency=_read_env_int(provider, "CONCURRENCY", d["concurrency"]),
        max_wait_s=_read_env_float(provider, "MAX_WAIT", DEFAULT_MAX_WAIT_S),
        rate_per_second=_rate_per_second(provider),
    )
    _throttles[key] = instance

    url = redis_url()
    if url is not None:
        # Wire the distributed bucket lazily — connecting is async and the factory
        # is sync. If the connect fails, the bucket stays None and the throttle
        # uses the in-process limiter, which is exactly the desired fallback.
        instance._bucket_task = loop.create_task(_attach_bucket(instance, url))
    return instance


def throttle(provider: str) -> _ThrottledCall:
    """``async with throttle(provider): ...`` — same public API as always.

    Returns a FRESH wrapper per call (the underlying throttle stays a shared
    singleton) so each pass can be timed independently. That makes this the one
    seam instrumenting every outbound call; see :mod:`app.services.run_metrics`.
    """
    return _ThrottledCall(get_throttle(provider))


async def _await_bucket(instance: ProviderThrottle) -> None:
    """ALERTES-402 point 3 — attend (au plus ``BUCKET_ATTACH_WAIT_S``) que le seau PARTAGÉ soit en place.

    Avant : ``get_throttle`` lançait le rattachement en tâche de fond et rendait la main aussitôt ; les
    premiers appels d'une boucle neuve passaient donc par le limiteur LOCAL, hors budget commun — une
    rafale au démarrage, invisible, exactement celle qui récolte des 429. Jamais bloquant au-delà de la
    borne, jamais une exception : un Redis absent ou lent retombe sur le limiteur local, comme avant."""
    task = instance._bucket_task
    if task is None:
        return
    if task.done():
        instance._bucket_task = None
        return
    try:
        await asyncio.wait_for(asyncio.shield(task), timeout=BUCKET_ATTACH_WAIT_S)
    except Exception as exc:  # noqa: BLE001 — best-effort : on part sur le limiteur local
        logger.debug("rate_limit_bucket_attente provider=%s %s", instance.name, exc)
    if task.done():
        instance._bucket_task = None


async def _attach_bucket(instance: ProviderThrottle, url: str) -> None:
    """Best-effort: open the Redis client and attach a token bucket."""
    try:
        client = await get_client(url)
        instance.bucket = RedisTokenBucket(client, instance.name, instance.rpm)
        logger.info(
            "rate_limit_distributed provider=%s rpm=%d (redis token bucket)",
            instance.name,
            instance.rpm,
        )
    except RedisUnavailable as exc:
        if not instance._fallback_logged:
            instance._fallback_logged = True
            logger.warning(
                "rate_limit_redis_unavailable provider=%s falling back to in-process limiter: %s",
                instance.name,
                exc,
            )


#: #3925.a — seaux PAR DOMAINE : {(provider, domaine, loop id): throttle}, bornés
#: (le plus ancien sort) — une collecte web visite des milliers de domaines.
_domain_throttles: dict[tuple[str, str, int], ProviderThrottle] = {}
_MAX_DOMAIN_BUCKETS = 1024


def throttle_per_domain(provider: str, domain: str) -> _ThrottledCall:
    """#3925.a — ``async with throttle_per_domain("careers_pages", host): ...``.

    Le budget déclaré de ``provider`` (``_DEFAULTS``, surchargeable par
    ``{PROVIDER}_RPM`` / ``_CONCURRENCY``) s'applique à CHAQUE domaine séparément :
    un site lent ou une analyse voisine ne consomme plus le débit des autres sites,
    et un même site n'est jamais visité plus vite que ce budget. Seau en mémoire
    du processus (pas de seau Redis par domaine : un par site visité serait une
    clé Redis par site). Fournisseur non déclaré → ``KeyError`` (jamais un défaut muet).
    """
    if provider not in _DEFAULTS:
        raise KeyError(provider)
    host = (domain or "").strip().lower().removeprefix("www.")
    loop_id = id(asyncio.get_running_loop())
    key = (provider, host, loop_id)
    instance = _domain_throttles.get(key)
    if instance is None:
        d = _DEFAULTS[provider]
        instance = ProviderThrottle(
            f"{provider}:{host}",
            rpm=_read_env_int(provider, "RPM", d["rpm"]),
            concurrency=_read_env_int(provider, "CONCURRENCY", d["concurrency"]),
            max_wait_s=_read_env_float(provider, "MAX_WAIT", DEFAULT_MAX_WAIT_S),
        )
        while len(_domain_throttles) >= _MAX_DOMAIN_BUCKETS:
            _domain_throttles.pop(next(iter(_domain_throttles)))
        _domain_throttles[key] = instance
    return _ThrottledCall(instance)


def _reset_cache_for_tests() -> None:
    """Clear the per-loop cache. Tests use this to read fresh env values."""
    _throttles.clear()
    _domain_throttles.clear()
    _scoped_throttles.clear()
    _unknown_warned.clear()


#: Défaut de refroidissement quand un 429 n'a pas de ``Retry-After`` exploitable.
#: Même valeur que le patron qui existait déjà (``recherche_entreprises.
#: _DEFAULT_BACKOFF_S``) : assez pour qu'une fenêtre glissante par minute se
#: vide à moitié, assez court pour qu'un remplissage de fond ne s'arrête pas
#: pour l'heure.
DEFAULT_BACKOFF_S = 30.0
#: ALERTES-402 point 3 — attente MAXIMALE du rattachement du seau partagé au premier appel. Au-delà,
#: on part sur le limiteur local : un Redis lent ne doit pas rallonger un appel, seulement le dé-partager.
BUCKET_ATTACH_WAIT_S = 1.0


def parse_retry_after(value: str | float | int | None) -> float | None:
    """Secondes tirées d'un ``Retry-After`` (ou d'une durée déjà calculée), ou
    ``None`` si ce n'est pas exploitable.

    Seule la forme numérique est honorée. ``Retry-After`` peut aussi porter une
    DATE HTTP — on ne la parse pas : mal la lire produirait une attente absurde,
    et retomber sur le défaut de l'appelant est plus sûr qu'une mauvaise
    supposition (le choix déjà fait par ``recherche_entreprises._back_off_from``
    avant ce lot).
    """
    if value is None:
        return None
    try:
        return max(0.0, float(value))
    except (TypeError, ValueError):
        return None


def retry_after_header(response: object) -> str | None:
    """L'en-tête ``Retry-After`` d'une réponse, sans JAMAIS lever.

    Pourquoi ce détour plutôt que ``res.headers.get("retry-after")`` sur les
    trente sites d'appel : le refroidissement est une MESURE, et **une mesure
    n'a jamais le droit de casser ce qu'elle mesure** — c'est la règle déjà
    écrite dans ``cost_ledger`` pour le registre de coûts. Or ces trente lignes
    s'exécutent au moment précis où un fournisseur répond 429, c'est-à-dire au
    pire moment : un objet de réponse sans ``headers`` (double de test, client
    maison, réponse tronquée) transformait alors une limitation de débit — un
    cas NORMAL et rattrapable — en ``AttributeError`` qui remonte jusqu'à
    l'appelant. Attrapé le 12/09/2026 par la suite complète sur l'arbre
    fusionné, sur ``test_enrich_failure_reasons`` : un fichier qu'aucun lot
    n'avait touché.

    Rend ``None`` dès que l'en-tête est absent, illisible ou non textuel —
    ``back_off_provider`` retombe alors sur son délai par défaut, ce qui est
    exactement le comportement voulu.
    """
    try:
        # ⚠️ `getattr(obj, "x", defaut)` PROPAGE l'exception quand `x` est une
        # propriété qui lève : le défaut ne s'applique qu'à un attribut ABSENT,
        # jamais à un attribut qui échoue. Le `try` doit donc englober l'accès
        # lui-même, pas seulement le `.get()`.
        headers = getattr(response, "headers", None)
        if headers is None:
            return None
        value = headers.get("retry-after")
    except Exception:
        return None
    return value if isinstance(value, str) else None


def back_off_provider(
    provider: str,
    retry_after: str | float | int | None = None,
    *,
    default_seconds: float = DEFAULT_BACKOFF_S,
) -> None:
    """Fait taire le compartiment PARTAGÉ de ``provider`` après un 429.

    Un jeton acquis ne dit rien du débit RÉEL qu'un fournisseur accepte : le
    refroidissement (:meth:`ProviderThrottle.back_off`) est le seul retour
    d'information qu'un 429 nous donne, et un compartiment qui l'ignore continue
    d'émettre au même débit vers la requête suivante — mesuré le 23/08/2026 sur
    ``recherche-entreprises`` (#631, 79,5 % d'entreprises jetées pour une panne
    d'infrastructure présentée comme un fait de marché). Avant ce lot,
    ``recherche_entreprises._search_page`` était le SEUL appelant de
    ``back_off`` dans tout le dépôt pour les 24 fournisseurs déclarés.

    ``retry_after`` suit la même règle partout : une valeur numérique (chaîne
    ``Retry-After`` ou secondes déjà calculées, ex. le ``x-ratelimit-reset``
    epoch de GitHub converti par l'appelant) est respectée ; une date HTTP, une
    absence ou une valeur illisible retombent sur ``default_seconds``. Doit être
    appelée depuis une boucle d'événements en cours (comme ``get_throttle``).
    """
    seconds = parse_retry_after(retry_after)
    if seconds is None:
        seconds = default_seconds
    get_throttle(provider).back_off(seconds)


__all__ = [
    "DEFAULT_BACKOFF_S",
    "retry_after_header",
    "DEFAULT_MAX_WAIT_S",
    "WAIT_WARNING_THRESHOLD_S",
    "ProviderThrottle",
    "RateLimitTimeout",
    "back_off_provider",
    "parse_retry_after",
    "throttle",
]
