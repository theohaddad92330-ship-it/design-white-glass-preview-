---
sources:
  - apps/ia/app/models/agent_envelope.py
  - packages/contracts/src/schemas/agent-envelope.ts
---

# Contrat d'orchestration entre agents

Spécification du contrat technique commun à tous les agents de BellumAI. Toute nouvelle
implémentation d'agent **doit** respecter ce contrat. Les agents existants migrent par
ordre du pipeline (Researcher → Hunter → Classifier → Strategist → Messenger →
Advisor / Scout / Watcher / Profiler).

Voir `agent_docs/agents.md` pour la liste des agents et leurs responsabilités. Ce doc-ci
définit le **format d'échange**, pas le rôle métier.

---

## 0. Pourquoi ce contrat

État actuel (mai 2026) :

- Côté IA Python : `app.agents.orchestrator.AgentResult(agent_name, success, data, error)`
  — 4 champs, pas de métadonnées, pas de code d'erreur stable, pas de version d'agent,
  pas de correlation_id, `data: dict` non typé.
- Côté API TS : `@bellum/contracts` expose `researchResponseSchema = { data: record }`,
  `contactsResponseSchema = { data: { contacts: array, ... } }` — enveloppe `{ data }`
  partielle, pas de section `error` ni `meta`.
- Erreurs IA : `ClaudeError`/`FirecrawlScrapeError` exposent `code`/`service`/`user_message`
  mais sont _raised_ puis mappées en HTTP par les handlers FastAPI. Elles ne traversent
  jamais l'orchestrator Python — donc un agent qui en attrape une perd toute info typée.
- Erreurs API : `HttpError` (`status`, `body`, `retryable`, `endpoint`) consommé par
  `analysis.worker.ts` pour décider `UnrecoverableError` vs retry BullMQ.

Conséquences observées : couplage implicite (Strategist suppose que Classifier a tourné),
divergence orchestrator Python ↔ pipeline HTTP (cf. `agents.md` §3), impossibilité de
distinguer "Apollo a renvoyé 0" de "Apollo est tombé", logs non-corrélables d'un agent
à l'autre.

---

## 1. Enveloppe canonique

Tout agent retourne une `AgentEnvelope[T]`. Format JSON sur le wire, types Pydantic côté
Python, schéma Zod côté TS.

```ts
type AgentEnvelope<T> = {
  status: AgentStatus // 1 valeur parmi 5, jamais null
  data: T | null // présent ssi status ∈ {success, partial_success}
  error: AgentError | null // présent ssi status ∈ {recoverable_failure, terminal_failure}
  meta: AgentMeta // toujours présent
}
```

**Règles d'invariance** (validées en CI par un test cross-language) :

| status                | data     | error                               |
| --------------------- | -------- | ----------------------------------- |
| `success`             | non-null | null                                |
| `partial_success`     | non-null | null _(warnings → `meta.warnings`)_ |
| `recoverable_failure` | null     | non-null                            |
| `terminal_failure`    | null     | non-null                            |
| `cancelled`           | null     | null                                |

Un parser doit rejeter toute combinaison hors de cette table.

### 1.1 Pourquoi cette forme et pas une autre

- **`status` séparé de `error`** : permet `partial_success` (data utilisable + warnings)
  sans fabriquer une fausse erreur. Cas réel : Researcher renvoie une fiche compte alors
  que Brave est tombé — la fiche est valide mais incomplète.
- **`data | null` et `error | null` mutuellement exclusifs** : empêche le pattern
  défensif `if (res.data) { ... } else if (res.error) { ... } else { ??? }` qui crée
  les bugs de type "no-op silencieux".
- **`meta` toujours présent** : la traçabilité ne dépend pas du succès. Un échec sans
  `correlation_id` est ingérable.

---

## 2. AgentStatus — 5 valeurs

```ts
type AgentStatus =
  | 'success' // Tout OK. `data` complet, pas de warning.
  | 'partial_success' // `data` utilisable mais dégradé. `meta.warnings` non-vide.
  | 'recoverable_failure' // Échec transitoire. Le worker DOIT retry. `error.retryable = true`.
  | 'terminal_failure' // Échec définitif. Le worker NE DOIT PAS retry. `error.retryable = false`.
  | 'cancelled' // Annulé via signal externe (client disconnect, user cancel).
```

