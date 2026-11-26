"""Policy for making the unit suite independent of the developer's shell.

The rule this encodes: **the unit suite always runs against the documented
zero-config defaults**, exactly as CI's keyless ``test-ia`` job does. Whatever
``tools/dev.secret.sh`` exports into the shell that launches ``pytest`` must not
change a single verdict.

Two families are neutralised, for two different reasons:

``CREDENTIAL_VARS``
    Keys and backing-service URLs. The codebase is full of env-gated sources
    documented as "sans clé = no-op strict, ZÉRO réseau" (see CLAUDE.md). Tests
    assert that no-op contract; with a key ambiently present they instead call
    the real provider — slow, billable, flaky, and no longer testing the thing
    they claim to test. Stripping them makes the keyless path the *guaranteed*
    path rather than the accidental one. Tests that exercise the key-present
    path set their own key via ``monkeypatch.setenv``, which runs after the
    autouse fixture and therefore still wins.

``TUNING_VARS``
    Behaviour knobs. These do not open sockets, but they move the defaults the
    tests assert against — ``FIRECRAWL_MAX_PAGES`` and ``CONTACTS_BATCH_SIZE``
    are both read at *import* time and both appear in a normal dev shell.

Because several tuning knobs are captured at module import (see
``app/services/classification.py``), neutralisation has to happen in
``pytest_configure`` — before app modules are imported — not only in a fixture.
``apps/ia/conftest.py`` does exactly that.

``tests/contracts/`` (marker ``upstream_contract``) is exempt: real credentials
and real network calls are the entire point of that suite, and it is deselected
from the default run by ``pytest.ini``.
"""

from __future__ import annotations

import ipaddress
import os
import socket
from typing import Any

__all__ = [
    "CREDENTIAL_VARS",
    "TUNING_VARS",
    "NetworkBlockedError",
    "install_network_guard",
    "is_classified",
    "is_exempt_path",
    "looks_like_credential",
    "neutralise_environment",
    "uninstall_network_guard",
]


# ── what counts as a credential ───────────────────────────────────────────────

#: Anything that unlocks a real provider, or points at a real backing service.
#: Grouped as in CLAUDE.md so a reader can match a line to the feature it gates.
CREDENTIAL_VARS: frozenset[str] = frozenset(
    {
        # Pont interne du copilote vers la messagerie / l'agenda (NestJS détient
        # les jetons OAuth). Sans lui, les outils messagerie du copilote sont un
        # no-op strict qui le DIT — jamais une liste vide.
        "API_INTERNAL_URL",
        # LLM providers
        "ANTHROPIC_API_KEY",
        "OPENAI_API_KEY",
        # Search / scrape / enrichment
        "APOLLO_API_KEY",
        "BRAVE_API_KEY",
        "FIRECRAWL_API_KEY",
        "PAPPERS_API_KEY",
        "SALESQL_API_KEY",
        "SERPER_API_KEY",
        "TAVILY_API_KEY",
        # Optional open-data / partner sources (documented no-op without a key)
        "FRANCE_TRAVAIL_CLIENT_ID",
        "FRANCE_TRAVAIL_CLIENT_SECRET",
        "GITHUB_TOKEN",
        "INPI_PASSWORD",
        "INPI_USERNAME",
        "INSEE_API_KEY",
        "INSEE_API_KEY_HEADER",
        "WTTJ_ALGOLIA_API_KEY",
        "WTTJ_ALGOLIA_APP_ID",
        # #3885 — agrégateurs d'offres (`data_sources/job_aggregators.py`)
        "ADZUNA_APP_ID",
        "ADZUNA_APP_KEY",
        "JOOBLE_API_KEY",
        "JOOBLE_HOST",
        "BRAVE_EXTRA_SNIPPETS",
        "THEIRSTACK_API_KEY",
        "MANTIKS_API_KEY",
        "FANTASTIC_JOBS_API_KEY",
        # #4734 — annuaires French Tech déclarés par l'opérateur : sans eux, aucun appel réseau.
        "FRENCH_TECH_DIRECTORY_URLS",
        # Country packs
        "ZEFIX_API_PASSWORD",
        "ZEFIX_API_USER",
        # RAG embeddings — the key is the switch for pgvector similarity
        "EMBEDDING_API_KEY",
        "EMBEDDING_API_URL",
        # OCR d'un CV scanné (PDF 3, décision de Louis du 21/08). La clé est le
        # SEUL interrupteur : sans elle, aucune requête ne part. L'URL et le
        # modèle sont classés ici et non en réglage, parce qu'ils désignent le
        # fournisseur — les laisser dans un test ferait sortir un CV d'un
        # environnement de test vers une adresse arbitraire.
        "OCR_API_KEY",
        "OCR_API_URL",
        "OCR_MODEL",
        # Backing services. A reachable Redis is not "just a cache" for this
        # suite: it makes provider results persist ACROSS tests and across runs,
        # so a keyless no-op assertion can be served stale data cached by an
        # earlier keyed run. Measured: 42 failures from REDIS_URL alone.
        "REDIS_URL",
        "DATABASE_URL",
        "LANGGRAPH_PG_URL",
        "SOURCE_CACHE_PG_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "SUPABASE_URL",
        # The internal-secret gate. Present ⇒ the middleware enforces
        # ``x-internal-secret`` and every router test gets 401 instead of its
        # payload. Measured: 169 failures from this variable alone.
        "INTERNAL_API_SECRET",
        # Error reporting — a dev DSN would ship test noise to the real project.
        "SENTRY_DSN",
        # Observabilité LLM — des clés ambiantes enverraient les traces de la
        # suite vers le vrai projet Langfuse, et feraient mentir les tests du
        # contrat « sans clés = no-op strict ».
        "LANGFUSE_PUBLIC_KEY",
        "LANGFUSE_SECRET_KEY",
        "LANGFUSE_HOST",
    }
)

