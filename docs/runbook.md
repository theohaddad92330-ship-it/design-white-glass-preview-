# Runbook BellumAI — lancement, déploiement et accès critiques

Ce document est la référence unique pour reprendre, lancer et déployer BellumAI. Il centralise les commandes exécutables, les plateformes à administrer, les comptes, les clés API et les services tiers nécessaires au produit.

> **Sécurité** — Ne jamais committer de secret réel. Les valeurs ci-dessous décrivent les noms de variables, leur usage et l'endroit où les renseigner. Les secrets de production doivent rester dans les coffres des plateformes concernées (Railway, Vercel, Supabase, fournisseurs tiers) ou dans le gestionnaire de mots de passe de l'organisation.

## 1. Vue d'ensemble

### Applications et responsabilités

| Composant           | Package                     | Stack                   | Rôle                                                       | Local                   | Production                                    |
| ------------------- | --------------------------- | ----------------------- | ---------------------------------------------------------- | ----------------------- | --------------------------------------------- |
| Application produit | `@bellum/web`               | Vite, React, TypeScript | Interface connectée utilisée par les clients.              | `http://localhost:5173` | Vercel, domaine `app.bellum.ai`               |
| API produit         | `@bellum/api`               | NestJS, TypeORM, BullMQ | Auth applicative, comptes, analyses, Stripe, emails, jobs. | `http://localhost:3000` | Railway, healthcheck `/health`                |
| Service IA          | `@bellum/ia`                | FastAPI, Python         | Pipeline IA, enrichissement, RAG, appels fournisseurs.     | `http://localhost:8000` | Railway, healthcheck `/health`                |
| Site marketing      | `@bellum/website`           | Next.js                 | Landing, pages légales, demande de démo.                   | `http://localhost:3004` | Vercel, domaine `bellum.ai`                   |
| Dashboard manager   | `@bellum/dashboard-manager` | Next.js                 | Outils internes de lancement, télémétrie et config IA.     | `http://localhost:3005` | À déployer uniquement derrière accès interne. |

### Infrastructure partagée

| Service                       | Usage                                       | Local                                          | Production                                              |
| ----------------------------- | ------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------- |
| PostgreSQL / Supabase         | Base principale, auth schema, pgvector.     | Docker Supabase Postgres sur `localhost:5432`. | Supabase/Railway Postgres selon environnement actif.    |
| Supabase Auth / Kong / Studio | Auth GoTrue locale et inspection DB locale. | Docker : Kong `54321`, Studio `3001`.          | Projet Supabase administré hors repo.                   |
| Redis                         | BullMQ, throttling, outbox et OTP.          | Docker `localhost:6379`.                       | Railway Redis, politique `maxmemory-policy=noeviction`. |
| Mailpit                       | SMTP local et preview emails.               | SMTP `1025`, UI `8025`.                        | Remplacé par Resend en production.                      |
| Sentry                        | Observabilité front, API et IA.             | Non configuré.                                 | Aucun compte/projet disponible à ce stade.              |
| Feature gating produit        | Accès aux fonctionnalités non livrées.      | Configuration statique dans le code.           | Configuration statique déployée avec l'app.             |

## 2. Prérequis poste développeur

- Node.js `>=22.19.0 <25`.
- pnpm `10.6.0`.
- Docker Desktop ou Docker Engine avec Compose.
- Python 3.12+ pour le service IA (la CI utilise Python 3.13).
- Accès GitHub au dépôt `Bellum-AI/belllum-monorepo`.
- Accès aux consoles nécessaires : Vercel, Railway, Supabase, Stripe, Resend et aux fournisseurs data/IA listés plus bas.

## 3. Lancement local exécutable

### 3.1 Installation initiale

```bash
pnpm setup
```

Cette commande installe les dépendances Node, crée le venv Python `apps/ia/.venv`, installe `apps/ia/requirements.txt` et initialise les fichiers `.env` disponibles depuis les exemples.

### 3.2 Configurer les secrets locaux

```bash
cp tools/dev.secret.sh.example tools/dev.secret.sh 2>/dev/null || true
cp apps/ia/.env.example apps/ia/.env 2>/dev/null || true
cp apps/website/.env.example apps/website/.env.local 2>/dev/null || true
cp apps/dashboard-manager/.env.example apps/dashboard-manager/.env.local 2>/dev/null || true
```

Renseigner ensuite les clés nécessaires. Pour un lancement local complet, les valeurs minimales à vérifier sont :

- `ANTHROPIC_API_KEY` pour l'API et/ou le service IA.
- `BRAVE_API_KEY`, `FIRECRAWL_API_KEY`, `APOLLO_API_KEY`, `PAPPERS_API_KEY` pour les enrichissements IA.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` si l'app ne s'appuie pas uniquement sur les valeurs Docker de démonstration.
- `STRIPE_SECRET_KEY` si les flux crédits/paiement doivent être testés.
- `INTERNAL_API_SECRET` identique entre API, IA et dashboard manager ; longueur minimale 16 caractères.

### 3.3 Démarrer toute la stack locale

```bash
pnpm dev full
```

La commande démarre l'infrastructure Docker puis les serveurs de développement via Turbo. Si vous préférez contrôler chaque étape :

```bash
pnpm infra:start
pnpm db:reset
pnpm dev:start
```

### 3.4 URLs locales utiles

| Service           | URL                               |
| ----------------- | --------------------------------- |
| App produit       | `http://localhost:5173`           |
| API               | `http://localhost:3000`           |
| Service IA        | `http://localhost:8000`           |
| Site marketing    | `http://localhost:3004`           |
| Dashboard manager | `http://localhost:3005`           |
| Supabase Studio   | `http://localhost:3001`           |
| Supabase Auth API | `http://localhost:54321/auth/v1/` |
| Mailpit           | `http://localhost:8025`           |