### Mapping avec les couches existantes

| AgentStatus           | HTTP IA (FastAPI)              | API worker (BullMQ)                            |
| --------------------- | ------------------------------ | ---------------------------------------------- |
| `success`             | 200                            | ack                                            |
| `partial_success`     | 200 + `meta.warnings`          | ack + log warning + flag dégradé sur l'analyse |
| `recoverable_failure` | 5xx (HttpError retryable=true) | retry per backoff                              |
| `terminal_failure`    | 4xx (typiquement 402 ou 422)   | `UnrecoverableError` (échec immédiat)          |
| `cancelled`           | 499 (Client Closed Request)    | ack, pas de retry, pas d'alerte                |

Le `retryable` côté `HttpError` reste calculé à partir du status HTTP — il est
**redondant avec** `error.retryable` côté enveloppe **mais cohérent par construction**
(les handlers FastAPI mappent `terminal_failure → 422/402`, les routers `recoverable
_failure → 5xx`).

---

## 3. AgentMeta — métadonnées minimales

```ts
type AgentMeta = {
  // ── Identification (toujours présent) ────────────────────────────
  agent_name: string // snake_case stable, ex: "researcher"
  agent_version: string // semver, bumpé sur tout changement du schéma `data`/`error`

  // ── Traçabilité (toujours présent) ──────────────────────────────
  correlation_id: string // hérité de CorrelationIdMiddleware (vide si invocation interne)
  started_at: string // ISO-8601 UTC, ex: "2026-05-26T10:00:00.000Z"
  finished_at: string // ISO-8601 UTC
  duration_ms: number // entier, finished_at - started_at

  // ── LLM (présent ssi l'agent appelle Claude) ─────────────────────
  prompt_name?: string // ex: "bellum_research"
  model?: string // ex: "claude-sonnet-4-20250514"
  token_usage?: TokenUsage // { input_tokens, output_tokens, cost_usd }

  // ── Santé des sources externes (présent ssi pertinent) ───────────
  // Valeurs: 'ok' = appel réussi, 'degraded' = partiel, 'down' = en panne, 'skipped' = pas appelé
  source_health?: Record<string, 'ok' | 'degraded' | 'down' | 'skipped'>

  // ── Retry (présent si l'agent fait du retry interne, pas BullMQ) ─
  retry_count?: number

  // ── Warnings (présent ssi status = partial_success) ──────────────
  warnings?: AgentWarning[]
}

type TokenUsage = {
  input_tokens: number
  output_tokens: number
  cost_usd: number
}

type AgentWarning = {
  code: string // UPPER_SNAKE, ex: "BRAVE_DOWN_FALLBACK_USED"
  message: string // FR, lisible
  context?: Record<string, unknown>
}
```

**Règle d'or** : `meta` n'est jamais omise, même sur `cancelled`. Sans `meta.duration_ms`,
on ne sait pas si l'annulation a coûté 0 ms ou 4 minutes de Claude.

---

## 4. AgentError — normalisation des erreurs

```ts
type AgentError = {
  code: ErrorCode // identifiant stable, registre §5
  service: ErrorService // d'où vient l'erreur (registre §5)
  severity: 'recoverable' | 'terminal'
  retryable: boolean // = (severity === 'recoverable')  // dérivé mais explicite
  user_message: string // FR, affichable à l'utilisateur final
  debug_message: string // EN, technique, pour les logs
  cause?: AgentError // chaîne d'origine (max 3 niveaux pour éviter l'enflure)
  context?: Record<string, unknown> // ex: { url, status, prompt_name, model }
}

type ErrorService = 'claude' | 'firecrawl' | 'brave' | 'apollo' | 'pappers' | 'supabase' | 'internal' | 'precondition'
```

### Règles

