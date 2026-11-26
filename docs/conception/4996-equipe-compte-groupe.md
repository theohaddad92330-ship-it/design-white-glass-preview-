# Conception — une équipe sur le compte groupe, un périmètre par membre (#4996)

Date : 01/11/2026 · Branche : `claude/4996-equipe-compte-groupe` · Épopée : #4731 (mode équipe), voisines #4803, #4804.
Statut : conception, **aucun code applicatif**. Mesures prises sur `64dae8ba` (cette branche, partie de `main` au
merge #5092).

## 0. Ce qui est déjà arbitré (pas re-litigé ici)

- Le compte groupe est porté par UNE ÉQUIPE. On ne crée ni un compte par entité, ni un utilisateur par entité, et on
  n'intègre pas Collective (Louis, 31/10).
- Commentaire de Louis sur #4731 (31/10, 10:42) : « le périmètre **FILTRE et pré-assigne, il ne bloque pas l'écriture** ;
  périmètre = **entités du groupe + texte libre**, BU plus tard. Se livre après #4731/#4803/#4804. »
- #4996 est fermée et rattachée à #4731 (#4996.1-.4). Les lots ci-dessous citent `Refs #4731` et `#4996.n`.

Cette conception s'en tient là. Elle n'ajoute **aucune barrière d'écriture** : un membre agit partout sur le compte, quel
que soit son périmètre (c76, #4731 « tous les gestes »).

---

## 1. L'existant mesuré

### 1.1 Les trois colonnes du compte

| Colonne            | Ce qu'elle porte, mesuré                                                                               | Preuve                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `user_id`          | « créé par » : qui a lancé l'analyse. N'est plus un droit.                                             | `apps/api/src/database/entities/account.entity.ts:20`, commentaire `:22-26` |
| `workspace_id`     | la portée de lecture et de geste (nullable pendant la bascule user→espace)                             | `account.entity.ts:27-29`                                                   |
| `assigned_to`      | le **responsable** du compte (« Portefeuille »), un seul membre ; `null` = file « à attribuer »        | `account.entity.ts:343-351`                                                 |
| `business_unit_id` | la BU / agence **de NOTRE espace** (l'ESN), pas une subdivision du prospect                            | `account.entity.ts:353-364`, `business-unit.entity.ts:9-25`                 |
| `group_role`       | `'groupe' \| 'filiale' \| null`, fait capitalistique (Pappers), contrainte `accounts_group_role_check` | `account.entity.ts:114-122`                                                 |
| `group_head_siren` | la tête de groupe déclarée ; « même groupe » = même tête, jamais un rapprochement de noms              | `account.entity.ts:117-118`, `apps/api/src/common/same-group-sql.ts:1-12`   |

**Homonymie à ne pas reproduire.** On trouve dans le dépôt trois choses qui s'appellent « BU » ou « périmètre » :

1. `business_units` : NOTRE agence (`business-unit.entity.ts:12-23`). `BusinessUnitService.perimetersOf` appelle
   « périmètres » les BU d'un membre (`apps/api/src/modules/business-unit/business-unit.service.ts:113`).
2. `account_entities` : les subdivisions **du CLIENT**, de type `bu | subsidiary | division | unknown`
   (`account-entity.entity.ts:4-32`, contrainte `1789531284416-AccountEntitiesAndSites.ts:63`).
3. L'entité d'accueil par défaut s'appelle « Périmètre non déterminé » (`1789531284416-AccountEntitiesAndSites.ts:146-148`,
   `is_default`, `account-entity.entity.ts:68-75`).

Le périmètre de #4996 vise les **entités du client** (sens 2). Une « BU » du client est déjà un `account_entities.kind = 'bu'` :
elle est donc couverte dès le premier lot. Le « BU plus tard » de Louis vise le sens 1 (voir Q4). Dans le code, la notion
neuve s'appelle `account_team_scopes` (« zone d'un membre sur un compte »), pour ne pas croiser `perimetersOf`. À l'écran,
le mot reste « périmètre », celui des utilisateurs.

### 1.2 L'équipe de compte existe déjà (#4158.25, PR #4170)

- Table `account_team_members` : `workspace_id, account_id, user_id, added_by, created_at, removed_at, removed_by`. On ajoute
  seulement : un retrait pose `removed_at` (`account-team-member.entity.ts:3-36`).
- Migration `1796506798642-TeamGuardrails.ts:56-75` : un index unique partiel `(account_id, user_id) WHERE removed_at IS NULL`
  (`:68`) et un index `(workspace_id, user_id)` (`:71`). **Aucune RLS, aucune clé étrangère.**
- Lecture et écriture : `TeamGuardrailsService.accountTeam` (`team-guardrails.service.ts:587-616`) rend
  `{ responsible (= assigned_to), members[], can_edit }`. Composer l'équipe est réservé au responsable ou à `team:manage`
  (`assertCanEditTeam`, `:618-628`). Ajouter un membre (`:630-652`) vérifie qu'il est dans l'espace. Retirer (`:654-661`)
  archive la ligne.
- Routes : `GET/POST accounts/:id/team`, `DELETE accounts/:id/team/:memberId` (`team-guardrails.controller.ts:157-185`). Le
  `POST` exige `records:write`.
- Contrat : `accountTeamMemberSchema` / `accountTeamResponseSchema` (`packages/contracts/src/schemas/team-guardrails.ts:140-158`).
- Filtre « Mes comptes » : `ownership: 'mine'` = responsable OU co-équipier actif (`accounts.service.ts:1500-1509`, contrat
  `packages/contracts/src/schemas/account.ts:940-946`). `'teammate'` = porté par un autre (`accounts.service.ts:1494-1498`).
- Écran : `AccountTeamCard` (`apps/web/src/features/team-guardrails/components/AccountTeamCard.tsx`), ouvert depuis
  `AccountTeamDialog` (`apps/web/src/features/accounts/view/account-detail/collaboration/AccountTeamDialog.tsx:35`). L'axe
  du filtre est dans `AccountsToolbarControls.tsx:18` et `accountFavoriteFilters.ts:35`.
- Démo : un collègue fictif est semé dans l'équipe d'un compte (`demo-team-guardrails-seed.ts:166-172`), classé
  `account_team_members` dans `demo-coverage.ts:3813`.

**Ce qui manque pour #4996** : le _périmètre_. Un co-équipier est rattaché au compte entier, sans dire quelle entité il adresse.

### 1.3 Le module `account-access` n'est PAS une autorisation

#4731 le soupçonnait (« supposé »). La mesure dit le contraire. `account-access` porte la **barrière d'ACHAT** du client :
peut-on entrer chez lui, rang 1 installé, panel achats, coût d'accès. Voir `account-access.service.ts:161-187` (« La barrière
d'ACHAT estimée »), `barrierView` `:520-537` et `costEstimate` borné à l'espace `:609-620`. Ses lectures sont bornées à
`workspace_id` (`:314`, `:406`, `:422`). Ses écritures (`POST :id/access`, `:id/access/answer`) exigent `records:write`
(`account-access.controller.ts:76-77`, `:94-95`), sans aucun filtre de propriétaire. **Ce module ne bloque pas B sur le compte
de A et n'a pas à bouger pour #4996.** Ses `access-barrier.spec.ts` et `account-access-level.spec.ts` testent le score
d'accès commercial.

### 1.4 Ce qui empêchait B d'agir sur le compte de A (#4731), et ce qui reste

- **Cause** : les écritures filtraient `WHERE id = ? AND user_id = <appelant>`, un filtre de propriété
  (`accounts.teammate-gestures.spec.ts:4-14`).
- **Corrigé sur `main`** :
  - comptes : `accountGestureWhere` = l'espace OU une ligne ancienne `workspace_id IS NULL` de son propriétaire
    (`accounts.service.ts:3491-3504`) ;
  - contacts : `contactGestureWhere`, un seul endroit (`apps/api/src/modules/contacts/contact-gesture-scope.ts:16-26`), appelé
    par `contacts`, `contact-enrichment`, `crm`, `lemlist` et `linkedin` (#4803, commit `0e1a0d3f`).
- **Reste ouvert (#4804)**, toujours `user_id: userId` sur un `where` qui porte l'id :
  - `apps/api/src/modules/outreach/outreach.service.ts:1109` (séquence) ;
  - `outreach/outreach-cadence.service.ts:50` (cadence) ;
  - `actions/action-plan-items.service.ts:809` (`{ id, user_id }` OU `{ id, assigned_to }`, puis `colleagueItemForWrite`) ;
  - `actions/action-plan-items.service.ts:1525` (`materializeStep`).

  #4996 se livre **après** ces lignes : un membre de l'équipe BNP qui ne peut pas relancer la séquence d'un collègue rend le
  périmètre inutile.

### 1.5 Ce qui CACHE aujourd'hui un compte à un co-équipier : le mode « cloisonné »

Ce point n'apparaît dans aucune des quatre issues.

- La visibilité `restricted` est un réglage d'espace : « chaque commercial voit son portefeuille et les comptes libres »
  (`portfolio-visibility.values.ts:18-23`). `portfolioScopeFor` rend alors `{ ownerId, includeUnassigned }`, sauf pour
  `team:manage` (`portfolio-visibility.ts:51-59`).
- La clause appliquée, recopiée **quatre fois** : `(account.assigned_to = :ownerId OR account.assigned_to IS NULL)`
  (`accounts.service.ts:1081`, `:1115`, `:1222`, `:1791`). Elle ne regarde **pas** `account_team_members`.
- Mêmes jugements, sur `assigned_to` seul :
  - `team-comments.service.ts:314` et `:361` refusent de commenter un compte « hors de ton portefeuille » ;
  - `team-notifier.service.ts:261` (`canSeeAccount`) ;
  - `chat-conversations.service.ts:112`.

**Conséquence** : dans un espace cloisonné, un co-équipier ajouté au compte BNP ne **voit pas** BNP. Le commentaire « ne change
pas la visibilité » (`account-team-member.entity.ts:6-7`, `1796506798642-TeamGuardrails.ts:13`) n'est vrai qu'en mode `open`.
Cela contredit le critère « l'équipe voit l'ensemble ». Le lot L3 corrige ce point.

Le cloisonnement par BU (`businessUnitScopeFor`, `packages/contracts/src/schemas/business-unit.ts:129-135`) peut aussi
cacher le compte groupe à un membre d'une autre agence. Ce cas relève du « BU plus tard » (Q4).

### 1.6 Les filiales qui sont DÉJÀ des fiches

L'arbitrage du 15/10 (#4158 EX-03) a produit `listGroupEntities` : chaque entité d'un groupe déjà analysée est une fiche à part,
avec son `assigned_to`. La fiche groupe se contente de les nommer, filtrées par BU (`account-group-entities.ts:5-18`, requête
`:46-58`, appelant `accounts.service.ts:3760-3770`). La lecture est rendue par `GroupEntitiesCard.tsx`. La décision du 31/10
n'efface pas ces fiches, qui sont des données en place. Elle interdit d'en **créer** pour porter un responsable. Ces fiches
restent lisibles depuis l'équipe du groupe (§4.1), sans migration de données.

### 1.7 Assignation et départ d'un membre

- `AccountAssignmentService.assign` : un manager (`team:manage`) attribue tout ; un commercial prend un compte libre ou libère le
  sien (`apps/api/src/modules/assignment/account-assignment.service.ts:44-106`). Le contact a son propre `assigned_to`
  (`contact.entity.ts:51-55`) et sa clé d'entité `entity_id` (`contact.entity.ts:67-75`).
- Départ d'un membre : `releaseMemberWork` libère `accounts.assigned_to`, `contacts.assigned_to` et `action_plan_items`
  (`apps/api/src/modules/workspace/release-member-work.ts:17-26`). **Il ne touche pas `account_team_members`** : le partant
  reste inscrit, en ligne active, dans les équipes de compte. `accountTeam` le masque seulement quand son nom a disparu
  (`team-guardrails.service.ts:602-614`).

---

## 2. Le modèle de données

### 2.1 Choix : une table fille `account_team_scopes`, clé `(account_id, user_id)`

On ne crée pas de seconde table d'équipe. On ajoute la _zone_, à part, avec quatre raisons :

- Un membre peut couvrir **plusieurs** entités. L'index unique `(account_id, user_id)` d'`account_team_members` (`:68`) exclut
  une colonne `scope_*` par ligne.
- Le **responsable** (`assigned_to`) n'a pas de ligne dans `account_team_members` et doit pourtant pouvoir porter un
  périmètre. Une clé `(account_id, user_id)` le couvre sans le recopier dans la table d'équipe (GA-26 : « qui est
  responsable » vit à un seul endroit, `assigned_to`).
- L'archivage reste homogène : `removed_at` partout.
- Aucune colonne existante n'est modifiée.

```sql
CREATE TABLE IF NOT EXISTS account_team_scopes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL,
  account_id    uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL,                       -- un membre du compte : responsable OU co-équipier actif
  entity_id     uuid REFERENCES account_entities(id) ON DELETE SET NULL,  -- NULL = texte libre (ou entité retirée)
  label         text NOT NULL,                       -- le nom affiché ; copie du nom de l'entité à la pose
  added_by      uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  removed_at    timestamptz,
  removed_by    uuid,
  CONSTRAINT account_team_scopes_label_check CHECK (length(btrim(label)) BETWEEN 2 AND 120),
  CONSTRAINT account_team_scopes_removed_pair_check CHECK ((removed_at IS NULL) = (removed_by IS NULL))
);
```

- **`label` NOT NULL** : il fait deux choses. C'est le texte libre (« Retail France », « IT Groupe ») quand `entity_id` est
  NULL. C'est aussi la mémoire du nom quand une entité est supprimée : `ON DELETE SET NULL` garde la ligne et son libellé, la
  zone ne disparaît pas en silence. Aucun repli inventé.
- **Pas de colonne `kind`** : « entité » ou « texte libre » se lit sur `entity_id IS NULL`. Une seconde colonne dirait deux fois
  la même chose (GA-26).
- **Le membre** : on ne pose pas de FK vers `account_team_members`, car le responsable n'y figure pas. L'invariant
  « `user_id` ∈ {assigned_to} ∪ équipe active » est tenu par le service (§2.4) et par un compteur de garde (L2).
- **Même espace** : `entity_id` doit appartenir au même compte. Le service le vérifie
  (`account_entities.account_id = account_id`). En SQL, une FK composite exigerait un index unique `(id, account_id)` sur
  `account_entities` : c'est l'option de L8.

**Index** (tirés des requêtes de §3 et §4) :

```sql
-- une entité ne se pose qu'une fois par membre actif
CREATE UNIQUE INDEX IF NOT EXISTS account_team_scopes_entity_active
  ON account_team_scopes (account_id, user_id, entity_id) WHERE removed_at IS NULL AND entity_id IS NOT NULL;
-- un texte libre non plus (casse et espaces ignorés)
CREATE UNIQUE INDEX IF NOT EXISTS account_team_scopes_label_active
  ON account_team_scopes (account_id, user_id, lower(btrim(label))) WHERE removed_at IS NULL AND entity_id IS NULL;
-- « mon périmètre » sur un compte, et « qui couvre cette entité » (pré-assignation)
CREATE INDEX IF NOT EXISTS account_team_scopes_account_idx
  ON account_team_scopes (account_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS account_team_scopes_entity_idx
  ON account_team_scopes (entity_id) WHERE removed_at IS NULL AND entity_id IS NOT NULL;
-- « mes périmètres » dans l'espace
CREATE INDEX IF NOT EXISTS account_team_scopes_user_idx
  ON account_team_scopes (workspace_id, user_id) WHERE removed_at IS NULL;
```

Deux membres peuvent couvrir la **même** entité : aucune unicité par entité seule. C'est le cas réel « on est deux sur BNP
Retail », et le refuser forcerait une saisie fausse.

### 2.2 RLS

L'API se connecte en `BYPASSRLS` : la portée d'espace dans le code est la vraie barrière, la RLS est un filet
(`account-assignment.service.ts:47-49`). On suit le patron de `team_research_entries` (`1796575071694-TeamResearchEntries.ts:42-61`) :

```sql
ALTER TABLE account_team_scopes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read their workspace account scopes" ON account_team_scopes FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
```

Aucune politique d'écriture : seule l'API écrit. Le même lot pose la même politique de lecture sur `account_team_members`, qui
n'en a pas (§1.2). Ce filet manquant se répare dans la même migration, en ajout seul.

### 2.3 Contrat (`packages/contracts`) et sa contrainte SQL d'abord (GA-11/12)

- On ajoute `scopes: { id, entity_id: string | null, label }[]` à `accountTeamMemberSchema` et à un nouvel objet
  `responsible` (`team-guardrails.ts:140-155`). Ce n'est qu'un ajout : un client ancien ignore le champ.
- Corps des requêtes :
  - `addAccountTeamScopeRequestSchema = { user_id, entity_id?: guid, label?: string(2..120) }` ;
  - refus si les deux sont absents ;
  - si `entity_id` est fourni, `label` est **toujours** recopié du nom de l'entité par le serveur, jamais par le client.
- Les bornes `2..120` vivent une seule fois dans le contrat (`ACCOUNT_TEAM_SCOPE_LABEL_MAX`). La migration les écrit dans son
  `CHECK`, et la migration part **avant** le code qui écrit (GA-11/12). Une spec de migration vérifie le texte du `CHECK`
  contre la constante.

### 2.4 Migration en trois temps : étendre / migrer / rétrécir

L'horodatage suit `pnpm --filter @bellum/api migration:next` (`apps/api/src/migrations/README.md`, GA-372).

**Étendre (L1)**, migration seule, sans changement de comportement :

1. `CREATE TABLE account_team_scopes`, avec ses index et sa RLS (§2.1-2.2).
2. `ENABLE RLS` et politique de lecture sur `account_team_members`.
3. `COMMENT ON TABLE account_team_scopes IS 'Zone (périmètre) d''un membre sur un compte : filtre et pré-assigne, ne bloque
aucun geste (#4996, Louis 31/10).'`
4. `down()` : `DROP TABLE account_team_scopes`, puis retrait de la politique. Il ne touche jamais `account_team_members`.

**Migrer (L2)**, données et écritures :

1. **Aucun périmètre n'est déduit.** Un membre sans zone couvre « tout le compte » : c'est l'état réel tant que personne
   n'a rien déclaré. Fabriquer des zones à partir de `contacts.assigned_to` × `entity_id` inventerait une répartition.
2. **Reprise de `assigned_to`** : la colonne **reste** le responsable du compte, sans changer de sens. Elle ne part pas dans
   la table d'équipe et n'est pas renommée : plus de dix sites la lisent (§1.5, §1.7, `manager-team-views.service.ts:129`,
   `discover-alert-event.sweeper.ts:340`). Deux règles neuves la relient à l'équipe :
   - Un responsable ne peut pas être aussi co-équipier. Le geste `addTeamMember` refuse `user_id = assigned_to`. Quand un
     compte est attribué à un co-équipier actif, sa ligne d'équipe est archivée **dans la même transaction**
     (`removed_by = l'auteur du geste`), et ses zones restent attachées à `(account_id, user_id)`, donc conservées.
   - Le **doublon déjà en base** (un co-équipier actif qui est aussi `assigned_to`) est compté par un script de diagnostic en
     lecture seule, versé au PR. Il n'est pas archivé par la migration : `removed_by` n'aurait pas d'auteur humain. Le service
     le dédoublonne à la lecture tant qu'il existe. Le nettoyage se fait au rétrécissement, Q3.
3. **Départ d'un membre** : `releaseMemberWork` archive en plus ses lignes `account_team_members` **et** ses
   `account_team_scopes` dans l'espace (`removed_by` = l'auteur du retrait, déjà connu des deux appelants,
   `release-member-work.ts:8-11`). C'est une fonction pour les deux sorties, comme aujourd'hui.
4. **Rattrapage de l'existant** : le défaut « partant resté inscrit » touche des lignes déjà en base. Suivant la doctrine du
   18/09 (#2543), on le rattrape de façon ciblée, à la demande, pas au déploiement : une commande d'admin archive les lignes
   d'équipe des non-membres, avec un dry-run qui compte d'abord.

**Rétrécir (L8)**, une fois que tout écrit par le service :

1. FK `account_team_members.account_id → accounts(id)` posée `NOT VALID`, puis `VALIDATE` après la commande de rattrapage
   (les orphelins sont comptés avant).
2. Option : index unique `(id, account_id)` sur `account_entities`, puis FK composite
   `(entity_id, account_id) → account_entities(id, account_id)` sur `account_team_scopes`. Sa suppression change : elle passe
   de `SET NULL` à `SET NULL (entity_id)`, une syntaxe de PostgreSQL 15+ à vérifier sur Supabase avant de l'écrire.
3. Retrait du dédoublonnage à la lecture, quand le compteur du doublon est à 0.
4. Commentaires corrigés : « ne change pas la visibilité » devient « élargit le cloisonné aux co-équipiers »
   (`account-team-member.entity.ts:6-7`).

Rien n'est supprimé : on archive, on ne supprime pas.

---

## 3. Les droits

### 3.1 Principe

Le périmètre est **un angle et une suggestion**, jamais un droit. Il change l'ORDRE et le FILTRE PAR DÉFAUT. Il ne retire ni
un geste ni une donnée à l'équipe (c76, #4731, décision Louis du 31/10). Être dans l'équipe d'un compte **élargit** la
visibilité en mode cloisonné : c'est le seul effet du compte groupe sur la visibilité, et il va dans le sens « l'équipe voit
l'ensemble ».

Le contrôle d'espace reste la borne dure, sans changement. Un autre espace est refusé partout
(`accountGestureWhere`, `contactGestureWhere`).

### 3.2 Matrice

Légende : ✅ permis · ❌ refusé · « filtre » = masqué par défaut, avec un compteur et « tout voir » en un geste.

| Qui ↓ / quoi →                                    | Voir le compte groupe                    | Voir contacts et entités hors de sa zone | Agir sur le compte (enrichir, plan, rédiger, séquence) | Agir sur un contact hors de sa zone       | Composer l'équipe | Poser / retirer des zones | Assigner un contact                                            |
| ------------------------------------------------- | ---------------------------------------- | ---------------------------------------- | ------------------------------------------------------ | ----------------------------------------- | ----------------- | ------------------------- | -------------------------------------------------------------- |
| Responsable (`assigned_to`)                       | ✅                                       | ✅ (filtre si zone)                      | ✅                                                     | ✅                                        | ✅                | ✅ pour tous              | ✅ à soi, ou proposition à un membre (Q2)                      |
| Co-équipier avec zone                             | ✅ (même en cloisonné, L3)               | ✅ (filtre)                              | ✅                                                     | ✅, avec la mention « dans la zone de X » | ❌                | ✅ **pour lui-même** (Q1) | prend un contact libre de sa zone ; le reste comme aujourd'hui |
| Co-équipier sans zone                             | ✅ (même en cloisonné)                   | ✅, aucun filtre (« tout le compte »)    | ✅                                                     | ✅                                        | ❌                | ✅ pour lui-même (Q1)     | comme aujourd'hui                                              |
| `team:manage` (owner, admin, sales_ops)           | ✅                                       | ✅                                       | ✅                                                     | ✅                                        | ✅                | ✅ pour tous              | ✅ à tous                                                      |
| Membre de l'espace hors équipe, mode `open`       | ✅                                       | ✅                                       | ✅ (#4731)                                             | ✅                                        | ❌                | ❌                        | comme aujourd'hui                                              |
| Membre de l'espace hors équipe, mode `restricted` | ❌ si le compte est porté (inchangé, D5) | —                                        | —                                                      | —                                         | ❌                | ❌                        | —                                                              |
| `viewer`                                          | ✅ en lecture                            | ✅                                       | ❌ (`records:write`)                                   | ❌                                        | ❌                | ❌                        | ❌                                                             |
| Autre espace                                      | ❌ 404                                   | ❌                                       | ❌                                                     | ❌                                        | ❌                | ❌                        | ❌                                                             |

### 3.3 Les deux cas demandés

- **Un membre hors de son périmètre.** Il voit tout et agit sur tout. Trois choses seulement changent :
  - **L'ordre.** Sa zone vient en premier dans les contacts et les entités.
  - **Le filtre par défaut** de l'onglet Contacts du compte, « Mon périmètre », avec la ligne « 14 contacts hors de ton
    périmètre — tout voir ». Ce qui est filtré est nommé et compté, rien n'est caché sans le dire.
  - **Une mention non bloquante** sur un contact d'une autre zone : « Dans le périmètre de Léa M. ». C'est le même patron que
    « déjà travaillé par X » (`ColleagueActivityBanner`).

  Aucune confirmation, aucun refus : un bouton offert marche (le défaut d'origine de #4803).

- **Un compte sans équipe.** C'est le comportement actuel, sans changement. Pas de section périmètre, pas de filtre, pas de
  mention. Le bloc Équipe affiche le responsable s'il existe et le bouton « Ajouter un membre » si le lecteur peut composer.
  Une absence ne fait **aucune ligne** (Louis, 20/09) : pas de « Aucun périmètre », pas de « 0 membre ».

### 3.4 Pourquoi ne PAS borner l'écriture

Ne pas borner l'écriture est la seule lecture compatible avec trois règles :

- c76 : le rôle change l'ordre, pas le contenu ;
- #4731 : « tous les gestes » ;
- #4804 : un collègue modifie déjà le contact visé, donc lui refuser la séquence ne protège rien.

Une zone bloquante recréerait, entité par entité, le défaut de #4731.

### 3.5 Où vit le droit (GA-26)

- `canEditAccountTeam(role, userId, account)` : déplacé de `team-guardrails.service.ts:618-628` vers une fonction pure du
  contrat. Elle sert au service et au `can_edit` de la réponse.
- `canEditOwnScope(role, userId, account, isMember)` : la règle de Q1, dans la même fonction pure.
- Visibilité cloisonnée :
  - `portfolioScopeFor` reste la seule source de « qui est cloisonné » ;
  - la clause SQL qui applique le cloisonnement devient **une seule** fonction, `portfolioScopeClause(scope, alias)`
    (dans `accounts/`), qui rend
    `(a.assigned_to = :ownerId OR a.assigned_to IS NULL OR EXISTS (équipe active))` ;
  - les quatre copies (`accounts.service.ts:1081`, `:1115`, `:1222`, `:1791`) l'appellent ;
  - les jugements en mémoire (`team-comments.service.ts:314`, `:361`, `team-notifier.service.ts:261`,
    `chat-conversations.service.ts:112`) passent par un prédicat jumeau `isInPortfolio(scope, account, teamUserIds)`,
    défini à côté.

---

## 4. Les écrans

Règles transverses : sombre par défaut, parité clair/sombre, cibles ≥ 44 px, borne mobile 768 px, aucune valeur absente
affichée « 0 », aucun taux de couverture (GA-259), et le copilote s'appelle Laura.

### 4.1 La fiche du compte groupe : l'équipe et le périmètre de chacun

On étend `AccountTeamCard`, sans écran neuf (une seule carte « équipe », GA-26).

```
Équipe du compte                                   [ + Ajouter un membre ]
 ● Claire D. — responsable      Périmètre : BNP Paribas CIB · IT Groupe      [modifier]
 ● Léa M.                        Périmètre : BNP Paribas Personal Finance     [modifier] [retirer]
 ● Hugo R.                                                                    [modifier] [retirer]
Fiches d'entité déjà suivies : Arval — porté par Hugo R.   (lecture, #4158 EX-03)
```

- Un membre sans zone n'a pas de ligne « Périmètre ». Une absence ne fait aucune ligne.
- **« modifier »** ouvre un `Dialog` shadcn qui n'a qu'un champ, un combobox multi-choix :
  - les `account_entities` du compte, triées par nom, avec le `kind` en pastille (« BU », « Filiale », « Division ») ;
  - « + Ajouter un libellé libre » (2 à 120 caractères, validé par le même schéma que l'API).

  Erreur sous le champ, pas de double soumission (`isPending`). Une entité retirée ensuite reste affichée par son `label`,
  avec la pastille « entité retirée ».

- **« Fiches d'entité déjà suivies »** reprend `listGroupEntities` (§1.6) : on n'ajoute pas de requête neuve, on fait suivre
  `ownerUserId`. Si aucune fiche n'existe, il n'y a aucune ligne.
- Dans l'onglet Organigramme / entités (`GroupEntitiesCard` et la liste `account_entities`), chaque entité affiche **qui la
  couvre** en pastilles de noms. Une entité que personne ne couvre n'a pas de pastille : pas de « non couverte », pas de
  pourcentage.
- Mobile : une ligne par membre, le périmètre passe à la ligne, les actions vont dans un menu `⋯` nommé « Actions pour Léa M. ».

### 4.2 Les filtres « mes comptes / mon périmètre »

- **Liste des comptes** : l'axe `ownership` existe déjà (« Toute l'équipe · Mes comptes · Portés par un collègue »,
  `AccountsToolbarControls.tsx:18`). « Mes comptes » inclut déjà le co-équipier (`accounts.service.ts:1500-1509`). **Rien
  de neuf** sur cette liste : le compte groupe est un compte, et le périmètre ne s'applique pas à une liste de comptes
  (Q5 propose une extension aux fiches d'entité).
- **Onglet Contacts de la fiche** : un segment `Mon périmètre · Tout le compte` dans l'URL (`?perimeter=mine|all`), jamais
  dans un store. Il n'est **affiché que si le lecteur a au moins une zone avec `entity_id`** sur ce compte. Règle du filtre :
  - garder `contacts.entity_id ∈ mes entity_id` ;
  - garder aussi `entity_id IS NULL` et l'entité `is_default` (« Périmètre non déterminé »), car on ne sait pas où ils sont :
    une absence ne les écarte pas ;
  - une zone **en texte libre ne filtre rien**, puisqu'on ne rapproche pas des noms (#3895). Elle apparaît dans la ligne
    « Ton périmètre : IT Groupe (texte libre, ne filtre pas) ».

  Défaut : `mine` si le segment est affiché (Q6). Sous la liste, en permanence : « N contacts hors de ton périmètre —
  Tout voir ».

- **Ordre**, sans filtre : dans « Tout le compte », les contacts de ma zone passent en tête (c76 : ordre).
- API : `GET accounts/:id/contacts?perimeter=mine` ajoute la clause côté serveur. Le calcul ne se recopie pas côté web.

### 4.3 Les assignations

- **Contact, à l'unité** : dans le sélecteur de porteur, le membre dont une zone couvre l'entité du contact est **en tête**,
  avec « couvre BNP Paribas CIB ». Rien n'est présélectionné ni écrit sans clic. Si deux membres couvrent l'entité, les deux
  sont en tête, par ordre alphabétique.
- **En masse : « Répartir selon les périmètres »**, un bouton de la carte Équipe pour le responsable ou `team:manage` :
  - aperçu figé : « 23 contacts → Léa M. (Personal Finance) · 11 → Claire D. (CIB) · 9 sans zone ou deux candidats, inchangés » ;
  - validation par un clic, application par un `UPDATE … WHERE assigned_to IS NULL` seulement : on ne retire jamais un contact
    à quelqu'un, une décision humaine gagne ;
  - c'est la « pré-assignation » de Louis, sous la forme d'un geste humain prévisualisé (Q2).
- **Compte** : le responsable reste attribué par `AccountAssignmentService`, sans changement. Attribuer le compte à un
  co-équipier archive sa ligne d'équipe et garde ses zones (§2.4).

### 4.4 La démo (craft rule n° 9)

- Compte : **Société Générale**, déjà `group_role: 'groupe'` dans la démo (`demo-dataset.ts:1333`) et dont les filiales sont
  déjà nommées (`subsidiaries`, `demo-dataset.ts:1327`). On sème deux `account_entities` réelles, « Boursorama / BoursoBank »
  et « Treezor » (`kind: 'subsidiary'`), plus « DSI Groupe » (`kind: 'division'`). La boucle existante s'en charge
  (`demo-seed.service.ts:8995-9014`).
- Équipe : le démonstrateur est responsable, avec la zone « DSI Groupe ». Deux collègues fictifs du lot L2 de #4170 couvrent
  l'un Boursorama, l'autre Treezor plus un libellé libre « Paiements ». Sans collègue fictif, aucune ligne : on n'attribue
  jamais une trace à quelqu'un qui n'existe pas (`demo-coverage.ts:3809-3811`).
- Trois contacts semés par entité, pour que le filtre « Mon périmètre » et « Répartir selon les périmètres » aient quelque
  chose à montrer.
- Couverture : `account_team_scopes` est **seedée** dans `demo-coverage.ts`. Ce fichier est chaud, donc le lot écrit un
  fragment `changes/<lot>.yml` et l'intégrateur reporte. `DemoResetService` purge la table (même place que
  `account_team_members`).

---

## 5. Découpage en lots (≤ 40 points chacun)

Ordre : L0 → L1 → L2 → (L3 ∥ L4) → L5 → L6 → L7 → L8. Chaque lot : test rouge pour la bonne raison, puis le code, puis
`pnpm ci:local`, puis une PR brouillon `Refs #4731` (#4996.n).

| Lot                          | Points | Contenu                                                                                                                                                                                                                                                                                                                  | Fichiers                                                                                                                                                                                                     | Tests (ciblés)                                                                                                                                                                                                                                                                                                  |
| ---------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **L0** prérequis             | —      | #4804 livré (§1.4 : `outreach.service.ts:1109`, `outreach-cadence.service.ts:50`, `action-plan-items.service.ts:809`, `:1525`) et #4731 recetté en production. **Pas dans ce chantier.**                                                                                                                                 | —                                                                                                                                                                                                            | —                                                                                                                                                                                                                                                                                                               |
| **L1** étendre               | 8      | migration `account_team_scopes`, index, RLS (et RLS d'`account_team_members`) ; entité TypeORM ; `database.module.ts` ; constantes et schémas du contrat (§2.3)                                                                                                                                                          | `apps/api/src/migrations/<next>-AccountTeamScopes.ts`, `database/entities/account-team-scope.entity.ts`, `packages/contracts/src/schemas/team-guardrails.ts`                                                 | `migrations/__tests__/<next>-AccountTeamScopes.spec.ts` (CHECK = constante, RLS posée, `down` ne touche pas `account_team_members`) ; `packages/contracts` : test du schéma (refus label vide, refus des deux champs absents)                                                                                   |
| **L2** service et API        | 13     | `GET` équipe enrichie de `scopes` ; `POST/DELETE accounts/:id/team/:userId/scopes` ; label recopié de l'entité ; entité d'un autre compte refusée ; responsable ≠ co-équipier ; `releaseMemberWork` archive l'équipe et les zones ; commande de rattrapage avec dry-run ; `canEditAccountTeam` et `canEditOwnScope` purs | `team-guardrails.service.ts`, `team-guardrails.controller.ts`, `workspace/release-member-work.ts`, `assignment/account-assignment.service.ts`, `packages/contracts/src/schemas/team-guardrails.ts`           | `team-guardrails.service.spec.ts` (refus : entité d'un autre compte, autre espace, non-membre ; contrôle négatif) ; `workspace-team.release-portfolio.spec.ts` ; `account-assignment.service.spec.ts`                                                                                                           |
| **L3** visibilité cloisonnée | 13     | `portfolioScopeClause` et `isInPortfolio` (une seule définition) ; les 4 copies SQL et les 4 jugements mémoire y passent ; commentaires corrigés                                                                                                                                                                         | `accounts.service.ts:1081/1115/1222/1791`, `team-comments.service.ts:314/361`, `team-notifier.service.ts:261`, `chat-conversations.service.ts:112`, `packages/contracts/src/schemas/portfolio-visibility.ts` | `portfolio-visibility.test.ts` ; `accounts.favorite-ownership-filter.spec.ts` (co-équipier voit en `restricted`, non-membre ne voit pas un compte porté : la garde dit NON) ; `team-comments` spec existante ; extension de la garde de doctrine d'une seule clause, si une garde `architecture/` la porte déjà |
| **L4** filtre contacts       | 8      | `?perimeter=mine` côté API (`entity_id IN zones` OU NULL OU `is_default`) ; texte libre neutre ; compteur « hors périmètre » ; ordre « ma zone d'abord »                                                                                                                                                                 | `contacts/contacts.service.ts` (liste par compte), contrat de la requête de liste                                                                                                                            | spec de liste des contacts : contact sans entité gardé, texte libre ne filtre pas, compteur exact                                                                                                                                                                                                               |
| **L5** pré-assignation       | 8      | ordre du sélecteur de porteur ; `POST accounts/:id/team/distribute/preview` puis `…/apply` (seulement `assigned_to IS NULL`, aperçu figé par empreinte)                                                                                                                                                                  | `assignment/contact-assignment.service.ts`, `assignment.controller.ts`, contrat                                                                                                                              | `contact-assignment.service.spec.ts` (n'écrase jamais un porteur, deux candidats = inchangé, l'aperçu périmé est refusé)                                                                                                                                                                                        |
| **L6** écrans                | 13     | `AccountTeamCard` (zones, dialog, fiches d'entité suivies) ; pastilles « couvert par » dans les entités ; segment `perimeter` dans l'URL et ligne « hors périmètre » ; mention « dans la zone de X » ; bouton Répartir + aperçu ; i18n FR                                                                                | `features/team-guardrails/components/AccountTeamCard.tsx`, `account-detail/components/GroupEntitiesCard.tsx`, onglet Contacts, `features/accounts/model/accountsSearch.ts`                                   | `team-guardrails.components.test.tsx` (membre sans zone = pas de ligne ; erreur API sous le champ) ; test du segment (masqué sans zone, URL) ; gardes `architecture/` GA-18/19, 28-35 vertes                                                                                                                    |
| **L7** démo                  | 5      | entités SG, zones de l'équipe, contacts par entité, purge au reset, fragment `changes/<lot>.yml` pour `demo-coverage.ts`                                                                                                                                                                                                 | `demo/demo-dataset.ts`, `demo/demo-team-guardrails-seed.ts`, `demo/demo-reset.service.ts`                                                                                                                    | `demo-team-guardrails-seed.spec.ts` (sans collègue = aucune zone) ; `demo-coverage.spec.ts`                                                                                                                                                                                                                     |
| **L8** rétrécir              | 5      | FK `NOT VALID` puis `VALIDATE` ; FK composite d'entité (option) ; retrait du dédoublonnage à la lecture quand le compteur est à 0                                                                                                                                                                                        | migration `<next>-AccountTeamFks.ts`, `team-guardrails.service.ts`                                                                                                                                           | spec de migration (orphelins comptés avant `VALIDATE`) ; `team-guardrails.service.spec.ts`                                                                                                                                                                                                                      |

Total : 73 points en sept lots livrables. L3 et L4 peuvent tourner en parallèle après L2, car leurs fichiers ne se recoupent
pas. Plus de trois fichiers touchés dans L2, L3 et L6 : `/impact-check` d'abord.

---

## 6. Questions pour Louis (QCM, recommandée en premier)

**Q1 — Qui pose le périmètre d'un co-équipier ?**

- A. ⭐ Le responsable et `team:manage` pour tous, **et chaque membre pour lui-même**. C'est un filtre personnel et une
  suggestion, pas un droit. Interdire à Léa de dire « je fais Personal Finance » ne protège rien.
- B. Seulement le responsable et `team:manage`, la même règle que pour composer l'équipe.
- C. Seulement `team:manage`.

**Q2 — La « pré-assignation », c'est quoi ?**

- A. ⭐ **Un ordre et un geste prévisualisé** : le membre qui couvre l'entité est en tête du sélecteur, et « Répartir selon
  les périmètres » montre un aperçu figé, appliqué en un clic, sur les contacts sans porteur seulement. Rien ne s'écrit seul.
- B. A, plus une écriture automatique de `contacts.assigned_to` à la collecte, quand une seule zone couvre l'entité.
- C. Seulement l'ordre du sélecteur, sans répartition en masse.

**Q3 — Le doublon « co-équipier ET responsable » déjà en base.**

- A. ⭐ Dédoublonné à la lecture, compté par un diagnostic, archivé ensuite par une commande d'admin lancée à la main (dry-run
  d'abord), avec l'auteur du geste en `removed_by`.
- B. Archivé par la migration, avec `removed_by = NULL` et une raison en commentaire.
- C. Toléré : le responsable peut aussi apparaître comme membre.

**Q4 — « BU plus tard » : quelle BU ?**

- A. ⭐ **Notre BU (`business_units`)**. Une BU du client est déjà une `account_entities.kind = 'bu'`, donc couverte dès L1. Le
  croisement « un membre d'une autre agence voit le compte groupe sous cloisonnement BU » est reporté à un chantier à part.
- B. La BU du client, à modéliser à part des entités : il faudrait alors dire ce qui la distingue de `kind = 'bu'`.
- C. Les deux, dans ce chantier.

**Q5 — Les fiches d'entité qui existent déjà (#4158 EX-03) entrent-elles dans « mon périmètre » de la liste des comptes ?**

- A. ⭐ Non dans ce chantier : elles sont **nommées** sur la fiche groupe avec leur porteur, et la liste des comptes reste sur
  `ownership`. Rapprocher une fiche d'entité et une zone ne se ferait que par le SIREN, et c'est un lot à part.
- B. Oui, par SIREN égal (`account_entities.siren = accounts.siren`) dans le même groupe, jamais par le nom.

**Q6 — Le filtre par défaut de l'onglet Contacts d'un membre qui a une zone.**

- A. ⭐ **« Mon périmètre » par défaut**, avec la ligne « N contacts hors de ton périmètre — Tout voir » toujours affichée.
  C'est le « FILTRE » de ta décision du 31/10, et rien n'est caché sans être nommé.
- B. « Tout le compte » par défaut, avec ma zone en tête (ordre seul, c76 au plus strict).

**Q7 — La démo.**

- A. ⭐ Société Générale, déjà « groupe » en démo, avec Boursorama, Treezor et « DSI Groupe » en entités.
- B. Le client de livraison SNCF, qui a déjà ses `account_entities` (SNCF Voyageurs, SNCF Connect & Tech,
  `demo-dataset.ts:11761-11780`), mais n'est pas `group_role: 'groupe'`.