### 3.5 Commandes de contrôle local

```bash
pnpm docker:ps
pnpm docker:logs
pnpm db:migration:show
pnpm lint
pnpm check-types
pnpm build
pnpm test
```

Pour arrêter l'infra locale :

```bash
pnpm infra:stop
```

Pour repartir d'une base locale saine :

```bash
docker compose -f tools/docker-compose.yml down -v
pnpm infra:start
pnpm db:reset
```

## 4. Variables d'environnement et clés API

### 4.1 API NestJS (`@bellum/api`)

| Variable                                                                                                   | Usage                                             | Local                       | Production                                     |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------- | ---------------------------------------------- |
| `SUPABASE_URL`                                                                                             | URL Supabase/Kong utilisée par l'API.             | `http://localhost:54321`    | URL projet Supabase.                           |
| `SUPABASE_ANON_KEY`                                                                                        | Clé publique Supabase pour auth.                  | JWT demo Docker possible.   | Clé anon du projet.                            |
| `SUPABASE_SERVICE_ROLE_KEY`                                                                                | Clé admin Supabase, bypass RLS.                   | JWT demo Docker possible.   | Secret critique, Railway uniquement.           |
| `SUPABASE_JWT_SECRET`                                                                                      | Validation des JWT auth.                          | Secret Docker local.        | Secret Supabase.                               |
| `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`                      | Connexion TypeORM.                                | Défauts Docker.             | Variables DB managée.                          |
| `ANTHROPIC_API_KEY`                                                                                        | Appels Claude côté API si utilisés.               | Secret local.               | Secret Railway.                                |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`                                                               | Paiement, crédits, webhooks.                      | Clés test Stripe.           | Clés live Stripe.                              |
| `REDIS_URL`                                                                                                | BullMQ, throttling, outbox, OTP.                  | `redis://localhost:6379`    | Railway Redis.                                 |
| `IA_SERVICE_URL`                                                                                           | URL appelée par l'API pour le service IA.         | `http://localhost:8000`     | URL interne/publique Railway IA.               |
| `API_INTERNAL_URL`                                                                                         | URL callback API utilisée dans les flux internes. | `http://localhost:3000`     | DNS interne Railway API.                       |
| `INTERNAL_API_SECRET`                                                                                      | Secret machine-to-machine API/IA/dashboard.       | Valeur dev partagée.        | Secret fort partagé uniquement entre services. |
| `FRONTEND_URL`                                                                                             | Origine CORS et liens emails.                     | `http://localhost:5173`     | `https://app.bellum.ai`.                       |
| `EMAIL_PROVIDER`                                                                                           | `mailpit` ou `resend`.                            | `mailpit`                   | `resend`.                                      |
| `RESEND_API_KEY`, `RESEND_FROM`                                                                            | Emails transactionnels production.                | Optionnel.                  | Requis si `EMAIL_PROVIDER=resend`.             |
| `SMTP_*`, `MAILPIT_HTTP_BASE_URL`                                                                          | Transport mail local/SMTP.                        | Mailpit.                    | Seulement si SMTP choisi.                      |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `SENTRY_TRACES_SAMPLE_RATE`                          | Observabilité API.                                | Optionnel.                  | Recommandé.                                    |
| `BYPASS_EMAIL_VERIFICATION`                                                                                | Désactive l'OTP email.                            | `true` possible en dev/E2E. | Toujours `false`.                              |
| `NODE_ENV`, `PORT`                                                                                         | Runtime.                                          | `development`, `3000`.      | `production`, port injecté par Railway.        |
| `SESSION_COOKIE_PREFIX`, `REFRESH_COOKIE_PREFIX`, `LOGGED_IN_COOKIE_PREFIX`, `LAST_USED_LOGIN_COOKIE_NAME` | Noms de cookies.                                  | Défauts.                    | Défauts sauf migration contrôlée.              |

### 4.2 Service IA (`@bellum/ia`)

| Variable                                                                                                                                                                                 | Usage                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `ANTHROPIC_API_KEY`                                                                                                                                                                      | Génération et raisonnement Claude.                     |
| `BRAVE_API_KEY`                                                                                                                                                                          | Recherche web Brave.                                   |
| `FIRECRAWL_API_KEY`                                                                                                                                                                      | Crawl et extraction web.                               |
| `APOLLO_API_KEY`                                                                                                                                                                         | Enrichissement contacts.                               |
| `PAPPERS_API_KEY`                                                                                                                                                                        | Données entreprises françaises.                        |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`                                                                                                                                              | RAG, persistance et lecture de contexte.               |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `SENTRY_TRACES_SAMPLE_RATE`                                                                                                        | Observabilité IA.                                      |
| `CORS_ORIGINS`                                                                                                                                                                           | Origines autorisées.                                   |
| `LOG_LEVEL`                                                                                                                                                                              | Niveau de logs.                                        |
| `IA_AGENT_ENVELOPE_V1`                                                                                                                                                                   | Flag de migration de format de réponse.                |
| `CLAUDE_RPM`, `CLAUDE_CONCURRENCY`, `BRAVE_RPM`, `BRAVE_CONCURRENCY`, `APOLLO_RPM`, `APOLLO_CONCURRENCY`, `PAPPERS_RPM`, `PAPPERS_CONCURRENCY`, `FIRECRAWL_RPM`, `FIRECRAWL_CONCURRENCY` | Limites par fournisseur.                               |
| `APOLLO_ENRICH_LIMIT`                                                                                                                                                                    | Plafond de contacts enrichis pour contrôler les coûts. |

### 4.3 Web app Vite (`@bellum/web`)

| Variable                      | Usage                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `VITE_API_URL`                | URL API appelée par le navigateur et Socket.IO.                                       |
| `VITE_MARKETING_URL`          | URL site marketing pour les retours/CTA.                                              |
| `VITE_SENTRY_DSN`, `VITE_ENV` | Observabilité front.                                                                  |
| `VITE_CODE_VERSION_ID`        | Version de build pour le toast de mise à jour. Optionnel, calculé au build si absent. |

Feature gating web : les fonctionnalités non livrées sont gérées statiquement dans le code :

- `/discover`, `/knowledge` et `/chat` restent visibles côté navigation mais doivent être rendues désactivées.
- `/integrations` est accessible uniquement en mode démo.
- Les exports PDF de compte sont accessibles sans feature flag.

### 4.4 Website Next.js (`@bellum/website`)

| Variable                            | Usage                                           |
| ----------------------------------- | ----------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`               | Destination des CTA vers l'application produit. |
| `NEXT_PUBLIC_SITE_URL`              | URL canonique du site.                          |
| `RESEND_API_KEY`, `DEMO_FROM_EMAIL` | Envoi des demandes de démo.                     |