- `code` est **stable** : un changement de code est un changement de contrat (bump
  `agent_version`). Les outils en aval (front, alerting, Sentry tags) s'y abonnent.
- `code` est **UPPER_SNAKE_CASE** et **unique cross-service** (préfixé par le service :
  `CLAUDE_OUTPUT_TRUNCATED`, pas `OUTPUT_TRUNCATED`).
- `severity === 'terminal'` ⇔ `retryable === false`. Validation CI.
- `user_message` est en français, sans détail technique, sans nom de service. Le
  message peut être réutilisé tel quel par la couche UI ; il est destiné à un
  commercial ESN, pas un dev.
- `debug_message` peut citer prompts/URLs/IDs ; il finit dans les logs et Sentry.
- Si une exception sous-jacente porte déjà l'info (`ClaudeError`, `FirecrawlScrapeError`,
  `HttpError`), l'adapter la convertit en `AgentError` au lieu de la propager —
  l'enveloppe ne _raise_ jamais.

---

## 5. Registre des codes d'erreur

Liste exhaustive. Ajouter une ligne ici est une décision archi — ne pas créer de codes
ad-hoc dans le code.

### Claude (LLM)

| code                      | severity    | HTTP IA | user_message (FR)                                               |
| ------------------------- | ----------- | ------- | --------------------------------------------------------------- |
| `CLAUDE_OUTPUT_TRUNCATED` | terminal    | 422     | Réponse Claude tronquée. L'analyse a été annulée.               |
| `CLAUDE_INVALID_JSON`     | terminal    | 422     | Claude a renvoyé une réponse invalide. L'équipe a été notifiée. |
| `CLAUDE_RATE_LIMITED`     | recoverable | 429     | Surcharge Claude temporaire. Nouvelle tentative en cours.       |
| `CLAUDE_API_ERROR`        | recoverable | 5xx     | Erreur Claude transitoire. Nouvelle tentative en cours.         |
| `CLAUDE_UNKNOWN`          | terminal    | 422     | Erreur Claude inattendue. L'équipe a été notifiée.              |

### Firecrawl

| code                             | severity    | HTTP IA | user_message (FR)                                             |
| -------------------------------- | ----------- | ------- | ------------------------------------------------------------- |
| `FIRECRAWL_INSUFFICIENT_CREDITS` | terminal    | 402     | Quota de scraping épuisé. L'équipe a été notifiée.            |
| `FIRECRAWL_AUTH_FAILED`          | terminal    | 402     | Erreur d'authentification Firecrawl. L'équipe a été notifiée. |
| `FIRECRAWL_RATE_LIMITED`         | recoverable | 429     | Surcharge Firecrawl temporaire. Nouvelle tentative en cours.  |
| `FIRECRAWL_WEBSITE_BLOCKED`      | recoverable | N/A     | Une page n'a pas pu être lue. L'analyse continue.             |
| `FIRECRAWL_INTERNAL`             | recoverable | 5xx     | Erreur serveur Firecrawl. Nouvelle tentative en cours.        |
| `FIRECRAWL_UNKNOWN`              | terminal    | 402     | Erreur Firecrawl inattendue. L'équipe a été notifiée.         |

### Brave / Apollo / Pappers (sources externes non-LLM)

| code                  | severity    | user_message (FR)                                                            |
| --------------------- | ----------- | ---------------------------------------------------------------------------- |
| `BRAVE_DOWN`          | recoverable | Recherche web indisponible. L'analyse continue en mode dégradé.              |
| `APOLLO_EMPTY`        | recoverable | Aucun contact trouvé sur Apollo. Repli sur les mentions presse.              |
| `APOLLO_UNKNOWN`      | recoverable | Apollo indisponible. Repli sur les mentions presse.                          |
| `APOLLO_RATE_LIMITED` | recoverable | Limite Apollo atteinte. Nouvelle tentative en cours.                         |
| `APOLLO_AUTH_FAILED`  | terminal    | Clé Apollo invalide ou expirée. L'équipe a été notifiée.                     |
| `APOLLO_PLAN_BLOCKED` | terminal    | Plan Apollo insuffisant pour la recherche de contacts. Contacter le support. |
| `PAPPERS_NOT_FOUND`   | recoverable | Entreprise introuvable dans Pappers. L'analyse continue.                     |
| `PAPPERS_UNKNOWN`     | recoverable | Pappers indisponible. L'analyse continue sans données légales.               |

