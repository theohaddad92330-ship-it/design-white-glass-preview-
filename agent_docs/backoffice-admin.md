# Backoffice super-admin (dashboard-manager)

> Décision (2026-07-13) : faire de `apps/dashboard-manager` (Next.js 14, port
> 3005, outil ops interne existant — monitoring/run/config/feedback) un **vrai
> backoffice plateforme** : gérer les users, leur offre/plan, et les ESN
> (workspaces) + le rattachement user↔ESN. S'appuie sur le modèle workspace
> de [multi-user-workspaces.md](multi-user-workspaces.md) (Phase 1).

## Modèle d'auth (réutilisé, rien de neuf)

Le DM est un app Next **server-side** qui appelle l'API avec le secret partagé
`INTERNAL_API_SECRET` en header `x-internal-secret` (déjà utilisé pour
`GET /internal/telemetry`, guard `InternalSecretGuard`). Le backoffice réutilise
ce guard : nouveaux endpoints `/internal/admin/*`, cross-tenant (l'opérateur voit
TOUTES les lignes) — c'est voulu, c'est derrière le secret.

⚠️ **Gating du DM lui-même** : comme le backoffice peut modifier tous les
users/plans, l'accès au DM déployé DOIT être protégé (le secret est server-side,
mais quiconque ouvre l'URL DM déclenche les mutations). Reco : Vercel Deployment
Protection (password/SSO) sur le projet DM, ou basic-auth. À faire au déploiement.

## API — module `admin` (PR stackée sur Phase 1)

`apps/api/src/modules/admin/` — `internal-admin.controller.ts` (guard
`InternalSecretGuard`, préfixe `/internal/admin`), `admin.service.ts`, dto zod.
Endpoints v1 :

- `GET /overview` — compteurs (users, workspaces, accounts, users par plan)
- `GET /users?search=&limit=&offset=` — annuaire (profiles) + plan (subscriptions)
  - workspaces du user
- `GET /workspaces?search=` / `GET /workspaces/:id` — ESN + membres + invitations
- `PATCH /users/:userId/plan {plan}` — assigne une offre (limits depuis PLAN_CONFIG)
- `POST /workspaces {name, ownerUserId}` / `PATCH /workspaces/:id {name}`
- `POST /workspaces/:id/members {userId, role}` / `DELETE …/members/:userId`
  (retrait de l'owner interdit)
- `GET /plans` — catalogue PLAN_CONFIG (lecture seule)

Annuaire user = table `profiles` (1 ligne/user : user_id, email, first/last name).
Plan = `subscriptions`. PLAN_CONFIG (free/starter/pro/scale) reste hardcodé dans
`credits.service` — **offres éditables** = follow-up (nécessite une table `plans`).

## DM — pages backoffice (PR stackée sur Phase 1)

Nav + pages : `/users` (table + changer plan), `/esn` + `/esn/[id]` (membres,
rename, invitations), `/offres` (catalogue). Fetch server-side via
`src/lib/admin.ts` (mirror de `telemetry.ts`) ; mutations via route handlers
`src/app/api/admin/*` qui proxifient l'API avec le secret (jamais exposé au
navigateur) + `router.refresh()`.

## Déploiement

DM = Next.js → Vercel (projet séparé) ou Railway. Env : `API_BASE_URL` (API prod)

- `INTERNAL_API_SECRET` (= valeur de l'API). **+ gating d'accès** (voir ⚠️).

## Suites

- Offres éditables (table `plans` + CRUD) au lieu de PLAN_CONFIG hardcodé.
- Rattacher le backoffice aux invitations workspace (Phase 3 multi-user) une fois
  le flow d'invitation live.
- Audit log des actions admin (qui a changé quel plan / rattaché qui).

## Transfert de propriété d'une ESN (#4158.33)

Back-office seulement (décision Louis 14/10/2026). Fiche `/esn/[id]` › « Transférer la propriété » : choix du
nouveau propriétaire PARMI LES ADMINS, aperçu (`GET internal/admin/workspaces/:id/ownership-transfer/preview`,
n'écrit rien) puis validation (`POST …/ownership-transfer`), une transaction : nouveau `owner`, ancien `admin`,
`workspaces.owner_user_id`, la ligne `subscriptions` (donc le pool, aucun compteur recalculé) et l'historique
`credit_ledger` de l'espace suivent ; une ligne `ownership_transfer` (delta 0) au grand livre ; entrée d'audit
`workspaces.ownership_transfer` (catégorie `permission`).

Refusé, avec message : facturation Stripe (l'abonnement Stripe ne se déplace pas ici), cible non admin / non
membre, espace de démo, et — tranché sans Louis — ancien ou nouveau propriétaire possédant un autre espace (le pool
est porté par la personne) ou nouveau propriétaire déjà porteur d'un abonnement (on ne l'écrase pas).
Code : `workspace-ownership-transfer-plan.ts` (règles), `workspace-ownership-transfer.service.ts` (transaction).
