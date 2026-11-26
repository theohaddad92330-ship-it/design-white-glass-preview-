# Profiler — Mémoire et contexte (ENG-121)

Spécification de ce que l'agent **Profiler** doit comprendre, stocker et restituer
sur l'utilisateur. C'est le document de référence pour les tickets enfants :

- **ENG-148** — générer le profil personnalisé après le Temps 1.
- **ENG-153** — permettre l'édition des réponses onboarding depuis le profil.
- **ENG-154** — injecter le contexte onboarding dans les agents clés.

Lié à :

- `agent_docs/agents.md` §2.1 (rôle métier du Profiler).
- `agent_docs/agent-contract.md` (format AgentEnvelope, codes d'erreur).
- `packages/contracts/src/schemas/onboarding.ts` (10 champs Temps 1).
- `packages/contracts/src/schemas/profile-context.ts` (mirror TS de `ProfileContext`).

---

## 1. Inventaire des objets de contexte

Quatre couches, du plus statique au plus volatile.

### 1.1 Identité (rare, jamais utilisée comme signal de personnalisation)

| Champ                 | Localisation               | Modifié via                  |
| --------------------- | -------------------------- | ---------------------------- |
| `profiles.first_name` | Postgres `public.profiles` | `/settings/profile/identity` |
| `profiles.last_name`  | Postgres `public.profiles` | `/settings/profile/identity` |

→ Le Profiler n'a besoin que du nom et du prénom (uniquement pour personnaliser
`bellum_phrases.welcome` et les éventuels appellatifs). **N'entrent PAS** dans
le prompt comme signal de personnalisation commerciale.

### 1.2 Réponses ESN brutes (la **source de vérité** du Profiler)

`esn_profiles.*` — versionné par `(user_id, version)`, `is_current` flag. 10 champs
Temps 1 :

| Champ                  | Kind          | Cardinalité |
| ---------------------- | ------------- | ----------- |
| `esn_name`             | text          | 1           |
| `consultant_size`      | single        | 1           |
| `sales_team_size`      | single        | 1           |
| `expertise_areas`      | multi-grouped | 1..5        |
| `positioning`          | single        | 1           |
| `staffing_model`       | single        | 1           |
| `target_sectors`       | multi-grouped | 1..5        |
| `target_company_types` | multi         | 1..N        |
| `geo_zones`            | multi         | 1..N        |
| `main_sales_pain`      | single        | 1           |

Lu par :

1. **Le Profiler** comme `answers: dict` → produit `ProfileContext`.
2. **« Mon profil »** (`/settings/profile/$stage`) pour l'édition.
3. Aucun autre agent — les agents lisent `ProfileContext`, pas `esn_profiles`.

### 1.3 Profil contextualisé (sortie du Profiler, **durable**)

`profiles.profile_context` (JSONB). Schéma typé :
`apps/ia/app/models/profile_context.py` ↔
`packages/contracts/src/schemas/profile-context.ts`. 7 blocs :

| Bloc                    | Rôle                                                            |
| ----------------------- | --------------------------------------------------------------- |
| `esn_archetype`         | enum 5 valeurs (soloHunter…enterprisePlayer)                    |
| `selling_posture`       | enum 5 valeurs (expertiseRare…nicheVerticals)                   |
| `ideal_account_profile` | size, sectors_priority[], decision_level, entry_strategy        |
| `analysis_parameters`   | brave_queries_count, firecrawl_pages_count, contacts_target, …  |
| `messaging_style`       | tone, length, value_proposition_angle, differentiation_points[] |
| `coaching_insights`     | main_weakness, key_advice, cadence_recommendation, kpi_targets  |
| `bellum_phrases`        | welcome, first_analysis_cta, weekly_summary_intro, …            |

Lu par : **TOUS les agents downstream** (Researcher, Contact Hunter, Classifier,
Strategist, Messenger, Scout, Advisor) — paramètre `profile_data: ProfileContext`.

### 1.4 Signaux opérationnels (transient / dérivé)

Données qui informent le contexte courant **sans alimenter le prompt Profiler**.

