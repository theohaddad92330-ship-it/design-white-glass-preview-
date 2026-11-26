# #2128 — « Ne pas doubler un collègue » : ce qui EXISTE déjà, mesuré

Phase 1 du lot M2-7, mesurée le 14/09/2026 sur `origin/main` à `0f240ce34`.
Chaque ligne porte son fichier:ligne. Trois colonnes, et ce sont les trois
questions qui décident s'il faut écrire du code : **calculé ? persisté ?
RENDU ?** — le défaut n°1 du dépôt est du code juste que personne n'appelle, et
son symétrique (l'API calcule, persiste et RENVOIE un champ qu'aucun écran ne
lit) est ici présent, littéralement.

---

## 1. L'attribution du compte — `accounts.assigned_to`

| Question | Réponse mesurée |
| --- | --- |
| Calculé | OUI — colonne `accounts.assigned_to` (migration `1786958241077-AccountAssignment.ts:25`), backfillée depuis `user_id` (`1791608123457-BackfillAccountAssignedTo.ts:62`) |
| Persisté | OUI |
| Rendu | **LA LISTE OUI, LE DOSSIER NON** |

- Le NOM du porteur est dérivé côté serveur, une fois, pour toute la page :
  `AccountsService.resolveOwnerNames` (`apps/api/src/modules/accounts/accounts.service.ts:4091`),
  posé sur chaque ligne en `owner` (`accounts.service.ts:1042`).
- Le contrat le porte sur la LIGNE DE LISTE seulement :
  `accountListItemSchema` (`packages/contracts/src/schemas/account.ts:450`) —
  `accountSchema`, le payload du DOSSIER, ne l'a pas.
- Un seul écran le lit : `AccountTableRow.tsx:115`, qui ne badge que le compte
  porté par quelqu'un d'AUTRE.

⚠️ **Le symétrique, et il est ici** : `GET /accounts/:id` répond
`{ ...account, age_days, last_analyzed_at }` (`accounts.controller.ts:1079-1083`)
à partir d'un `SELECT a.*` (`accounts.service.ts:1469`). **La colonne
`assigned_to` voyage donc DÉJÀ jusqu'au navigateur sur le dossier**, sans être
au contrat et sans qu'aucun écran ne la lise. Ce qui manque n'est pas la donnée,
c'est son NOM — la dérivation `resolveOwnerNames` n'est pas appelée sur ce
chemin.

