# BellumAI — Technical Documentation

> Last updated: April 11, 2026 | For: Matteo (CTO onboarding)

---

## 1. Vue d'ensemble

BellumAI est un SaaS B2B de veille commerciale pour les commerciaux des ESN (Entreprises de Services du Numérique) françaises. L'utilisateur saisit un nom d'entreprise cible et reçoit en 3 à 6 minutes un dossier de conquête complet : description du compte, contacts réels avec coordonnées, organigramme décisionnel, angles d'attaque personnalisés selon le profil de l'ESN, et un plan d'action hebdomadaire prêt à exécuter avec les messages à envoyer. Le produit est calibré au profil de l'ESN (taille, offres, personas, cycle de vente) — pas de conseil générique. Les données proviennent de sources publiques réelles (Brave Search, Firecrawl, Pappers, Apollo) et sont synthétisées par Claude. Le coût par analyse est d'environ 0,40 USD.

---

## 2. Stack technique

| Technologie         | Version            | Pourquoi                                           | Docs                                            |
| ------------------- | ------------------ | -------------------------------------------------- | ----------------------------------------------- |
| React               | 18.3.1             | SPA moderne, écosystème riche, composants réactifs | https://react.dev                               |
| Vite                | 5.4.19             | Build ultra-rapide, HMR natif, config minimale     | https://vitejs.dev                              |
| TailwindCSS         | 3.4.17             | Utility-first, dark mode natif, cohérence design   | https://tailwindcss.com                         |
| shadcn/ui           | (composants Radix) | Composants accessibles non-opinionnés, dark mode   | https://ui.shadcn.com                           |
| Framer Motion       | 12.38.0            | Animations déclaratives React, transitions fluides | https://www.framer.com/motion                   |
| React Router        | 6.30.3             | Routing SPA, nested routes, lazy loading           | https://reactrouter.com                         |
| Supabase JS         | 2.101.1            | Auth + client BDD Supabase côté front              | https://supabase.com/docs/reference/javascript  |
| Socket.IO client    | 4.8.3              | Réception des événements temps réel depuis NestJS  | https://socket.io/docs/v4/client-api            |
| TanStack Query      | 5.83.0             | Cache serveur, synchronisation état async          | https://tanstack.com/query                      |
| Zod                 | 3.25.76            | Validation schémas TypeScript runtime              | https://zod.dev                                 |
| Recharts            | 3.8.1              | Graphiques (dashboard, scores)                     | https://recharts.org                            |
| NestJS              | 10.4.15            | API REST + WebSocket, modules, guards, pipes       | https://docs.nestjs.com                         |
| BullMQ              | 5.73.0             | Queue de jobs Redis, workers asynchrones           | https://docs.bullmq.io                          |
| Redis (ioredis)     | 5.10.1             | Broker BullMQ, state des jobs                      | https://ioredis.readthedocs.io                  |
| Passport / JWT      | 11.0.5 / 11.0.2    | Validation tokens JWT Supabase                     | https://docs.nestjs.com/security/authentication |
| Stripe SDK          | 17.7.0             | Facturation, webhooks, plans                       | https://stripe.com/docs/api                     |
| FastAPI             | 0.115.12           | Service IA Python async, routeurs par phase        | https://fastapi.tiangolo.com                    |
| Anthropic SDK       | 0.52.0             | Appels Claude API                                  | https://docs.anthropic.com                      |
| LangChain           | 0.3.25             | Orchestration RAG, chains                          | https://python.langchain.com                    |
| pgvector            | 0.4.0              | Recherche vectorielle similarité cosinus           | https://github.com/pgvector/pgvector            |
| Supabase PostgreSQL | —                  | BDD principale, Auth, RLS, pgvector                | https://supabase.com/docs                       |
| Turborepo           | —                  | Orchestration monorepo, cache builds               | https://turbo.build                             |
| pnpm                | 9+                 | Gestionnaire de paquets workspaces                 | https://pnpm.io                                 |
| Vitest              | 3.2.4              | Tests unitaires frontend (React Testing Library)   | https://vitest.dev                              |
| Jest                | 29.7.0             | Tests unitaires NestJS                             | https://jestjs.io                               |
| pytest              | 8.4.0              | Tests Python FastAPI                               | https://docs.pytest.org                         |

---

## 3. Setup local (10 minutes)

### Prérequis

- Node.js 20+
- pnpm 9+ (`npm install -g pnpm`)
- Python 3.11+
- Docker Desktop

### Étapes

```bash
# 1. Cloner le repo
git clone <repo-url> bellum-ai && cd bellum-ai

# 2. Installer toutes les dépendances (monorepo)
pnpm install

# 3. Copier les fichiers d'environnement
cp .env.example apps/api/.env
cp .env.example apps/ia/.env
cp .env.example apps/web/.env

# 4. Remplir les variables OBLIGATOIRES dans chaque .env
# apps/api/.env — minimum requis :
#   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET
#   REDIS_URL=redis://localhost:6379
#   IA_SERVICE_URL=http://localhost:8000
#   NODE_ENV=development
#
# apps/ia/.env — minimum requis :
#   ANTHROPIC_API_KEY
#   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
#   BRAVE_API_KEY, FIRECRAWL_API_KEY, PAPPERS_API_KEY, APOLLO_API_KEY
#
# apps/web/.env — minimum requis :
#   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
#   VITE_API_URL=http://localhost:3000
#   VITE_IA_URL=http://localhost:8000

# 5. Démarrer Redis via Docker
docker compose up -d

# 6. Appliquer les migrations Supabase
# Dans le dashboard Supabase > SQL Editor, exécuter dans l'ordre :
#   supabase/migrations/00001_init.sql
#   supabase/migrations/00002_indexes_and_fixes.sql
#   supabase/migrations/00003_rag_vector_search.sql
#   supabase/migrations/20260410_audit_fixes.sql
#   supabase/migrations/20260411_user_actions.sql

# 7. Installer les dépendances Python
cd apps/ia && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && cd ../..

# 8. Démarrer tous les services
pnpm dev
```

### URLs des services en local

| Service          | URL                        | Description                   |
| ---------------- | -------------------------- | ----------------------------- |
| Frontend (React) | http://localhost:5173      | Application web               |
| API (NestJS)     | http://localhost:3000      | REST API + Socket.IO          |
| IA (FastAPI)     | http://localhost:8000      | Service IA + pipeline         |
| FastAPI Swagger  | http://localhost:8000/docs | Documentation API interactive |
| Redis            | localhost:6379             | Queue BullMQ                  |

