// ─────────────────────────────────────────────────────────────────────────────
// Infrastructure as Code — la SEULE description du projet Railway.
//
// POURQUOI CE FICHIER EXISTE
// ──────────────────────────
// Railway a déprécié Config-as-code (`railway.json` / `railway.toml`) : la
// mutation `serviceInstanceUpdate(railwayConfigFile:)` est désormais REFUSÉE, et
// les anciens fichiers cessent d'être lus le **2026-12-01**. Ce fichier les
// remplace, tous les quatre à la fois.
//
// ⚠️ « OMIT MEANS DELETE » — un service, un volume ou une base absent de
// `resources` est SUPPRIMÉ par `railway config apply`. Ce fichier décrit donc le
// projet ENTIER, Redis et son volume compris, pas seulement ce qu'on modifie.
//
// ⚠️ Ce que ce fichier NE contient pas : les VALEURS des variables. `preserve()`
// dit « garde ce qui est déjà posé côté Railway ». Aucun secret ne vit ici.
//
// CE QUE LA MIGRATION CORRIGE AU PASSAGE
// ──────────────────────────────────────
// `railway config pull` ne lit que les réglages d'INTERFACE. Tout ce que les
// `railway.json` appliquaient au déploiement en était absent — et cet écart est
// exactement la dette qu'on solde ici :
//
//   · `replicas` : l'interface portait 6 sur les trois services produit, les
//     fichiers 2. C'est 2 qui gagnait au déploiement, donc 2 est le vrai. Un
//     réglage vit à UN seul endroit — celui-ci vivait à deux, avec deux valeurs.
//   · `watchPatterns` : ABSENT côté interface. Sans eux, chaque poussée
//     redéployait les quatre services. Pour `ci-runner`, un redéploiement TUE
//     les jobs en cours (le runner n'est pas éphémère).
//   · `healthcheckPath`, `restartPolicy*`, `builder` : absents aussi.
//   · `preDeployCommand` de l'API : l'interface portait `migration:run`, le
//     fichier `migration:run:prod`. Ce n'est pas la même commande.
// ─────────────────────────────────────────────────────────────────────────────

import { defineRailway, github, preserve, project, redis, service, volume } from 'railway/iac'

const REGION = 'europe-west4-drams3a'
const REPO = 'Bellum-AI/belllum-monorepo'

// Un changement dans `packages/**` ou dans le manifeste pnpm reconstruit tout
// service Node du monorepo : ils compilent depuis la racine, pas depuis leur
// dossier. `apps/ia` y échappe — il est Python et ne lit que `packages/contracts`.
const MONOREPO_ROOTS = ['/packages/**', '/pnpm-lock.yaml', '/pnpm-workspace.yaml', '/package.json', '/turbo.json']