#: Safety net for the provider someone wires up on a Friday without touching
#: ``CREDENTIAL_VARS``. Deliberately narrow: it must not swallow tuning knobs.
_CREDENTIAL_SUFFIXES: tuple[str, ...] = (
    "_API_KEY",
    "_APIKEY",
    "_ACCESS_KEY",
    "_SECRET",
    "_SECRET_KEY",
    "_CLIENT_ID",
    "_CLIENT_SECRET",
    "_TOKEN",
    "_PASSWORD",
    "_DSN",
    "_API_USER",
    "_API_PASSWORD",
)


def looks_like_credential(name: str) -> bool:
    """True when a variable name is credential-shaped.

    Used both to sweep the ambient environment and to let the drift-guard test
    accept a newly added key without a code change.
    """
    return name.endswith(_CREDENTIAL_SUFFIXES)


# ── behaviour knobs ───────────────────────────────────────────────────────────

#: Read by ``app/`` and capable of moving a test's expected output. Several are
#: captured at import time, which is why neutralisation runs at configure time.
TUNING_VARS: frozenset[str] = frozenset(
    {
        # Collection depth / batching (CLAUDE.md warns about a stale
        # FIRECRAWL_MAX_PAGES=3 override still living on Railway).
        "APOLLO_DEFAULT_SENIORITIES",
        # #4722 — durée de vie du verrou single-flight des appels payés au résultat (défaut 90 s).
        "PROVIDER_LOCK_TTL_S",
        # GROUPE-FRANCE (16/10) — nombre d'entités d'un groupe dont Mantiks achète les offres (défaut 5).
        "MANTIKS_MAX_ENTITIES",
        # #3941 — fils publics de levées de fonds de Découvrir ; VIDE = aucun fil.
        "FUNDING_FEED_URLS",
        # Rejeu nocturne des évals IA (#2975) : interrupteur et plafond de coût en $.
        "EVAL_NIGHTLY_ENABLED",
        "EVAL_NIGHTLY_MAX_COST_USD",
        # Relance automatique des thèmes de contacts (#2290.3) : ÉTEINTE par
        # défaut (`false`), plafonnée à 2 familles non couvertes par analyse.
        "CONTACTS_AUTO_THEME_RELAUNCH_ENABLED",
        # #2543.5g — coupe-circuit de la passe d'élargissement quand le stock
        # reste mince même après repli + amorces du registre légal (décision
        # Louis 18/09/2026). ACTIVE par défaut, bornée à UNE passe ; poser
        # `true` ÉTEINT la passe.
        "CONTACTS_AUTO_WIDEN_DISABLED",
        "CONTACTS_BATCH_SIZE",
        "CONTACTS_ENRICH_MAX",
        "CONTACTS_ENRICH_TOP_N",
        "CONTACTS_MAX_AUTO_THEME_RELAUNCH",
        "CONTACTS_WEB_ROLE_MAX_QUERIES",
        "CONTACTS_MIN_BEFORE_FALLBACK",
        "CONTACTS_MIN_BEFORE_WIDENING",
        # Budget de temps de la cascade d'enrichissement contact (legs optionnels).
        "ENRICH_CASCADE_BUDGET_S",
        # #4108 — palier gratuit trafilatura devant Firecrawl ; ÉTEINT par défaut.
        "CRAWL_TIER_FREE_ENABLED",
        # #4108 palier 2 — navigateur auto-hébergé crawl4ai devant Firecrawl ; ÉTEINT par défaut.
        "CRAWL_TIER_BROWSER_ENABLED",
        "CRAWL_TIER_BROWSER_TIMEOUT_MS",
        "FIRECRAWL_CHARS_PER_CATEGORY",
        "FIRECRAWL_CONCURRENCY",
        "FIRECRAWL_MAX_AGE_MS",
        "FIRECRAWL_MAX_PAGES",
        # #3205.1 (lot D1, 02/10) — coupe-circuit de la lecture crt.sh ; défaut « on ».
        "PROVIDER_FOOTPRINT_SUBDOMAINS",
        "PRESS_RSS_ENABLED",
        # Intégration AE (chantier signaux, 09/10/2026) — coupe-circuits de trois
        # sources publiques sans clé, ACTIVES par défaut (`false`/`0`/`no`/`off` coupe).
        "ATS_EXTRA_ENABLED",
        "CAREERS_PAGES_ENABLED",
        "COMPANY_EVENTS_ENABLED",
        "FIRECRAWL_PER_URL_TIMEOUT_S",
        "FIRECRAWL_PROXY",
        # #4016 (lot W12) — documents web lus en local (plafond d'octets, délai).
        "WEB_DOCUMENT_MAX_BYTES",
        "WEB_DOCUMENT_TIMEOUT_S",
        "FIRECRAWL_TIMEOUT_S",
        # Model / prompt sizing
        "CHAT_CONTEXT_MAX",
        # #3705.5 — filiales Pappers dans la recherche de Laura (défaut 8)
        "CHAT_SEARCH_GROUP_LOOKUP_MAX",
        # Copilote tool-calling loop — ON by default; the kill-switch is the
        # only lever, and it is absent outside an incident.
        "CHAT_TOOLS_DISABLED",
        # #4112 — sélection d'outils de Laura (noyau + `chercher_un_outil`) ; ÉTEINTE par défaut.
        "LAURA_TOOL_SELECTION_ENABLED",
        # Observabilité Langfuse — deux réglages, pas des clés : le break-glass
        # (couper sans retirer les clés) et l'opt-in de capture du contenu des
        # prompts (défaut : métadonnées seules).
        "LANGFUSE_DISABLED",
        "LANGFUSE_CAPTURE_CONTENT",
        # #4113 — NER (Presidio) des NOMS de personnes dans les traces Langfuse.
        # Réglage, pas une clé ; défaut désactivé (chemin byte-identique).
        "TRACE_PII_NER_ENABLED",
        # L'environnement STAMPÉ sur chaque trace. Réglage et non clé : il ne
        # déverrouille rien, il sépare les vues. Absent, on retombe sur
        # `SENTRY_ENVIRONMENT` (déjà posée sur les trois services) plutôt que
        # d'exiger une seconde variable qui finirait par la contredire.
        "LANGFUSE_ENVIRONMENT",
        # Budget de temps d'un tour de copilote. Doit rester sous celui de
        # l'appelant NestJS (120 s) : au-dessus, un dépassement se présente à
        # l'utilisateur en panne au lieu d'une réponse dégradée.
        "CHAT_TURN_BUDGET_S",
        # Budget de temps du compte de contacts avant qu'un lien profond filtré
        # soit proposé (décision Louis, 15/09/2026, `chat_tools._deep_link_count`).
        # Très en dessous de `CHAT_TURN_BUDGET_S` : un dépassement dégrade en
        # silence (le lien se propose sans nombre), il ne fait jamais échouer
        # le tour.
        "DEEP_LINK_COUNT_BUDGET_S",
        # Budget de temps de `run_account_search`, EN SECONDES (#2852.36) —
        # distinct de `DEEP_LINK_COUNT_BUDGET_S` : celui-ci borne la recherche
        # RÉELLE affichée à l'écran, largement sous `CHAT_TURN_CEILING_S` pour
        # que le budget nomme l'échec au lieu de laisser le tour entier expirer.
        "ACCOUNT_SEARCH_BUDGET_S",
        # Le fournisseur/modèle du copilote. Ce n'est pas une clé — c'est un
        # aiguillage — mais il change le PROTOCOLE d'outils utilisé par
        # ``chat_orchestrator`` (Anthropic ``messages`` vs OpenAI
        # ``/v1/responses``). Un shell de dev qui l'exporte ferait tourner toute
        # la suite du copilote sur l'autre branche en silence, et la garde qui
        # prouve que le chemin par défaut est INCHANGÉ ne prouverait plus rien.
        # ⚠️ Le nom est construit par f-string dans ``llm_gateway``
        # (``LLM_ROUTE_{TÂCHE}``), donc le balayage de sources ne peut pas le
        # voir : il n'existe ici que parce qu'on l'a écrit.
        "LLM_ROUTE_CHAT",
        # #2248 — les destinations des deux PALIERS du copilote, même forme et
        # même construction par f-string (``LLM_ROUTE_{TÂCHE}``) que ci-dessus.
        # Un shell qui en exporte une active le routage par palier pour toute
        # la suite : les témoins « sans réglage, rien ne change » ne
        # prouveraient plus rien. Et son coupe-circuit, lu par ``kill_switch``.
        "LLM_ROUTE_CHAT_FAST",
        "LLM_ROUTE_CHAT_DEEP",
        "CHAT_MODEL_ROUTING_DISABLED",
        # Le mode OMBRE du même routage (décision de Louis, 17/09/2026) : il
        # ajoute une ligne de log par tour, que les tests de journal comptent.
        "CHAT_MODEL_ROUTING_SHADOW",
        # Effort de raisonnement du copilote sur l'API Responses d'OpenAI
        # (``low`` par défaut, ``off`` retire le paramètre). Réglage pur : il ne
        # déverrouille rien, il déplace un compromis qualité/coût.
        "CHAT_REASONING_EFFORT",
        # Plafond DUR du tour, posé à l'entrée du handler (#1191). Le budget
        # ci-dessus ne couvre ni l'exécution d'un outil (attendue sans délai) ni
        # la préparation du contexte (l'échéance naît APRÈS elle) : sans ce
        # plafond, un tour pouvait dépasser les 120 s de l'appelant et se
        # présenter en 502. Réglage, pas clé : absent = 105 s.
        "CHAT_TURN_CEILING_S",
        "CLAUDE_TEMPERATURE",
        "FACTS_MAX_TOKENS",
        "ORGANIGRAMME_MAX_TOKENS",
        "ORGANIGRAMME_MODEL",
        "PLAN_LIGHT_MODEL",
        "SIGNALS_MAX_TOKENS",
        "STRATEGY_MAX_TOKENS",
        "STRATEGY_MODEL",
        "VOCABULARY_MODEL",
        # Timeouts
        "BRAVE_PAPPERS_TIMEOUT_S",
        "PHASE_CLASSIFY_TIMEOUT_S",
        "PHASE_CONTACTS_TIMEOUT_S",
        "PHASE_JUDGE_TIMEOUT_S",
        "PHASE_PLAN_TIMEOUT_S",
        "PHASE_RESEARCH_TIMEOUT_S",
        "SSE_KEEPALIVE_SECONDS",
        # DATA-A 15/10 — filtres de la recherche de décideurs Apollo
        "APOLLO_SEARCH_EMAIL_STATUS",
        "APOLLO_SEARCH_NOT_TITLES",
        # Caches
        "APOLLO_ENRICH_CACHE_TTL_S",
        "APOLLO_ORG_CACHE_TTL_S",
        "APOLLO_SEARCH_CACHE_TTL_S",  # DATA-A 15/10
        "CACHE_TTL_BRAVE_NEWS_FRESH_S",  # DATA-A 15/10 — veille quotidienne
        "CACHE_TTL_CONTACT_S",
        "CACHE_TTL_EMPLOYER_IDENTITY_S",  # #4674 L2 — nom → identité registre, 90 j
        "CACHE_TTL_FIRMO_S",
        "CACHE_TTL_JOBS_S",
        "CACHE_TTL_LLM_S",
        "CACHE_TTL_NEWS_S",
        "CACHE_TTL_PERSON_NAME_SEARCH_S",  # #4386 — recherche d'une personne par nom
        "CACHE_TTL_REGISTRY_SEARCH_S",
        "CACHE_TTL_SEARCH_S",
        "CACHE_TTL_SIGNALS_S",
        "CACHE_TTL_TECH_S",
        "CACHE_TTL_TERRITORY_S",  # DATA-C 15/10
        "SALESQL_CACHE_TTL_S",
        "SCRAPE_CACHE_TTL_S",
        "SOURCE_CACHE_RERUN_BYPASS_S",
        # RAG
        "RAG_EMBED_CONTENT_CHARS",
        "RAG_KNOWLEDGE_CANDIDATES",
        "RAG_KNOWLEDGE_TOP_K",
        "RAG_MATCH_THRESHOLD",
        "RAG_EMBED_BATCH_SIZE",
        "RAG_RERANK_CROSS_ENCODER",
        "RAG_RERANK_ENABLED",
        "EMBEDDING_MODEL",
        # #3586 (W2) — digest du Drive interne : coupe-circuit de l'injection
        # (défaut « on ») et taille du corpus envoyé à la génération.
        "INTERNAL_KNOWLEDGE_DIGEST_DISABLED",
        "INTERNAL_KNOWLEDGE_DIGEST_INPUT_CHARS",
        # Routing / gateway
        "LLM_GATEWAY_ROUTING",
        "SALESQL_AUTH_STYLE",
        "SEC_EDGAR_USER_AGENT",
        "INSEE_API_BASE",
        # Index name only — the Algolia *key* is the actual switch for WTTJ.
        "WTTJ_ALGOLIA_INDEX",
        # Environment shape. ``ENV=production`` flips the internal-auth gate to
        # fail-closed and changes Sentry wiring.
        "ENV",
        # Identité de la révision déployée, lue par `/version` (mêmes noms que côté
        # API). Absentes hors plateforme → « unknown », jamais un faux SHA.
        "GIT_COMMIT",
        "RAILWAY_GIT_COMMIT_SHA",
        "RAILWAY_ENVIRONMENT_NAME",
        "SENTRY_ENVIRONMENT",
        "SENTRY_RELEASE",
        "SENTRY_TRACES_SAMPLE_RATE",
        "LOG_LEVEL",
        "CORS_ORIGINS",
        "INTERNAL_CALLBACK_ALLOWED_HOSTS",
        "PAPPERS_RUN_CALL_WARN",
        # Kill switches for the always-on v2 axes. Read indirectly through
        # ``app/services/kill_switch.py``, so the source scan cannot see them —
        # listed here explicitly.
        "DATA_GATEWAY_DISABLED",
        "GROUNDING_DISABLED",
        "JUDGE_DISABLED",
        "LLM_GATEWAY_DISABLED",
        "SELF_CONSISTENCY_BUDGET_S",
        "SELF_CONSISTENCY_DISABLED",
        "SOURCE_CACHE_DISABLED",
        # Rate limiting — dev shells export these for the app.
        "APOLLO_CONCURRENCY",
        "APOLLO_ENRICH_LIMIT",
        "APOLLO_RPM",
        "BRAVE_CONCURRENCY",
        "BRAVE_RPM",
        "CLAUDE_CONCURRENCY",
        "CLAUDE_RPM",
        "FIRECRAWL_RPM",
        "PAPPERS_CONCURRENCY",
        "PAPPERS_RPM",
    }
)