---

## 4. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    BROWSER (React SPA)                  │
│              Vercel — apps/web                          │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS REST + Socket.IO
                       ▼
┌──────────────────────────────────────────────────────────┐
│               NestJS API — apps/api                      │
│       Auth (JWT Guard) | Accounts | Contacts             │
│       Analysis Controller | Credits | Actions            │
│                  Railway                                 │
└──────────┬────────────────────┬────────────────────────┘
           │ Supabase SDK       │ BullMQ enqueue job
           ▼                    ▼
┌─────────────────┐   ┌────────────────────────────────┐
│  Supabase DB    │   │   Redis / BullMQ Queue         │
│  PostgreSQL     │   │   "analysis" queue              │
│  + pgvector     │   │   Railway                      │
│  + RLS          │   └──────────────┬─────────────────┘
│  eu-west-1      │                  │ Worker consumes
└────────┬────────┘                  ▼
         │                ┌──────────────────────────────┐
         │                │   AnalysisWorker (NestJS)    │
         │                │   4 HTTP calls → FastAPI IA  │
         │                └──────────────┬───────────────┘
         │                               │ HTTP POST
         │                               ▼
         │                ┌──────────────────────────────────────┐
         │                │       FastAPI IA — apps/ia           │
         │                │  Phase 1: Research (Brave+Firecrawl  │
         │                │          +Pappers → Claude)          │
         │                │  Phase 2: Contacts (Apollo, fallback │
         │                │          Brave+Claude)               │
         │                │  Phase 3: Enrich (Claude CONTACTS)   │
         │                │  Phase 4: Plan (Claude PLAN)         │
         │                │  + 10 routers secondaires            │
         │                │  Railway                             │
         │                └──┬───┬───┬───┬────────────────────────┘
         │                   │   │   │   │
         │                   ▼   ▼   ▼   ▼
         │             Anthropic  Brave  Firecrawl  Apollo/Pappers
         │             Claude API Search  Scraping   Contacts/Legal
         │
         │  Supabase writes (direct from FastAPI)
         ◄───────────────────────────────────────────────────────┘

REAL-TIME FLOW :
NestJS Gateway (Socket.IO) ←→ Browser
  Events: research_complete (40%), contacts_complete (70%),
          enrich_complete (85%), analysis:done, analysis:error
