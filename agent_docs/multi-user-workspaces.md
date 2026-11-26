# Multi-utilisateur — Workspaces / équipes ESN

> Décision produit (2026-07-13) : passer BellumAI d'un modèle **1 user = 1 compte
> isolé** à un modèle **équipe** — une ESN = une _workspace_ avec plusieurs
> commerciaux qui partagent comptes, analyses et base de connaissances. Motivé
> par l'offre commerciale « 3 utilisateurs / ESN » qui n'avait aujourd'hui
> **aucun support technique**.

## 1. État de départ (audit)

- Toutes les tables métier sont scopées **par utilisateur** : colonne
  `user_id UUID NOT NULL REFERENCES auth.users(id)`, RLS Supabase
  `USING (auth.uid() = user_id)`.
- L'API NestJS se connecte en **`postgres` (superuser)** → **bypass RLS**.
  L'enforcement réel = `where userId` dans le code (~400 sites sur ~30 fichiers ;
  top : accounts.service 41, contacts.service 39, analysis.service 39,
  credits.service 33).
- L'IA (FastAPI) passe par PostgREST en `service_role` → bypass RLS aussi.
- **Conséquence** : la RLS Supabase est un backstop défense-en-profondeur, PAS
  la barrière primaire. Le vrai chantier = réécrire les requêtes NestJS.
- Seul partage existant : `account_shares` (lien slug public, lecture-seule) —
  **conservé tel quel**, orthogonal aux workspaces.
- `subscriptions` (ex-`user_credits`) : billing par-user (`plan`,
  `accounts_limit` défaut 3 = analyses/mois, `accounts_used`, Stripe IDs).

## 2. Modèle cible

### Tables neuves

**`workspaces`** — l'équipe / ESN.
`id, name, owner_user_id → auth.users, created_at, updated_at`.

**`workspace_members`** — appartenance + rôle.
`id, workspace_id → workspaces (CASCADE), user_id → auth.users (CASCADE),
role ∈ {owner, admin, member}, created_at`. `UNIQUE(workspace_id, user_id)`.

**`workspace_invitations`** — invitations par email.
`id, workspace_id (CASCADE), email, role, token UNIQUE, invited_by,
status ∈ {pending, accepted, revoked, expired}, expires_at, accepted_at,
created_at`. Unique partiel `(workspace_id, email) WHERE status='pending'`.

### Classement des tables existantes