### Agent / interne

| code                        | severity | HTTP IA | user_message (FR)                                                  |
| --------------------------- | -------- | ------- | ------------------------------------------------------------------ |
| `AGENT_PRECONDITION_FAILED` | terminal | 412     | Données manquantes pour cette analyse. L'équipe a été notifiée.    |
| `AGENT_TIMEOUT`             | terminal | 504     | L'analyse a dépassé le temps imparti. Nouvelle tentative possible. |
| `AGENT_CANCELLED`           | n/a      | 499     | Analyse annulée.                                                   |
| `AGENT_INTERNAL`            | terminal | 500     | Erreur interne. L'équipe a été notifiée.                           |

### HTTP (fallbacks côté client TS quand le body upstream n'est pas typé)

| code               | severity    | HTTP IA | user_message (FR)                                        |
| ------------------ | ----------- | ------- | -------------------------------------------------------- |
| `HTTP_UNAVAILABLE` | recoverable | 5xx     | Service indisponible. Nouvelle tentative en cours.       |
| `HTTP_REJECTED`    | terminal    | 4xx     | Le service a refusé la requête. L'équipe a été notifiée. |

> **Ajouter un code** = ajouter une ligne ici **et** dans les enums Pydantic / Zod
> dans `packages/contracts/src/schemas/agent-envelope.ts` + `apps/ia/app/models/agent_envelope.py`.
> Sinon le contrat est cassé silencieusement.

---

## 6. Schémas de référence

### 6.1 Python (Pydantic)

À implémenter dans `apps/ia/app/models/agent_envelope.py` :

```python
from enum import Enum
from typing import Generic, Optional, TypeVar
from pydantic import BaseModel, Field, model_validator

T = TypeVar("T")


class AgentStatus(str, Enum):
    SUCCESS = "success"
    PARTIAL_SUCCESS = "partial_success"
    RECOVERABLE_FAILURE = "recoverable_failure"
    TERMINAL_FAILURE = "terminal_failure"
    CANCELLED = "cancelled"


class TokenUsage(BaseModel):
    input_tokens: int
    output_tokens: int
    cost_usd: float


class AgentWarning(BaseModel):
    code: str
    message: str
    context: Optional[dict] = None


class AgentMeta(BaseModel):
    agent_name: str
    agent_version: str
    correlation_id: str = ""
    started_at: str
    finished_at: str
    duration_ms: int
    prompt_name: Optional[str] = None
    model: Optional[str] = None
    token_usage: Optional[TokenUsage] = None
    source_health: Optional[dict[str, str]] = None
    retry_count: Optional[int] = None
    warnings: Optional[list[AgentWarning]] = None


class AgentError(BaseModel):
    code: str
    service: str
    severity: str  # 'recoverable' | 'terminal'
    retryable: bool
    user_message: str
    debug_message: str
    cause: Optional["AgentError"] = None
    context: Optional[dict] = None

    @model_validator(mode="after")
    def _retryable_matches_severity(self) -> "AgentError":
        expected = self.severity == "recoverable"
        if self.retryable != expected:
            raise ValueError(
                f"retryable={self.retryable} contradicts severity={self.severity}"
            )
        return self


class AgentEnvelope(BaseModel, Generic[T]):
    status: AgentStatus
    data: Optional[T] = None
    error: Optional[AgentError] = None
    meta: AgentMeta

    @model_validator(mode="after")
    def _check_invariant(self) -> "AgentEnvelope[T]":
        s = self.status
        has_data = self.data is not None
        has_error = self.error is not None
        if s in (AgentStatus.SUCCESS, AgentStatus.PARTIAL_SUCCESS):
            if not has_data or has_error:
                raise ValueError(f"status={s} requires data, forbids error")
        elif s in (AgentStatus.RECOVERABLE_FAILURE, AgentStatus.TERMINAL_FAILURE):
            if has_data or not has_error:
                raise ValueError(f"status={s} forbids data, requires error")
        elif s == AgentStatus.CANCELLED:
            if has_data or has_error:
                raise ValueError("cancelled forbids both data and error")
        return self
```