#: Never touched. ``BELLUM_SCHEMA_STRICT`` is set by the CI job on purpose — it
#: turns cross-language schema drift into a build failure. Clearing it here
#: would quietly disable a guard, which is the opposite of the goal.
_PRESERVED: frozenset[str] = frozenset(
    {
        "BELLUM_SCHEMA_STRICT",
        "BELLUM_SHARED_SCHEMAS_DIR",
    }
)


def is_classified(name: str) -> bool:
    """True when the policy has an opinion about ``name``.

    The drift-guard test uses this to refuse an env-gated source that nobody
    declared.
    """
    return (
        name in CREDENTIAL_VARS
        or name in TUNING_VARS
        or name in _PRESERVED
        or looks_like_credential(name)
    )


def is_exempt_path(path: str) -> bool:
    """True for the live upstream-contract suite, which must keep its keys."""
    return "tests/contracts/" in str(path).replace("\\", "/")


# ── neutralisation ────────────────────────────────────────────────────────────


def neutralise_environment() -> dict[str, str]:
    """Remove every policy-covered variable from ``os.environ``.

    Returns the removed ``{name: value}`` so a contract-suite run in the same
    process can put them back.
    """
    removed: dict[str, str] = {}
    for name in list(os.environ):
        if name in _PRESERVED:
            continue
        if name in CREDENTIAL_VARS or name in TUNING_VARS or looks_like_credential(name):
            removed[name] = os.environ.pop(name)
    return removed