| Signal                     | Localisation                                  | TTL                       | Consommateurs               |
| -------------------------- | --------------------------------------------- | ------------------------- | --------------------------- |
| Statut onboarding          | `user_onboarding_state.status`                | jusqu'à completed         | API redirect routing        |
| Étape courante             | `user_onboarding_state.current_stage_id`      | jusqu'au prochain advance | Resume `/onboarding`        |
| `profile_context_stale_at` | `profiles.profile_context_stale_at` (NOUVEAU) | jusqu'au refresh          | Worker Profiler debounce    |
| Comptes ouverts (focus)    | URL TanStack (`/accounts/$id`)                | par session               | Advisor (chat ancré compte) |
| Historique d'analyses      | `accounts`, `attack_angles`, `action_plans`   | durable                   | Strategist, Advisor         |
| Alertes Watcher            | `alerts` (Postgres)                           | rolling                   | Notifications, Watcher      |
| Cache d'appel LLM          | Redis `claude:*`                              | minutes                   | `claude_service` cost optim |

---

## 2. Persisted vs temporary

| Donnée                                | Persisted ?            | Pourquoi                                                                |
| ------------------------------------- | ---------------------- | ----------------------------------------------------------------------- |
| `esn_profiles.*` (10 champs)          | ✅ Postgres            | Source utilisateur, éditable, versionnée                                |
| `profiles.profile_context`            | ✅ Postgres (JSONB)    | Sortie LLM coûteuse (Opus, ~$X/refresh), réutilisée par chaque pipeline |
| `profiles.first_name/last_name/email` | ✅ Postgres            | Identité durable                                                        |
| `profile_context_stale_at`            | ✅ Postgres            | Trigger de refresh debounce coordonné cross-instance                    |
| Statut onboarding                     | ✅ Postgres            | Reprise multi-device                                                    |
| Compte courant (focus)                | ❌ URL only            | État éphémère, déductible de la nav                                     |
| Historique conversation Advisor       | ❌ Front state         | Pas d'archivage côté Profiler (Advisor n'a pas de mémoire long terme)   |
| Cache Claude                          | 🟡 Redis               | Optimisation coût, n'influence pas la sémantique                        |
| Outputs d'agents (Researcher, etc.)   | ✅ Postgres par compte | Périmètre **par-compte**, pas profil utilisateur                        |

**Règle d'or** : seul `esn_profiles.*` (source) + `profile_context` (dérivé)
constituent la mémoire profil. Le reste est soit identité, soit per-account, soit
éphémère.

---

## 3. Règles de mise à jour

### 3.1 Génération initiale

1. L'utilisateur termine le Temps 1 → API `POST /onboarding/complete` → `status = completed`.
2. L'API (worker) appelle l'IA : `POST /profiler/generate` `{ user_id, ...answers }`.
   La payload est dérivée de la ligne courante `esn_profiles where is_current = true`.
3. `ProfilerAgent.run(answers, user_id, persist=True)` → écrit `profile_context` dans Postgres.
4. AgentEnvelope renvoyé au worker pour audit / Sentry / WebSocket.

### 3.2 Refresh sur édition (ENG-153)

Quand l'utilisateur édite une réponse via `/settings/profile/$stage` :

1. Front `PUT /esn-profile` (auto-save par stage actuellement).
2. API persiste, puis :
   - Set `profiles.profile_context_stale_at = NOW()`.
   - Enqueue un job `profiler_refresh` (BullMQ) **debouncé à 60 s** par `user_id`
     (clé Redis BullMQ `profiler-refresh:{userId}` avec `delay` qui se rétracte
     à chaque nouvel arrivage — pattern existant pour `analysis.worker`).
3. Le worker `profiler.worker.ts` consomme : lit `esn_profiles is_current`,
   appelle `POST /profiler/refresh`, qui réécrit `profile_context` ET clear `stale_at`.
4. Si la régénération échoue (`terminal_failure`), `stale_at` reste positionné →
   prochaine analyse lit le **contexte précédent** + log warning Sentry. Pas de
   bloquant utilisateur — on dégrade en gardant l'ancien contexte plutôt que
   d'empêcher le pipeline.