export default defineRailway(() => {
  // ⚠️ Ce `const` s'appelait `belllumMonorepo` dans la sortie de
  // `railway config pull`, comme le SERVICE homonyme trente lignes plus bas :
  // le fichier généré ne s'évaluait pas (`Identifier already declared`).
  // « Déployer après vert » (31/10/2026, Louis) : Railway attend les check suites du commit avant de
  // déployer. Appliquer : `railway config plan` puis `railway config apply` APRÈS fusion de la PR de la
  // file de fusion. Prérequis, jobs rouges par défaut et interblocages : docs/ci.md « La file de fusion ».
  const repo = github(REPO, { checkSuites: true })

  // ───────────────────────────────────────────────────────────────────────────
  // Redis — file BullMQ. Le `startCommand` retire `lost+found` avant de démarrer :
  // Railway crée ce dossier à la racine du volume et Redis refuse de s'y poser.
  // ───────────────────────────────────────────────────────────────────────────
  const Redis = redis('Redis', { region: REGION })
  Redis.deploy = {
    startCommand:
      '/bin/sh -c "rm -rf $RAILWAY_VOLUME_MOUNT_PATH/lost+found/ && exec docker-entrypoint.sh redis-server --requirepass $REDIS_PASSWORD --save 60 1 --dir $RAILWAY_VOLUME_MOUNT_PATH"',
  }

  const redisVolume = volume('redis-volume', {
    alerts: { usage: { '80': {}, '95': {}, '100': {} } },
    allowOnlineResize: true,
    region: REGION,
    sizeMB: 500,
  })

  // ───────────────────────────────────────────────────────────────────────────
  // Service IA — FastAPI. Seul service à builder depuis son propre dossier.
  // ───────────────────────────────────────────────────────────────────────────
  const bellumIaService = service('bellum-ia-service', {
    source: github(REPO, { checkSuites: true, rootDirectory: '/apps/ia' }),
    build: {
      builder: 'RAILPACK',
      // #4711.2 — la date de construction, posée au build puis relue par `/version` (`built_at`).
      buildCommand: 'date -u +%Y-%m-%dT%H:%M:%SZ > build-time.txt && pip install -r requirements.txt',
      watchPatterns: ['/apps/ia/**', '/packages/contracts/**'],
    },
    start: 'uvicorn app.main:app --host 0.0.0.0 --port $PORT',
    healthcheck: '/health',
    replicas: { [REGION]: 2 },
    deploy: { restartPolicyMaxRetries: 3 },
    networking: { privateNetworkEndpoint: 'rare-analysis' },
    env: {
      ANTHROPIC_API_KEY: preserve(),
      API_INTERNAL_URL: preserve(),
      APOLLO_API_KEY: preserve(),
      APOLLO_CONCURRENCY: preserve(),
      APOLLO_ENRICH_LIMIT: preserve(),
      APOLLO_RPM: preserve(),
      BRAVE_API_KEY: preserve(),
      BRAVE_CONCURRENCY: preserve(),
      BRAVE_RPM: preserve(),
      CLAUDE_CONCURRENCY: preserve(),
      CLAUDE_RPM: preserve(),
      EMBEDDING_API_KEY: preserve(),
      FIRECRAWL_API_KEY: preserve(),
      FIRECRAWL_CONCURRENCY: preserve(),
      FIRECRAWL_RPM: preserve(),
      FRANCE_TRAVAIL_CLIENT_ID: preserve(),
      FRANCE_TRAVAIL_CLIENT_SECRET: preserve(),
      GITHUB_TOKEN: preserve(),
      INPI_PASSWORD: preserve(),
      INPI_USERNAME: preserve(),
      INSEE_API_KEY: preserve(),
      INTERNAL_API_SECRET: preserve(),
      LANGFUSE_PUBLIC_KEY: preserve(),
      LANGFUSE_SECRET_KEY: preserve(),
      LLM_ROUTE_BELLUM_ACTIVITY: preserve(),
      LLM_ROUTE_BELLUM_COMPARE: preserve(),
      LLM_ROUTE_BELLUM_CV: preserve(),
      LLM_ROUTE_BELLUM_CV_PARSE: preserve(),
      LLM_ROUTE_BELLUM_DISCOVER: preserve(),
      LLM_ROUTE_BELLUM_ESN_PREFILL: preserve(),
      LLM_ROUTE_BELLUM_ICEBREAKER: preserve(),
      LLM_ROUTE_BELLUM_LINKEDIN_POSTS: preserve(),
      LLM_ROUTE_BELLUM_MEETING_NOTES: preserve(),
      LLM_ROUTE_BELLUM_NEED_PLAY: preserve(),
      LLM_ROUTE_BELLUM_ORG_DECLARE: preserve(),
      LLM_ROUTE_BELLUM_OUTREACH: preserve(),
      LLM_ROUTE_BELLUM_RFP_DRAFT: preserve(),
      LLM_ROUTE_BELLUM_SCORER: preserve(),
      LLM_ROUTE_BELLUM_SUMMARY: preserve(),
      LLM_ROUTE_BELLUM_VOCABULARY_BUILDER: preserve(),
      LLM_ROUTE_BELLUM_WEEKLY: preserve(),
      LLM_ROUTE_CHAT: preserve(),
      LLM_ROUTE_CLASSIFY: preserve(),
      LLM_ROUTE_MESSAGES: preserve(),
      LLM_ROUTE_PLAN: preserve(),
      LLM_ROUTE_PLAN_LIGHT: preserve(),
      LLM_ROUTE_RAG_KNOWLEDGE_RERANK: preserve(),
      LLM_ROUTE_RESEARCH: preserve(),
      LLM_ROUTE_SELF_CONSISTENCY_CONTACTS: preserve(),
      LLM_ROUTE_SIGNALS: preserve(),
      LLM_ROUTE_STRATEGY: preserve(),
      OPENAI_API_KEY: preserve(),
      PAPPERS_API_KEY: preserve(),
      PAPPERS_CONCURRENCY: preserve(),
      PAPPERS_RPM: preserve(),
      PROVIDER_UNIT_COST_APOLLO: preserve(),
      PROVIDER_UNIT_COST_BRAVE: preserve(),
      PROVIDER_UNIT_COST_FIRECRAWL: preserve(),
      PROVIDER_UNIT_COST_SERPER: preserve(),
      REDIS_URL: preserve(),
      SERPER_API_KEY: preserve(),
      SOURCE_CACHE_PG_URL: preserve(),
      SUPABASE_ANON_KEY: preserve(),
      SUPABASE_JWT_SECRET: preserve(),
      SUPABASE_PROJECT_ID: preserve(),
      SUPABASE_SERVICE_ROLE_KEY: preserve(),
      SUPABASE_URL: preserve(),
      TAVILY_API_KEY: preserve(),
      VOCABULARY_MODEL: preserve(),
    },
  })

  // ───────────────────────────────────────────────────────────────────────────
  // API NestJS. Le healthcheck vise `/health/ready` et non `/health` : la
  // sonde de VIVACITÉ répond avant que les migrations et Redis soient prêts.
  // 300 s de fenêtre, parce que `preDeployCommand` joue les migrations avant.
  //
  // ⚠️ `sleepApplication: true` est l'état RÉEL du service aujourd'hui, repris
  // tel quel — une migration de configuration ne change pas de comportement en
  // passant. Mais c'est de l'endormissement applicatif sur l'API de PRODUCTION,
  // donc un démarrage à froid sur la première requête après une accalmie. À
  // trancher séparément.
  // ───────────────────────────────────────────────────────────────────────────
  const belllumBackendService = service('belllum-backend-service', {
    source: repo,
    build: {
      builder: 'RAILPACK',
      // #4711.2 — la date de construction, posée au build puis relue par `/version` (`built_at`).
      buildCommand: 'date -u +%Y-%m-%dT%H:%M:%SZ > apps/api/build-time.txt && pnpm turbo build --filter=@bellum/api',
      watchPatterns: ['/apps/api/**', ...MONOREPO_ROOTS],
    },
    start: 'pnpm --filter @bellum/api start',
    preDeploy: 'pnpm --filter @bellum/api migration:run:prod',
    healthcheck: '/health/ready',
    healthcheckTimeout: 300,
    replicas: { [REGION]: 2 },
    // `restartPolicyType: ON_FAILURE` et `restartPolicyMaxRetries: 10` sont les
    // DÉFAUTS de Railway : les écrire ici produit un diff qui ne se ferme JAMAIS —
    // un défaut n'est pas stocké, donc il se relit `null`, donc le plan le
    // redemande à chaque passage. Mesuré le 04/09/2026 : `apply` cochait ✓ sur
    // les huit changements et le plan suivant en réclamait encore quatre.
    deploy: { sleepApplication: true },
    domains: [{ domain: 'api.bellum-ai.com', port: 3000 }],
    env: {
      ANTHROPIC_API_KEY: preserve(),
      API_PUBLIC_URL: preserve(),
      COOKIE_DOMAIN: preserve(),
      DB_POOL_MAX: preserve(),
      DEMO_PUBLIC: preserve(),
      EMAIL_PROVIDER: preserve(),
      FEEDBACK_GITHUB_REPO: preserve(),
      FEEDBACK_GITHUB_TOKEN: preserve(),
      FRONTEND_URL: preserve(),
      GOOGLE_AUTH_ENABLED: preserve(),
      GOOGLE_CLIENT_ID: preserve(),
      GOOGLE_CLIENT_SECRET: preserve(),
      GOOGLE_REDIRECT_URI: preserve(),
      HUBSPOT_CLIENT_ID: preserve(),
      HUBSPOT_CLIENT_SECRET: preserve(),
      HUBSPOT_REDIRECT_URI: preserve(),
      IA_SERVICE_URL: preserve(),
      INTERNAL_API_SECRET: preserve(),
      MCP_PUBLIC_URL: preserve(),
      MICROSOFT_CLIENT_ID: preserve(),
      MICROSOFT_CLIENT_SECRET: preserve(),
      MICROSOFT_REDIRECT_URI: preserve(),
      MICROSOFT_SCOPES: preserve(),
      NODE_ENV: preserve(),
      NODE_VERSION: preserve(),
      NOTION_CLIENT_ID: preserve(),
      NOTION_CLIENT_SECRET: preserve(),
      NOTION_REDIRECT_URI: preserve(),
      PORT: preserve(),
      POSTGRES_DB: preserve(),
      POSTGRES_HOST: preserve(),
      POSTGRES_PASSWORD: preserve(),
      POSTGRES_PORT: preserve(),
      POSTGRES_USER: preserve(),
      REDIS_URL: preserve(),
      REFLAG_SECRET_KEY: preserve(),
      RESEND_API_KEY: preserve(),
      RESEND_FROM: preserve(),
      SALESFORCE_CLIENT_ID: preserve(),
      SALESFORCE_CLIENT_SECRET: preserve(),
      SALESFORCE_REDIRECT_URI: preserve(),
      STRIPE_SECRET_KEY: preserve(),
      STRIPE_WEBHOOK_SECRET: preserve(),
      SUPABASE_ANON_KEY: preserve(),
      SUPABASE_JWT_SECRET: preserve(),
      SUPABASE_OTP_EXP_SECONDS: preserve(),
      SUPABASE_PROJECT_ID: preserve(),
      SUPABASE_SERVICE_ROLE_KEY: preserve(),
      SUPABASE_URL: preserve(),
      TRANSCRIPTION_API_KEY: preserve(),
    },
  })

  // ───────────────────────────────────────────────────────────────────────────
  // Serveur MCP. Le service s'appelle `belllum-monorepo` pour des raisons
  // historiques — c'est `apps/mcp` qu'il sert.
  // ───────────────────────────────────────────────────────────────────────────
  const mcpService = service('belllum-monorepo', {
    source: repo,
    build: {
      builder: 'RAILPACK',
      buildCommand: 'pnpm turbo build --filter=@bellum/mcp',
      watchPatterns: ['/apps/mcp/**', ...MONOREPO_ROOTS],
    },
    start: 'pnpm --filter @bellum/mcp start',
    healthcheck: '/health',
    replicas: { [REGION]: 2 },
    deploy: { restartPolicyMaxRetries: 3 },
    env: {
      API_INTERNAL_URL: preserve(),
      API_PUBLIC_URL: preserve(),
      INTERNAL_API_SECRET: preserve(),
      MCP_PUBLIC_URL: preserve(),
      PORT: preserve(),
    },
  })

  return project('BellumAI', {
    resources: [Redis, redisVolume, bellumIaService, belllumBackendService, mcpService],
  })
})