```

### Rôles de chaque service

**apps/web (React + Vite)** : SPA dark mode. Gère l'authentification Supabase, lance les analyses, affiche les résultats progressifs via Socket.IO, et offre 8 onglets par compte (Fiche, Contacts, Organigramme, Plan, Messages, Évaluation, Veille, Notes). Pages principales : Dashboard, Search, AccountDetail, Discover, Chat, Knowledge, Billing.

**apps/api (NestJS)** : Orchestre le flux principal. Valide les JWT Supabase, vérifie les crédits, crée le compte en BDD, enqueue le job BullMQ, et expose les endpoints CRUD. Le worker BullMQ est le cœur : il appelle FastAPI en séquence pour les 4 phases et émet les événements Socket.IO. Rate limit global : 20 requêtes/heure/IP (ThrottlerGuard).

**apps/ia (FastAPI)** : Service IA stateless. Reçoit les instructions du worker NestJS, collecte les données externes (Brave, Firecrawl, Pappers, Apollo), construit les prompts Claude, parse le JSON retourné et sauvegarde en Supabase. Expose aussi 10 routers secondaires (discover, chat, summary, battlecard, scorer, icebreaker, activity, compare, weekly, rag).

---

## 5. Structure du code

```
bellum-ai/
├── apps/
│   ├── web/                          # React SPA
│   │   └── src/
│   │       ├── pages/
│   │       │   ├── Landing.tsx       # Page marketing (1 900 lignes — à découper)
│   │       │   ├── Login.tsx / Signup.tsx
│   │       │   ├── Dashboard.tsx     # Vue pipeline + actions semaine
│   │       │   ├── Search.tsx        # Saisie nom + lancement analyse
│   │       │   ├── AccountDetail.tsx # *** FICHIER CLÉ — 8 tabs inline (1 771 lignes)
│   │       │   ├── Accounts.tsx      # Liste des comptes
│   │       │   ├── Discover.tsx      # Découverte de nouveaux comptes
│   │       │   ├── Chat.tsx          # Chatbot par compte
│   │       │   └── Billing.tsx / Profile.tsx / Knowledge.tsx
│   │       ├── components/
│   │       │   ├── ui/               # shadcn/ui (13 composants présents mais non utilisés — voir §13)
│   │       │   ├── layout/           # Sidebar, Header, Layout
│   │       │   └── account/          # Tabs AccountDetail (MessagesTab, etc.)
│   │       ├── hooks/
│   │       │   ├── useAnalysis.ts    # Lance analyse + écoute Socket.IO
│   │       │   ├── useAccount.ts     # Fetch compte + contacts + polling status
│   │       │   └── useSupabase.ts / useCredits.ts / useCompanySearch.ts
│   │       ├── lib/
│   │       │   ├── supabase.ts       # Client Supabase initialisé (anon key)
│   │       │   ├── socket.ts         # Connexion Socket.IO
│   │       │   └── api.ts            # Fetch wrapper → NestJS
│   │       └── App.tsx               # Routes React Router
│   │
│   ├── api/                          # NestJS
│   │   └── src/
│   │       ├── main.ts               # Bootstrap + CORS + ValidationPipe + security headers
│   │       ├── app.module.ts         # Importe tous les modules
│   │       ├── modules/
│   │       │   ├── auth/
│   │       │   │   └── jwt.guard.ts  # *** Valide JWT Supabase sur chaque requête
│   │       │   ├── analysis/
│   │       │   │   ├── analysis.controller.ts  # POST /analysis/start
│   │       │   │   ├── analysis.worker.ts      # *** FICHIER CLÉ — BullMQ consumer
│   │       │   │   └── analysis.gateway.ts     # Socket.IO gateway
│   │       │   ├── accounts/         # CRUD accounts Supabase
│   │       │   ├── contacts/         # CRUD contacts + enrichissement
│   │       │   ├── credits/          # Plans + Stripe checkout + webhooks
│   │       │   └── actions/          # Tracking actions commerciales
│   │       └── common/
│   │           └── supabase.service.ts  # Client Supabase (service role)
│   │
│   └── ia/                           # FastAPI Python
│       └── app/
│           ├── main.py               # App FastAPI + CORS + 14 routers
│           ├── routers/
│           │   ├── phase1_research.py  # *** FICHIER CLÉ — Brave+Firecrawl+Pappers+Claude
│           │   ├── phase2_contacts.py  # Apollo + fallback Brave+Claude
│           │   ├── phase3_enrich.py    # Claude CONTACTS
│           │   ├── phase4_plan.py      # Claude PLAN
│           │   ├── rag.py / chat.py / discover.py
│           │   └── summary / battlecard / scorer / icebreaker / activity / compare / weekly
│           ├── prompts/              # 18 fichiers de prompts Claude (voir §8)
│           ├── services/
│           │   ├── claude_api.py     # *** Appel Claude + parsing JSON robuste
│           │   ├── brave_search.py   # Brave Search API
│           │   ├── firecrawl.py      # Scraping web
│           │   ├── pappers.py        # Données légales FR
│           │   ├── apollo.py         # People Search + Enrichment
│           │   └── supabase_client.py  # Client Supabase (service role)
│           ├── models/               # Pydantic models (input/output par phase)
│           └── agents/               # 8 agents multi-agents NON CONNECTÉS (code mort)
│
├── packages/
│   └── shared/                       # Types TypeScript partagés
│       └── src/types/
│           ├── account.ts / contact.ts / profile.ts
│           ├── attack-angle.ts / action-plan.ts / rag-document.ts
│           └── analysis.ts
│
├── supabase/migrations/              # 5 migrations SQL
├── docker-compose.yml                # Redis uniquement
├── turbo.json                        # Config Turborepo
├── pnpm-workspace.yaml
└── CLAUDE.md                         # Instructions pour Claude Code
```

---

## 6. Base de données

Supabase PostgreSQL — projet `qkpuwkziwnljfwlzyngr` (eu-west-1, Plan Pro).
RLS activé sur toutes les tables. Politique universelle : `auth.uid() = user_id`.

### Table : `profiles`

| Colonne                | Type                 | Description                                                                                                                                                  |
| ---------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                   | uuid PK              | —                                                                                                                                                            |
| `user_id`              | uuid FK → auth.users | Unique                                                                                                                                                       |
| `full_name`            | text                 | Nom affiché                                                                                                                                                  |
| `company_name`         | text                 | Nom de l'ESN                                                                                                                                                 |
| `onboarding_data`      | jsonb                | Réponses au questionnaire 12 questions (companyName, size, offers, sectors, personas, geoZone, avgTJM, salesCycle, salesTeamSize, mainChallenge, references) |
| `onboarding_completed` | boolean              | false tant que le questionnaire n'est pas terminé                                                                                                            |

Trigger : `handle_new_user()` crée automatiquement un profil à chaque inscription.

### Table : `user_credits`

| Colonne                  | Type                 | Description                                        |
| ------------------------ | -------------------- | -------------------------------------------------- |
| `user_id`                | uuid FK → auth.users | Unique                                             |
| `plan`                   | text                 | `'free'` par défaut                                |
| `accounts_limit`         | integer              | 3 (free), 10 (Starter), 30 (Pro), illimité (Scale) |
| `accounts_used`          | integer              | Compteur analyses lancées                          |
| `enrichment_credits`     | integer              | Crédits Apollo Enrichment (payant à la demande)    |
| `stripe_customer_id`     | text                 | ID client Stripe                                   |
| `stripe_subscription_id` | text                 | ID abonnement Stripe actif                         |

Trigger : `handle_new_user_credits()` crée la ligne en même temps que le profil.

### Table : `accounts`

| Colonne          | Type                 | Description                                                         |
| ---------------- | -------------------- | ------------------------------------------------------------------- |
| `user_id`        | uuid FK → auth.users | —                                                                   |
| `company_name`   | text NOT NULL        | Nom de l'entreprise cible                                           |
| `sector`         | text                 | Secteur (rempli Phase 1)                                            |
| `employees`      | text                 | Effectifs (Pappers source de vérité)                                |
| `revenue`        | text                 | CA en euros (Pappers)                                               |
| `headquarters`   | text                 | Adresse siège                                                       |
| `subsidiaries`   | jsonb `[]`           | Liste des filiales                                                  |
| `it_challenges`  | jsonb `[]`           | Défis IT identifiés                                                 |
| `recent_signals` | jsonb `[]`           | Signaux d'achat récents                                             |
| `priority_score` | integer              | Score 1–10 calibré par taille ESN                                   |
| `raw_analysis`   | jsonb `{}`           | **Coffre-fort** : tout le JSON Claude (Phase 1 + Phase 4 fusionnés) |
| `status`         | text                 | `analyzing` / `completed` / `error`                                 |
| `error_message`  | text                 | Message d'erreur si status=error                                    |
| `api_cost_euros` | numeric(10,4)        | Coût API de l'analyse                                               |

### Table : `contacts`

| Colonne                    | Type                 | Description                                                          |
| -------------------------- | -------------------- | -------------------------------------------------------------------- |
| `account_id`               | uuid FK → accounts   | Cascade delete                                                       |
| `user_id`                  | uuid FK → auth.users | —                                                                    |
| `full_name`                | text NOT NULL        | —                                                                    |
| `title`                    | text                 | Poste exact                                                          |
| `entity`                   | text                 | Filiale/BU de rattachement                                           |
| `decision_role`            | text                 | `sponsor/champion/operational/purchasing/influencer/blocker/unknown` |
| `priority`                 | integer              | 1–5 (1 = contacter en premier)                                       |
| `email` / `email_verified` | text / bool          | Rempli par Apollo Enrichment (payant)                                |
| `phone`                    | text                 | Rempli par Apollo Enrichment (payant)                                |
| `linkedin_url`             | text                 | URL LinkedIn                                                         |
| `profile_summary`          | text                 | 3–4 phrases sur le profil                                            |
| `why_contact`              | text                 | Pourquoi pertinent pour cette ESN                                    |
| `email_message`            | jsonb                | `{subject, body}`                                                    |
| `linkedin_message`         | text                 | Message LinkedIn prêt                                                |
| `phone_script`             | text                 | Script téléphonique                                                  |
| `followup_message`         | jsonb                | `{subject, body}` relance                                            |
| `user_status`              | text                 | `new/contacted/replied/meeting/refused/silence`                      |
| `source`                   | text                 | `linkedin_apify/apollo/ai_generated`                                 |

### Table : `attack_angles`

Angles d'attaque générés par Phase 1. Colonnes : `account_id`, `user_id`, `title`, `description`, `entry_point`, `is_recommended` (boolean, premier angle = true), `rank`.

### Table : `action_plans`

Plan généré par Phase 4. Colonnes : `account_id`, `user_id`, `strategy_type`, `strategy_justification`, `weeks` (jsonb — plan complet séquencé 5 phases).

### Table : `rag_documents`

Base de connaissances utilisateur. Colonnes : `user_id`, `title`, `content`, `category`, `embedding` (vector(1536) — OpenAI text-embedding-3-small). Index IVFFlat cosinus (lists=100).

**Attention** : la méthode `.ilike()` manque dans `supabase_client.py` — la fonctionnalité RAG est cassée en production. Voir §13.

### Table : `user_actions`

Tracking des actions commerciales. Colonnes : `user_id`, `account_id`, `contact_id`, `action_type` (`message_copied/message_sent/response_received/rdv_obtained/deal_signed/analysis_started/analysis_completed`), `channel` (`linkedin/email/phone/meeting/other`), `metadata` (jsonb). Ajoutée le 11 avril 2026.

---

## 7. Pipeline d'analyse (flux principal)

### Vue d'ensemble

```
Frontend POST /analysis/start
    → NestJS vérifie JWT + crédits
    → Crée account (status=analyzing)
    → Enqueue job BullMQ "analysis"
    → Retourne { jobId, accountId }
    → Frontend connecte Socket.IO room jobId

