# Scale readiness — API multi-replica (Railway 1 → N)

Chantier C1 (validé Louis) : rendre `apps/api` sûre à N replicas Railway. Audit
complet + fixes livrés par la PR `feat/multi-replica-readiness`. Règle de
conception : **le comportement à 1 replica (avec ou sans Redis) est strictement
inchangé** — chaque protection est gated sur `REDIS_URL` et dégrade en
comportement actuel sans elle.

## TL;DR

| #   | Surface                            | État avant                                                                                                                                             | Risque à N>1                                                                                                                                         | Fix livré                                                                                                                                        |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Socket.IO — adapter                | `AnalysisGateway` attachait déjà `@socket.io/redis-adapter` (PR #350) sur le server PARTAGÉ par les deux gateways                                      | Émissions OK, mais l'attache dépendait implicitement du module analysis                                                                              | Helper partagé `attachRedisAdapterOnce` (idempotent par server) appelé par les DEUX gateways — retirer un module ne perd plus l'adapter          |
| 1b  | Socket.IO — replay buffer profiler | `Map` in-process dans `ProfilerGateway`                                                                                                                | Les callbacks HTTP de l'IA atterrissent sur n'importe quelle replica → buffer fragmenté, replay incomplet au join                                    | Buffer déplacé dans Redis (`RPUSH`/`LRANGE`, TTL 15 min), fallback Map sans `REDIS_URL`                                                          |
| 2   | Crons `@Cron` (5)                  | Chaque replica découvre et tire chaque cron → N exécutions par tick                                                                                    | `relance-reminders` et `weekly-summary` = read-then-write → **notifications + emails en double** ; les 3 autres idempotents mais N sweeps redondants | `SingletonLockService` + helper `withSingletonLock(name, fn)` — `SET NX EX` Redis, un seul replica exécute le tick                               |
| 3   | État in-memory                     | Throttler ✅ Redis, OTP ✅ Redis, sessions ✅ DB, JWKS cache ✅ inoffensif — mais `AnalysisCancellationService` = `Map<jobId, AbortController>` locale | **Cancel cassé** : la requête HTTP cancel atterrit sur B, le worker tourne sur A → l'analyse continue et brûle des tokens Claude jusqu'au bout       | Broadcast pub/sub Redis (`bellum:analysis:cancel`) — chaque replica s'abonne et aborte son controller local                                      |
| 4   | BullMQ                             | Workers `analysis` (concurrency 3) + `mailer` ; claims atomiques Redis                                                                                 | Aucun — multi-consumer safe by design                                                                                                                | Rien. Note : la concurrency devient **globale 3×N** (voir « Points d'attention »)                                                                |
| 5   | Fichiers locaux                    | Aucune écriture disque (pas de multer/diskStorage ; ingest RAG = base64 → DB)                                                                          | Aucun                                                                                                                                                | Rien                                                                                                                                             |
| 6   | Graceful shutdown                  | `app.enableShutdownHooks()` déjà en place (#350) → `@nestjs/bullmq` draine les jobs actifs sur SIGTERM                                                 | OK                                                                                                                                                   | Les nouveaux clients Redis (locks, pub/sub cancel, buffer profiler, adapter) se ferment tous via `onModuleDestroy` ; tripwire test sur `main.ts` |

## Détail par point

### 1. Socket.IO cross-replica

- Les deux gateways (`AnalysisGateway`, `ProfilerGateway`) partagent UN server
  Socket.IO (même port, namespace par défaut). L'adapter Redis fan-out les
  `server.to(room).emit(...)` vers toutes les replicas.
- `apps/api/src/config/socketio-redis-adapter.ts` : `attachRedisAdapterOnce`
  est idempotent par server (WeakSet) — chaque gateway l'appelle depuis son
  `afterInit` (règle repo #7 : retirer un module ne casse pas l'autre), seul le
  premier crée la paire pub/sub et en possède la fermeture.
- **Sticky sessions : inutiles.** Le client web force
  `transports: ['websocket']` (`apps/web/src/lib/socket.ts`) — pas de handshake
  long-polling multi-requêtes, donc pas besoin d'affinité de session au load
  balancer Railway (qui n'en propose pas).
- Replay buffer profiler : les événements de progression arrivent par callback
  HTTP IA→API (`/internal/profiler/progress`) routé sur n'importe quelle
  replica. Le buffer est donc dans Redis (`profiler:replay:{userId}`, TTL
  15 min, purgé sur done/error) pour que le replay au join soit complet quelle
  que soit la replica du socket.

### 2. Crons — verrou singleton par tick

`apps/api/src/modules/locks/singleton-lock.service.ts` (+ `LocksModule`).
Sémantique : `SET bellum:cron-lock:{name} <replica> EX 600 NX` — **jamais
relâché**, il expire. Relâcher à la fin re-ouvrirait le tick pour une replica
dont l'horloge tire le même cron quelques secondes plus tard. TTL 10 min <
plus petite période (1 h). Redis en erreur = **fail-open** (le job tourne,
warning) : une panne du backend de lock ne doit pas sauter un reset de quotas.
Sans `REDIS_URL` : exécution directe (dev = inchangé).

| Cron                                          | Horaire         | Idempotent seul ?                                                                                                    | Verrou                                                             |
| --------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `monthly-quota-reset` (credits.service)       | 03:23           | ✅ UPDATE guardé (`period_start <= now()-1 month`, re-évalué sous row lock ; ledger issu du RETURNING de SON update) | `monthly-quota-reset` (évite N sweeps + ceinture-bretelles ledger) |
| `relance-reminders` (notifications.scheduler) | 07:00 Paris     | ❌ dedup `last_reminded_on` écrit APRÈS la notification → fenêtre de course large                                    | `relance-reminders`                                                |
| `weekly-summary` (notifications.scheduler)    | Lun 08:00 Paris | ❌ dedup `countSince` = read-then-write → double email                                                               | `weekly-summary`                                                   |
| `privacy-retention-sweep`                     | 04:17           | ✅ DELETE idempotent                                                                                                 | `privacy-retention-sweep`                                          |
| `oauth-cleanup`                               | xx:17           | ✅ DELETE idempotent                                                                                                 | `oauth-cleanup`                                                    |
| Outbox drainer (`@Interval` 2 s)              | —               | ✅ `FOR UPDATE SKIP LOCKED` (#350) — les replicas SE PARTAGENT le travail                                            | aucun (un verrou le sérialiserait pour rien)                       |

Injection : `@Optional() locks?: SingletonLockService` dans chaque host (même
pattern que `analytics`) — les specs qui construisent en direct restent
valides ; les modules (`credits`, `notifications`, `privacy`, `oauth`)
importent `LocksModule`.

### 3. État in-memory — inventaire

| Singleton                                                   | Verdict                                                                                                                                             |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Throttler global (`ThrottlerStorageRedisService`)           | ✅ déjà Redis                                                                                                                                       |
| OTP (`OtpService`)                                          | ✅ déjà Redis (code + throttle + attempts)                                                                                                          |
| Sessions / appareils (`user_sessions`)                      | ✅ DB                                                                                                                                               |
| `JwksCache` (clés publiques Supabase par `kid`)             | ✅ inoffensif — cache read-through de données publiques identiques partout, refetch sur miss                                                        |
| Idempotence analyse (jobId BullMQ + result cache DB)        | ✅ Redis/DB                                                                                                                                         |
| `AnalysisCancellationService`                               | ❌ → **fixé** : pub/sub `bellum:analysis:cancel`, abort local à la réception ; loopback inoffensif ; sans Redis = comportement in-process d'origine |
| `ProfilerGateway.buffers`                                   | ❌ → **fixé** : buffer Redis (point 1b)                                                                                                             |
| Maps locales dans les services (telemetry, coverage, kpis…) | ✅ inoffensives — scope requête/fonction, pas d'état inter-requêtes                                                                                 |

### 4. BullMQ

Multi-consumer safe by design (claims atomiques, locks de job,
`stalledInterval`/`lockDuration` déjà calibrés — voir `analysis.worker.ts`).
`removeOnFail`/DLQ inchangés. Le shutdown hook ferme les workers en drainant
les jobs actifs (`worker.close()` via `@nestjs/bullmq`).

### 5. Fichiers locaux

Aucun write disque dans `apps/api` (pas de multer/`diskStorage`/`tmpdir`).
L'ingest RAG passe en base64 dans le body → service IA → DB.

### 6. Graceful shutdown

- `main.ts` : `app.enableShutdownHooks()` (tripwire : `main.bootstrap.spec.ts`).
- Chaque possesseur de client Redis le ferme dans `onModuleDestroy` :
  adapter Socket.IO (gateway propriétaire), buffer profiler, pub/sub cancel,
  lock service, client OTP (framework).

## Ce que Louis règle côté Railway

1. **Replicas = 2+** sur le service API — aucun autre prérequis code.
2. **Sticky sessions : rien à faire** (pas dispo sur Railway, et inutile :
   client en `transports: ['websocket']` + adapter Redis).
3. **Healthcheck** : pointer le healthcheck Railway sur `GET /health`
   (200 `{status:'ok'}`, `@SkipThrottle`) pour que le rolling deploy n'envoie
   du trafic qu'aux replicas prêtes. `GET /version` donne le SHA déployé par
   replica (parité release).
4. Vérifier le plan Redis : chaque replica ouvre ~7-9 connexions
   (BullMQ, throttler, OTP, adapter pub+sub, buffer profiler, cancel pub+sub,
   locks) — à 2-3 replicas on reste très en dessous des limites Railway, juste
   à garder en tête si N grandit.

## Points d'attention (assumés, documentés)

- **Concurrency analyse globale = 3 × N replicas.** Le budget « 3 » protégeait
  les quotas tiers (Brave/Firecrawl/Apollo/Anthropic). À 2 replicas le plafond
  effectif devient 6 analyses simultanées. Si c'est trop, baisser
  `concurrency` dans `ANALYSIS_WORKER_OPTIONS` ou le rendre env-tunable.
- Le lock cron est un **dedup de tick**, pas un mutex d'exécution : si un cron
  dépassait 10 min ET qu'une replica démarrait pile après l'expiration du TTL,
  une deuxième exécution serait possible. Aucun cron actuel n'approche 10 min.
- Redis down au moment d'un tick = fail-open (N exécutions possibles ce
  tick-là) — même exposition qu'avant le chantier, jamais pire.