# ── network guard ─────────────────────────────────────────────────────────────


class NetworkBlockedError(RuntimeError):
    """Raised when a unit test tries to reach the network.

    Seeing this means a test is missing a stub. Fix the test — do not widen the
    guard. If the call genuinely must hit a real provider, it belongs in
    ``tests/contracts/`` behind the ``upstream_contract`` marker.
    """


_LOCAL_HOSTS = frozenset({"localhost", "localhost.", "127.0.0.1", "::1", "0.0.0.0", ""})

_real_connect = socket.socket.connect
_real_connect_ex = socket.socket.connect_ex
_real_getaddrinfo = socket.getaddrinfo


def _is_local(host: Any) -> bool:
    """Loopback stays reachable: Postgres on 5440, fixtures that spin a server."""
    if not isinstance(host, str):
        return False
    host = host.strip("[]").lower()
    return host in _LOCAL_HOSTS or host.startswith("127.") or host.endswith(".localhost")


def _guarded_connect(self: socket.socket, address: Any, *args: Any, **kwargs: Any) -> Any:
    if getattr(self, "family", None) == getattr(socket, "AF_UNIX", None):
        return _real_connect(self, address, *args, **kwargs)
    if isinstance(address, tuple) and address and _is_local(address[0]):
        return _real_connect(self, address, *args, **kwargs)
    raise NetworkBlockedError(
        f"unit test attempted a network connection to {address!r}. "
        "Stub the provider, or move the test to tests/contracts/ "
        "(marker: upstream_contract)."
    )