### 3.3 Refresh manuel (optionnel)

Bouton « Régénérer mon profil » dans `/settings/profile` → endpoint `POST /profiler/refresh`
direct, ignore debounce. Faible priorité (ENG ouverte si besoin).

### 3.4 Idempotence et concurrence

- **Snapshot par pipeline** : l'orchestrator lit `profile_context` une fois au démarrage
  d'une analyse et le passe par valeur à chaque agent. Un refresh concurrent
  n'invalide PAS la pipeline en cours.
- **No-op silencieux** : si `stale_at` est null au moment où le worker tire un job
  Profiler, on skip (les debounces peuvent générer des doublons).
- **Pas de déterminisme strict** : Opus produit des variations entre runs même
  pour le même input. On accepte la variance — le profil n'est pas un fingerprint.

---

## 4. Format de sortie standard

L'agent retourne **`AgentEnvelope[ProfileContext]`** — strictement conforme à
`agent-contract.md` §1.

### 4.1 Statuts pertinents

| Status                | Cas                                                     | data             | error                   |
| --------------------- | ------------------------------------------------------- | ---------------- | ----------------------- |
| `success`             | Opus a renvoyé un JSON valide, conforme au schéma       | `ProfileContext` | `null`                  |
| `terminal_failure`    | `AGENT_PRECONDITION_FAILED` (answers vide)              | `null`           | `AgentError`            |
| `terminal_failure`    | `CLAUDE_OUTPUT_TRUNCATED` / `CLAUDE_INVALID_JSON`       | `null`           | `AgentError`            |
| `recoverable_failure` | `CLAUDE_RATE_LIMITED` / `CLAUDE_API_ERROR` (5xx)        | `null`           | `AgentError`, retryable |
| `cancelled`           | Client disconnect avant Opus → `asyncio.CancelledError` | `null`           | `null`                  |

**Pas de `partial_success`** — soit on a un `ProfileContext` complet, soit pas.
Profiler est one-shot, aucune source partielle à dégrader.

### 4.2 Méta requises

```python
AgentMeta(
    agent_name="profiler",
    agent_version="1.0.0",       # bump à chaque changement de schéma ProfileContext
    correlation_id=...,           # hérité du middleware CorrelationId
    started_at=..., finished_at=..., duration_ms=...,
    prompt_name="bellum_profiler",
    model=CLAUDE_PROFILER_MODEL,   # Opus (seul agent qui l'utilise)
    token_usage=TokenUsage(input, output, cost_usd),
    source_health={"claude": "ok" | "down"},
)
```

### 4.3 Wire format

`POST /profiler/generate` retourne :

- **200** + `AgentEnvelope[ProfileContext]` (`status: success`).
- **412** + envelope (`status: terminal_failure`, code `AGENT_PRECONDITION_FAILED`).
- **422** + envelope (`status: terminal_failure`, service `claude`).
- **5xx** + envelope (`status: recoverable_failure`) → BullMQ retry.
- **499** + envelope (`status: cancelled`).

Le flag `IA_AGENT_ENVELOPE_V1` est on en prod ; le fallback legacy
`ProfileContextResponse({user_id, profile_context})` est conservé pour migration
seulement (à retirer post-ENG-142).

---

## 5. Pattern d'injection (lecture du contexte par les agents downstream)

Implémenté côté orchestrator Python et router HTTP. Convention unique :

```python
# Orchestrator (ou worker BullMQ TS qui appelle les routers /phase/N)
profile = sb.table("profiles").select("profile_context").eq("user_id", user_id).single()
if not profile or not profile["profile_context"]:
    raise PreconditionFailed("AGENT_PRECONDITION_FAILED — onboarding non complété")

context = ProfileContext(**profile["profile_context"])

# Passé par valeur à chaque agent — JAMAIS re-lu en cours de pipeline.
research_env  = await researcher.run(company_name=..., profile_data=context, ...)
hunter_env    = await hunter.run(company_name=..., profile_data=context, ...)
classifier_env = await classifier.run(profile_data=context, contacts_data=..., ...)
strategist_env = await strategist.run(profile_data=context, ...)
messenger_env  = await messenger.run(profile_data=context, contacts=..., ...)
```

