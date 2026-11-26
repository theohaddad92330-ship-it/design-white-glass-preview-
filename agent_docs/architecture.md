# Architecture technique — Nouvelle stack

## Vue d'ensemble

```
[Navigateur] → [Vercel: apps/web React]
                    ↓ API calls
              [Railway: apps/api NestJS]
                    ↓ Analyse demandée
              [BullMQ queue Redis]
                    ↓ Worker consomme le job
              [Railway: apps/ia FastAPI Python]
                    ↓ Appels parallèles
        ┌───────────┼───────────┐───────────┐
    [Brave]    [Firecrawl]  [Pappers]  [Apollo]
        └───────────┼───────────┘───────────┘
                    ↓ Données collectées
              [Claude API — 3 prompts]
                    ↓ Résultats JSON
              [PostgreSQL Supabase + pgvector]
                    ↓ WebSocket events
              [Socket.IO → Navigateur]
```

## apps/web — React + Vite + shadcn/ui

```
apps/web/src/
├── components/
│   ├── ui/              # shadcn/ui (Button, Card, Dialog, etc.)
│   ├── layout/          # Sidebar, Header, PageWrapper
│   ├── search/          # SearchBar, CompanyAutocomplete
│   ├── account/         # OverviewTab, ContactsTab, PlanTab, MessagesTab, OrgChart
│   ├── dashboard/       # ActionsList, Pipeline, TopAccounts, SignalsFeed
│   ├── chat/            # ChatWindow, MessageBubble, ChatInput
│   └── common/          # ErrorBoundary, LoadingSpinner, EmptyState
├── hooks/
│   ├── useAnalysis.ts        # Lancer + suivre une analyse (WebSocket)
│   ├── useSupabase.ts        # Client Supabase + auth
│   ├── useContacts.ts        # CRUD contacts
│   └── useCredits.ts         # Vérifier/consommer crédits
├── pages/
│   ├── Landing.tsx, Login.tsx, Signup.tsx
│   ├── Onboarding.tsx, Dashboard.tsx, Search.tsx
│   ├── AccountDetail.tsx     # Shell + routing onglets
│   ├── Discover.tsx, Chat.tsx, Contacts.tsx
│   ├── Knowledge.tsx, Billing.tsx, Profile.tsx
│   └── NotFound.tsx
├── lib/
│   ├── supabase.ts      # Client initialisé
│   ├── socket.ts        # Connexion Socket.IO
│   └── api.ts           # Fetch wrapper vers NestJS
├── stores/              # Zustand si besoin (dark mode toggle, etc.)
└── App.tsx + main.tsx
```

## apps/api — NestJS

```
apps/api/src/
├── main.ts                    # Bootstrap NestJS + global pipes/guards
├── app.module.ts              # Import tous les modules
├── modules/
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── jwt.guard.ts       # Vérifie JWT Supabase
│   │   └── auth.service.ts    # Decode token, get user
│   ├── accounts/
│   │   ├── accounts.module.ts
│   │   ├── accounts.controller.ts  # CRUD + lister
│   │   ├── accounts.service.ts     # Logique BDD
│   │   └── dto/
│   ├── contacts/
│   │   ├── contacts.controller.ts  # CRUD + enrichissement
│   │   ├── contacts.service.ts
│   │   └── dto/
│   ├── analysis/
│   │   ├── analysis.module.ts
│   │   ├── analysis.controller.ts  # POST /analysis/start → crée job BullMQ
│   │   ├── analysis.worker.ts      # Consumer BullMQ → appelle FastAPI
│   │   └── analysis.service.ts
│   ├── credits/
│   │   ├── credits.controller.ts   # Vérifier crédits, Stripe checkout
│   │   ├── credits.service.ts
│   │   └── stripe.webhook.ts       # Webhook Stripe
│   ├── rag/
│   │   ├── rag.controller.ts       # Upload documents, lister
│   │   └── rag.service.ts
│   └── gateway/
│       └── analysis.gateway.ts     # Socket.IO Gateway (WebSocket events)
├── common/
│   ├── supabase.service.ts    # Client Supabase partagé
│   ├── redis.service.ts       # Connexion Redis
│   └── logger.service.ts      # Winston structured logging
└── config/
    └── env.config.ts          # Variables d'environnement validées
```

## apps/ia — FastAPI Python