### 6.2 TypeScript (Zod)

À implémenter dans `packages/contracts/src/schemas/agent-envelope.ts` :

```ts
import { z } from 'zod'

export const agentStatusSchema = z.enum([
  'success',
  'partial_success',
  'recoverable_failure',
  'terminal_failure',
  'cancelled',
])
export type AgentStatus = z.infer<typeof agentStatusSchema>

export const tokenUsageSchema = z.object({
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  cost_usd: z.number().nonnegative(),
})

export const agentWarningSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
  message: z.string(),
  context: z.record(z.unknown()).optional(),
})

export const agentMetaSchema = z.object({
  agent_name: z.string().regex(/^[a-z][a-z0-9_]+$/),
  agent_version: z.string().regex(/^\d+\.\d+\.\d+$/),
  correlation_id: z.string(),
  started_at: z.string().datetime(),
  finished_at: z.string().datetime(),
  duration_ms: z.number().int().nonnegative(),
  prompt_name: z.string().optional(),
  model: z.string().optional(),
  token_usage: tokenUsageSchema.optional(),
  source_health: z.record(z.enum(['ok', 'degraded', 'down', 'skipped'])).optional(),
  retry_count: z.number().int().nonnegative().optional(),
  warnings: z.array(agentWarningSchema).optional(),
})

export const agentErrorSchema: z.ZodType<AgentError> = z.lazy(() =>
  z
    .object({
      code: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
      service: z.enum(['claude', 'firecrawl', 'brave', 'apollo', 'pappers', 'supabase', 'internal', 'precondition']),
      severity: z.enum(['recoverable', 'terminal']),
      retryable: z.boolean(),
      user_message: z.string().min(1),
      debug_message: z.string().min(1),
      cause: agentErrorSchema.optional(),
      context: z.record(z.unknown()).optional(),
    })
    .refine(e => e.retryable === (e.severity === 'recoverable'), 'retryable must match severity'),
)
export type AgentError = {
  code: string
  service: 'claude' | 'firecrawl' | 'brave' | 'apollo' | 'pappers' | 'supabase' | 'internal' | 'precondition'
  severity: 'recoverable' | 'terminal'
  retryable: boolean
  user_message: string
  debug_message: string
  cause?: AgentError
  context?: Record<string, unknown>
}

export const agentEnvelopeSchema = <T extends z.ZodTypeAny>(data: T) =>
  z
    .object({
      status: agentStatusSchema,
      data: data.nullable(),
      error: agentErrorSchema.nullable(),
      meta: agentMetaSchema,
    })
    .superRefine((env, ctx) => {
      const hasData = env.data !== null
      const hasError = env.error !== null
      const s = env.status
      if ((s === 'success' || s === 'partial_success') && (!hasData || hasError)) {
        ctx.addIssue({ code: 'custom', message: `status=${s} requires data, forbids error` })
      }
      if ((s === 'recoverable_failure' || s === 'terminal_failure') && (hasData || !hasError)) {
        ctx.addIssue({ code: 'custom', message: `status=${s} forbids data, requires error` })
      }
      if (s === 'cancelled' && (hasData || hasError)) {
        ctx.addIssue({ code: 'custom', message: 'cancelled forbids both data and error' })
      }
    })
```

### 6.3 Parité Python ↔ TS

Une CI doit échouer si un champ existe d'un côté et pas de l'autre. Stratégie minimum
viable : un test partagé qui sérialise un fixture Python en JSON et le parse via Zod
(`pnpm test:contract:parity`). À automatiser via `pre-commit` une fois en place.

---

## 7. Exemples

### 7.1 Succès complet (Researcher, toutes sources OK)

