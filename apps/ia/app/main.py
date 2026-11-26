import logging
import os
from datetime import UTC, datetime
from typing import Any

# Must run before any other app import so FastApiIntegration hooks into the ASGI stack.
from app.sentry_init import init_sentry

init_sentry()

# Root logging config — without this every `logging.getLogger(__name__).info(...)`
# call across the codebase is silently dropped (default level is WARNING). Set
# once here so the level/format apply uniformly to all of our modules; uvicorn's
# own loggers keep their own handlers.
logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    # `[%(correlation_id)s]` : le même identifiant que celui posé par l'API NestJS
    # sur la requête entrante. Sans lui, les logs du service — c'est-à-dire
    # l'essentiel d'un run — étaient impossibles à rattacher à l'incident qu'on
    # cherche. Le filtre installé juste après garantit que le champ existe sur
    # CHAQUE record : un format qui réclame un attribut absent perd la ligne.
    format="%(asctime)s %(levelname)s [%(correlation_id)s] %(name)s %(message)s",
    datefmt="%H:%M:%S",
)

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.middleware.correlation_id import CorrelationIdMiddleware, install_correlation_log_filter

install_correlation_log_filter()
# DECATHLON 11/10 — jamais une clé de fournisseur en clair dans un journal.
from app.middleware.log_redaction import install_secret_redaction

install_secret_redaction()
from app.middleware.cost_ledger_mw import CostLedgerMiddleware
from app.middleware.http_logging import HttpLoggingMiddleware
from app.middleware.internal_auth import InternalAuthMiddleware
from app.middleware.llm_lane import LlmLaneMiddleware
from app.routers import (
    activity,
    battlecard,
    chat,
    chat_title,
    commercial_brief,
    companies,
    compare,
    config_admin,
    cv,
    need_play,
    discover,
    discover_signals,
    dossier_blocks,
    esn_directory,
    expenses,
    territory,
    graph_analyze,
    icebreaker,
    message,
    missions,
    need_compile_text,
    qualification,
    mail_reply,
    onboarding_reformulate,
    org_verify,
    phase1_research,
    phase2_contacts,
    phase3_classify,
    phase4_plan,
    public_registry,
    search_entity,
    talent_message,
    profiler,
    project_synthesis,
    rfp,
    rag,
    scorer,
    notes,
    org_declare,
    content,
    summary,
    weekly,
    score_axes,
    relation_axis_recalc,
    internal_chat_replay,
    reasoning_judge,
)
from app.services import claude_service, kill_switch
from app.services.build_time import read_built_at
from app.services.claude_service import ClaudeError
from app.services.firecrawl import FirecrawlScrapeError

app = FastAPI(title="BellumAI — IA Service", version="0.1.0")

ALLOWED_ORIGINS = os.environ.get(
    "CORS_ORIGINS", "http://localhost:3000,http://localhost:5173"
).split(",")