```
apps/ia/
├── main.py                    # FastAPI app + CORS + routers
├── routers/
│   ├── phase1_research.py     # POST /phase/1/research
│   ├── phase2_contacts.py     # POST /phase/2/contacts (Apollo)
│   ├── phase3_enrich.py       # POST /phase/3/enrich (Claude CONTACTS)
│   ├── phase4_plan.py         # POST /phase/4/plan (Claude PLAN)
│   ├── rag.py                 # POST /rag/query, POST /rag/ingest
│   └── chat.py                # POST /chat/message (Agent IA conversationnel)
├── services/
│   ├── claude_api.py          # Appel Claude API + parsing JSON robuste
│   ├── brave_search.py        # Recherche Brave (8-10 requêtes)
│   ├── firecrawl.py           # Scraping pages web
│   ├── pappers.py             # Données entreprise FR
│   ├── apollo.py              # People Search + Enrichment
│   └── rag_service.py         # LangChain + pgvector
├── prompts/
│   ├── bellum_research.py     # System prompt Phase 1
│   ├── bellum_contacts.py     # System prompt Phase 3
│   ├── bellum_plan.py         # System prompt Phase 4
│   ├── bellum_discover.py     # Découverte de comptes (nouveau)
│   ├── bellum_advisor.py      # Chatbot IA (nouveau)
│   ├── bellum_pitch.py        # Cold calling (nouveau)
│   └── bellum_boolean.py      # Recherches LinkedIn (nouveau)
├── models/                    # Pydantic models (input/output)
├── tests/                     # pytest
├── requirements.txt
└── .env
```

## packages/shared — Types TypeScript

```typescript
// packages/shared/src/types.ts
export interface Account {
  id: string
  user_id: string
  company_name: string
  sector: string
  employees: string
  revenue: string
  priority_score: number
  status: 'analyzing' | 'completed' | 'error'
  raw_analysis: RawAnalysis
}
export interface Contact {
  id: string
  account_id: string
  full_name: string
  title: string
  entity: string
  decision_role: 'sponsor' | 'champion' | 'operational' | 'purchasing' | 'influencer' | 'blocker'
  priority: number
  linkedin_url: string
  email?: string
  phone?: string
  source: 'apollo' | 'ai_generated'
}
export interface Profile {
  id: string
  user_id: string
  onboarding_data: OnboardingData
}
export interface OnboardingData {
  companyName: string
  size: string
  offers: string[]
  sectors: string[]
  clientTypes: string[]
  personas: string[]
  geoZone: string
  references: string[]
  salesCycle: string
  avgTJM: string
  salesTeamSize: string
  mainChallenge: string
}
// ... etc
```

## Flux d'une analyse (BullMQ + WebSocket)

1. Front POST /api/analysis/start { companyName, userContext? }
2. NestJS vérifie JWT + crédits → crée account (status=analyzing) → crée job BullMQ → retourne { jobId, accountId }
3. Front connecte Socket.IO au room jobId
4. Worker BullMQ consomme le job :
   a. Appelle FastAPI /phase/1/research → emit phase:complete=1
   b. Appelle FastAPI /phase/2/contacts (Apollo) → emit phase:complete=2
   c. Appelle FastAPI /phase/3/enrich (Claude) → emit phase:complete=3
   d. Appelle FastAPI /phase/4/plan (Claude) → emit analysis:done
5. À chaque phase, FastAPI sauvegarde en BDD via Supabase
6. Front reçoit les events et affiche progressivement

## Décision — Point d'entrée du pipeline (ENG-144)

Le pipeline d'analyse a existé en double : `Orchestrator.run_analysis()` (Python,
en-process, dans `apps/ia/app/agents/orchestrator.py`) et les routers HTTP
`/phase/*` de `apps/ia`. Seuls les routers étaient consommés en production (par le
worker BullMQ via `apps/api/src/modules/ia/ia.client.ts`).

**Décision : le worker BullMQ + les routers HTTP `/phase/*` sont le point d'entrée
unique.** La classe `Orchestrator` (dont `run_analysis`, mais aussi les méthodes
mortes `run_discover` / `run_chat` / `run_watch`, déjà réimplémentées inline par
`discover.py` / `chat.py`) est **supprimée**.

Conséquences :

- **L'orchestration vit dans le worker** (`apps/api`), qui séquence les phases,
  persiste en BDD entre chaque, et gère retry / checkpoint / annulation par phase.
  Un orchestrateur Python en-process dupliquait ce rôle en moins fiable (une panne
  en phase tardive relançait tout le flux).
- **Chaque phase est un agent** au contrat `AgentEnvelope`, invoqué via son router.
  La collaboration multi-agent se fait _à l'intérieur_ d'une phase (parallélisme
  `asyncio`, ex. Phase 1 lance `facts` / `signals` / `strategy` en parallèle).
- **Pas d'orchestrateur LLM dynamique** : le flux est déterministe
  (Research → Contacts → Plan), un superviseur LLM n'apporterait que latence, coût
  et non-déterminisme.

> Note : les classes d'agents `researcher` / `contact_hunter` / `strategist` /
> `messenger` / `scout` / `advisor` / `watcher` ne sont plus appelées après cette
> suppression. Elles sont conservées comme socle de la couche agent et seront
> rationalisées (rework / inline / suppression) par la refonte 3-phases (ENG-159),
> qui généralise le pattern _router mince → agent typé_ déjà utilisé par
> `phase3_classify` → `ClassifierAgent`.

## Scalabilité

- 10 clients → 1 instance chaque service (Railway)
- 50 clients → BullMQ concurrency 5-10 workers
- 200 clients → Read replica Supabase, FastAPI autoscale
- 500+ → Redis cluster, workers dédiés
