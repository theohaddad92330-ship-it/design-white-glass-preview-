# Plan d'exécution — Prompts Claude Code

## Méthode de travail

1. Chaque bloc = 1 branche Git (feature/bloc-X)
2. On écrit les tests AVANT le code (TDD)
3. On merge dans main SEULEMENT quand tous les tests passent
4. On lance /impact-check avant chaque modification majeure

## BLOC 1 — Monorepo Turborepo (Jour 1)

### Prompt 1.1

```
Crée un monorepo Turborepo avec pnpm workspaces.
Structure : apps/web (React 18 + Vite + Tailwind + shadcn/ui),
apps/api (NestJS TypeScript strict mode),
apps/ia (FastAPI Python avec requirements.txt),
packages/shared (types TypeScript).
Configure turbo.json avec les pipelines dev, build, test, lint.
Configure pnpm-workspace.yaml.
Lis CLAUDE.md pour les conventions du projet.
Initialise Git avec .gitignore complet.
Fais un premier commit : "chore: init monorepo Turborepo"
```

### Prompt 1.2

```
Dans apps/api, configure NestJS :
- main.ts avec ValidationPipe global (whitelist, forbidNonWhitelisted)
- @nestjs/throttler (20 req/heure par IP)
- CORS configuré pour http://localhost:5173 en dev
- Winston logger structuré
- Module auth avec JwtGuard qui vérifie les tokens Supabase
- Module accounts (controller + service + DTOs vides pour l'instant)
- Module contacts (idem)
- Module analysis (idem)
- Module credits (idem)
- Lis agent_docs/architecture.md pour la structure exacte.
- Écris un test pour chaque module (vérifie que le module se charge).
- Lance les tests : tous doivent passer.
```

### Prompt 1.3

```
Dans apps/ia, configure FastAPI :
- main.py avec CORS, routers séparés
- Router phase1_research.py (endpoint vide POST /phase/1/research)
- Router phase2_contacts.py (POST /phase/2/contacts)
- Router phase3_enrich.py (POST /phase/3/enrich)
- Router phase4_plan.py (POST /phase/4/plan)
- Router rag.py (POST /rag/query, POST /rag/ingest)
- Router chat.py (POST /chat/message)
- Modèles Pydantic pour les inputs/outputs
- requirements.txt : fastapi, uvicorn, httpx, anthropic, langchain, pgvector, python-dotenv
- Un test pytest par endpoint (vérifie que ça retourne 200)
- Lis agent_docs/architecture.md pour la structure.
```

## BLOC 2 — Apollo fonctionnel (Jours 2-3)

### Prompt 2.1

```
Dans apps/ia/services/apollo.py, crée le service Apollo :
- Fonction search_people(company_name, person_titles, max_pages=5)
- Appelle POST https://api.apollo.io/v1/mixed_people/search
- Header : x-api-key depuis .env (APOLLO_API_KEY)
- Pagination : 25/page, itère jusqu'à max_pages
- Retourne : liste de contacts (first_name, last_name, title, organization, linkedin_url, city)
- Lis agent_docs/apis.md section Apollo pour les détails.
- Écris un test avec un mock HTTP pour vérifier le parsing.
- Puis un test d'intégration réel avec APOLLO_API_KEY pour chercher "SNCF" (skip si pas de clé).
```

### Prompt 2.2

```
Connecte Apollo au router phase2_contacts.py :
- L'endpoint reçoit { company_name, profile_data }
- Construit les person_titles depuis profile_data.personas
- Appelle apollo.search_people()
- Retourne les contacts au format standardisé
- Écris un test end-to-end.
```

## BLOC 3 — Pipeline IA complet (Jours 4-8)

### Prompt 3.1

```
Dans apps/ia/services/brave_search.py, crée le service Brave :
- Fonction search(company_name, profile_data) → 8-10 requêtes ciblées
- Lis agent_docs/pipeline.md pour les requêtes exactes
- Déduplique les résultats, garde top 30
- Lis agent_docs/apis.md pour l'endpoint Brave.
Test : mock HTTP + vérification du format de sortie.
```

### Prompt 3.2

```
Dans apps/ia/services/firecrawl.py :
- Fonction scrape_urls(urls, max_pages=15, max_chars=40000)
- Scrape en parallèle avec asyncio
- Exclure linkedin.com, facebook.com, youtube.com
- Lis agent_docs/apis.md section Firecrawl.
Test inclus.
```

### Prompt 3.3

```
Dans apps/ia/services/pappers.py :
- Fonction search_company(name) → SIREN
- Fonction get_company(siren) → CA, effectifs, dirigeants, établissements
- Lis agent_docs/apis.md section Pappers.
Tests inclus.
```

### Prompt 3.4

```
Dans apps/ia/services/claude_api.py :
- Fonction call_claude(system_prompt, user_prompt, max_tokens) → dict
- Appelle POST https://api.anthropic.com/v1/messages
- Vérifie res.ok (si pas ok → raise avec status + body)
- Parse JSON robuste : nettoyer backticks, extraire premier { au dernier }
- Si parse échoue → logger 300 premiers + 200 derniers chars → raise
- Lis agent_docs/prompts.md pour comprendre la structure.
Test avec mock.
```

### Prompt 3.5

```
Implémente le router phase1_research.py complet :
- Reçoit { company_name, profile_data, user_context }
- Appelle brave, firecrawl, pappers EN PARALLÈLE (asyncio.gather)
- Construit le prompt BELLUM-RESEARCH (lis agent_docs/prompts.md prompt 1)
- Appelle claude_api
- Fusionne données Pappers (source de vérité CA, effectifs)
- Sauvegarde dans Supabase (accounts + attack_angles)
- Retourne le résultat complet
Test end-to-end avec mocks.
```

### Prompt 3.6

```
Implémente phase3_enrich.py (prompt BELLUM-CONTACTS) et phase4_plan.py (prompt BELLUM-PLAN).
Même pattern que phase1. Lis agent_docs/prompts.md pour les prompts 2 et 3.
Tests inclus.
```

## BLOC 4 — BullMQ + WebSocket (Jours 9-11)

### Prompt 4.1

```
Dans apps/api, configure BullMQ avec Redis :
- Module analysis avec un producer (crée un job) et un worker (consomme)
- Le worker appelle séquentiellement :
  1. FastAPI /phase/1/research
  2. FastAPI /phase/2/contacts
  3. FastAPI /phase/3/enrich
  4. FastAPI /phase/4/plan
- Après chaque phase, émet un event via Socket.IO
- Configure Socket.IO dans un NestJS Gateway (analysis.gateway.ts)
- Events : phase:complete, analysis:done, analysis:error
- Lis agent_docs/architecture.md section flux.
Tests unitaires pour le worker.
```

## BLOC 5 — Frontend React (Jours 12-18)

### Prompt 5.1

```
Dans apps/web, setup React + Vite + Tailwind + shadcn/ui :
- Configure dark mode (class strategy, default dark)
- Installe shadcn/ui composants : Button, Card, Dialog, Table, Badge, Input, Skeleton, Toast
- Layout : Sidebar (navigation) + main content area
- Router avec les routes du PRD (lis agent_docs/prd.md)
- Connexion Supabase Auth (login email + Google OAuth)
- Page Login/Signup fonctionnelle
```

### Prompt 5.2 — et suivants...

(Chaque page = 1 prompt séparé avec ses specs précises)

## BLOC 6 — Stripe + Deploy (Jours 19-21)

## BLOC 7 — RAG (Jours 22-25)

## BLOC 8 — Features avancées (Jours 26+)
