# Database schema BellumAI

La base applicative est PostgreSQL avec TypeORM côté API. Supabase est utilisé pour l'auth locale/prod et fournit le schéma `auth`, mais l'application écrit ses données métier via les entities TypeORM de `apps/api/src/database/entities`.

## Runtime

| Élément               | Valeur                                       |
| --------------------- | -------------------------------------------- |
| ORM                   | TypeORM                                      |
| Config runtime        | `apps/api/src/database/database.module.ts`   |
| Config CLI migrations | `apps/api/src/database/data-source.ts`       |
| Entities              | `apps/api/src/database/entities/*.entity.ts` |
| Migrations            | `apps/api/src/migrations/*.{ts,js}`          |
| Table migrations      | `_migrations`                                |
| `synchronize`         | Toujours `false`                             |
| `migrationsRun`       | Toujours `false` au boot                     |

Les migrations sont exécutées explicitement avec les scripts pnpm, jamais automatiquement au démarrage de l'API.

## Commandes utiles

```bash
pnpm db:migration:new <nom>
pnpm db:migration:run
pnpm db:migration:revert
pnpm db:migration:show
pnpm db:reset
pnpm db:types
```

`pnpm db:reset` reconstruit l'environnement local Docker et applique les migrations pour repartir d'un état sain.

## Entities métier

| Entity                            | Rôle                                                         |
| --------------------------------- | ------------------------------------------------------------ |
| `AccountEntity`                   | Compte analysé, état d'analyse, données brutes et synthèses. |
| `AccountShareEntity`              | Partage public de compte via slug.                           |
| `AccountVocabularyEntity`         | Vocabulaire généré/associé à un compte.                      |
| `ActionPlanEntity`                | Plans d'action issus des analyses.                           |
| `AttackAngleEntity`               | Angles d'attaque commerciaux générés.                        |
| `ChatMessageEntity`               | Messages/conversations du copilote IA.                       |
| `ContactEntity`                   | Contacts enrichis liés aux comptes.                          |
| `EsnProfileEntity`                | Réponses profil ESN/onboarding.                              |
| `OnboardingStageDefinitionEntity` | Définition des étapes onboarding.                            |
| `OutboxEntity`                    | Outbox applicative pour events asynchrones.                  |
| `ProfileEntity`                   | Profil utilisateur, préférences et `profile_context`.        |
| `ProfileContextRevisionEntity`    | Historique immuable des versions de `profile_context`.       |
| `RagDocumentEntity`               | Documents RAG / knowledge base.                              |
| `SubscriptionEntity`              | Plan, crédits, IDs Stripe et compteurs utilisateur.          |
| `UserActionEntity`                | Historique d'actions utilisateur/produit.                    |
| `UserOnboardingStateEntity`       | Progression onboarding par utilisateur.                      |

## Schémas Supabase

En local, Docker démarre une base Supabase Postgres avec :

- schéma `auth`,
- `auth.users`,
- fonctions Supabase comme `auth.uid()`,
- extension `pgvector`,
- rôles internes Supabase.

Les scripts init sont dans `infra/docker-init` :

- `roles.sql`
- `jwt.sql`
- `auth-permissions.sql`

Le seed local Supabase est dans `infra/supabase/seed.sql`.

## Pool et timeouts

La connexion TypeORM définit :

- `DB_POOL_MAX`, défaut `10`,
- `connectionTimeoutMillis: 10000`,
- `idleTimeoutMillis: 30000`,
- `statement_timeout: 60000`.

Le but est d'éviter qu'un worker ou une requête lente bloque tout le pool.

## Production

En production, `ssl` est activé si `NODE_ENV=production` avec `rejectUnauthorized: false`, car la chaîne CA peut varier selon l'environnement managé.

Variables minimales :

- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`

## Règles de changement

- Ne jamais utiliser `synchronize: true`.
- Toute évolution de structure passe par une migration TypeORM.
- Une migration doit être idempotente quand c'est raisonnable (`IF EXISTS`, `IF NOT EXISTS`) pour faciliter les reprises.
- Les migrations qui touchent des données existantes doivent documenter leur backfill.
- Les JWT et secrets Supabase locaux ne doivent pas être copiés en staging/prod.

## Zones non finalisées

- Modèle workspace réel : organisations, membres, rôles, permissions et invitations.
- Allocation de crédits workspace/membre.
- Export/suppression RGPD complète.
- Historique détaillé de consommation crédits.
- Intégrations production et stockage de secrets/connecteurs.

## Index vectoriel et tables à secrets (audit IA, 13/10/2026)

- Les index `rag_documents_embedding_idx` et `rag_document_chunks_embedding_idx` sont des
  **HNSW `vector_cosine_ops`** (migration `1796541541000`), plus des ivfflat `lists = 100`
  créés sur table vide. `match_rag_documents` règle `hnsw.ef_search` et, si pgvector ≥ 0.8,
  `hnsw.iterative_scan` pour qu'un petit espace ne reçoive plus 0 résultat.
- `oauth_*`, `api_keys`, `google_connections` et `user_sessions` ont la RLS **sans policy** et
  aucun droit pour `anon` / `authenticated` (migration `1796541542000`) : accès uniquement par
  l'API (connexion Postgres directe) ou `service_role`.