BullMQ Worker (AnalysisWorker) :
    → Phase 1 → Phase 2 → Phase 3 → Phase 4 (séquentiel)
    → Après chaque phase : emit Socket.IO event
    → FastAPI sauvegarde en Supabase directement

Frontend reçoit événements et affiche progressivement.
```

### Phase 1 — Research (~60–90 secondes)

**Ce qu'elle fait** : collecte en parallèle les résultats Brave Search et les données Pappers, scrape les URLs via Firecrawl, puis appelle Claude avec le prompt BELLUM-RESEARCH.

**APIs appelées** :

- Brave Search : 1 requête principale (`company_name`)
- Firecrawl : scrape des top URLs (max 30 000 chars de contenu)
- Pappers : recherche SIREN + détail entreprise (CA, effectifs, dirigeants, établissements)

**Truncation safety** : si le prompt dépasse 500 000 chars, Firecrawl est réduit. Brave est tronqué à 20 résultats, snippets limités à 500 chars.

**Écrit en BDD** : mise à jour `accounts` (sector, employees, revenue, headquarters, website, subsidiaries, it_challenges, recent_signals, priority_score, raw_analysis) + insertion des `attack_angles`.

**Event Socket.IO** : `research_complete` (40%)

**max_tokens Claude** : 8 000

### Phase 2 — Contacts (~20–40 secondes)

**Ce qu'elle fait** : cherche les contacts décideurs via Apollo People Search. Si Apollo retourne 0 résultats, fallback automatique vers Brave Search + Claude (prompt inline, non paramétré par le profil).

**APIs appelées** :

- Apollo.io People Search : `POST /v1/mixed_people/search` avec `q_organization_name` et `person_titles` issus du profil ESN (gratuit, pas d'email ni téléphone)
- Brave Search + Claude (fallback si Apollo = 0)

**Écrit en BDD** : insert dans `contacts` (full_name, title, linkedin_url, source='apollo').

**Event Socket.IO** : `contacts_complete` (70%)

### Phase 3 — Enrich (~30–45 secondes)

**Ce qu'elle fait** : prend les contacts bruts de Phase 2 et les enrichit via Claude avec le prompt BELLUM-CONTACTS. Attribue les rôles décisionnels, priorités, résumés, messages personnalisés, organigramme.

**APIs appelées** : Claude API uniquement.

**Écrit en BDD** : mise à jour `contacts` (entity, decision_role, priority, profile_summary, why_contact).

**Données perdues** : `linkedinUrl`, `bestApproach`, `personalizedHook`, `reportingTo`, `influenceLevel` générés par Claude ne sont pas persistés. Voir §13.

**Event Socket.IO** : `enrich_complete` (85%)

**max_tokens Claude** : 12 000

### Phase 4 — Plan (~30–60 secondes)

**Ce qu'elle fait** : génère le plan d'action commercial complet (5 phases temporelles, 4+ actions chacune, quick wins, plan B si no-response, évaluation go/no-go).

**APIs appelées** : Claude API uniquement.

**Écrit en BDD** : insert dans `action_plans` + mise à jour `accounts` (status='completed', raw_analysis fusionné avec le plan).

**Event Socket.IO** : `analysis:done`

**max_tokens Claude** : 12 000

### Durée totale

3 à 6 minutes. Timeout worker : 360 secondes (6 min) par phase.

### Gestion des erreurs

Si une phase échoue, le worker NestJS met `accounts.status = 'error'` et émet `analysis:error` via Socket.IO avec le message d'erreur.

---

## 8. Agents & Prompts IA

Tous les fichiers sont dans `apps/ia/app/prompts/`. Le modèle utilisé est `claude-sonnet-4-20250514`.

| Fichier                  | Rôle                                                  | Input principal                                                          | Output JSON clés                                                                                                         | max_tokens | Utilisé dans                |
| ------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ---------- | --------------------------- |
| `bellum_research.py`     | Analyse exhaustive compte Phase 1                     | company_name, brave_results, scraped_content, pappers_data, user_context | businessDescription, entitiesExhaustive, itChallenges, pains, angles, priorityScore, messages, rdvScript, powerQuestions | 8 000      | `phase1_research.py`        |
| `bellum_contacts.py`     | Enrichissement contacts Phase 3                       | contacts bruts, entities, angles, pains                                  | contacts (role, priority, summary, whyContact, organigramme, decisionChain, approach_order)                              | 12 000     | `phase3_enrich.py`          |
| `bellum_plan.py`         | Plan d'action commercial Phase 4                      | account_data, contacts enrichis                                          | actionPlan (5 phases, actions), offersToPropose, quick_wins, if_no_response, evaluation                                  | 12 000     | `phase4_plan.py`            |
| `bellum_advisor.py`      | Chatbot copilote par compte                           | profile, account_data, contacts_summary, plan_summary                    | Réponses conversationnelles (non JSON)                                                                                   | —          | `chat.py`                   |
| `bellum_discover.py`     | Découverte de nouveaux comptes                        | criteria, brave_results                                                  | companies[]: name, sector, why, priorityScore, potentialContacts, suggestedAngle                                         | —          | `discover.py`               |
| `bellum_pitch.py`        | Script cold calling par contact                       | profile, company_analysis, contact_data, rag_templates                   | accroche, positionnement, questions[], objections[], closing                                                             | —          | Non connecté directement    |
| `bellum_boolean.py`      | Recherches booléennes LinkedIn                        | profile, company_name, entities[]                                        | searches[]: entity, decisionMakers, operationals, recruits                                                               | —          | Accessible via router       |
| `bellum_summary.py`      | Résumé exécutif personnalisé (archetype-aware)        | profile (esn_archetype), raw_analysis                                    | immediate_action, score_ajusté, key_insights                                                                             | —          | `summary.py`                |
| `bellum_battlecard.py`   | Battle card pré-RDV                                   | profile (archetype), account_data, contact_data                          | accroche, objection_probable, killer_question, ce_qu_il_ne_faut_pas_dire                                                 | —          | `battlecard.py`             |
| `bellum_scorer.py`       | Recalcul score adapté à l'ESN                         | profile (archetype, avg_deal_size, cycle), account raw_factors           | adjusted_score, sub_scores, justification                                                                                | —          | `scorer.py`                 |
| `bellum_icebreaker.py`   | 3 accroches personnalisées pour un contact            | profile, contact_data, recent_signals                                    | icebreakers[]: type, text, hook_reason                                                                                   | —          | `icebreaker.py`             |
| `bellum_activity.py`     | Description opérationnelle de l'activité              | profile, raw_analysis                                                    | concrete_activity, it_implications, entry_points, pitfalls                                                               | —          | `activity.py`               |
| `bellum_compare.py`      | Comparaison et priorisation de comptes                | profile (archetype, capacity), accounts[]                                | ranking[], recommended_focus, reasoning                                                                                  | —          | `compare.py`                |
| `bellum_weekly.py`       | Briefing lundi matin                                  | profile, accounts avec statuts, actions historiques                      | top5_actions[], stats, tip_semaine                                                                                       | —          | `weekly.py`                 |
| `bellum_debrief.py`      | Analyse post-RDV                                      | profile, account_data, debrief_text                                      | temperature (hot/warm/cold), positive_signals, negative_signals, next_steps, followup_message                            | —          | Non exposé via router actif |
| `bellum_intelligence.py` | Évaluation complexité entreprise                      | company_name, pappers_summary, brave_snippet                             | complexity, estimated_entities, key_sectors, special_instructions                                                        | —          | Non exposé via router actif |
| `bellum_profiler.py`     | Profilage ESN à l'onboarding (BELLUM_PROFILER_SYSTEM) | onboarding_data (12 réponses)                                            | profile_context: esn_archetype, selling_posture, personas, sectors, scoring_params                                       | —          | Non exposé via router actif |
| `bellum_coach.py`        | Coach prospection (questions libres)                  | profile, question (texte libre)                                          | Réponse textuelle (non structurée)                                                                                       | —          | Non exposé via router actif |

---

## 9. Intégrations & APIs tierces

| API                  | Rôle                           | Endpoint principal                                                  | Auth                                                                 | Coût / Limites                                                  | Statut                           |
| -------------------- | ------------------------------ | ------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------- |
| **Anthropic Claude** | Analyse IA (toutes phases)     | `POST https://api.anthropic.com/v1/messages`                        | `x-api-key: ANTHROPIC_API_KEY`                                       | ~$0.18/analyse (3 appels)                                       | Actif                            |
| **Brave Search**     | Recherche web                  | `GET https://api.search.brave.com/res/v1/web/search?q=...&count=20` | `X-Subscription-Token: BRAVE_API_KEY`                                | ~$0.005/requête, ~$0.05/analyse                                 | Actif                            |
| **Firecrawl**        | Scraping contenu web           | `POST https://api.firecrawl.dev/v0/scrape`                          | `Authorization: Bearer FIRECRAWL_API_KEY`                            | ~$0.01/page, ~$0.15/analyse (15 pages)                          | Actif                            |
| **Apollo.io**        | People Search (contacts)       | `POST https://api.apollo.io/v1/mixed_people/search`                 | `x-api-key: APOLLO_API_KEY`                                          | People Search gratuit. Enrichment : 1 crédit/email, 5/téléphone | Actif (avec fallback)            |
| **Pappers**          | Données légales entreprises FR | `GET https://api.pappers.fr/v2/recherche?q=...&api_token=...`       | Query param `api_token`                                              | ~$0.02/requête                                                  | Actif                            |
| **Supabase**         | BDD + Auth + Realtime          | SDK JS et Python                                                    | `SUPABASE_SERVICE_ROLE_KEY` (API) / `VITE_SUPABASE_ANON_KEY` (front) | Plan Pro                                                        | Actif                            |
| **Redis / BullMQ**   | Queue async analyses           | `redis://host:port`                                                 | URL avec password en prod                                            | —                                                               | Actif                            |
| **Stripe**           | Paiements & abonnements        | `https://api.stripe.com/v1/`                                        | `STRIPE_SECRET_KEY`                                                  | 4 plans : Free/Starter(49€)/Pro(99€)/Scale(199€)                | Partiellement intégré (voir §13) |
| **Socket.IO**        | Temps réel frontend            | WebSocket via NestJS Gateway                                        | Aucune auth actuellement (voir §13)                                  | —                                                               | Actif                            |