### 4.5 Dashboard manager (`@bellum/dashboard-manager`)

| Variable                                             | Usage                                       |
| ---------------------------------------------------- | ------------------------------------------- |
| `API_BASE_URL`                                       | URL de l'API produit.                       |
| `IA_BASE_URL`                                        | URL du service IA.                          |
| `INTERNAL_API_SECRET`                                | Secret interne pour les endpoints protégés. |
| `DEMO_BASE_URL`, `DEMO_INTERNAL_SECRET`, `DEMO_PORT` | Mode démo local.                            |

## 5. Accès et comptes critiques

| Accès                               | Pourquoi                                                  | Niveau requis                                      | Où stocker/rotater                                 |
| ----------------------------------- | --------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| GitHub `Bellum-AI/belllum-monorepo` | Code, PR, CI, issues synchronisées.                       | Write pour livrer, Admin pour secrets/protections. | GitHub org + gestionnaire de mots de passe.        |
| Vercel                              | Déploiement `@bellum/web` et `@bellum/website`, domaines. | Project Admin.                                     | Vercel team.                                       |
| Railway                             | Déploiement API, IA, Redis et variables runtime.          | Project Admin.                                     | Railway project variables.                         |
| Supabase                            | DB, Auth, service role, JWT secret, Studio prod.          | Owner/Admin.                                       | Supabase project settings.                         |
| Stripe                              | Produits, prix, webhooks, clés test/live.                 | Developer/Admin.                                   | Stripe Developers + gestionnaire de mots de passe. |
| Anthropic                           | Clé Claude.                                               | Admin/API keys.                                    | Console Anthropic.                                 |
| Brave Search                        | Recherche web.                                            | Admin/API keys.                                    | Console Brave.                                     |
| Firecrawl                           | Crawl web.                                                | Admin/API keys.                                    | Console Firecrawl.                                 |
| Apollo                              | Enrichissement contacts, crédits.                         | Admin/API keys/billing.                            | Console Apollo.                                    |
| Pappers                             | Données entreprises.                                      | Admin/API keys.                                    | Console Pappers.                                   |
| Resend                              | Emails transactionnels et domaine d'envoi.                | Admin.                                             | Console Resend.                                    |
| Sentry                              | Non configuré aujourd'hui.                                | Aucun compte disponible.                           | À créer si l'observabilité Sentry est activée.     |
| DNS registrar                       | Domaines `bellum.ai`, `app.bellum.ai`.                    | Admin DNS.                                         | Registrar/Cloudflare selon propriété.              |
| Linear                              | Roadmap, bugs, lien GitHub issues.                        | Member/Admin.                                      | Linear workspace.                                  |

## 6. Déploiement

### 6.1 Contrôles avant livraison