Côté agent, **règle stricte** : `profile_data` est un paramètre obligatoire,
typé `ProfileContext` (Pydantic). Pas de `Optional[ProfileContext]` — si on
n'a pas de contexte on n'appelle pas l'agent.

ENG-154 audite la conformité de chaque agent à cette règle (certains routers
HTTP acceptent encore un dict non-typé).

---

## 6. Mapping Temps-1 → input Profiler (action ENG-148)

**État actuel** : le prompt `bellum_profiler` et le DTO `OnboardingAnswers`
(`apps/ia/app/routers/profiler.py`) sont calés sur l'**ancien** onboarding
12 champs (`company_name, size, offers, sectors, personas, sales_cycle,
avg_tjm, current_tools, goal, …`). Le nouveau Temps-1 expose **10 champs**
nommés différemment.

| Nouveau Temps-1 (`esn_profiles`)  | Legacy prompt          | Action recommandée                                                   |
| --------------------------------- | ---------------------- | -------------------------------------------------------------------- |
| `esn_name`                        | `company_name`         | rename DTO + prompt                                                  |
| `consultant_size`                 | `size`                 | rename                                                               |
| `sales_team_size`                 | `sales_team_size`      | ✅ identique                                                         |
| `expertise_areas` (multi-grouped) | `offers`               | rename + accepte la liste verbatim (les libellés sont déjà riches)   |
| `positioning`                     | —                      | **nouveau** — ajouter au prompt comme signal-clé (archétype/posture) |
| `staffing_model`                  | —                      | **nouveau** — ajouter au prompt (impact volume + cadence)            |
| `target_sectors` (multi-grouped)  | `sectors`              | rename                                                               |
| `target_company_types`            | (proxy via `personas`) | **nouveau** — signal direct du `ideal_account_profile.size`          |
| `geo_zones` (multi)               | `geo_zone` (single)    | élargir prompt à une liste                                           |
| `main_sales_pain`                 | `main_challenge`       | rename                                                               |
| —                                 | `personas`             | **supprimé** — le Profiler le dérive maintenant                      |
| —                                 | `sales_cycle`          | **supprimé** — non collecté en Temps 1                               |
| —                                 | `avg_tjm`              | **supprimé**                                                         |
| —                                 | `current_tools`        | **supprimé** — Temps 2                                               |
| —                                 | `goal`                 | **supprimé** — Temps 2                                               |

Deux stratégies d'implémentation (ENG-148) :

- **(A) Adapter** : mapper Temps-1 → dict legacy dans l'API avant de poster à
  `/profiler/generate`. Rapide, mais perd `positioning` + `staffing_model` qui
  ne match aucun champ legacy.
- **(B) Réécrire le DTO + prompt** : `OnboardingAnswers` aligné Temps-1,
  prompt mis à jour pour citer les 10 champs et leurs valeurs verbatim. Plus
  long mais correct. **Recommandé.**

Bump `agent_version` à `2.0.0` si (B) — c'est un changement de contrat
d'entrée.

---

## 7. Définition de fait (ENG-121)

- [x] Les objets de contexte utiles sont listés (§1).
- [x] Les règles de mise à jour du profil sont définies (§3).
- [x] Les données persistées vs temporaires sont distinguées (§2).
- [x] Le format de sortie standard du Profiler est documenté (§4).

Implémentations qui s'appuient sur ce doc :

- ENG-148 — réécrire le DTO + prompt pour le Temps-1 + câbler le trigger
  `/onboarding/complete` → `/profiler/generate`.
- ENG-153 — UI d'édition (déjà partiellement faite via `/settings/profile/$stage`) +
  worker debounce `profiler_refresh` + colonne `profile_context_stale_at`.
- ENG-154 — audit de chaque agent : `profile_data` typé `ProfileContext`,
  non-`Optional`, lu par snapshot au démarrage de pipeline.