**Conclusion pour la phase 2** : brancher `resolveOwnerNames` sur le détail
(une dérivation, un seul endroit, GA-26) plutôt que recomposer un nom côté
navigateur depuis `GET /workspaces/members` — deux chemins qui refont la même
dérivation divergent (`first_name + last_name || email` d'un côté,
`fullName ?? email` de l'autre).

## 2. Le geste d'attribuer — `PATCH /accounts/:id/assign`

| Question | Réponse mesurée |
| --- | --- |
| Calculé | OUI — `AccountAssignmentService.assign` (`apps/api/src/modules/assignment/account-assignment.service.ts:40`) |
| Persisté | OUI |
| Rendu | **UN SEUL ÉCRAN** — `ManagerDashboardPage.tsx:622` via `useAssignAccount` (`apps/web/src/features/manager/hooks/useAssignAccount.ts:14`) |

**Les droits sont DÉJÀ tenus côté serveur, et lus dans la matrice RBAC, pas sur
une chaîne de rôle** (`account-assignment.service.ts:50` puis `:66-93`) :

- `team:manage` → alloue librement, et peut libérer ;
- sinon `analysis:run` → peut PRENDRE un compte que personne ne porte et
  LIBÉRER le sien, jamais prendre celui d'un collègue ni le donner ;
- la route déclare `@RequirePermission('records:write')`
  (`assignment.controller.ts:28`).

C'est ce qui rend le branchement depuis le dossier possible **sans fabriquer le
moindre contrôle d'accès dans le navigateur** : l'écran propose, le serveur
refuse en 403 avec sa phrase, et `useAssignAccount` l'affiche déjà
(`useAssignAccount.ts:27`).

La liste des membres à proposer existe : `GET /workspaces/members`
(`workspace.controller.ts:96`), lue par `useWorkspaceMembers`
(`apps/web/src/features/chat/hooks/useWorkspaceMembers.ts:33`).

## 3. Les croisements — `memory-crossing.ts` et la route orpheline

| Question | Réponse mesurée |
| --- | --- |
| Calculé | OUI — `WorkspaceMemoryCrossingsService` (`apps/api/src/modules/workspace/workspace-memory-crossings.service.ts`) |
| Persisté | Dérivé à la lecture (+ table de traces `workspace_bridge_contacts`, migration `1791450000001`) |
| Rendu | OUI, sur un écran **QUE RIEN NE RELIE AU DOSSIER** |

- Contrat complet et fermé : `packages/contracts/src/schemas/memory-crossing.ts`
  — 4 natures (`MEMORY_CROSSING_KINDS`, l.305), 4 actions suggérées
  (`BRIDGE_ACTIONS`, l.256), le collègue nommé **ou réduit à son rôle**
  (`bridgeColleagueSchema`, l.224), la politique de l'espace, et
  `unreadableSources` — une source TOMBÉE est nommée, elle ne se lit pas
  « ton espace ne sait rien ».
- Client : `memoryBridgeApi` (`apps/web/src/features/memoire-collective/api.ts`),
  hook `useMemoryBridge` (`hooks/useMemoryBridge.ts:31`), écran
  `MemoryBridgeView.tsx`, route `/accounts/memoire-collective/$accountId`
  (`apps/web/src/routes/accounts/memoire-collective_.$accountId.tsx`).
- **Le seul lien entrant vient de la LISTE de la mémoire collective**
  (`MemoryBridgeAccountsView.tsx:65`) et de la navigation latérale
  (`components/navigation/sections.ts:157`). `git grep -n "memoire-collective"`
  sur `features/accounts/view/account-detail` : **aucun résultat**.

C'est le défaut n°1, en entier : un écran juste, calculé, testé, gardé — et
personne ne l'appelle depuis l'endroit où la question se pose.

## 4. Les contributeurs et la dernière activité d'équipe

| Question | Réponse mesurée |
| --- | --- |
| Calculé | La MATIÈRE oui, l'agrégat non |
| Persisté | OUI — table `activities` |
| Rendu | Le FIL oui (onglet Historique), le « qui » en tête non |

- `GET /activities?scope=account&entityId=<id>` est **scopé à l'ESPACE**, pas à
  l'utilisateur (`activities.service.ts:406-407`, et le commentaire D65 le dit
  explicitement : « la timeline est scopée à l'ESPACE »).
- Chaque ligne porte `userId` **et** `authorName`, et `authorName` est bien un
  COLLÈGUE : il est résolu depuis `profiles` par `user_id`
  (`activities.service.ts:457-476`), jamais depuis l'interlocuteur du message.
- L'appelant existe déjà dans le dossier : `TimelinePanel scope="account"`
  (`AccountDetailTabContent.tsx:174`) via `useTimeline`
  (`apps/web/src/features/activities/hooks/useTimeline.ts:8`).

**Conclusion pour la phase 2** : les contributeurs et la dernière activité
d'équipe se DÉRIVENT de cette timeline, sous la MÊME clé de requête que
l'onglet Historique (`activityKeys.timeline('account', id)`) — donc sans un
appel réseau de plus.

⚠️ **Ce qu'on ne dérive PAS** : un COMPTE de touches par personne.
`prospectionCollisionDetailSchema` (`memory-crossing.ts:377`) refuse déjà de
compter les touches d'un collègue, et écrit pourquoi : « compter les touches
d'un collègue serait un début de classement entre pairs ». Un nom et la date de
sa dernière trace coordonnent ; un compteur par personne note quelqu'un.

## 5. Ce qui est DÉJÀ LIVRÉ et que le registre des 27 points donnait pour absent

Deux points sont à re-mesurer avant d'écrire quoi que ce soit :

- **#2128.8 « attribuer une action » — LIVRÉ, et dans le dossier.**
  `ActionPlanBoard.tsx:358-376` monte `ActionExecuteMenu` avec `onAssign`,
  `members` et `assignedTo` ; le menu rend un sous-menu « Assigner à »
  (`apps/web/src/features/actions/components/ActionExecuteMenu.tsx:82,144-166`),
  l'écriture passe par `usePlanItems().assign` (`usePlanItems.ts:96`) →
  `PATCH` sur `action_plan_items.assigned_to`, et le serveur vérifie
  l'appartenance du destinataire à l'espace
  (`action-plan-items.service.ts:145-147`). Le registre disait ABSENT parce
  qu'il cherchait `task.ts` et un composant `AssigneeSelect` : ni l'un ni
  l'autre n'existe, la capacité si.
- **#2128.22 « bouton Fusionner » — le mécanisme CONFORME existe déjà.**
  `GET /governance/duplicates` + `POST /governance/duplicates/:id/decide`
  (`crm-core/governance.controller.ts:112-129`) enregistrent une décision
  **HUMAINE** ; le commentaire de la route dit la doctrine mot pour mot :
  « `merged` veut dire “quelqu'un a fusionné à la main dans son CRM” — Bellum
  ne fusionne rien ». L'écran est `governance/view/DuplicatesPanel.tsx`.
  Il n'y a donc **rien à écrire** : il y a une porte à ne pas ouvrir.

## 6. Ce qui est réellement ABSENT, et ce que ça coûterait

- **La BU interne du vendeur (#2128.2, #2128.16)** — n'existe NULLE PART.
  Les seuls « BU » du dépôt classent les entités du compte CLIENT
  (`org-graph.ts:38`, `account-entity.ts:25`, `analysis/primitives.ts:30`) :
  sens différent. Il n'y a ni colonne, ni champ de profil, ni réglage d'espace
  qui porte l'organisation interne de l'ESN. L'inventer serait une donnée
  fictive, et le déduire du rôle RBAC serait faux (`sales_ops` n'est pas une BU).
  → décision produit, pas du code.
- **Deux porteurs sur un même compte (#2128.15)** — impossible par
  construction : `accounts.assigned_to` est une colonne `uuid` SINGULIÈRE
  (migration `1786958241077:25`). Il n'y a pas de conflit à détecter, il y a
  une histoire d'attribution à montrer.
- **Les natures de croisement manquantes (#2128.14, .18, .19)** —
  `MEMORY_CROSSING_KINDS` est un enum FERMÉ, additif en fin seulement (GA-08),
  et chaque nature demande sa dérivation SQL côté
  `workspace-memory-crossings.service.ts` + son détail typé. Ce n'est pas un
  branchement, c'est un lot.
- **La visibilité par rôle (#2128.25, .26, .27, .29, .30)** —
  `workspacePermissionValues` (`packages/contracts/src/schemas/workspace.ts:70-140`)
  ne porte aucune permission de LECTURE (`contacts:read`, `memory:read`,
  `activities:read` : aucune). Décider qui a le droit de voir quoi est une
  décision de droits ; **un contrôle d'accès fabriqué dans le navigateur n'en
  est pas un** — masquer une colonne côté client laisse la donnée dans la
  réponse. Arrêt, par consigne du lot.
  (#2128.27 est d'ailleurs déjà tranché plus fort que « par rôle » : D65 —
  le corps d'un message ne sort vers AUCUN autre membre, quel que soit son
  rôle ; c'est appliqué à la source, `activities.service.ts:406-412`.)

---

## 7. Phase 3 — les collisions : ce qui est livré, ce qui reste `retenu` et POURQUOI

### Livré

| Point | Où |
| --- | --- |
| #2128.6 · .17 · .20 · .21 · .23 | Bandeau Collaboration du dossier : les croisements de la mémoire collective s'affichent enfin depuis `/accounts/<id>`, chacun avec son titre, son fait daté (`factSentence`, la MÊME phrase que l'écran complet) et son action suggérée. Jamais un blocage muet — rien n'est bloqué. `.21` ouvre la section Historique du dossier, nommée avec le collègue. |
| #2128.24 | « Continuer malgré tout » replie l'annonce pour la visite. Rien n'est écrit, rien n'est supprimé : l'annonce revient au chargement suivant tant que le fait est vrai. |

### `retenu`, avec la raison

- **#2128.12 — « un collègue travaille déjà ce contact ».** Écrit, puis RETIRÉ
  après mesure : `contacts.assigned_to` vit sur `contactListItemSchema`
  (`contact.ts:571`), **pas sur `contactSchema`**, qui est le payload de la
  FICHE. Le porteur d'un contact n'atteint donc jamais l'écran où le geste se
  fait — ouvrir la fiche et écrire. C'est EXACTEMENT l'asymétrie corrigée pour
  le compte au §1, à refaire pour le contact : exposer le porteur (et son nom)
  sur `GET /contacts/:id`, puis brancher l'avertissement. Sans cette moitié
  serveur, le composant serait du code que personne ne peut alimenter — le
  défaut que ce lot corrige, reproduit.

- **#2128.2 · #2128.16 — la BU interne.** Aucun support dans le dépôt (ni
  colonne, ni champ de profil, ni réglage d'espace) ; les « BU » existants
  décrivent l'organisation du compte CLIENT. L'inventer serait une donnée
  fictive, la déduire du rôle RBAC serait faux. **Décision produit d'abord.**
- **#2128.15 — deux porteurs sur un compte.** Impossible par construction :
  `accounts.assigned_to` est une colonne `uuid` singulière. Il n'y a pas de
  conflit à détecter. Ce que le bandeau montre à la place est l'attribution
  elle-même, et le geste pour la changer.
- **#2128.14 · #2128.18 · #2128.19 — trois natures de croisement de plus.**
  `MEMORY_CROSSING_KINDS` est un enum FERMÉ, additif en fin (GA-08), et chaque
  nature demande sa dérivation SQL dans `workspace-memory-crossings.service.ts`,
  son détail typé, sa garde et son semis. Ce n'est pas un branchement : c'est un
  lot. Le bandeau les affichera sans une ligne de plus le jour où elles
  existent — c'est ce que ce lot rend vrai.
- **#2128.13 — « Demander validation manager ».** Une demande de validation est
  une ÉCRITURE qui vise une personne d'après son RÔLE : il faut décider qui la
  reçoit (le porteur de `team:manage` ? lequel, s'ils sont trois ?), ce qu'elle
  devient si personne ne répond, et par quel canal elle se voit. C'est la porte
  « droits et rôles » du lot — on ne la fabrique pas côté navigateur.
- **#2128.22 — le bouton « Fusionner ».** Ne sera pas ajouté : on PROPOSE une
  fusion, on ne fusionne JAMAIS. Le mécanisme conforme existe déjà
  (`/governance/duplicates` + `.../decide`, qui enregistre une décision
  HUMAINE), et `bridgeActionSchema` est fermé à quatre gestes humains dont aucun
  n'écrit. Poser un bouton « Fusionner » sur une collision de contact
  contredirait les deux.
- **#2128.25 · .26 · .27 · .29 · .30 — la visibilité par rôle.** ARRÊT, par
  consigne du lot et par bon sens : `workspacePermissionValues` ne porte
  AUCUNE permission de lecture (`contacts:read`, `memory:read`,
  `activities:read` n'existent pas). Les créer est une décision de droits, et
  **un contrôle d'accès fabriqué dans le navigateur n'en est pas un** — masquer
  une colonne côté client laisse la donnée dans la réponse.
  ⚠️ #2128.27 est déjà tranché plus fort que « par rôle » : D65 interdit le
  corps d'un message à TOUT autre membre, quel que soit son rôle, et c'est
  appliqué à la source (`activities.service.ts:406-412`).