```json
{
  "status": "success",
  "data": {
    "businessDescription": "...",
    "sector": "Transport",
    "employees": 271000,
    "revenue": 35400000000,
    "siren": "552049447",
    "entitiesExhaustive": [...]
  },
  "error": null,
  "meta": {
    "agent_name": "researcher",
    "agent_version": "1.0.0",
    "correlation_id": "01J5K7...",
    "started_at": "2026-05-26T10:00:00.000Z",
    "finished_at": "2026-05-26T10:01:23.456Z",
    "duration_ms": 83456,
    "prompt_name": "bellum_research",
    "model": "claude-sonnet-4-20250514",
    "token_usage": { "input_tokens": 12453, "output_tokens": 6789, "cost_usd": 0.139 },
    "source_health": { "brave": "ok", "firecrawl": "ok", "pappers": "ok" }
  }
}
```

### 7.2 Succès partiel (Researcher, Brave down)

```json
{
  "status": "partial_success",
  "data": { "businessDescription": "...", ... },
  "error": null,
  "meta": {
    "agent_name": "researcher", "agent_version": "1.0.0",
    "correlation_id": "01J5K7...",
    "started_at": "...", "finished_at": "...", "duration_ms": 91200,
    "source_health": { "brave": "down", "firecrawl": "ok", "pappers": "ok" },
    "warnings": [
      {
        "code": "BRAVE_DOWN_FALLBACK_USED",
        "message": "Recherche web indisponible. Analyse basée sur Firecrawl + Pappers seuls.",
        "context": { "fallback": "firecrawl+pappers" }
      }
    ]
  }
}
```

### 7.3 Échec récupérable (Claude rate-limited)

```json
{
  "status": "recoverable_failure",
  "data": null,
  "error": {
    "code": "CLAUDE_RATE_LIMITED",
    "service": "claude",
    "severity": "recoverable",
    "retryable": true,
    "user_message": "Surcharge Claude temporaire. Nouvelle tentative en cours.",
    "debug_message": "Anthropic API returned 429 for prompt=bellum_research model=claude-sonnet-4-20250514",
    "context": { "prompt_name": "bellum_research", "retry_after_s": 30 }
  },
  "meta": { "agent_name": "researcher", "agent_version": "1.0.0", ... }
}
```

### 7.4 Échec terminal (Claude output truncated)

```json
{
  "status": "terminal_failure",
  "data": null,
  "error": {
    "code": "CLAUDE_OUTPUT_TRUNCATED",
    "service": "claude",
    "severity": "terminal",
    "retryable": false,
    "user_message": "Réponse Claude tronquée. L'analyse a été annulée.",
    "debug_message": "max_tokens=16000 hit at prompt=bellum_research model=claude-sonnet-4-20250514",
    "context": { "prompt_name": "bellum_research", "max_tokens": 16000 }
  },
  "meta": { "agent_name": "researcher", "agent_version": "1.0.0", ... }
}
```

### 7.5 Annulation (client disconnect)

```json
{
  "status": "cancelled",
  "data": null,
  "error": null,
  "meta": {
    "agent_name": "researcher",
    "agent_version": "1.0.0",
    "correlation_id": "01J5K7...",
    "started_at": "...",
    "finished_at": "...",
    "duration_ms": 12400,
    "source_health": { "brave": "ok", "firecrawl": "skipped", "pappers": "skipped" }
  }
}
```

---

## 8. Handoffs entre agents

Le contrat impose que **l'output d'un agent N soit l'input d'un agent N+1**, modulo un
adaptateur fin. Concrètement :

```python
# Dans Orchestrator.run_analysis
research_env = await researcher.run(...)
if research_env.status in (AgentStatus.TERMINAL_FAILURE, AgentStatus.CANCELLED):
    return research_env  # propagation immédiate, pas de Phase 2

# partial_success est OK pour continuer — c'est le rôle de l'orchestrator de décider
hunter_env = await hunter.run(
    company_name=...,
    research_data=research_env.data,   # contrat: Hunter accepte le data brut du Researcher
    profile_data=...,
)
```

**Règles** :

