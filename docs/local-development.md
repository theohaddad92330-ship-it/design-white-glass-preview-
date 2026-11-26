# Environnement de développement local

## Prérequis

- Node.js >= 22.19.0 et < 25
- pnpm 10.6.0
- Docker Desktop
- Python 3.12 (pour le service IA)

## Architecture Docker

L'infra locale tourne dans un seul projet Docker (`bellum-container`) :

| Service            | Container              | Port           | Image                          |
| ------------------ | ---------------------- | -------------- | ------------------------------ |
| PostgreSQL         | bellum-postgres        | 5432           | supabase/postgres:15.8.1.085   |
| Auth (GoTrue)      | bellum-supabase-auth   | interne (9999) | supabase/gotrue:v2.186.0       |
| API Gateway (Kong) | bellum-supabase-kong   | 54321          | kong:2.8.1                     |
| Metadata API       | bellum-supabase-meta   | interne (8080) | supabase/postgres-meta:v0.68.0 |
| Studio (UI)        | bellum-supabase-studio | 3001           | supabase/studio                |
| Redis              | bellum-redis           | 6379           | redis:7-alpine                 |

### Schéma des connexions

```
Browser (localhost:3001) → Studio → Meta (8080) → Postgres (5432)
                                  → Kong (8000)
App (localhost:5173) → API (3000) → Postgres (5432)
                                  → Redis (6379)
                                  → Kong (54321) → GoTrue (9999)
```

## Démarrage rapide

### 1. Configurer les secrets

```bash
cp tools/dev.secret.sh.example tools/dev.secret.sh
# Remplir les clés API (Anthropic, Brave, etc.)
```

### 2. Lancer l'infra + les serveurs de dev

```bash
pnpm dev full
```

Ou étape par étape :

```bash
pnpm infra:start    # Docker : Postgres + Auth + Studio + Redis
pnpm db:reset       # Applique les migrations + seed
pnpm dev:start      # Lance les serveurs de dev (web, api, ia)
```

### 3. Accéder aux services

| Service           | URL                             |
| ----------------- | ------------------------------- |
| Frontend (web)    | http://localhost:5173           |
| Backend (api)     | http://localhost:3000           |
| Service IA        | http://localhost:8000           |
| Supabase Studio   | http://localhost:3001           |
| Supabase Auth API | http://localhost:54321/auth/v1/ |

## Commandes disponibles

### Infrastructure

| Commande           | Description                                      |
| ------------------ | ------------------------------------------------ |
| `pnpm infra:start` | Lancer Docker (Postgres + Auth + Studio + Redis) |
| `pnpm infra:stop`  | Arreter Docker                                   |
| `pnpm docker:ps`   | Voir les containers                              |
| `pnpm docker:logs` | Logs Docker en temps reel                        |

### Base de donnees

| Commande                      | Description                                            |
| ----------------------------- | ------------------------------------------------------ |
| `pnpm db:reset`               | Drop + recreer les tables, appliquer migrations + seed |
| `pnpm db:types`               | Generer les types TypeScript depuis la DB locale       |
| `pnpm db:types --remote`      | Generer les types depuis Supabase cloud                |
| `pnpm db:migration:new <nom>` | Creer une nouvelle migration                           |

### Developpement

| Commande         | Description                           |
| ---------------- | ------------------------------------- |
| `pnpm dev`       | Menu interactif                       |
| `pnpm dev:start` | Lancer les serveurs de dev uniquement |
| `pnpm build`     | Build prod (tous les packages)        |
| `pnpm test`      | Lancer les tests                      |
| `pnpm lint`      | Lancer le linter                      |

## Base de donnees

### Image Supabase Postgres

On utilise `supabase/postgres:15.8.1.085` qui inclut :

- Schema `auth` avec `auth.users`, `auth.uid()`, etc.
- Schema `extensions` avec pgvector
- Roles Supabase internes (`supabase_admin`, `supabase_auth_admin`, etc.)
- RLS (Row Level Security) fonctionnel

### Migrations

Les migrations applicatives sont des migrations TypeORM dans `apps/api/src/migrations/`. Elles sont appliquees par `pnpm db:reset` via les scripts API.

Pour creer une nouvelle migration :

```bash
pnpm db:migration:new ma_migration
# Editer apps/api/src/migrations/<timestamp>-MaMigration.ts
pnpm db:reset  # Reappliquer tout
```

### Seed

Les donnees de test Supabase locales sont dans `infra/supabase/seed.sql`. Elles sont appliquees automatiquement par `pnpm db:reset`.

### Init scripts Docker

Les scripts dans `infra/docker-init/` s'executent au premier demarrage de Postgres :

- `roles.sql` : Configure les mots de passe des roles internes
- `jwt.sql` : Configure le JWT secret dans la DB
- `auth-permissions.sql` : Transfere la propriete du schema auth a GoTrue

## Authentification locale

GoTrue gere l'auth en local :

- **Email/password** : Fonctionne directement, auto-confirmation activee (`GOTRUE_MAILER_AUTOCONFIRM=true`)
- **Google OAuth** : Desactive par defaut. Pour l'activer, remplir dans `dev.secret.sh` :
  ```bash
  export GOOGLE_AUTH_ENABLED="true"
  export GOOGLE_CLIENT_ID="..."
  export GOOGLE_CLIENT_SECRET="..."
  ```
- **Callback OAuth** : `http://localhost:54321/auth/v1/callback`

### Tester l'auth

```bash
# Creer un utilisateur
curl -X POST http://localhost:54321/auth/v1/signup \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@bellum.dev", "password": "password123"}'

# Se connecter
curl -X POST http://localhost:54321/auth/v1/token?grant_type=password \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@bellum.dev", "password": "password123"}'
```

## Variables d'environnement

Le fichier `tools/dev.secret.sh` contient tous les secrets (gitignore). Il est source automatiquement par `dev.sh` et par les `dev.env.sh` de chaque app.

### Variables cles

| Variable                    | Valeur locale          | Description                           |
| --------------------------- | ---------------------- | ------------------------------------- |
| `SUPABASE_URL`              | http://localhost:54321 | URL du Kong API gateway               |
| `SUPABASE_ANON_KEY`         | JWT demo               | Cle publique pour les requetes client |
| `SUPABASE_SERVICE_ROLE_KEY` | JWT demo               | Cle admin (bypass RLS)                |
| `SUPABASE_JWT_SECRET`       | super-secret-...       | Secret pour signer les JWT            |
| `POSTGRES_PASSWORD`         | postgres               | Mot de passe Postgres                 |
| `REDIS_URL`                 | redis://localhost:6379 | URL Redis                             |

## Troubleshooting

### `role "postgres" does not exist`

Le volume Docker a des donnees corrompues. Supprimer et relancer :

```bash
docker compose -f tools/docker-compose.yml down -v
docker compose -f tools/docker-compose.yml up -d
```

### GoTrue crash au demarrage

Verifier les logs : `docker logs bellum-supabase-auth`. Si erreur de permission sur `auth.uid()`, supprimer le volume et relancer (le script `auth-permissions.sql` corrige ca au premier init).

### Studio affiche des erreurs

S'assurer que `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` sont definis dans `dev.secret.sh`. Studio en a besoin pour communiquer avec Kong.

### Les migrations echouent

Les migrations referencent `auth.users` et `extensions.vector`. Elles ne fonctionnent qu'avec l'image `supabase/postgres`, pas avec `postgres:15-alpine`.

### Port deja utilise

```bash
# Trouver le process
lsof -i :5432  # ou 6379, 3001, 54321
# Arreter les containers existants
docker compose -f tools/docker-compose.yml down
```