- **Partagées (scope workspace)** — ajout `workspace_id` : `accounts`, `contacts`,
  `attack_angles`, `action_plans`, `account_vocabulary`, `chat_messages`\*,
  `rag_documents`, `crm_connections`, `user_actions`, `account_shares`.

  \* ⚠️ **`chat_messages` est MIXTE depuis le 22/09/2026 (#2703, décision Louis).** Une
  conversation **NOMMÉE** (`conversation_id` posé) reste partagée par l'espace : c'est un
  travail qu'on reprend à plusieurs, et chaque message y porte son auteur (#1940.4). Le fil
  **PAR DÉFAUT** (sans `conversation_id`) est **PRIVÉ** : il appartient à son auteur
  (`user_id`), parce que c'est un brouillon personnel et que deux membres d'un même espace y
  écrivaient littéralement dans le même fil — défaut remonté par un CLIENT PAYANT (Apricot
  Labs, deux sièges, 22/09/2026). La clé vit à un seul endroit, `ChatMessagesService.threadWhere`,
  et `workspace_id` reste dans les DEUX branches. Rien n'a été migré : `user_id` portait déjà
  l'auteur de chaque ligne.

- **Personnelles (restent scope user)** : `profiles` (identité), `subscriptions`
  → promue **workspace** en Phase 5 (billing), `user_onboarding_state`,
  `esn_profiles` / `profile_context*` (profil de ciblage — reste per-user en
  Phase 1 ; promotion « profil ESN partagé » possible plus tard).
- `outbox` : infra async, garde `user_id` (attribution), pas de scope workspace.

`user_id` est **conservé partout** comme `created_by` (attribution/audit) ;
le scope de lecture devient `workspace_id`.

## 3. Décisions (défauts retenus — vétoables)

| Sujet            | Défaut                                                                                                                                                                  | Alternative                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Partage données  | **Tous les membres voient+éditent tous les comptes/analyses de la workspace** — ⚠️ sauf le **fil par défaut** de Laura, privé à son auteur depuis le 22/09/2026 (#2703) | ACL par-compte (plus lourd, différé)                            |
| Quota analyses   | **Pool par workspace** (l'équipe partage le quota mensuel)                                                                                                              | Par-siège                                                       |
| Rôles            | `owner` (billing+membres), `admin` (membres), `member` (lecture+écriture data)                                                                                          | RBAC fin par ressource (différé)                                |
| Billing          | **Plan pro inclut N sièges (N=3, = promesse vente)** ; sièges extra plus tard                                                                                           | Facturation par-siège dès le départ                             |
| Workspace active | 1 user peut appartenir à plusieurs workspaces → **switcher** (Phase 3)                                                                                                  | 1 seule workspace/user (plus simple, casse les invits croisées) |

## 4. Phasage (non-cassant pour la beta live)

**Phase 1 — Fondation additive (PR isolée) — SÛRE / réversible.** ← _en cours_

- Migration : créer `workspaces`, `workspace_members`, `workspace_invitations`.
- Backfill : 1 workspace par user existant (owner), 1 membership `owner`.
- Ajouter `workspace_id` (nullable) aux tables partagées, backfillé depuis la
  workspace de l'owner. **Aucune requête changée** → app identique.
- Entités TypeORM + schémas contracts + tests migration.

**Phase 2 — Scoping des requêtes.**

- `WorkspaceContext` resolver (auth.uid → workspace active + rôle).
- Refactor `where user_id = uid` → `where workspace_id = activeWorkspaceId` via
  helper, module par module (TDD). Comportement identique tant qu'un user = 1
  workspace (aucune invit acceptée). `workspace_id` passe `NOT NULL`.

### Phase 2 — Fondation livrée (PR `feat/multiuser-p2-foundation`)

Cette PR pose **uniquement la fondation non-collisionnante** : le resolver, les
helpers de scoping et **un seul module preuve** (`rag`). La réécriture large
(~400 sites sur ~30 fichiers) est **différée** aux incréments suivants, après
que les autres PRs feature en cours aient mergé (évite les conflits massifs).

**API — `WorkspaceContextService`** (`apps/api/src/modules/workspace/`, exporté
par `WorkspaceModule`) :

| Méthode                                                                      | Rôle                                                                                                                                         |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolveActiveWorkspace(userId): Promise<{ workspaceId, role }>`             | Workspace active du user (aujourd'hui : celle qu'il possède ; fallback = sa plus vieille appartenance). Lève `ForbiddenException` si aucune. |
| `getMembership(userId, workspaceId): Promise<WorkspaceMemberEntity \| null>` | Ligne d'appartenance ou `null`.                                                                                                              |
| `assertMember(userId, workspaceId): Promise<WorkspaceMemberEntity>`          | Idem, mais lève `ForbiddenException` si non-membre. Brique des guards.                                                                       |
| `assertRole(userId, workspaceId, allowed[]): Promise<WorkspaceMemberEntity>` | `assertMember` + vérifie le rôle. Alimente les guards owner/admin (Phase 4).                                                                 |

**API — helpers de scoping** (`workspace-scoping.ts`) — les 2 seules formes
qu'une lecture prend, donc chaque module convertit pareil :

- Pattern A (`repo.find` / `findOne`) : `where: workspaceScopeWhere(workspaceId)`
  → `{ workspace_id }`. Composable : `{ ...workspaceScopeWhere(wsId), status }`.
- Pattern B (QueryBuilder) : `applyWorkspaceScope(qb, alias, workspaceId)` →
  ajoute `<alias>.workspace_id = :workspaceId` via `andWhere`.
- `user_id` reste sur chaque ligne comme **created_by** (attribution/audit) ;
  seule la portée de **lecture** bascule sur `workspace_id`.

**Recette par module (canonique, cf. `rag`)** : (1) ajouter la colonne
`workspace_id UUID nullable` à l'entité ; (2) le service lit via le helper de
scoping ; (3) le controller/appelant résout la workspace active
(`resolveActiveWorkspace`) et passe `workspaceId` ; (4) `WorkspaceModule` importé
dans le module ; (5) test prouvant des résultats identiques aujourd'hui.

**Checklist de rollout (lectures) — suivi incrément par incrément :**

- [x] `rag` — `rag_documents` : `RagService.listForWorkspace` (module preuve).
- [x] `accounts` — `accounts` (#357 ; lecture par `workspace_id`, stamp au create).
- [x] `contacts` — `contacts` (#358 ; lecture par `workspace_id`, stamp au bulk).
- [x] `analysis` — `attack_angles`, `action_plans`, `account_vocabulary` (#355 ;
      stamp au persist ; `chat_messages` **pas encore** — cf. `feat/p2-scope-secondary`).
- [ ] `credits` — `subscriptions` (~33 sites) — reste **per-user** jusqu'à la
      Phase 5 (billing sièges) ; ne pas basculer ici.
- [x] `dashboard` — dérive de accounts/contacts/actions (agrégateur, pas de requête
      propre) : suit automatiquement.
- [x] `crm` — `crm_connections` (`feat/p2-scope-secondary` mergé ; stamp HubSpot +
      Salesforce ; `NOT NULL` en `feat/multiuser-finalize`).
- [x] `actions` — `user_actions` (`feat/p2-scope-secondary` mergé ; stamp `track` +
      `recordAnalysisCompleted` ; `NOT NULL` en `feat/multiuser-finalize`).
- [x] `chat` — `chat_messages` (`feat/p2-scope-secondary` mergé ; stamp `create` ;
      `NOT NULL` en `feat/multiuser-finalize`).
- [ ] `esn-profile` / `profile-context` — **restent per-user** (profil de
      ciblage) ; promotion « profil ESN partagé » éventuelle plus tard.
- [ ] `outbox` — **garde `user_id`** (infra async, pas de scope workspace).

### Phase 2 — Finalisation écritures + `NOT NULL` (PR `feat/p2-finalize-notnull`) — **FAIT**

Audit du chemin d'**écriture** sur les 10 tables partagées (chaque `INSERT` :
`.save` / `.insert` / `repo.create`). Verdict par table :

| Table                | Site d'insert (service)                            | Stampe `workspace_id` ?  |
| -------------------- | -------------------------------------------------- | ------------------------ |
| `accounts`           | `AccountsService.create`                           | ✅ (résolu, fail-closed) |
| `contacts`           | `ContactsService.bulkInsert` / `bulkImportManual`  | ✅ (résolu en interne)   |
| `attack_angles`      | `AttackAnglesService.bulkInsert`                   | ✅ (param du caller)     |
| `action_plans`       | `ActionPlansService.create`                        | ✅ (param du caller)     |
| `account_vocabulary` | `AccountVocabularyService.saveVocabulary`          | ✅ (param du caller)     |
| `chat_messages`      | `ChatMessagesService.create`                       | ❌ (module non scopé)    |
| `crm_connections`    | `CrmService.upsertConnection`                      | ❌ (module non scopé)    |
| `user_actions`       | `ActionsService.track`                             | ❌ (module non scopé)    |
| `account_shares`     | `AccountShareService.mintShareLink`                | ❌ (module non scopé)    |
| `rag_documents`      | **aucun insert NestJS** (écrit par l'IA/PostgREST) | ❌ (l'IA ne stampe pas)  |

**Passées `NOT NULL`** (migration `1784500000000`, après re-backfill) — les 5
tables dont **tous** les inserts stampent : `accounts`, `contacts`,
`attack_angles`, `action_plans`, `account_vocabulary`.

**Laissées `nullable`** (un insert au moins ne stampe pas → un flip casserait un
`INSERT` live) : `chat_messages`, `crm_connections`, `user_actions`,
`account_shares` (modules pas encore scopés, cf. `feat/p2-scope-secondary`) et
`rag_documents` (écrit hors NestJS par le service IA). Elles reçoivent quand même
le re-backfill, prêtes à flipper quand leur module sera scopé.

**Provisionnement workspace à l'inscription** : la migration ajoute le trigger
`on_auth_user_created_workspace` sur `auth.users` (miroir de
`handle_new_user_credits`) — la Phase 1 ne backfillait que les users **existants**,
les nouveaux inscrits se retrouvaient sans workspace (`resolveActiveWorkspace`
levait, les lectures/écritures Phase 2 cassaient). Désormais **chaque** user a une
workspace ⇒ `AccountsService.create` fail-**closed** (renvoie `create_failed` au
lieu d'insérer un `workspace_id` NULL). Filet de sécurité idempotent inclus pour
les users créés entre la Phase 1 et cette migration.

**Preuve de partage** (`workspace-sharing.spec.ts`) : services réels +
repos in-memory. A (owner de W) crée un compte (stampé `workspace_id=W`) ; B
(membre de W, ne possède rien) résout vers W et **voit** le compte ; C (workspace
V) **ne le voit pas**. Valide toute la chaîne P2 au niveau requête.

**Reste après cette PR** : scoper `chat_messages` / `crm_connections` /
`user_actions` / `account_shares` puis flipper leurs `NOT NULL`
(`feat/p2-scope-secondary`) ; **Phase 3** invitations + écran Équipe + switcher ;
**Phase 4** guards rôles (owner/admin) ; **Phase 5** billing sièges
(`subscriptions` → scope workspace) ; **Phase 6** RLS Supabase alignée sur
l'appartenance workspace.

### Phase 2 — Finalisation écritures (tables secondaires) + `NOT NULL` (PR `feat/multiuser-finalize`) — **FAIT**

`feat/p2-scope-secondary` a mergé : les 4 modules « secondaires » scopent
désormais leurs lectures par `workspace_id` **et stampent** `workspace_id` à
l'écriture. Re-audit du chemin d'**écriture** (chaque `INSERT` :
`.save` / `.insert` / `repo.create`), y compris les sites ajoutés depuis
(Salesforce, `recordAnalysisCompleted`) :

| Table             | Site d'insert (`fichier`)                                                                                   | Stampe `workspace_id` ?  |
| ----------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------ |
| `chat_messages`   | `ChatMessagesService.create` (`ia-proxy/chat-messages.service.ts`) — caller `ia-proxy.controller.ts` résout | ✅                       |
| `crm_connections` | `CrmService.upsertConnection` (`crm/crm.service.ts`, HubSpot)                                               | ✅ (résolu, fail-closed) |
| `crm_connections` | `SalesforceService.upsertConnection` (`salesforce/salesforce.service.ts`)                                   | ✅ (résolu, fail-closed) |
| `user_actions`    | `ActionsService.track` (`actions/actions.service.ts`) — caller `actions.controller.ts` résout               | ✅                       |
| `user_actions`    | `AnalysisPersistence.recordAnalysisCompleted` (`analysis/analysis.persistence.ts`)                          | ✅ (résolu inline)       |
| `account_shares`  | `AccountShareService.mintShareLink` (`accounts/account-share.service.ts`)                                   | ✅ (résolu inline)       |

Chaque site résout via `WorkspaceContextService.resolveActiveWorkspace`
(**fail-closed** : lève `ForbiddenException` si aucune workspace) → un
`workspace_id NULL` ne peut plus être écrit sur ces 4 tables. Aucun `INSERT INTO`
brut ni `.into()` QueryBuilder pour ces tables ailleurs dans `apps/api`.

**Passées `NOT NULL`** (migration `1784800000000-FinalizeSecondaryWorkspaceNotNull`,
après re-backfill idempotent) : `chat_messages`, `crm_connections`,
`user_actions`, `account_shares` — les 4 dont **tous** les inserts stampent.

**Laissée `nullable`** : `rag_documents` uniquement — écrite hors NestJS par le
service IA (FastAPI/PostgREST), l'insert ne porte pas de `workspace_id`. **Non
touchée** par cette migration. (⚠️ Le timestamp `1784700000000` étant déjà pris
par `CrmInstanceUrl`, la migration utilise `1784800000000`.)

Note : les entités TypeORM gardent `@Column('uuid', { nullable: true })` même
après le flip DB (convention repo, cf. `accounts` déjà `NOT NULL` en base) — le
flip vit dans la migration, pas dans l'entité.

**Sièges — source unique** : la carte sièges/plan locale (`PLAN_SEATS`) du flux
invitations (`workspace-team.service.ts`, Phase 3) est supprimée au profit d'une
lecture de `PLAN_CONFIG[...].seats` (`credits.service.ts`, Phase 5) — **une seule
source de vérité** pour les sièges (free 1 / starter 3 / pro 5 / scale 20).
Valeurs et comportement de plafond inchangés.

**Reste** : **Phase 6** RLS déjà livrée ; les policies des 4 tables gardent leur
fallback `workspace_id IS NULL` — inoffensif maintenant qu'aucune ligne neuve
n'est NULL (branche morte, à simplifier plus tard si besoin).

**Phase 3 — Invitations.**

- Créer invit (email + token), envoi Resend, accept → membership.
- Front : écran « Équipe » (liste membres, inviter, rôle, retirer) + switcher.

**Phase 4 — Rôles.** Guards admin/owner (billing, invite, remove).

**Phase 5 — Billing sièges (Stripe).** `subscriptions` → scope workspace ;
plan pro = N sièges inclus ; sièges extra facturés. _Différé : beta = Stripe test
mode._

### Phase 6 — RLS Supabase alignée workspace (livrée — `feat/p6-rls-workspace`)

Migration `1784600000000-WorkspaceRlsPolicies.ts` (SQL only, `up` idempotent,
`down` lève). **Backstop pur** : l'API (`postgres` BYPASSRLS) et l'IA
(`service_role`) contournent la RLS — ces policies ne sont PAS la barrière
primaire (elle vit dans le service layer, Phase 2). Aucun changement de code,
requête, table ou colonne : **policies uniquement**.

Chaque table team-scopée voit sa policy per-user (`auth.uid() = user_id`)
remplacée par une policy d'appartenance workspace `<table>_workspace_access`
(`FOR ALL`, `USING` + `WITH CHECK`) :

```
workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
```

| Table                | Ancienne policy droppée                               | Nouvelle policy                       | Fallback NULL  |
| -------------------- | ----------------------------------------------------- | ------------------------------------- | -------------- |
| `accounts`           | `accounts_{select,insert,update,delete}`              | `accounts_workspace_access`           | non (NOT NULL) |
| `contacts`           | `contacts_{select,insert,update,delete}`              | `contacts_workspace_access`           | non (NOT NULL) |
| `attack_angles`      | `attack_angles_{select,insert,update,delete}`         | `attack_angles_workspace_access`      | non (NOT NULL) |
| `action_plans`       | `action_plans_{select,insert,update,delete}`          | `action_plans_workspace_access`       | non (NOT NULL) |
| `account_vocabulary` | `Users can manage their own account vocabulary`       | `account_vocabulary_workspace_access` | non (NOT NULL) |
| `chat_messages`      | `Users can manage their own chat messages`            | `chat_messages_workspace_access`      | **oui**        |
| `crm_connections`    | `Users can manage their own CRM connections`          | `crm_connections_workspace_access`    | **oui**        |
| `user_actions`       | `Users can manage their own actions`                  | `user_actions_workspace_access`       | **oui**        |
| `rag_documents`      | `rag_documents_{select,insert,update,delete}`         | `rag_documents_workspace_access`      | **oui**        |
| `account_shares`     | _(aucune — RLS jamais activée)_ → `ENABLE` + nouvelle | `account_shares_workspace_access`     | **oui**        |

**`workspace_id IS NULL` (les 4 tables non-flippées + `rag`)** : les 5 tables
laissées `nullable` (write-path pas encore scopé) gardent un fallback owner —
`USING/WITH CHECK (… OR (workspace_id IS NULL AND user_id = auth.uid()))` — pour
qu'une ligne à `workspace_id` NULL reste joignable par son créateur. Les 5 tables
`NOT NULL` prennent la policy workspace simple (la branche NULL serait morte).

**`account_shares` — lecture publique préservée** : `account_shares` n'avait
jamais de RLS. Sa lecture par slug public passe par `SharePublicService`
(TypeORM → superuser `postgres` BYPASSRLS), donc activer la RLS + une policy
workspace ici **ne touche pas** le chemin de partage public. La migration fait
`ENABLE ROW LEVEL SECURITY` sur `account_shares` puis crée la policy avec le
fallback owner.

## 5. Risques

- **Migration prod** : additive + `IF NOT EXISTS` + backfill idempotent. `down`
  non supporté (convention repo) → tester `up` sur copie avant Railway.
- **Fuite de scope** en Phase 2 : un `where` oublié = un user voit les comptes
  d'une autre workspace. Mitigation : helper centralisé + tests par module +
  RLS backstop Phase 6.
- **Coût** : refactor ~30 fichiers ; étaler sur plusieurs PRs, pas un big-bang.

## Mode équipe — droits, invitations, lectures partagées (lot L1, 14/10, #4158.1-8)

- **Rôles admin réservés (#4158.1)** : `owner` et `admin` seuls attribuent, retirent ou modifient un rôle `admin`/`owner`. `sales_ops` (`team:manage`) gère les autres rôles ; il reçoit **403** s'il invite un admin, retire un admin ou promeut/rétrograde un admin. `updateMemberRole` passe de « owner seul » à `team:manage` + cette règle (`workspace-team.service.ts`, `assertMayTouchRoles`). Les **droits en propre** (`PUT /workspaces/members/:id/permissions`) restent réservés au propriétaire.
- **Renvoi (#4158.2)** : `POST /workspaces/invitations/:id/resend` — nouveau jeton, +7 j, e-mail par le chemin existant, issue rendue (`emailSent`/`emailError`). Une invitation expirée se réveille (siège vérifié) ; acceptée/révoquée → 409.
- **Expiration (#4158.3)** : `expires_at` passé = `expired` partout (comptage des sièges, dédoublonnage, liste) via le filtre de `loadPendingInvitations` ; ré-inviter marque d'abord la ligne périmée `expired` (index unique sur `pending`). Balayage horaire : `WorkspaceInvitationExpirySweeper`.
- **Retrait (#4158.4)** : `releasePortfolio` libère aussi `action_plan_items.assigned_to` (retour au créateur — `assigned_to = NULL`), borné aux comptes de l'espace.
- **Lectures par espace (#4158.5/.6)** : la checklist du plan d'un compte et son plan se lisent par compte de l'espace actif (404 hors espace) ; les modèles de séquence lisent le contact par espace. L'écriture/ la création d'une séquence restent à propriétaire strict.
- Tests à deux utilisateurs : `apps/api/src/modules/workspace/team-two-users.integration.spec.ts` (remplace le parcours e2e `invite.spec.ts`, toujours skippé faute de Tier 3).

## 6. Boîte de réception d'équipe (#4158.14 → .19, 14/10/2026)

Décision Louis 14/10 : **dans l'app + e-mail opt-in**, jamais rien vers un prospect.

- **Une seule cloche.** `notifications` gagne `workspace_id` et `actor_user_id` (nullables). La boîte montre
  les notifications personnelles (`workspace_id` NULL) ET celles de l'espace ACTIF ; « Équipe » est un filtre
  (`?scope=team`) de la même liste, jamais une seconde cloche. Les types d'équipe : `TEAM_NOTIFICATION_TYPES`
  (`packages/contracts/src/schemas/notifications.ts`).
- **Un seul passage obligé** : `TeamNotificationsService` (`modules/notifications/team/team-notifier.service.ts`).
  Règles communes : personne n'est notifié de sa propre action ; le destinataire est MEMBRE de l'espace du geste ;
  s'il y a un compte, il doit pouvoir l'ouvrir (`portfolioScopeFor`) ; best-effort (le geste a déjà réussi).
  Appelants : assignation de compte (`account-assignment.service.ts`, #4158.15), délégation d'une action
  (`action-plan-items.service.ts#update`, #4158.16), mention d'un commentaire d'équipe
  (`team-comments.service.ts#create`, #4158.17).
- **Entrée dérivée** (#4158.18) : « N collègues attendent que tu décrives l'ESN » est CALCULÉE à la lecture
  (`TeamInboxDerivedService`) pour `team:manage`, tant que l'espace n'a pas de fiche canonique et qu'au moins un
  autre membre a fini son onboarding. Jamais stockée, jamais « lue » ; elle compte dans le compteur tant qu'elle est vraie.
- **E-mail** (#4158.19) : `notification_preferences.email_on_assignment|delegation|mention|manager_digest`,
  tous faux par défaut. Activé : un e-mail au destinataire seul (liste d'opposition consultée, jamais en démo),
  une phrase et un lien, jamais le texte d'un commentaire ni d'un message. `email_on_manager_digest` est réservé au
  digest du manager (L5) : aucun interrupteur affiché tant que son émetteur n'existe pas.

## Intégration passe 2 — périmètre BU du cockpit et alignements (14/10, #4158 (complément BU))

- **`GET /manager/team-stats` porte le périmètre BU.** `ManagerService.getTeamStats` résout `resolveBusinessUnitScope`
  (fail-closed : service absent ⇒ 503) puis passe la portée à CHAQUE lecture qui nomme ou compte un compte —
  non attribués, doublons de couverture, actions partagées, activité récente, couverture, pipeline, agenda, tendance, et
  les blocs du lot L7 (pouls, revue du pipeline, staffing, activité de la période). La règle reste dans
  `accounts/business-unit-scope.clause.ts` ; `manager/manager-bu-scope.ts` n'écrit que la liste d'identifiants (validés UUID).
  Un `team:manage` cloisonné à une BU ne voit aucun compte d'une autre BU ; sans cloisonnement, les requêtes sont byte-identiques.
  Preuve : `manager-team-stats-bu-scope.spec.ts`.
- **Collègues fictifs de la démo** : `DEMO_COLLEAGUES` (`demo-dataset.ts`) est la SEULE source d'identifiants (boîte d'équipe L3,
  continuité L5, garde-fous L4 — ces derniers sont semés APRÈS `seedColleagues`). Preuve : `demo-colleague-ids.spec.ts`.
- **Digest du manager** : `ManagerDigestService` dépose et envoie par `TeamNotificationsService.notifyManagerDigest` — une seule
  porte, une seule préférence (`notification_preferences.email_on_manager_digest`, faux par défaut), interrupteur affiché dans
  Réglages › Notifications.