# Order: HTTP logging runs OUTSIDE correlation-id so the access log line for a
# request appears even if the correlation-id middleware itself errors. Starlette
# applies middlewares in reverse order of `add_middleware()` calls — the last
# `add_middleware()` ends up outermost.
# LOT (15/10) DATA-C — voie « lot » (Message Batches) sur en-tête d'un appelant
# de fond ; sans en-tête, rien ne change.
app.add_middleware(LlmLaneMiddleware)
app.add_middleware(CorrelationIdMiddleware)
# Registre de coûts par requête (D19) : ce qu'a coûté CETTE phase repart dans
# l'en-tête X-Bellum-Costs, l'API additionne les phases d'un même run.
app.add_middleware(CostLedgerMiddleware)
# Runs inside HTTP logging (rejections are logged) and outside correlation-id.
# No-op en DÉVELOPPEMENT tant qu'INTERNAL_API_SECRET n'est pas posé sur les deux
# services ; en PRODUCTION, un secret absent rejette tout en 503 plutôt que
# d'ouvrir le service en silence. « No-op sans la variable » tout court était la
# moitié rassurante de la phrase — la production n'a pas de mode ouvert.
app.add_middleware(InternalAuthMiddleware)
app.add_middleware(HttpLoggingMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(FirecrawlScrapeError)
async def firecrawl_scrape_error_handler(
    _: Request, exc: FirecrawlScrapeError
) -> JSONResponse:
    """Map a terminal Firecrawl error (credits / auth / rate limit) to a
    typed 402 the API worker recognizes. 402 is non-retryable per
    ``isRetryableStatus`` so the BullMQ worker fails the job fast instead
    of burning retries on an account-wide failure.
    """
    return JSONResponse(
        status_code=402,
        content={
            "detail": {
                "code": exc.code,
                "service": exc.service,
                "user_message": exc.user_message,
                "url": exc.url,
            }
        },
    )


@app.exception_handler(ClaudeError)
async def claude_error_handler(_: Request, exc: ClaudeError) -> JSONResponse:
    """Map a typed Claude failure (truncated output, missing tool_use) to
    a 422 with a payload the API worker recognizes. 422 is non-retryable
    per ``isRetryableStatus`` so the worker fails fast instead of burning
    Claude tokens on a known-bad config (e.g. max_tokens too low).
    """
    return JSONResponse(
        status_code=422,
        content={
            "detail": {
                "code": exc.code,
                "service": exc.service,
                "user_message": exc.user_message,
            }
        },
    )


app.include_router(phase1_research.router)
app.include_router(phase2_contacts.router)
app.include_router(phase3_classify.router)
app.include_router(phase4_plan.router)
app.include_router(graph_analyze.router)
app.include_router(profiler.router)
app.include_router(score_axes.router)
# #2298.4 (19/09/2026, lot I3) — même préfixe `/score`, route distincte
# (`/score/addressability-relation`) : APIRouter fusionne les routes de
# plusieurs modules sous le même préfixe sans collision, comme `score_axes`.
app.include_router(relation_axis_recalc.router)
app.include_router(rag.router)
app.include_router(chat.router)
# #1911.1 — le titre d'un fil, appelé par l'API en tâche de fond (même préfixe
# `/chat`, derrière le même secret interne).
app.include_router(chat_title.router)
# #2810 — extraction d'entité pour /search, appelée par l'API en tâche du
# composer (même préfixe `/search`, derrière le même secret interne).
app.include_router(search_entity.router)
# #4347 — Laura rédige le message à un consultant du vivier (appelé par l'API, secret interne).
app.include_router(talent_message.router)
app.include_router(companies.router)
app.include_router(discover.router)
app.include_router(discover_signals.router)
app.include_router(esn_directory.router)
app.include_router(public_registry.router)
app.include_router(territory.router)
app.include_router(summary.router)
app.include_router(notes.router)
app.include_router(org_declare.router)
app.include_router(content.router)
app.include_router(battlecard.router)
app.include_router(need_play.router)
app.include_router(project_synthesis.router)
app.include_router(scorer.router)
app.include_router(icebreaker.router)
app.include_router(mail_reply.router)
app.include_router(onboarding_reformulate.router)
# Chantier « briefs comptes » (01/10/2026) — appelé par l'API après l'analyse.
app.include_router(commercial_brief.router)
app.include_router(dossier_blocks.router)
app.include_router(message.router)
app.include_router(activity.router)
app.include_router(internal_chat_replay.router)
app.include_router(compare.router)
app.include_router(weekly.router)
app.include_router(config_admin.router)
app.include_router(org_verify.router)
app.include_router(cv.router)
app.include_router(rfp.router)
app.include_router(expenses.router)
app.include_router(missions.router)
app.include_router(need_compile_text.router)
# #3755 — évaluation de la grille de qualification propre à l'espace.
app.include_router(qualification.router)
# #3223 (décision Louis 11/10/2026) — juge « recommandation générique », échantillon borné.
app.include_router(reasoning_judge.router)


@app.on_event("startup")
async def _load_config_overrides() -> None:
    # Best-effort: apply the persisted knowledge-config overrides at boot.
    # Degradable (no creds / no table → keeps defaults), never fatal.
    # #2915.2 — `aload_config_overrides` (pas `load_config_overrides`) : ce
    # handler tourne sur l'UNIQUE thread event-loop du processus (pas de
    # --workers, apps/ia/railway.json) ; la variante sync bloquerait ce même
    # thread — et donc /health — le temps du fetch Supabase.
    from app.config.overrides_loader import aload_config_overrides

    try:
        await aload_config_overrides()
    except Exception as exc:  # pragma: no cover - startup safety net
        logging.getLogger(__name__).warning("startup config-override load failed: %s", exc)

    # Panne silencieuse la plus coûteuse observée en prod : le service tourne, la
    # healthcheck est verte, et 8 routers rendent 500 parce que deux variables
    # manquent. On le dit FORT au démarrage (donc dans Sentry via le transport de
    # logs), une seule fois, plutôt qu'une stack trace par requête.
    missing = missing_required_env()
    if missing:
        logging.getLogger(__name__).error(
            "Configuration incomplète — %s absente(s). Les routes qui lisent Supabase "
            "en direct (icebreaker, message, battlecard, summary, weekly, compare, "
            "scorer, activity) répondront 500 tant qu'elles ne sont pas posées.",
            ", ".join(missing),
        )

    # Observabilité Langfuse (env-gated : sans LANGFUSE_PUBLIC_KEY +
    # LANGFUSE_SECRET_KEY = no-op strict, aucun thread, zéro réseau). Le flusher
    # de fond ne démarre QU'ICI — jamais depuis un enregistrement — pour que ni
    # un test ni un script n'ouvre le réseau par accident.
    from app.services import langfuse_client

    langfuse_client.start()


@app.on_event("shutdown")
async def _flush_observability() -> None:
    # Best-effort : ce qui reste en file part avant l'arrêt. Ne lève jamais.
    from app.services import langfuse_client

    langfuse_client.flush()


@app.get("/health")
async def health() -> dict[str, Any]:
    """Liveness — reste 200 même mal configuré (sinon Railway ne promeut jamais
    le déploiement qui corrigerait la config), mais DIT ce qui manque.

    Une config incomplète ne se voyait nulle part : le service démarrait, la
    healthcheck passait, les analyses tournaient, et seules les routes lisant
    Supabase en direct rendaient un 500 générique. Le trou se lisait uniquement
    dans une stack trace, à condition de savoir la chercher."""
    missing = missing_required_env()
    if not missing:
        return {"status": "ok"}
    return {"status": "degraded", "missing_env": missing}


#: Variables SANS lesquelles des familles entières de routes répondent 500 —
#: `get_supabase()` lève, et les 8 routers qui lisent Supabase en direct
#: (icebreaker, message, battlecard, summary, weekly, compare, scorer, activity)
#: tombent un par un. Une analyse, elle, continue de marcher : le pipeline écrit
#: via NestJS. C'est ce qui rend la panne INVISIBLE — le produit a l'air debout.
_REQUIRED_FOR_DIRECT_READS: tuple[str, ...] = ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")


def missing_required_env() -> list[str]:
    """Variables critiques absentes ou vides, dans l'ordre déclaré."""
    return [name for name in _REQUIRED_FOR_DIRECT_READS if not os.environ.get(name)]


@app.get("/metrics/cost")
async def cost_metrics() -> dict[str, Any]:
    """Ce que chaque prompt a coûté depuis le démarrage du process.

    Le trou que ça bouche : le pipeline d'analyse persiste ses métriques
    (``analysis_runs.cost_eur``), mais les fonctionnalités hors analyse —
    Copilote, discover, battlecard, weekly, compare, icebreaker, message,
    summary, scorer, activity — appellent Claude à chaque clic sans rien
    persister. Elles représentent l'essentiel de la facture et étaient
    invisibles : la seule trace était une ligne de log par appel.

    Compteurs en mémoire du process : ils repartent de zéro à chaque
    redéploiement et ne sont pas agrégés entre replicas. C'est voulu — répondre
    à « qu'est-ce qui coûte cher » ne demande pas une base de données, juste un
    ordre de grandeur qu'on peut lire en direct. Route non exemptée, donc
    protégée par le secret interne comme le reste.
    """
    counters = claude_service.cost_counters()
    prompts = [
        {"prompt": name, **vars(stats)}
        for name, stats in sorted(
            counters.items(), key=lambda kv: kv[1].cost_usd, reverse=True
        )
    ]
    return {
        "prompts": prompts,
        "total_cost_usd": sum(p["cost_usd"] for p in prompts),
        "truncations": {k: vars(v) for k, v in claude_service.truncation_counters().items()},
    }


@app.get("/internal/kill-switches")
async def kill_switches() -> dict[str, Any]:
    """Quelles capacités du moteur sont COUPÉES en ce moment.

    Le trou que ça bouche (D169) : les interrupteurs d'arrêt n'avaient aucune
    surface. ``GROUNDING_DISABLED=true`` posé pendant un incident, le dossier
    sortait sans son sourçage et **rien nulle part ne le disait** — ni au
    client, ni au back-office. Un interrupteur qu'on oublie d'éteindre devient
    indistinguable d'un produit qui n'a jamais su faire.

    ⚠️ **Aucun nom de variable, aucune valeur d'environnement ne sort d'ici.**
    Ce qui est publié est l'ÉTAT d'une CAPACITÉ, sous un identifiant stable
    (``analysis.grounding``) que l'API joint à son propre registre pour rendre
    un libellé produit. C'est ce qui garantit qu'un secret ne suivra jamais le
    chemin qu'on vient d'ouvrir.

    ⚠️ ``true`` veut dire « coupée exprès », pas « en panne ». Et ce n'est pas
    non plus le cas « sans clé = no-op » : une intégration sans clé est un
    chemin NORMAL, pas un interrupteur posé.

    Route non exemptée, donc protégée par le secret interne comme le reste.
    """
    return {
        "switches": kill_switch.capability_states(),
        "measured_at": datetime.now(UTC).isoformat(),
    }


@app.get("/version")
async def version() -> dict[str, str | None]:
    """Quelle révision du service IA tourne réellement.

    L'API NestJS expose déjà `/version` (même convention d'env vars) ; le service
    IA, non — donc quand un correctif IA est mergé et que le bug persiste en
    ligne, rien ne permet de distinguer « le correctif est déployé et
    insuffisant » de « le service n'a pas encore redéployé ». Ce trou a coûté un
    diagnostic entier sur le bug des accroches (colonnes `contacts` inexistantes,
    corrigé côté code, erreur toujours visible en prod).

    Aucun secret : uniquement le SHA du commit et le nom d'environnement, comme
    côté API. `unknown` quand la plateforme ne les injecte pas (dev local).
    """
    return {
        "commit": os.environ.get("SENTRY_RELEASE")
        or os.environ.get("RAILWAY_GIT_COMMIT_SHA")
        or os.environ.get("GIT_COMMIT")
        or "unknown",
        "environment": os.environ.get("SENTRY_ENVIRONMENT") or os.environ.get("ENV") or "unknown",
        "timestamp": datetime.now(UTC).isoformat(),
        # #4711.1 — la CONSTRUCTION, posée au build (#4711.2) ; `None` = inconnue, jamais devinée.
        "built_at": read_built_at(),
    }