- Un agent **N+1** consomme `envelope.data` de l'agent **N** ; il n'a accès à rien d'autre.
- Si `data` du N est `None` (status `terminal_failure` ou `cancelled`), l'orchestrator
  **doit** s'arrêter et propager l'enveloppe. Pas de "data par défaut".
- `partial_success` est toujours propagé tel quel : le N+1 décide s'il sait gérer le
  dégradé (Classifier sait gérer `peopleMentioned` vide ; Strategist non).
- L'orchestrator agrège les `warnings` de tous les agents dans la réponse finale.

---

## 9. Plan de migration

Migration progressive sans casser le pipeline existant.

| Phase | Livrable                                                                                                                                                     | Durée estimée |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| M1    | `agent_envelope.py` + `agent-envelope.ts` créés, tests de parité OK                                                                                          | 0.5j          |
| M2    | Registre des codes d'erreur câblé (enums Pydantic + Zod) + migration `ClaudeError` / `FirecrawlScrapeError` vers helpers `AgentError.from_claude_error(...)` | 0.5j          |
| M3    | `ResearcherAgent` retourne `AgentEnvelope[ResearchData]`. `phase1_research.py` wrap dans l'enveloppe sur le wire                                             | 1j            |
| M4    | Idem pour `ContactHunterAgent`, `ClassifierAgent` (à créer, cf. `agents.md` §3 #1), `StrategistAgent`, `MessengerAgent`                                      | 2j            |
| M5    | `analysis.worker.ts` lit `envelope.status` au lieu de catch sur `HttpError.retryable` ; alimente la barre de progression avec `meta.source_health`           | 1j            |
| M6    | Suppression de `AgentResult` (legacy) du repo                                                                                                                | 0.5j          |

Compat : pendant M3-M5, le pipeline tolère les deux formats côté API worker (feature
flag `IA_AGENT_ENVELOPE_V1`) jusqu'à ce que tous les endpoints IA soient migrés.

---

## 10. Checklist : ajouter un nouvel agent

À cocher dans la PR qui introduit l'agent.

- [ ] Le nom est en `snake_case`, unique, ajouté à `agent_docs/agents.md` §1.
- [ ] `agent_version` initiale = `1.0.0`. Bumpé sur tout changement de `data` ou des codes d'erreur émis.
- [ ] Le schéma `data` est défini en Pydantic ET en Zod (mêmes champs, mêmes noms).
- [ ] L'agent implémente `async def run(input) -> AgentEnvelope[Data]` (pas d'autre signature).
- [ ] Les exceptions internes sont **interceptées** et converties en `AgentError` via le
      registre §5. Une exception non-catchée = bug du contrat, pas un état métier.
- [ ] Tous les codes d'erreur émis sont dans §5. Si nouveau code → PR avec mise à jour
      de ce document avant merge.
- [ ] Tests unitaires : un par status (`success`, `partial_success`, `recoverable_failure`,
      `terminal_failure`, `cancelled`).
- [ ] L'agent est ajouté à `agent_docs/agents.md` §2 (responsabilité, inputs, outputs,
      handoffs, boundaries).
- [ ] Si l'agent appelle Claude : `meta.prompt_name`, `meta.model`, `meta.token_usage` remplis.
- [ ] Si l'agent appelle des sources externes : `meta.source_health` rempli pour chacune.

---

## 11. Définition de fait (DoD ticket _Contrat d'orchestration_)

- [x] **Schéma commun input / output défini** — `AgentEnvelope<T>` §1, invariants §1 + table §1.
- [x] **Métadonnées minimales standardisées** — `AgentMeta` §3 (identification, traçabilité,
      LLM, source_health, warnings).
- [x] **Erreurs et codes de statut normalisés** — `AgentStatus` §2, `AgentError` §4,
      registre exhaustif §5.
- [x] **Contrat documenté et exploitable** — schémas Pydantic §6.1 et Zod §6.2 prêts à
      copier-coller, exemples §7, handoffs §8, checklist §10.

Les implémentations (Pydantic, Zod, migration des agents) sont scopées dans le plan §9
— elles font l'objet de tickets enfants, pas de ce ticket de définition.