**Coût total moyen par analyse** : ~$0.40 USD (Brave $0.05 + Firecrawl $0.15 + Claude $0.18 + Pappers $0.02 + Apollo $0)

---

## 10. Variables d'environnement

Copier `.env.example` vers `.env` dans chaque service. Ne jamais committer les `.env`.

### Service API — `apps/api/.env`

| Variable                    | Obligatoire | Description                                                            |
| --------------------------- | ----------- | ---------------------------------------------------------------------- |
| `SUPABASE_URL`              | Oui         | URL du projet Supabase (format https://xxx.supabase.co)                |
| `SUPABASE_SERVICE_ROLE_KEY` | Oui         | Clé service_role (~200 chars, accès admin, NE PAS exposer côté client) |
| `SUPABASE_JWT_SECRET`       | Oui         | Secret JWT pour vérifier les tokens Supabase Auth                      |
| `STRIPE_SECRET_KEY`         | Non (prod)  | `sk_test_...` (test) ou `sk_live_...` (prod)                           |
| `STRIPE_WEBHOOK_SECRET`     | Non (prod)  | `whsec_...` — vérification signatures webhooks                         |
| `REDIS_URL`                 | Oui         | `redis://localhost:6379` (local) ou Railway URL                        |
| `IA_SERVICE_URL`            | Oui         | `http://localhost:8000` (local) ou Railway URL                         |
| `FRONTEND_URL`              | Non         | Pour CORS (prod : `https://app.bellum.ai`)                             |
| `NODE_ENV`                  | Non         | `development` / `test` / `production`                                  |
| `PORT`                      | Non         | `3000` par défaut                                                      |
| `CORS_ORIGINS`              | Non         | Origines CORS séparées par virgules                                    |
| `GOOGLE_CLIENT_ID`          | Non         | OAuth Google (optionnel)                                               |
| `GOOGLE_CLIENT_SECRET`      | Non         | OAuth Google (optionnel)                                               |

### Service IA — `apps/ia/.env`

| Variable                    | Obligatoire | Description                                                                                                                                                                                              |
| --------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`         | Oui         | `sk-ant-api03-...` — console.anthropic.com                                                                                                                                                               |
| `BRAVE_API_KEY`             | Oui         | `BSA...` — api.search.brave.com                                                                                                                                                                          |
| `FIRECRAWL_API_KEY`         | Oui         | `fc-...` — firecrawl.dev                                                                                                                                                                                 |
| `APOLLO_API_KEY`            | Oui         | apollo.io > Settings > Integrations > API                                                                                                                                                                |
| `PAPPERS_API_KEY`           | Oui         | pappers.fr > Mon compte > Clé API                                                                                                                                                                        |
| `SUPABASE_URL`              | Oui         | Même valeur que apps/api                                                                                                                                                                                 |
| `SUPABASE_SERVICE_ROLE_KEY` | Oui         | Même valeur que apps/api                                                                                                                                                                                 |
| `BELLUM_MODE`               | Non         | `development` / `production`                                                                                                                                                                             |
| `EMBEDDING_API_KEY`         | Non         | **Le seul interrupteur des vecteurs.** Présente ⇒ similarité pgvector ; absente ⇒ recherche plein-texte Postgres. Il n'y a PAS de drapeau à poser en plus (`rag_service.py` : « the key IS the switch ») |
| `EMBEDDING_API_URL`         | Non         | `https://api.openai.com/v1/embeddings`                                                                                                                                                                   |
| `EMBEDDING_MODEL`           | Non         | `text-embedding-3-small`                                                                                                                                                                                 |
| `CORS_ORIGINS`              | Non         | Même format que apps/api                                                                                                                                                                                 |

### Service Web — `apps/web/.env`

| Variable                 | Obligatoire | Description                                                                  |
| ------------------------ | ----------- | ---------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`      | Oui         | URL publique Supabase (exposée au navigateur — OK)                           |
| `VITE_SUPABASE_ANON_KEY` | Oui         | Clé anon Supabase (accès limité par RLS — OK d'exposer)                      |
| `VITE_API_URL`           | Oui         | `http://localhost:3000` (local) ou Railway API URL                           |
| `VITE_IA_URL`            | Non         | `http://localhost:8000` — certaines pages appellent FastAPI directement      |
| `VITE_PAPPERS_API_KEY`   | Non         | Clé Pappers côté client (visible dans le bundle — préférer un proxy en prod) |
| `VITE_SENTRY_DSN`        | Non         | DSN Sentry monitoring frontend                                               |

---

## 11. Déploiement

### Architecture cible (actuelle)

| Service  | Plateforme      | URL cible             |
| -------- | --------------- | --------------------- |
| apps/web | Vercel          | https://app.bellum.ai |
| apps/api | Railway         | https://api.bellum.ai |
| apps/ia  | Railway         | https://ia.bellum.ai  |
| Redis    | Railway (addon) | URL interne Railway   |

### apps/web — Vercel

```bash
# Build command
tsc --noEmit && vite build

# Output directory
dist

# Variables d'environnement à configurer dans Vercel :
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_API_URL=https://api.bellum.ai
VITE_IA_URL=https://ia.bellum.ai
VITE_SENTRY_DSN  # optionnel
```

### apps/api — Railway

```bash
# Build command
nest build

# Start command
node dist/main

# Variables d'environnement à configurer dans Railway :
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_JWT_SECRET
REDIS_URL  # URL Redis Railway interne
IA_SERVICE_URL  # URL Railway du service IA
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://app.bellum.ai
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

### apps/ia — Railway

```bash
# Build command
pip install -r requirements.txt

# Start command
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Variables d'environnement à configurer dans Railway :
ANTHROPIC_API_KEY
BRAVE_API_KEY
FIRECRAWL_API_KEY
APOLLO_API_KEY
PAPPERS_API_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
BELLUM_MODE=production
CORS_ORIGINS=https://api.bellum.ai,https://app.bellum.ai
```

### Migrations Supabase

Appliquer les migrations dans l'ordre dans Supabase SQL Editor :

```
supabase/migrations/00001_init.sql
supabase/migrations/00002_indexes_and_fixes.sql
supabase/migrations/00003_rag_vector_search.sql
supabase/migrations/20260410_audit_fixes.sql
supabase/migrations/20260411_user_actions.sql
```

### Problèmes connus au déploiement

- Le CORS en production est restreint à `["https://bellum-ai.com", "https://www.bellum-ai.com"]` dans `main.ts` — mettre à jour si le domaine change
- `STRIPE_SECRET_KEY` non définie → Stripe initialisé avec `"sk_test_placeholder"` → webhooks silencieusement cassés
- `SUPABASE_JWT_SECRET` manquant → toutes les requêtes authentifiées retournent 401
- Le service IA FastAPI doit être accessible depuis le réseau interne Railway par le worker NestJS

---

## 12. Tests

### Lancer les tests

```bash
# Tous les tests (via Turborepo)
turbo test

# Tests frontend uniquement
cd apps/web && pnpm test
# ou
vitest run

# Tests API NestJS uniquement
cd apps/api && pnpm test
# ou
jest

# Tests Python FastAPI uniquement
cd apps/ia && pytest
# ou avec verbosité
pytest -v

```

### Couverture actuelle

170+ tests au total :

- **49 tests NestJS** (Jest) — modules auth, accounts, contacts, analysis, credits
- **95 tests Python** (pytest) — routers, services, prompts, parsing JSON Claude
- **26 tests Frontend** (Vitest + React Testing Library) — composants, hooks, pages

### Ajouter un test

**NestJS** : créer `*.spec.ts` dans le même répertoire que le fichier testé. Utiliser `@nestjs/testing` et `createTestingModule`. Mocker Supabase avec `jest.fn()`.

**FastAPI** : créer `tests/test_*.py`. Utiliser `pytest-asyncio` pour les tests async. Mocker les appels API externes avec `httpx.MockTransport` ou `unittest.mock.patch`.

**Frontend** : créer `*.test.tsx` dans le répertoire du composant. Utiliser `@testing-library/react` et `vi.mock()` pour Supabase et Socket.IO.

---

## 13. Dette technique & bugs connus

Basé sur l'audit du 10 avril 2026 (commit `41e3be3`). 49 problèmes identifiés.

### Critiques (7)

| #   | Sévérité | Problème                                                                                                     | Fichier                                                         | Impact                                                                           | Fix estimé |
| --- | -------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------- |
| 1   | CRITIQUE | Méthode `.ilike()` absente dans `supabase_client.py`                                                         | `apps/ia/app/services/supabase_client.py`                       | Knowledge Base (RAG) complètement hors service — `AttributeError` à chaque appel | 15 min     |
| 2   | CRITIQUE | `businessImpact` lu comme `impact` dans AccountDetail                                                        | `apps/web/src/pages/AccountDetail.tsx` l.578                    | L'impact des pains est toujours vide dans le tab Fiche                           | 5 min      |
| 3   | CRITIQUE | `angles.strategy` lu comme `description` dans AccountDetail                                                  | `apps/web/src/pages/AccountDetail.tsx` l.610                    | La stratégie des angles est toujours vide dans le tab Fiche                      | 5 min      |
| 4   | CRITIQUE | `entitiesExhaustive` — frontend lit `activity/esnAngle/pitfalls`, le prompt génère `name/type/parent/region` | `apps/web/src/pages/AccountDetail.tsx` l.272                    | Section entités du tab Fiche toujours vide                                       | 30 min     |
| 5   | CRITIQUE | `commentOuvrirCompte` — prompt génère une string, frontend attend un objet `{strategy, entryPoints[]}`       | `apps/web/src/pages/AccountDetail.tsx` l.639                    | Section "Ouvrir le compte" toujours vide                                         | 10 min     |
| 6   | ÉLEVÉ    | `"dev-token"` hardcodé en fallback si session invalide                                                       | `apps/web/src/hooks/useAnalysis.ts` l.40, `Dashboard.tsx` l.121 | Faille sécurité — token fictif envoyé au backend si session expirée              | 10 min     |
| 7   | ÉLEVÉ    | `entry_point` (attack_angles) toujours vide — mismatch clé `entryContact` vs `entryContactPersona`           | `apps/ia/app/routers/phase1_research.py` l.185                  | Colonne `entry_point` vide systématiquement                                      | 5 min      |

### Élevés (top 5)

| #   | Sévérité | Problème                                                            | Fichier                                                 | Impact                                                                 | Fix estimé |
| --- | -------- | ------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------- | ---------- |
| 8   | ÉLEVÉ    | WebSocket Gateway sans authentification                             | `apps/api/src/modules/analysis/analysis.gateway.ts`     | N'importe quel client peut écouter les analyses d'un autre utilisateur | 2h         |
| 9   | ÉLEVÉ    | Routes FastAPI sans validation `user_id` — publiquement accessibles | `apps/ia/app/models/research.py`                        | Injection de données arbitraires dans la BDD d'un autre utilisateur    | 2h         |
| 10  | ÉLEVÉ    | `linkedinUrl` non persisté lors de Phase 3                          | `apps/ia/app/routers/phase3_enrich.py`                  | URLs LinkedIn générées par Claude perdues                              | 10 min     |
| 11  | ÉLEVÉ    | 16 catch vides frontend (erreurs silencieuses)                      | `useAccount.ts`, `Login.tsx`, `Dashboard.tsx`, etc.     | UX dégradée — écrans vides sans explication, impossible de débuguer    | 2h         |
| 12  | MOYEN    | `sk_test_placeholder` hardcodé si `STRIPE_SECRET_KEY` manquante     | `credits.controller.ts` l.45, `credits.service.ts` l.25 | Stripe silencieusement cassé sans message d'erreur au démarrage        | 15 min     |

### Dette architecturale

- **`AccountDetail.tsx` : 1 771 lignes** — 8 tabs inline, à découper en composants. Priorité haute.
- **`Landing.tsx` : 1 900 lignes** — tout le site marketing dans un fichier.
- **13 composants shadcn/ui dans `ui/`** : button, card, badge, skeleton, tabs, separator, progress, scroll-area, dropdown-menu, input, label, select, dialog — présents mais aucun n'est importé nulle part. Code mort.
- **8 agents Python dans `apps/ia/app/agents/`** : researcher, scout, advisor, strategist, messenger, contact_hunter, watcher, orchestrator — architecture multi-agents complète mais aucun router ne les utilise. Code mort.
- **20+ castings `as Record<string, unknown>`** dans AccountDetail.tsx — conséquence directe du stockage du JSON Claude brut dans `raw_analysis: JSONB` sans typage fort.
- **Types `Contact` et `Account` dupliqués** entre `packages/shared/` et `apps/web/src/hooks/useAccount.ts` — les hooks utilisent des définitions locales incomplètes au lieu d'importer les types partagés.

---

## 14. Décisions d'architecture

| Décision                                     | Pourquoi                                                                                                                                                                                                   | Alternatives considérées             | Ne pas changer sauf si                                                                                             |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Monorepo (Turborepo + pnpm)**              | Types TypeScript partagés entre web et API, CI/CD unifié, une seule commande pour lancer tout le projet                                                                                                    | Repos séparés                        | L'équipe dépasse 5 développeurs avec des rythmes de release très différents par service                            |
| **NestJS (pas Express)**                     | Modules, guards, pipes, DI natif — structure imposée qui évite l'accumulation de dette. Intégration BullMQ et Socket.IO first-class                                                                        | Express + Fastify                    | Jamais — Express nécessite trop de setup boilerplate pour atteindre le même niveau de structure                    |
| **FastAPI séparé (pas intégré dans NestJS)** | Le service IA est CPU-bound et nécessite des libs Python (Anthropic SDK, LangChain, pgvector). Séparation claire des responsabilités. Scale indépendant                                                    | intégrer via node-python-bridge      | Si le volume d'appels IA justifie un service dédié autoscalé (déjà le cas) — ne pas changer                        |
| **BullMQ pour les analyses asynchrones**     | Une analyse dure 3–6 min. Sans queue, le HTTP timeout à 30s tuerait le process. BullMQ gère le retry, la persistence, la concurrence                                                                       | Pas de queue (long-polling)          | Si on passe à un modèle serverless (Vercel Functions) — adapter alors                                              |
| **Supabase (pas un PostgreSQL custom)**      | Auth JWT intégrée, RLS, pgvector, Realtime, dashboard — élimine 3 semaines de plomberie. Plan Pro inclut les backups et un SLA                                                                             | PostgreSQL sur Railway + Auth custom | Si les coûts Supabase deviennent prohibitifs à l'échelle (>10K users)                                              |
| **Claude API (pas fine-tuning)**             | Les prompts sont riches et contextuels (profil ESN injecté à chaque appel). Le fine-tuning ne permettrait pas cette personnalisation dynamique. claude-sonnet-4 a les capacités JSON structuré nécessaires | GPT-4o, fine-tuning                  | Si Anthropic change sa politique tarifaire ou si un autre modèle produit un meilleur JSON structuré                |
| **pnpm (pas npm/yarn)**                      | Workspaces natifs, liens symboliques, 2–3x plus rapide que npm, disk space efficient                                                                                                                       | npm workspaces, yarn berry           | Ne pas changer — migration coûteuse pour un gain marginal                                                          |
| **`raw_analysis: JSONB`**                    | Toute la sortie Claude est stockée d'un coup sans schema rigide — permet d'itérer sur les prompts sans migrations                                                                                          | Tables structurées par champ         | Si le frontend a besoin de requêter les sous-champs de `raw_analysis` via SQL (nécessiterait des colonnes dédiées) |

---

## 15. Ce qu'il ne faut PAS faire

Ces erreurs ont déjà été faites. Ne pas les répéter.

**Sur les prompts Claude :**

- Ne pas augmenter `max_tokens` au-delà de 8 000 pour la Phase 1 sans réduire la taille du prompt en entrée — le contexte total peut dépasser la fenêtre disponible.
- Ne pas modifier le schéma JSON dans un prompt sans mettre à jour simultanément le frontend qui lit ces clés — les mismatches sont la première source de bugs (voir §13, issues 2–5).
- Ne pas supprimer les guards `|| {}` sur les réponses Supabase dans les services Python — `existing.data` peut être `None` si Supabase retourne une erreur, et `raw_analysis` serait écrasé par un objet vide.

**Sur le frontend :**

- Ne pas utiliser `|| "dev-token"` comme fallback de `session?.access_token` — c'est une faille de sécurité. Si la session est null, rediriger vers `/login`.
- Ne pas ajouter de `catch {}` vides — loguer toujours l'erreur ou afficher un message à l'utilisateur. Les catch vides rendent le debugging impossible.
- Ne pas importer les types `Contact` ou `Account` localement dans les hooks — utiliser les types de `@bellum/shared`.

**Sur la base de données :**

- Ne pas modifier les politiques RLS sans tester que les données d'un user A ne sont pas accessibles à un user B.
- Ne pas ajouter de colonnes à `accounts` ou `contacts` sans ajouter la migration correspondante dans `supabase/migrations/`.

**Sur le workflow :**

- Ne pas merger dans `main` sans que `turbo test` passe en vert.
- Ne pas modifier plus de 3 fichiers sans vérifier l'impact avec `/impact-check`.
- Ne pas committer de vraies clés API — le `.gitignore` est configuré, mais vérifier avant chaque `git add .`.

**Sur le déploiement :**

- Ne pas déployer en production sans configurer `STRIPE_SECRET_KEY` — la valeur `"sk_test_placeholder"` laisse Stripe silencieusement cassé.
- Ne pas oublier d'appliquer les migrations Supabase dans l'ordre avant de déployer un code qui dépend d'une nouvelle table.
- Ne pas exposer `SUPABASE_SERVICE_ROLE_KEY` dans les variables `VITE_*` — cette clé bypasse le RLS et donne un accès admin complet à la base.

---

## 16. Contacts & ressources

| Ressource                    | URL                                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase Dashboard           | https://supabase.com/dashboard/project/qkpuwkziwnljfwlzyngr                                                                                 |
| Supabase SQL Editor          | https://supabase.com/dashboard/project/qkpuwkziwnljfwlzyngr/sql                                                                             |
| Supabase Auth                | https://supabase.com/dashboard/project/qkpuwkziwnljfwlzyngr/auth/users                                                                      |
| Anthropic Console (API Keys) | https://console.anthropic.com                                                                                                               |
| Brave Search API Dashboard   | https://api.search.brave.com/app/dashboard                                                                                                  |
| Firecrawl Dashboard          | https://firecrawl.dev/app                                                                                                                   |
| Apollo.io API Settings       | https://app.apollo.io/#/settings/integrations/api                                                                                           |
| Pappers API                  | https://www.pappers.fr/api                                                                                                                  |
| Stripe Dashboard             | https://dashboard.stripe.com                                                                                                                |
| Documentation agent_docs/    | Lire avant de coder : `agent_docs/prd.md`, `agent_docs/pipeline.md`, `agent_docs/prompts.md`, `agent_docs/rag.md`, `agent_docs/security.md` |
| Audit complet                | `AUDIT_10_AVRIL.md` — 49 problèmes détaillés avec fichier + ligne                                                                           |
| Backlog produit              | `agent_docs/backlog.md` — bugs + features par priorité                                                                                      |