def _guarded_connect_ex(self: socket.socket, address: Any, *args: Any, **kwargs: Any) -> Any:
    if isinstance(address, tuple) and address and _is_local(address[0]):
        return _real_connect_ex(self, address, *args, **kwargs)
    raise NetworkBlockedError(
        f"unit test attempted a network connection to {address!r}. "
        "Stub the provider, or move the test to tests/contracts/."
    )


def _is_ip_literal(host: Any) -> bool:
    """True for a numeric address, which resolves without any DNS traffic.

    ``getaddrinfo("8.8.8.8", 80)`` is parsed locally — no packet leaves the box —
    and the SSRF guard in ``app/services/progress.py`` relies on exactly that to
    classify a callback target. Blocking it would buy no safety while breaking a
    real security test; an actual connection to that address is still refused by
    the connect guard.
    """
    if not isinstance(host, str):
        return False
    try:
        ipaddress.ip_address(host.strip("[]"))
    except ValueError:
        return False
    return True


def _guarded_getaddrinfo(host: Any, port: Any, *args: Any, **kwargs: Any) -> Any:
    if host is None or _is_local(host) or _is_ip_literal(host):
        return _real_getaddrinfo(host, port, *args, **kwargs)
    raise NetworkBlockedError(
        f"unit test attempted to resolve {host!r}. "
        "Stub the provider, or move the test to tests/contracts/."
    )


def install_network_guard() -> None:
    """Make outbound (non-loopback) traffic impossible for the current test."""
    socket.socket.connect = _guarded_connect  # type: ignore[method-assign]
    socket.socket.connect_ex = _guarded_connect_ex  # type: ignore[method-assign]
    socket.getaddrinfo = _guarded_getaddrinfo  # type: ignore[assignment]


def uninstall_network_guard() -> None:
    socket.socket.connect = _real_connect  # type: ignore[method-assign]
    socket.socket.connect_ex = _real_connect_ex  # type: ignore[method-assign]
    socket.getaddrinfo = _real_getaddrinfo  # type: ignore[assignment]
