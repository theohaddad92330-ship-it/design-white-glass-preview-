# Agents — rôles, responsabilités et handoffs

Source de vérité pour l'architecture multi-agent BellumAI. Toute nouvelle capacité doit
s'adosser à un agent listé ici ou faire l'objet d'une mise à jour de ce document.

> **Périmètre** — un "agent" est un acteur autonome avec un contrat I/O typé, un déclencheur
> explicite et un ensemble fini de tools (services + prompts). Les prompts isolés
> (`battlecard`, `scorer`, `summary`, `icebreaker`, `activity`, `compare`, `weekly`) sont
> des **générateurs spécialisés** appelés par les agents — pas des agents.

---

## 1. Vue d'ensemble

| #   | Agent          | Phase / trigger           | Bloquant pipeline ? | Backing prompts                          |
| --- | -------------- | ------------------------- | ------------------- | ---------------------------------------- |
| 1   | Profiler       | Onboarding (1×/user)      | Non (préalable)     | `bellum_profiler` (Opus)                 |
| 2   | Researcher     | Pipeline — Phase 1        | Oui                 | `bellum_research`                        |
| 3   | Contact Hunter | Pipeline — Phase 2        | Oui                 | — (Apollo only)                          |
| 4   | Classifier     | Pipeline — Phase 3        | Oui                 | `bellum_contacts`, `bellum_organigramme` |
| 5   | Strategist     | Pipeline — Phase 4        | Oui                 | `bellum_plan`                            |
| 6   | Messenger      | Post-pipeline + on-demand | Non (différable)    | `bellum_pitch`, `bellum_icebreaker`      |
| 7   | Scout          | Top-of-funnel / discover  | Hors pipeline       | `bellum_discover`                        |
| 8   | Advisor        | Post-analyse / chat       | Hors pipeline       | `bellum_advisor` (+ générateurs)         |
| 9   | Watcher        | Cron — alerting           | Hors pipeline       | — (Brave only)                           |

Pipeline d'analyse séquentiel : **Researcher → Contact Hunter → Classifier → Strategist**
(les 4 phases bloquantes). Messenger s'exécute en queue de pipeline mais n'empêche pas
l'analyse d'être marquée `completed`.

```
                    ┌──────────────┐
                    │  Profiler    │  (onboarding, 1×)
                    └──────┬───────┘
                           │ ProfileContext (persisté)
                           ▼
  Discover ──► Scout ──► (liste cibles) ──► [user choisit]
                                              │
                                              ▼
   ┌────────────────────────────────────────────────────────┐
   │                  PIPELINE D'ANALYSE                    │
   │                                                        │
   │  Researcher ──► Contact Hunter ──► Classifier          │
   │       │              │                  │              │
   │       └──────────────┴──────────────────┴──► Strategist│
   │                                              │         │
   │                                              ▼         │
   │                                         (analyse OK)   │
   └────────────────────────────────────────────────────────┘
                       │
                       ├──► Messenger  (asynchrone, top-N contacts)
                       │
                       └──► Advisor    (chat, à la demande)

  Watcher  ──►  (cron) ──►  alertes  ──►  notifications
```

---

## 2. Spécifications détaillées

### 2.1 Profiler

- **Code** : `apps/ia/app/agents/profiler.py` · `ProfilerAgent`
- **Responsabilité** : Transformer les réponses du questionnaire d'onboarding en
  `ProfileContext` typé et persister dans `profiles.profile_context`. Ce contexte est
  ensuite injecté dans **tous** les autres agents (LLM ou non).
- **Trigger** : `POST /profiler/generate` (onboarding initial) ou
  `POST /profiler/refresh` (mise à jour questionnaire).
- **Inputs** : `answers: dict` (réponses brutes), `user_id: str` (optionnel — déclenche
  la persistance Supabase).
