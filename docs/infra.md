# Infrastructure — runtime checks

## Redis (Railway)

BullMQ relies on Redis for queue state and **cannot tolerate key eviction under memory pressure**: an evicted job key silently disappears from the queue, which corrupts queue semantics (stalled counters drift, completed/failed counters desync, retried jobs vanish mid-retry).

### Required policy

```
maxmemory-policy: noeviction
```

With `noeviction` Redis refuses new writes when memory is full rather than dropping keys. Combined with sensible retention (see below), this is safe.

### How to verify

From a workstation with `REDIS_URL` set:

```bash
redis-cli -u "$REDIS_URL" CONFIG GET maxmemory-policy
# expected: 1) "maxmemory-policy"
#           2) "noeviction"
```

On Railway:

1. Open the Redis service → **Variables** tab.
2. If `REDIS_MAXMEMORY_POLICY` isn't present, add it with value `noeviction`.
3. Redeploy the service. Re-run the `redis-cli` check above.

### Rationale

BullMQ's own docs require this: <https://docs.bullmq.io/guide/going-to-production#maxmemory-policy>.

---

## Analysis queue — retention

Configured in `apps/api/src/modules/analysis/analysis.module.ts` via `defaultJobOptions`:

| Option             | Value                          | Effect                                         |
| ------------------ | ------------------------------ | ---------------------------------------------- |
| `removeOnComplete` | `{ age: 86_400, count: 1000 }` | Keep completed jobs 24h or 1000 most recent.   |
| `removeOnFail`     | `{ age: 604_800 }`             | Keep failed jobs 7 days for post-mortem debug. |

Rationale: bound Redis memory, but keep enough history for UI "recent analyses" lists and failure investigation without an external archive.

---

## Analysis worker — stalled job recovery

Configured in `apps/api/src/modules/analysis/analysis.worker.ts` via the `@Processor` decorator:

```ts
@Processor('analysis', { stalledInterval: 30_000, maxStalledCount: 1 })
```

| Option            | Value    | Effect                                                                          |
| ----------------- | -------- | ------------------------------------------------------------------------------- |
| `stalledInterval` | `30_000` | Every 30s, BullMQ moves jobs whose worker died back to the wait queue.          |
| `maxStalledCount` | `1`      | A job that stalls more than once is moved to `failed` (protects against loops). |

### How to verify recovery after a crash

Manual test (local):

1. `POST /analysis/start` with a company name. Note the returned `jobId`.
2. During phase 2 (contacts), `kill -9 $(pgrep -f 'apps/api/src/main')`.
3. Restart the API. Within ~30s the stalled job is re-picked and execution resumes.

---

## Idempotency — deterministic `jobId`

`analysis.service.ts` derives `jobId = analysis:${userId}:${slug(company_name)}`:

- Two `POST /analysis/start` with the same `(userId, company_name)` while a job is active/waiting/delayed return the **same `jobId` and `accountId`** — no duplicate job, no duplicate Supabase account.
- Once the job reaches a terminal state (`completed`/`failed`), the `jobId` is released on the next start request (old job removed, new one enqueued with a fresh `accountId`).

Slug rules: NFD-normalised, lowercased, non-alphanum collapsed to `-`. Unicode-only names fall back to a 12-char SHA-1 prefix.

---

## Retry policy & Dead-Letter Queue

### Retry options (per `analysis.service.ts`)

| Option     | Value                                         | Effect                                                              |
| ---------- | --------------------------------------------- | ------------------------------------------------------------------- |
| `attempts` | `3`                                           | Max 3 executions total (1 initial + 2 retries).                     |
| `backoff`  | `{ type: 'exponential-jitter', delay: 5000 }` | Custom strategy; delay = `min(5000·2^(n-1), 60_000)` × rand(0.5–1). |

### Global job timeout

`process()` runs under `AbortSignal.timeout(600_000)` (10 min). The signal is combined (`AbortSignal.any`) with a per-phase `AbortSignal.timeout(300_000)` so a hung IA phase aborts at 5 min, and a slow aggregate never runs past 10 min. Aborted fetches throw a retryable error (caught by BullMQ, counted as one attempt).

### Retryable vs terminal error classification

HTTP status returned by the IA service determines whether the error goes through retries or is wrapped in `UnrecoverableError` (short-circuits BullMQ retries):

| Status                  | Type                 | Rationale                                    |
| ----------------------- | -------------------- | -------------------------------------------- |
| `5xx`                   | Retryable `Error`    | Upstream transient failure.                  |
| `429` (Rate Limited)    | Retryable `Error`    | Backoff gives the provider time to recover.  |
| `408` (Request Timeout) | Retryable `Error`    | Transient network.                           |
| `4xx` (other)           | `UnrecoverableError` | Bad request — retrying won't change outcome. |

### `analysis:retry` WebSocket event

Emitted by the worker at the start of `process()` when `attemptsStarted > 1`. Payload: `{ attempt, maxAttempts }`. The front-end uses it to render a "Nouvelle tentative…" state instead of showing the transient failure.

### `analysis-dlq` — Dead-Letter Queue

A second BullMQ queue (`analysis-dlq`, registered in `analysis.module.ts`) that receives **terminal failures only** — either all retries exhausted, or an `UnrecoverableError` thrown on any attempt.

#### When an item lands in the DLQ

Written by `@OnWorkerEvent('failed')` in `analysis.worker.ts`. A failure is terminal when:

- `error instanceof UnrecoverableError` (any attempt), or
- `job.attemptsMade >= job.opts.attempts` (retries exhausted).

Intermediate failures (retryable error, still have attempts left) **do not** write to Supabase, **do not** emit `analysis:error`, and **do not** go to the DLQ — they're just logged and BullMQ schedules the next retry.

#### DLQ item payload

```ts
{
  originalJobId: string // e.g. "analysis:user-123:sncf"
  payload: AnalysisJobData // full original job.data for replay
  failedReason: string // error.message at the terminal attempt
  unrecoverable: boolean // true if UnrecoverableError
  attemptsMade: number // how many attempts ran before giving up
  maxAttempts: number // value of opts.attempts at enqueue time
  correlationId: string | null // cross-service tracing ID
  failedAt: string // ISO-8601 timestamp
}
```

#### Retention

DLQ jobs are kept for **30 days** (`removeOnComplete: { age: 2_592_000 }`, `removeOnFail: false`) — longer than the main queue because these are the ones you need to investigate.

#### Inspecting the DLQ

```bash
redis-cli -u "$REDIS_URL" KEYS 'bull:analysis-dlq:*' | head
redis-cli -u "$REDIS_URL" LRANGE 'bull:analysis-dlq:wait' 0 10
# or via BullMQ programmatically:
#   const dlq = app.get<Queue>(getQueueToken('analysis-dlq'))
#   await dlq.getJobs(['wait', 'completed'], 0, 50)
```

#### Future: replay from DLQ

Out of scope for ENG-58 — a future ticket will add a UI/admin endpoint that reads a DLQ job and re-enqueues it on `analysis` with a fresh `accountId`. Today, manual replay = fetch the DLQ job, `analysisQueue.add('analyze', dlqJob.data.payload, { attempts: 3, backoff: { type: 'exponential-jitter', delay: 5000 } })`.