Depuis la racine du repo :

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm lint:exports:types
pnpm format:check
pnpm check-types
pnpm build
pnpm turbo test --filter=@bellum/api
cd apps/ia && pytest -q
```

La CI GitHub exécute ces familles de contrôles sur pull request vers `development`, `staging` et `main`.

Les apps `@bellum/web`, `@bellum/website` et `@bellum/dashboard-manager` sont publiées sur Vercel — **trois projets distincts**. Les previews de PR sont déclenchées automatiquement par Vercel, et les déploiements production le sont aussi au merge sur la branche configurée. Pour consulter les déploiements, relancer un build ou modifier les variables, il faut être membre de l'organisation Vercel BellumAI.

**Chaque projet ne se construit que s'il est concerné.** Les trois `vercel.json` portent un `ignoreCommand` — `npx turbo-ignore <paquet>` — qui interroge le graphe de dépendances Turborepo : une modification de `apps/web` ne reconstruit plus le site vitrine, une modification de `packages/contracts` reconstruit tout ce qui en dépend. Sans cette borne, une seule poussée déclenchait **six builds du monorepo entier** (trois previews + trois productions) ; mesuré sur 30 jours, 3 821 builds Vercel pour environ 500 commits.

Le sens des codes de sortie est contre-intuitif et se vérifie plutôt qu'il ne se devine : **`0` = on IGNORE le build, `1` = on construit**. `turbo-ignore` sort `1` quand il n'arrive pas à conclure (référence git introuvable, historique tronqué) — l'échec construit donc, il ne laisse jamais une production périmée.

### 6.1.b Déploiements Railway : ce qui déclenche quoi

**Toute la configuration Railway vit dans un SEUL fichier : [`.railway/railway.ts`](../.railway/railway.ts).**
Il décrit le projet ENTIER — les quatre services, Redis et son volume.

⚠️ **« omit means delete »** : une ressource absente de `resources` est SUPPRIMÉE par
`railway config apply`. On n'y retire jamais un bloc pour « ne pas y toucher ».

⚠️ **Aucune valeur de variable n'est ici.** `preserve()` veut dire « garde ce qui est
posé côté Railway ». Le fichier est lisible par tous ceux qui lisent le dépôt.

| Service                   | Se redéploie si                                                        | Réplicas |
| ------------------------- | ---------------------------------------------------------------------- | -------- |
| `belllum-backend-service` | `/apps/api/**`, `/packages/**`, lockfile, `turbo.json`, `package.json` | 2        |
| `bellum-ia-service`       | `/apps/ia/**`, `/packages/contracts/**`                                | 2        |
| `belllum-monorepo` (MCP)  | `/apps/mcp/**`, `/packages/**`, lockfile, `turbo.json`, `package.json` | 2        |

#### Le cycle

```sh
pnpm install                  # le SDK `railway` est une devDependency de la racine
railway config plan           # lecture seule — montre le diff, n'écrit rien
railway config apply          # demande confirmation, puis écrit
```

⚠️ **Un défaut de Railway ne s'encode pas.** `restartPolicyType: ON_FAILURE` et
`restartPolicyMaxRetries: 10` SONT les valeurs par défaut : elles ne sont pas
stockées, donc elles se relisent `null`, donc le plan les redemande à chaque passage.
Mesuré le 04/09/2026 — `apply` a coché ✓ sur ses huit changements et le plan suivant
en réclamait encore quatre. Ce n'était pas un échec, c'était un diff qui ne pouvait
pas se fermer. La seule preuve qu'un `apply` a PRIS est le plan d'après :

```sh
railway config plan   # « ✓ Your Railway configuration is already up to date. »
```

`railway config pull` réimporte l'état réel dans le fichier. ⚠️ Il ne lit que les
réglages d'**interface** : ni `watchPatterns`, ni `healthcheckPath`, ni les commandes
de build/start des services qui les tenaient d'un `railway.json`. Un `pull` brut suivi
d'un `apply` les EFFACERAIT. Toujours relire le plan.

⚠️ Le générateur nomme le `const` du dépôt d'après son nom (`belllumMonorepo`), ce qui
collide avec le SERVICE homonyme : le fichier produit ne s'évalue pas
(`Identifier 'belllumMonorepo' has already been declared`). Renommer.

#### Pourquoi Config-as-code a disparu

Les `railway.json` sont **dépréciés** — `serviceInstanceUpdate(railwayConfigFile:)`
est refusée par l'API, et Railway cesse de lire ces fichiers le **2026-12-01**. Ils
restaient par ailleurs inertes tant que Settings › Config-as-code ne portait pas leur
chemin, échec **silencieux** qui a laissé `ci-runner` à 42 réplicas alors que son
fichier disait 8 — le 03/09/2026, ces 42 réplicas tournaient à 0 % de CPU et pesaient
92,7 % de la facture Railway du projet. Un fichier de configuration que personne ne
lit est du code juste que personne n'appelle. La CI ne tourne plus sur Railway depuis le 05/10/2026 : runners sur VPS Hetzner,
voir [`infra/ci-runner-vps/runbook.md`](../infra/ci-runner-vps/runbook.md).

La migration a soldé au passage deux réglages qui vivaient à deux endroits avec deux
valeurs : `numReplicas` (interface 6, fichier 2 — c'est 2 qui gagnait) et le
`preDeployCommand` de l'API (interface `migration:run`, fichier `migration:run:prod`).

### 6.2 Déploiement API sur Railway

Configuration attendue du service Railway API :

- Configuration : le service `belllum-backend-service` de [`.railway/railway.ts`](../.railway/railway.ts).
- Build : `pnpm turbo build --filter=@bellum/api`.
- Start : `pnpm --filter @bellum/api start`.
- Healthcheck : `/health`.
- Variables : toutes les variables de la section API, avec `NODE_ENV=production`.

Procédure :

1. Merger la PR validée dans la branche suivie par Railway.
2. Vérifier que le build Railway termine avec succès.
3. Ouvrir `/health` sur l'URL API.
4. Vérifier les logs de démarrage : configuration valide, connexion DB, connexion Redis, absence d'erreurs Stripe/Supabase. Les erreurs applicatives partent dans Sentry (un projet par service) via `logger.error` — ne jamais appeler `Sentry.captureException` directement.
5. Si une migration est incluse, vérifier l'état avec `pnpm db:migration:show` dans un shell Railway ou équivalent avant/après déploiement.

### 6.3 Déploiement IA sur Railway

Configuration attendue du service Railway IA :

- Configuration : le service `bellum-ia-service` de [`.railway/railway.ts`](../.railway/railway.ts) (`rootDirectory: /apps/ia`).
- Build : `pip install -r requirements.txt`.
- Start : `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
- Healthcheck : `/health`.

Procédure :

1. Merger la PR validée dans la branche suivie par Railway.
2. Vérifier que toutes les clés fournisseurs sont présentes.
3. Vérifier `/health`.
4. Lancer une analyse de test depuis l'app ou le dashboard manager.
5. Contrôler les logs pour les limites fournisseurs (`429`), erreurs Claude et erreurs de callback API.

### 6.4 Déploiement app produit sur Vercel

Configuration attendue :

- Root directory : `apps/web`.
- Framework : Vite.
- Build command : `cd ../.. && pnpm turbo build --filter=@bellum/web`.
- Output directory : `dist`.
- Domaine : `app.bellum.ai`.

Procédure :

1. Créer/mettre à jour les variables `VITE_*` dans Vercel.
2. Ouvrir la preview Vercel automatique sur la PR.
3. Déployer en production via merge sur la branche configurée ou via redeploy Vercel.
4. Vérifier que `/latest-version.json` est servi pour le mécanisme de toast de mise à jour.
5. Tester login, chargement dashboard, démarrage d'une analyse et Socket.IO.

Accès requis : être membre de l'organisation Vercel BellumAI pour voir les previews, relancer un déploiement ou intervenir sur la configuration.

### 6.5 Déploiement site marketing sur Vercel

Configuration attendue :

- Root directory : `apps/website`.
- Framework : Next.js.
- Build command : `pnpm turbo build --filter=@bellum/website`.
- Install command : `pnpm install --frozen-lockfile`.
- Domaine : `bellum.ai`.

Procédure :

1. Vérifier `NEXT_PUBLIC_APP_URL=https://app.bellum.ai`.
2. Ouvrir la preview Vercel automatique sur la PR si le changement touche le site.
3. Déployer en production via merge sur la branche configurée ou via redeploy Vercel.
4. Tester la landing, les pages légales, les CTA et le formulaire de demande de démo si `RESEND_API_KEY` est configuré.

Accès requis : être membre de l'organisation Vercel BellumAI pour voir les previews, relancer un déploiement ou intervenir sur la configuration.

### 6.6 bis Geler une version pour une démonstration

Avant une démonstration ou un webinaire, on veut deux choses : savoir **ce qui
tourne exactement**, et pouvoir y **revenir** si un correctif de dernière minute
casse quelque chose.

**1. Ce qui tourne, sans le déduire.** L'API le dit elle-même :

```bash
curl -s https://api.bellum-ai.com/version
# {"commit":"b6756237…","environment":"production","ia":{"commit":"…"}}
```

Le champ `commit` est le SHA réellement déployé (API et service IA séparément).
Ne pas le lire depuis la liste des déploiements Railway : elle affiche le
dernier déploiement _tenté_, pas celui qui sert le trafic.

**2. Geler.** Poser un tag annoté sur ce SHA, une fois le dernier correctif
mergé :

```bash
SHA=$(curl -s https://api.bellum-ai.com/version | python3 -c 'import json,sys;print(json.load(sys.stdin)["commit"])')
git tag -a demo-2026-08-18 "$SHA" -m "Version présentée au webinaire du 18/08"
git push origin demo-2026-08-18
```

Le tag ne bloque aucun merge — il nomme un point de retour. C'est sa seule
fonction, et c'est ce qui manque quand il faut revenir en arrière sous pression.

**3. Revenir.** Dans l'ordre, code d'abord, schéma ensuite (§6.6) :

1. Railway › `belllum-backend-service` › Deployments → « Redeploy » sur le
   déploiement portant le SHA du tag.
2. Vercel › `bellum-web` → « Promote to Production » sur le déploiement
   correspondant.
3. Ne toucher aux migrations **que si** le retour arrière du code ne suffit pas.
   Une migration additive (`ADD COLUMN … DEFAULT`) ne gêne pas l'ancien code :
   la colonne est simplement ignorée.

**Piège vérifié le 16/08 : le cache du navigateur peut faire croire à un échec.**
La SPA persiste ses réponses dans IndexedDB (`bellum-web-cache`). Après un
correctif — ou après une réparation côté fournisseur — un écran peut continuer à
montrer l'ancien état, y compris après un rechargement complet. Pour vérifier
pour de vrai, dans la console du navigateur :

```js
await indexedDB.deleteDatabase('bellum-web-cache')
location.reload()
```

### 6.6 Environnements et retour arrière

**Environnements.** Il n'existe aujourd'hui **qu'un seul environnement déployé** :
la production. La CI tourne sur les branches `development`, `staging` et `main`,
et Vercel construit une preview par pull request — c'est la seule pré-production
réelle, et elle ne couvre QUE le front : la preview tape l'API de production.
Aucun second service Railway (API, IA, Redis) ni second projet Supabase n'est
décrit dans le dépôt. Conséquence à connaître avant de toucher aux migrations :
**une migration ne se répète jamais ailleurs avant la production.**

Monter une pré-production complète demande, dans cet ordre : un projet Supabase
distinct, deux services Railway (API + IA) pointant sur `staging`, un Redis
dédié, puis les mêmes variables avec des clés fournisseurs de test. Tant que ce
n'est pas fait, la mitigation est celle du paragraphe suivant.

**Ce qui se déploie, et comment ça revient en arrière.**

| Service              | Déclencheur                 | Retour arrière                                                                                                                                                             |
| -------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API (Railway)        | merge sur la branche suivie | Redéployer le déploiement précédent depuis l'onglet Deployments de Railway (« Redeploy » sur la version antérieure). Le code revient ; **la base, non** — voir ci-dessous. |
| IA (Railway)         | merge sur la branche suivie | Idem. Sans état persistant propre, un retour arrière IA est sûr.                                                                                                           |
| App produit (Vercel) | merge, ou redeploy manuel   | « Promote to Production » sur le déploiement précédent. Instantané, sans état.                                                                                             |
| Site (Vercel)        | merge                       | Idem.                                                                                                                                                                      |

**Retour arrière d'une migration.** Les migrations tournent en
`preDeployCommand` Railway (`pnpm --filter @bellum/api migration:run:prod`) et
JAMAIS au démarrage de l'application (`migrationsRun: false` dans
`database.module.ts`, verrouillé par `migration-deploy.spec.ts`). C'est
délibéré : une migration lancée au boot laisserait du trafic frapper une colonne
absente. Conséquence pratique : **le code redéployé est l'ancien, mais le schéma
reste le nouveau.**

Les 160 migrations du dépôt ont toutes un `down()`. Pour annuler la dernière :

```bash
pnpm --filter @bellum/api migration:show:prod   # confirmer laquelle est en tête
pnpm --filter @bellum/api exec typeorm migration:revert -d dist/database/data-source.js
```

`migration:revert` annule **une seule** migration par appel — en enchaîner
plusieurs se fait un appel à la fois, en revérifiant `migration:show` entre
chaque. Trois règles apprises à l'usage :

1. **Un `down()` qui supprime une colonne détruit ses données.** Avant de
   révoquer une migration qui a ajouté une colonne désormais remplie, exporter
   la colonne (`\copy` ou une requête SQL enregistrée). Le `down()` ne sauvegarde rien.
2. **Élargir une contrainte `CHECK` est presque toujours plus sûr que revenir en
   arrière.** Le fond du problème est en général qu'une valeur écrite par le code
   n'est pas admise par la base ; élargir la contrainte règle l'incident sans
   toucher aux données. C'est la leçon de `account_vocabulary.kind`, qui marquait
   des dossiers complets « en erreur ».
3. **Le retour arrière du code passe AVANT celui du schéma.** Redéployer l'ancien
   code arrête l'hémorragie en une minute ; la question du schéma se traite
   ensuite, à froid.

## 7. Procédures d'exploitation

### 7.1 Vérifier Redis Railway

Redis doit refuser les écritures en saturation plutôt que supprimer des clés BullMQ :

```bash
redis-cli -u "$REDIS_URL" CONFIG GET maxmemory-policy
```

La valeur attendue est `noeviction`. Si ce n'est pas le cas, ajouter `REDIS_MAXMEMORY_POLICY=noeviction` sur Railway, redéployer Redis puis re-tester.

### 7.2 Investiguer une analyse bloquée

1. Vérifier les logs API Railway autour du `jobId`.
2. Vérifier les logs IA Railway avec le même `correlationId` si disponible.
3. Inspecter Redis/BullMQ : files `analysis` et `analysis-dlq`.
4. Vérifier les statuts fournisseurs : Anthropic, Apollo, Brave, Firecrawl, Pappers.
5. Si l'échec est terminal, relever le payload DLQ, la raison d'échec et les tentatives avant tout replay manuel.

### 7.3 Emails

- Local : Mailpit UI `http://localhost:8025`.
- Production : `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` et `RESEND_FROM` configurés.
- En cas d'incident : vérifier logs API, statut Resend, domaine d'envoi et bounce/spam events.

### 7.4 Stripe

- Utiliser les clés test en local et staging.
- Utiliser les clés live uniquement en production.
- `STRIPE_WEBHOOK_SECRET` doit correspondre au webhook de l'environnement ciblé.
- Après modification de prix/produits, tester un parcours complet de paiement et consulter les events Stripe.

### 7.5 Rotation d'un secret

1. Créer la nouvelle clé dans le fournisseur.
2. Ajouter la nouvelle valeur dans Railway/Vercel/Supabase selon l'app concernée.
3. Redéployer le service consommateur.
4. Vérifier `/health` et un parcours fonctionnel.
5. Révoquer l'ancienne clé.
6. Documenter la date de rotation dans l'outil interne de suivi des secrets.

### 7.6 Sauvegardes, restauration et supervision

**Ce qui est sauvegardé automatiquement.** La base vit sur Supabase (plan Pro) :
Supabase prend une **sauvegarde quotidienne, conservée 7 jours** sur ce plan.
Elles se restaurent depuis le tableau de bord Supabase, section _Database →
Backups_. Deux propriétés à connaître AVANT d'en avoir besoin :

- une restauration rend le projet **inaccessible** pendant l'opération, d'autant
  plus longtemps que la base est grosse ;
- la granularité est le **jour**. Entre deux sauvegardes, ce qui a été écrit est
  perdu. La récupération à la seconde près (_Point-in-Time Recovery_) est une
  option payante du plan Pro, avec 7, 14 ou 28 jours de rétention. Elle n'est
  **pas souscrite aujourd'hui** — à décider : c'est le seul moyen d'annuler une
  suppression accidentelle de quelques heures.

**Ce qui n'est PAS sauvegardé, et ce que ça implique.**

| Donnée                                              | Sauvegarde                    | Si on la perd                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Postgres (comptes, contacts, analyses, facturation) | Supabase, quotidienne, 7 j    | Retour à la veille.                                                                                                                                                                                                                                                                            |
| Redis / files BullMQ                                | **aucune**                    | Les analyses en vol sont perdues et doivent être relancées. Aucune donnée facturée ne disparaît : un run non terminé n'a pas consommé son slot.                                                                                                                                                |
| Jetons OAuth tiers (CRM, agenda, messagerie)        | dans Postgres, chiffrés       | Restaurés avec la base — **mais** la clé de chiffrement (`CRM_TOKEN_ENC_KEY`, à défaut `INTERNAL_API_SECRET`) est dans les variables Railway. Restaurer la base sans cette clé rend tous les jetons illisibles et oblige chaque utilisateur à se reconnecter. **La clé se sauvegarde à part.** |
| Variables d'environnement Railway / Vercel          | **aucune** hors export manuel | Reconstitution à la main. Un export chiffré hors ligne des trois services vaut le quart d'heure qu'il coûte.                                                                                                                                                                                   |
| Fichiers déposés (RAG, enregistrements)             | selon leur stockage           | À vérifier avant de compter dessus.                                                                                                                                                                                                                                                            |

**Vérification annuelle minimale.** Une sauvegarde qu'on n'a jamais restaurée
n'est pas une sauvegarde. Le contrôle tient en trois gestes : restaurer la
dernière sauvegarde dans un projet Supabase neuf, y pointer une API locale, et
ouvrir un dossier de compte. Ce qui échoue en pratique n'est presque jamais le
dump — c'est une clé absente, et on ne le découvre qu'en essayant.

**Supervision.** Sentry reçoit les erreurs _applicatives_ — mais un service qui
ne démarre plus n'en émet aucune. C'est exactement l'incident du 31/07/2026,
resté invisible pendant des heures. D'où une sonde EXTERNE : une sonde hébergée
à côté de ce qu'elle observe meurt avec lui.

`scripts/probe-health.mjs`, exécuté par `.github/workflows/uptime.yml` toutes les
dix minutes. GitHub Actions ne dépend ni de Railway, ni de Vercel, ni de Supabase,
ce qui est toute la propriété recherchée. Une panne ouvre UNE issue étiquetée
`uptime` et la commente tant qu'elle dure ; le retour à la normale la clôt — sans
quoi personne ne sait si l'incident d'hier soir est encore réel.

Ce qui est sondé, quand les variables sont posées (Settings → Secrets and
variables → Actions → **Variables**) :

| Variable         | Cible                    | Attendu                                  |
| ---------------- | ------------------------ | ---------------------------------------- |
| `PROBE_API_URL`  | `/health/ready`          | 200 — l'API répond ET Redis/worker aussi |
| `PROBE_IA_URL`   | `/health`                | 200                                      |
| `PROBE_WEB_URL`  | `/`                      | 200                                      |
| `PROBE_DEMO_URL` | la page de démonstration | 200                                      |

Aucune variable posée = le job sort vert en annonçant qu'il n'a rien à sonder :
un échec ici entraînerait à ignorer l'alerte. La sonde retente une fois avant de
conclure — un réseau qui bafouille ne doit réveiller personne, une vraie panne
rate les deux essais. Il n'y a pas de sonde `GET` côté API pour la démonstration :
ouvrir une salle est un `POST /demo/session`, qui en consommerait une du pool à
chaque appel. Sonder la page suffit, elle échoue précisément quand l'API est morte.

⚠️ **Ce que cette sonde n'est pas.** Le `schedule` de GitHub peut être retardé de
plusieurs minutes en période de charge, et il est suspendu sur un dépôt sans
activité depuis 60 jours. C'est un filet, pas un engagement de service : dès que
la disponibilité devient contractuelle, un service dédié (BetterStack,
UptimeRobot) prend le relais sur les mêmes URL.

## 8. Blocages connus, limites techniques et dettes prioritaires

> **Relu le 10/08/2026.** Ce chapitre décrivait un produit d'il y a un an : il
> annonçait Sentry non configuré, les espaces de travail « démo UX sans backend »,
> les notifications et les intégrations « à concevoir », `/integrations` réservé
> au mode démo. Tout cela est livré et tourne. Un registre de blocages périmé est
> pire que pas de registre : la personne qui le lit en incident cherche au mauvais
> endroit. Les lignes ci-dessous sont celles qui restent VRAIES.

### 8.1 Blocages connus

| Sujet                                                 | Impact                                                                                                                                                                                                            | Ce qui le lève                                                                                                       |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Sonde de disponibilité non ARMÉE                      | La sonde externe existe (`.github/workflows/uptime.yml`) mais reste muette tant que les variables `PROBE_*` ne sont pas posées sur le dépôt. Sans elles, une panne comme celle du 31/07/2026 redevient invisible. | Poser les quatre variables (voir §7.6).                                                                              |
| Prix Stripe en mode test                              | Le code du paiement est prêt ; sans prix live, le premier vrai client échoue au checkout.                                                                                                                         | Créer les prix live et basculer les clés.                                                                            |
| `FIRECRAWL_MAX_PAGES` — vérifier l'absence d'override | Le code fixe 12 pages par run. Une variable Railway résiduelle à `3` a bridé la collecte pendant des semaines, sans qu'aucun log ne le dise : la page équipe/gouvernance n'était jamais lue.                      | Supprimer la variable côté Railway. Un avertissement est désormais loggé au démarrage quand elle est sous le défaut. |
| Aucun environnement de pré-production déployé         | Une migration ou un changement d'API ne se vérifie qu'en local, puis directement en production.                                                                                                                   | Voir §6.6.                                                                                                           |
| Cartes de sources maps front absentes                 | Les erreurs JavaScript remontent minifiées dans Sentry : un bug client est plus long à localiser.                                                                                                                 | Uploader les sources maps au build Vercel.                                                                           |
| Connecteur ATS non validé sur instance réelle         | L'authentification et les chemins de lecture sont vérifiés ; le nom du paramètre de recherche des listes n'est pas public. Un paramètre ignoré DÉGRADE la couverture — il ne crée jamais de faux rattachement.    | Un test sur une instance cliente, puis figer `BOONDMANAGER_SEARCH_PARAM`.                                            |
| Écriture ERP : verbe et corps non publics             | Les chemins sont ceux vérifiés en LECTURE. La demande, l'approbation et la trace sont livrées ; ce qui part réellement sur le réseau reste à confirmer.                                                           | Une écriture de test sur une instance réelle avant d'ouvrir à un client.                                             |

### 8.2 Limites techniques

- **Redis/BullMQ** : la politique `noeviction` est obligatoire en production. Une mauvaise configuration Redis bloque ou perd des jobs.
- **Service IA** : dépendant de fournisseurs externes (Anthropic, Brave, Firecrawl, Apollo, Pappers, Serper/Tavily). Les `429`, quotas et indisponibilités sont des causes probables d'incident avant tout bug applicatif.
- **Compteurs de coût LLM en mémoire** : `GET /metrics/cost` compte depuis le démarrage du process, sans agrégation entre replicas. C'est un ordre de grandeur en direct, pas une comptabilité. La comptabilité durable vit dans `provider_costs`.
- **Coûts fournisseurs non tarifés** : sans `PROVIDER_UNIT_COST_<NOM>`, une ligne porte `null` — ce qui n'est PAS zéro. Les totaux excluent ces lignes plutôt que de les absorber.
- **E2E** : aucun pipeline complet avec Postgres/Redis/Supabase/Auth n'est branché au gate.
- **Dashboard manager** : outil interne, à ne pas exposer sans contrôle d'accès dédié.
- **Supabase local** : les JWT de démonstration restent locaux. Ne jamais réutiliser les valeurs de développement ailleurs.
- **Devises** : la facturation est multi-devises (EUR, USD, GBP, CHF, CAD) ; la conversion n'est PAS calculée par Bellum — chaque devise a son prix, et un pays sans prix déclaré retombe sur l'euro.

### 8.3 Dettes techniques prioritaires

1. Poser les variables `PROBE_*` pour armer la sonde de disponibilité (§7.6) — c'est le seul blocage de cette liste qui rend un incident invisible.
2. Créer les prix Stripe live et vérifier un checkout de bout en bout.
3. Renseigner `PROVIDER_UNIT_COST_*` pour que l'écran des coûts fournisseurs cesse d'afficher des totaux partiels.
4. Uploader les sources maps front au build Vercel.
5. Ajouter les tests frontend critiques au gate CI, en commençant par les routes produit non instables.
6. Monter un job E2E (Postgres/Redis/Supabase local) avant de bloquer les branches dessus.
7. Documenter les procédures de replay BullMQ/DLQ avec leurs critères de sécurité.
8. Valider connecteur ATS et écriture ERP sur une instance cliente réelle.

### 8.4 État du produit, écran par écran

Cette section contenait un inventaire de 85 lignes des écrans front et de leur
état (« mocké », « à concevoir », routes `/demo/workspace`…). Il décrivait le
produit d'il y a un an et **aucune de ses lignes n'était encore vraie** : les
espaces de travail, les notifications, les intégrations, le copilote et
`/discover` sont livrés depuis.

Il n'est pas remplacé par un autre inventaire ici. Deux listes du même sujet dans
deux fichiers divergent toujours, et c'est la périmée qu'on lit au mauvais
moment. L'état du produit — livré / en cours / fragile / hors scope — a **un seul
propriétaire** :

**`agent_docs/etat-produit-aout-2026.md`**

Le runbook garde ce qui lui appartient en propre : comment lancer, déployer,
revenir en arrière, restaurer et surveiller.

## 9. Reprise par une nouvelle personne

Checklist de reprise :

1. Obtenir les accès GitHub, Vercel, Railway, Supabase, Stripe, Resend, Sentry (3 projets : API, IA, web), Linear et fournisseurs IA/data. Vérifier au passage qu'aucun de ces accès ne dépend d'un seul compte personnel.
2. Cloner le repo puis exécuter `pnpm setup`.
3. Remplir `tools/dev.secret.sh` et les `.env` locaux depuis le gestionnaire de secrets.
4. Lancer `pnpm dev full` et vérifier les URLs locales.
5. Lire `docs/local-development.md`, `docs/infra.md`, `docs/ci.md`, `docs/auth-flow.md`, `docs/payment-architecture.md`, `docs/database-schema.md` et `apps/website/README.md` pour les détails spécialisés.
6. Lancer les contrôles de la section 6.1 avant toute PR.
7. Pour un incident production : `/health/ready`, puis Sentry (erreurs applicatives), puis les logs Railway/Vercel, puis Redis/BullMQ, puis l'état des fournisseurs externes. Un service qui ne DÉMARRE pas n'émet aucune erreur Sentry — si tout est silencieux, suspecter le déploiement lui-même (voir §8.1).

## 10. Sources repo utiles

- Scripts racine et exigences Node/pnpm : `package.json`.
- Docker local complet : `tools/docker-compose.yml`.
- Développement local détaillé : `docs/local-development.md`.
- Authentification : `docs/auth-flow.md`.
- Paiement et crédits : `docs/payment-architecture.md`.
- Schéma DB et migrations : `docs/database-schema.md`.
- Redis et BullMQ production : `docs/infra.md`.
- État du produit (livré / en cours / fragile / hors scope) : `agent_docs/etat-produit-aout-2026.md`.
- Pipeline CI : `docs/ci.md` et `.github/workflows/ci.yml`.
- Sonde de disponibilité : `scripts/probe-health.mjs` et `.github/workflows/uptime.yml`.
- Variables validées par l'API : `packages/contracts/src/schemas/env.ts`.
- Déploiement Railway (les 4 services, Redis et son volume) : `.railway/railway.ts`.
- Déploiement Vercel app produit : `apps/web/vercel.json`.
- Déploiement website : `apps/website/README.md`.