- **Outputs** :
  - **Nouveau (ENG-122)** : `AgentEnvelope[ProfileContext]` via `ProfilerAgent.run()`.
    `ProfileContext` est mirroré côté TS dans
    `packages/contracts/src/schemas/profile-context.ts` (schéma strict — pas de
    `.passthrough()` puisque c'est le contrat user-facing).
  - **Legacy** : `ProfileContext` direct via `generate_profile_context()` /
    `refresh_profile()` — utilisé par le router quand `IA_AGENT_ENVELOPE_V1` est off,
    à retirer une fois le worker migré (ENG-142).
- **Handoff** : Aucun — l'agent termine sa course en écrivant en BDD. Les autres agents
  lisent `profiles.profile_context` au démarrage de chaque job.
- **Boundaries** : NE fait PAS d'analyse de compte. NE persiste PAS ailleurs que dans
  `profiles`. NE relance PAS le pipeline automatiquement.
- **Notes** : Seul agent qui utilise Claude Opus (`CLAUDE_PROFILER_MODEL`).
  Appel one-shot, justifié par la qualité requise sur un appel rare.

### 2.2 Researcher (Phase 1)

- **Code** : `apps/ia/app/agents/researcher.py` · `ResearcherAgent` ↔
  `apps/ia/app/routers/phase1_research.py` (entrée HTTP).
- **Responsabilité** : Produire la fiche compte (`raw_analysis`) à partir de sources
  externes. Brave + Firecrawl + Pappers en parallèle, puis Claude `bellum_research`.
  Pappers est source de vérité pour `revenue`, `employees`, `siren` (override
  systématique du LLM).
- **Trigger** : `POST /phase/1/research` (worker BullMQ).
- **Inputs** :
  - `company_name: str`
  - `profile_data: ProfileContext` (injecté depuis BDD)
  - `user_context: str` (libre, optionnel)
  - `params: { brave_queries, firecrawl_pages, max_chars, claude_max_tokens }`
- **Outputs** : `AgentEnvelope[ResearchData]` (cf. `agent-contract.md` §1).
  `ResearchData` est défini dans `apps/ia/app/models/research_data.py` et mirroré dans
  `packages/contracts/src/schemas/research-data.ts` — extension permissive de
  `ResearchOutput` (`extra='allow'`) qui contient `businessDescription`, `sector`,
  `employees`, `revenue`, `siren`, `entitiesExhaustive`, `pains`, `angles`,
  `peopleMentioned`, `priorityScore`, etc.
- **Handoff vers Contact Hunter** (lecture du `status` de l'enveloppe) :
  - `success` / `partial_success` → propager `data` à Contact Hunter ; les warnings
    de `meta.warnings` remontent au worker pour le badge UI dégradé.
  - `recoverable_failure` → BullMQ retry l'appel HTTP (5xx).
  - `terminal_failure` → arrêter le pipeline, `accounts.status = 'error'`.
  - `cancelled` → ack, pas de retry, pas d'alerte.
- **Boundaries** : NE recherche PAS de contacts (rôle de Contact Hunter). NE produit PAS
  de plan d'action. NE consomme PAS de crédit Apollo.
- **Feature flag** : `IA_AGENT_ENVELOPE_V1=on` active la réponse au format enveloppe sur
  `phase1_research.py`. Sinon le wire format reste `ResearchResponse({success, data})`
  jusqu'à la migration du worker API (cf. ENG-142).

### 2.3 Contact Hunter (Phase 2)

- **Code** : `apps/ia/app/agents/contact_hunter.py` · `ContactHunterAgent` ↔
  `apps/ia/app/routers/phase2_contacts.py`.
- **Responsabilité** : Récupérer la liste brute des contacts via Apollo People Search,
  paginée et filtrée par les `personas` du `ProfileContext`. Pas de LLM ici.
- **Trigger** : `POST /phase/2/contacts` (worker BullMQ, après Researcher OK).
- **Inputs** :
  - `company_name: str`
  - `profile_data: ProfileContext`
  - `params: { apollo_pages }`
- **Outputs** : `AgentEnvelope[ContactsData]`. `ContactsData = { contacts: list[ApolloSearchHit], count: int }`.
  Voir `apps/ia/app/models/contacts_data.py` + `packages/contracts/src/schemas/contacts-data.ts`.
- **Handoff vers Classifier** (lecture du `status` + `meta.source_health.apollo`) :
  - `success` (`apollo: 'ok'`) → Classifier consomme les contacts.
  - `partial_success` (`apollo: 'degraded'`, warning `APOLLO_EMPTY`) → Classifier
    fait fallback sur `research_data.peopleMentioned`. Apollo 0-résultat ≠ panne.
  - `recoverable_failure` (`apollo: 'down'`, code `APOLLO_RATE_LIMITED` ou
    `APOLLO_UNKNOWN`) → BullMQ retry.
  - `terminal_failure` (code `APOLLO_AUTH_FAILED` ou `APOLLO_PLAN_BLOCKED`) →
    arrêter le pipeline. L'équipe doit régénérer la clé ou upgrader le plan.
  - `cancelled` → ack, pas de retry.
- **Feature flag** : `IA_AGENT_ENVELOPE_V1=on` active la réponse au format enveloppe
  sur `phase2_contacts.py`. Sinon `ContactsResponse({success, data})`.
- **Boundaries** : NE classe PAS les contacts (rôle, priorité, `orgChart` = Classifier).
  N'appelle PAS Claude. NE déclenche PAS le People-Match (email/phone) — c'est
  déplacé en endpoint on-demand gaté par crédit (cf. commentaire de
  `phase3_classify.py:24-29`).

### 2.4 Classifier (Phase 3)

- **Code** : `apps/ia/app/agents/classifier.py` · `ClassifierAgent` ↔
  `apps/ia/app/routers/phase3_classify.py` (thin delegate). Le service
  `app/services/classification.py` héberge la logique métier (batches
  `bellum_contacts` + `bellum_organigramme` en parallèle) — l'agent
  l'encapsule sans la dupliquer.
- **Responsabilité** : Enrichir les contacts bruts d'Apollo avec rôle décisionnel
  (`sponsor | champion | operational | purchasing | influencer | blocker`), priorité 1-5,
  `whyContact` personnalisé au ProfileContext, et construire l'`orgChart`.
  Utilise `bellum_contacts` (batches Haiku) + `bellum_organigramme` (Sonnet) en
  parallèle (le prompt s'appelle toujours `bellum_organigramme` — renommage du
  prompt est un ticket de suivi). Exécution `asyncio.as_completed` cancellable.
- **Trigger** : `POST /phase/3/classify` (worker BullMQ, après Hunter).
- **Inputs** :
  - `company_name: str`
  - `profile_data: dict` (ProfileContext)
  - `research_data: dict` (Phase 1 — `entitiesExhaustive`, `angles`, `pains`)
  - `contacts_data: { contacts: list[ApolloContact] }` (Phase 2)
- **Outputs** : `AgentEnvelope[ClassifiedData]` — voir
  `apps/ia/app/models/classified_data.py` et
  `packages/contracts/src/schemas/classified-data.ts`. Shape :
  `{ contacts, orgChart, decisionChain, uncoveredZones, stakeholderMap, approachOrder }`.
- **Handoff vers Strategist** (lecture du `status`) :
  - `success` → ≥ 1 contact priorité 1 OU 2.
  - `partial_success` → 0 contact priorité 1 OU 2, warning
    `CLASSIFIER_NO_PRIORITY_CONTACTS`. Le pipeline continue ; le front peut
    inviter à élargir la recherche Apollo.
  - `terminal_failure` → Claude renvoie un code terminal (truncation, etc.).
  - `cancelled` → ack, pas de retry.
  - Critère **échec terminal** : Claude 422 sur les deux prompts → `status = 'error'`.
- **Boundaries** : NE crée PAS d'action commerciale (= Strategist). NE génère PAS de
  message (= Messenger). NE re-fetch PAS d'Apollo.

### 2.5 Strategist (Phase 4)

> Migré vers `AgentEnvelope[StrategyData]` (ENG-141). `StrategyData` étend
> `ActionPlanOutput` ; voir `apps/ia/app/models/strategy_data.py` +
> `packages/contracts/src/schemas/strategy-data.ts`. Précondition stricte :
> `research_data` non-vide, sinon `terminal_failure` avec code
> `AGENT_PRECONDITION_FAILED`. Feature flag `IA_AGENT_ENVELOPE_V1`.

- **Code** : `apps/ia/app/agents/strategist.py` · `StrategistAgent` ↔
  `apps/ia/app/routers/phase4_plan.py`.
- **Responsabilité** : Produire le plan d'action commercial séquencé
  (S1 / M1 / M2-3 / M3-6 / M6-12), les offres à proposer, l'évaluation GO/NO-GO et les
  sous-comptes prioritaires. Prompt `bellum_plan`.
- **Trigger** : `POST /phase/4/plan` (worker BullMQ, après Classifier).
- **Inputs** :
  - `company_name: str`
  - `profile_data: ProfileContext`
  - `research_data: dict` (tronqué à 8000 chars)
  - `contacts_data: { contacts: list[ClassifiedContact] }` (top 20)
- **Outputs** : `{ actionPlan, offersToPropose, evaluation, prioritySubAccounts }`.
- **Handoff** : Aucun — termine le pipeline. `accounts.status = 'completed'`,
  WebSocket emit `analysis_done`.
- **Boundaries** : NE génère PAS de pitch téléphonique (= Messenger). NE recontacte PAS
  Brave / Firecrawl / Pappers (tout dérive de la Phase 1).

### 2.6 Messenger

> Migré vers `AgentEnvelope[MessengerData]` (ENG-138). Signature unifiée :
> `run(company_name, profile_data, contacts: list, research_data)` accepte
> 1 ou N contacts ; l'agent ne slice JAMAIS, le caller décide. Voir
> `apps/ia/app/models/messenger_data.py` +
> `packages/contracts/src/schemas/messenger-data.ts`. Échecs par contact
> isolés dans `meta.warnings` (`MESSENGER_CONTACT_FAILED`) ; statut =
> `partial_success` si au moins un message OK, `terminal_failure`
> (`MESSENGER_ALL_FAILED`) si tous échouent.

- **Code** : `apps/ia/app/agents/messenger.py` · `MessengerAgent`.
- **Responsabilité** : Générer messages personnalisés (pitch cold-call + icebreaker
  LinkedIn) pour les contacts prioritaires. Prompts `bellum_pitch` + `bellum_icebreaker`.
- **Trigger** :
  - **Post-pipeline (auto)** : après Strategist, top 5 contacts (`priority <= 2`).
  - **On-demand** : `POST /contacts/:id/pitch` ou `POST /contacts/:id/icebreaker`.
- **Inputs** : `company_name`, `profile_data`, `contacts: list[ClassifiedContact]`,
  `research_data: dict`.
- **Outputs** : `{ messages: list[{ contact, messages: { pitch, icebreaker, ... } }] }`.
- **Handoff** : Aucun — sortie consommée par le front (page contact) ou la table
  `contact_messages`.
- **Boundaries** : NE modifie PAS les contacts (rôle/priorité figés par Classifier).
  Les échecs par contact sont isolés (log warning) — l'agent n'échoue jamais en bloc.

### 2.7 Scout (Discover)

- **Code** : `apps/ia/app/agents/scout.py` · `ScoutAgent` ↔
  `apps/ia/app/routers/discover.py`.
- **Responsabilité** : Identifier 10 entreprises pertinentes pour le `ProfileContext` à
  partir de critères libres ("entreprises bancaires à Bordeaux"). Brave puis
  `bellum_discover`.
- **Trigger** : `POST /discover` (action utilisateur explicite, hors pipeline).
- **Inputs** : `criteria: str`, `profile_data: ProfileContext`.
- **Outputs** : `{ companies: list[{ name, sector, why, priorityScore, potentialContacts, suggestedAngle }] }`.
- **Handoff vers Researcher** : Aucun automatique. L'utilisateur choisit un compte
  parmi les 10 et déclenche un nouveau pipeline d'analyse manuellement.
- **Boundaries** : NE persiste PAS les résultats (liste éphémère). NE consomme PAS de
  crédit "analyse" (consomme un crédit "discover" distinct si activé).

### 2.8 Advisor

- **Code** : `apps/ia/app/agents/advisor.py` · `AdvisorAgent` ↔
  `apps/ia/app/routers/chat.py`.
- **Responsabilité** : Chatbot conversationnel post-analyse, ancré sur le compte ouvert.
  Répond avec le ton d'un directeur commercial senior. Peut suggérer de relancer une
  recherche, affiner contacts, challenger le plan — **mais ne déclenche pas les autres
  agents lui-même** (le front intercepte les intents et appelle l'agent ciblé).
- **Trigger** : `POST /chat` avec contexte compte (`account_data`, `contacts_summary`,
  `plan_summary`, `history`).
- **Inputs** : `message: str`, `context: { profile_data, account_data, contacts_summary, plan_summary, history }`.
- **Outputs** : `{ reply: str }`.
- **Handoff** : Aucun direct. Suggère verbalement des actions ; le front décide.
- **Boundaries** : NE persiste PAS d'historique (front owner). NE prend AUCUNE action
  sur la BDD. NE consomme PAS Brave / Firecrawl / Apollo / Pappers.
- **Note** : Si Claude renvoie une info absente du contexte (hallucination),
  contraindre via le system prompt à dire explicitement "je n'ai pas cette information".

### 2.9 Watcher

- **Code** : `apps/ia/app/agents/watcher.py` · `WatcherAgent`.
- **Responsabilité** : Surveiller en arrière-plan les comptes actifs et générer des
  alertes ("signal récent détecté") basées uniquement sur Brave (sans LLM).
- **Trigger** : Cron (à câbler — pas encore branché en prod). Max 10 comptes par cycle.
- **Inputs** : `accounts: list[{ id, company_name }]`.
- **Outputs** : `{ alerts: list[{ company, account_id, signals: list[BraveHit] }] }`.
- **Handoff** : Aucun. Les alertes sont écrites en BDD et poussées via WebSocket /
  notification.
- **Boundaries** : NE déclenche PAS d'analyse complète. NE consomme PAS de crédit LLM.
  Si un signal est jugé important par l'utilisateur, il relance un Researcher
  manuellement.

---

## 3. Ambiguïtés et recouvrements à supprimer

Cette section liste les divergences historiques entre l'ancien orchestrateur Python
(`Orchestrator`, supprimé par ENG-144) et les routers HTTP `phase*_*.py`, point
d'entrée unique du pipeline. Les lignes restantes doivent être résolues avant clôture
du projet _Multi-agent orchestration_.

| #     | Divergence                                                                                                                                                                                                            | Décision cible                                                                                                                                                                                                        |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~1~~ | ~~`Orchestrator.run_analysis` saute la Phase 3.~~                                                                                                                                                                     | ✅ Résolu par ENG-137 : `ClassifierAgent` créé, intercalé entre Hunter et Strategist.                                                                                                                                 |
| ~~2~~ | ~~`phase3_classify.py` utilise le service directement, sans wrapper.~~                                                                                                                                                | ✅ Résolu par ENG-137 : router slimmé, délègue à `ClassifierAgent`.                                                                                                                                                   |
| 3     | Les prompts spécialisés (`battlecard`, `scorer`, `summary`, `icebreaker`, `activity`, `compare`, `weekly`) ont leur propre router mais aucun agent dédié. Ambiguïté : sont-ce des agents ou des tools ?               | **Tools/générateurs**, pas agents. Documenter dans `agent_docs/prompts.md` qu'ils sont appelés par Advisor (à la demande de l'utilisateur dans le chat) ou par des endpoints CRUD on-demand depuis le front.          |
| ~~4~~ | ~~`MessengerAgent` est invoqué dans `run_analysis` (top 5 contacts) **et** prévu en on-demand par contact. Le contrat I/O est différent (liste vs single).~~                                                          | ✅ Résolu par ENG-138 : signature unique `run(contacts: list, ...)`, aucun cap interne, le caller (orchestrator ou router on-demand) décide. Échecs par contact dans `meta.warnings`.                                 |
| 5     | `phase3_classify.py` mentionne que l'enrichissement People-Match (email/phone) a été déplacé en on-demand mais aucun agent n'est associé à `POST /contacts/:id/enrich`. Risque : la logique se dilue dans le service. | Garder en service (pas un agent autonome) car déclenchement manuel + 1-call Apollo. Documenter l'appartenance dans `apis.md`.                                                                                         |
| 6     | `ContactHunterAgent` accepte un `params.apollo_pages` mais ne sait pas si Apollo a renvoyé 0 par "vraie" absence ou par panne. Le Classifier doit deviner.                                                            | Étendre `AgentResult.data` avec `meta: { apollo_status: 'ok' \| 'empty' \| 'error' }` pour que le Classifier choisisse `peopleMentioned` en connaissance de cause.                                                    |
| 7     | `AdvisorAgent` ne devrait pas pouvoir déclencher d'autres agents, mais le system prompt actuel ("peut suggérer de nouveaux comptes, relancer une recherche, affiner les contacts") laisse penser qu'il a ce pouvoir.  | Reformuler le prompt : l'Advisor **suggère verbalement**, le **front** intercepte l'intent et appelle l'agent. Documenter dans `bellum_advisor.py`.                                                                   |
| 8     | `WatcherAgent` n'est branché à aucun scheduler — il existe mais n'est jamais appelé en prod.                                                                                                                          | Soit câbler un cron (Railway worker), soit retirer l'agent du repo jusqu'à ce que la fonctionnalité soit prête. Ne pas laisser de code dormant.                                                                       |
| ~~9~~ | ~~Le pipeline d'analyse expose 4 endpoints HTTP indépendants (`/phase/1`...`/phase/4`) ET un orchestrator Python interne. Deux clients possibles pour le même flow → divergence garantie.~~                           | ✅ Résolu par ENG-144 : le worker BullMQ + les routers HTTP `/phase/*` sont le **point d'entrée unique**. La classe `Orchestrator` (dont `run_analysis()`) est supprimée. Décision documentée dans `architecture.md`. |

---

## 4. Contrats inter-agents (résumé)

Les types ci-dessous matérialisent les handoffs. Ils doivent vivre dans
`packages/shared/src/agents/` (TS) **et** `apps/ia/app/models/` (Python Pydantic). La
divergence des deux côtés est interdite (CI à mettre en place).

```ts
// packages/shared/src/agents/contracts.ts (cible)

export type ProfileContext = {
  /* sortie Profiler */
}
export type ResearchOutput = {
  /* sortie Researcher */
}
export type ApolloContact = {
  /* sortie Contact Hunter, brut */
}
export type ClassifiedContact = {
  /* sortie Classifier */
}
export type StrategyOutput = {
  /* sortie Strategist */
}
export type MessengerOutput = {
  /* sortie Messenger */
}

export type AgentResult<T> = {
  agent_name: string
  success: boolean
  data: T
  error?: string
  meta?: Record<string, unknown> // ex: apollo_status, claude_usage
}
```

---

## 5. Définition de fait (DoD ENG-119)

- [x] Liste des agents cibles définie (§1).
- [x] Chaque agent a une responsabilité explicite (§2.1-2.9).
- [x] Entrées, sorties, critères de handoff décrits (§2 + §4).
- [x] Recouvrements et ambiguïtés listés (§3) — **résolution** programmée dans des tickets enfants.
