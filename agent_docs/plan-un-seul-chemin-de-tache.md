# « UN seul chemin de tâche » — le constat mesuré (#2123.46-47)

Mesuré le 14/09/2026 sur `origin/main` @ 0f240ce34, worktree
`plan-objets-canoniques`. Chaque ligne vient d'un `grep -n` lancé dans ce
worktree, pas d'un souvenir.

## Le défaut, en une phrase

Trois mécanismes portent le mot « action » et **aucun n'est le même objet**.
Une action tapée dans le Plan d'action d'un compte part dans un blob JSON
(`raw_analysis.user_plan_actions`) que ni l'écran Actions ni le tableau de bord
ni la relance quotidienne ne lisent. Elle est écrite, elle est rendue sur SON
onglet, et elle n'existe nulle part ailleurs — le défaut n°1 du dépôt, du code
juste que personne n'appelle, vu depuis la donnée.

## Mécanisme 1 — `raw_analysis.user_plan_actions` (le blob)

|             |                                                                                                                                                                                                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contrat     | `packages/contracts/src/schemas/analysis/plan.ts:215-223` — `userPlanActionSchema` : `text` · `responsable` · `outil` · `deadline` · `kpi` · `expected_outcome`. Six champs, **tous du texte libre**, aucun identifiant.                                                                     |
| ÉCRIT par   | `apps/web/src/features/accounts/hooks/usePersistAccountPlan.ts:19` (`accountsApi.addPlanAction`) → `apps/api/src/modules/accounts/accounts.service.ts:3071` `appendRawAnalysisItem(id, userId, 'user_plan_actions', action)`. Un seul chemin d'écriture, appelé par `AddPlanActionForm.tsx`. |
| LU par      | `apps/web/.../tabs/plan/planViewData.ts:149` (`normalizeUserActions`) — **et personne d'autre**.                                                                                                                                                                                             |
| Ne sait pas | pointer vers quoi que ce soit : pas d'`id`, donc pas de statut, pas de cycle de vie, pas de jointure. Un élément d'un tableau JSONB.                                                                                                                                                         |

## Mécanisme 2 — la table `action_plan_items` (le survivant)

|           |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Table     | `apps/api/src/database/entities/action-plan-item.entity.ts`, migration `1784400000000-ActionPlanItems.ts`. RLS + filtre `user_id` en défense en profondeur.                                                                                                                                                                                                                                                                                                                                                                               |
| Contrat   | `packages/contracts/src/schemas/action-plan-items.ts:27-37`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ÉCRIT par | `apps/api/src/modules/actions/action-plan-items.service.ts` — semis paresseux depuis `action_plans.weeks` à la première lecture (`listForAccount`), `update()` pour le cycle de vie, `create` manuel (MCP) dans une bande de positions dédiée.                                                                                                                                                                                                                                                                                            |
| LU par    | `apps/web/src/features/actions/hooks/usePlanItems.ts` (appelé par `ActionPlanBoard.tsx:112`) · le tableau de bord « Mes relances à faire » / « Mes priorités » (#1285, invalidation `['dashboard']` à `usePlanItems.ts:64-68`) · `useCompleteRelance.ts` · le cron de relance (`notifications.scheduler.ts`) · l'historique de signal (`signal-history.service.ts:182`, `LEFT JOIN action_plan_items`) · la cadence multi-touch (`contacts/cadence.service.ts`) · la reprise de portefeuille (`workspace-portfolio-handover.service.ts`). |
| Sait déjà | porter une référence : `contact_id` EXISTE sur l'entité (bande cadence). Le champ de liaison n'est donc pas une invention, il est à généraliser.                                                                                                                                                                                                                                                                                                                                                                                          |

## Mécanisme 3 — les cartes Action OS (`copilot_card_runs`)

|                 |                                                                                                                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contrat         | `packages/contracts/src/schemas/copilot-card.ts:363-391` — `copilotCardStateSchema`, dont `prepared` et `executed`.                                                                                                                              |
| ÉCRIT par       | `apps/api/src/modules/action-os/copilot-card.service.ts` (un tour du copilote, une approbation, un `workflow-runner`). **Jamais par un formulaire du Plan d'action.**                                                                            |
| LU par          | l'écran Actions (`CARD_STATES_IN_ACTIONS_CURRENT` / `_HISTORY`, `copilot-card.ts:585-596`).                                                                                                                                                      |
| Objet différent | une carte est **un geste proposé par Laura avec son coût, sa prévisualisation et sa porte d'approbation**, pas une ligne de to-do. Elle a un cycle de vie (`cardAllowedGestures`) que `action_plan_items` n'a pas, et elle ne survit pas au fil. |

## Ce qui survit, et ce qui ne survit pas

**Survit : `action_plan_items`.** C'est le seul des trois qui est une LIGNE
(donc adressable), qui est déjà lu par cinq appelants indépendants, et dont
l'écriture passe par un service unique. Les 8 objets canoniques et les 9 champs
d'une action s'ajoutent LÀ, et nulle part ailleurs — **GA-26, un réglage vit à
un seul endroit** ; deux chemins qui refont la dérivation « quel objet vise
cette action » divergeraient en trois semaines.

**Ne survit pas comme concept de tâche : `raw_analysis.user_plan_actions`.**
On ne le SUPPRIME pas (on archive, on ne supprime pas : les blobs existants
restent lisibles et rendus). Il est **gelé** : aucun champ neuf ne s'y ajoute.
Les champs canoniques neufs vivent sur la ligne, et la vue du plan lit la ligne.

**N'est pas un concurrent : la carte Action OS.** Elle répond à « Laura propose
un geste », pas à « j'ai une tâche ». Les deux vocabulaires de statut se
RENCONTRENT (une action peut être `préparée` puis `exécutée`) sans que l'une
devienne l'autre : l'action porte son statut, la carte reste la carte.

## La conséquence pour les phases 2 à 4

1. Le champ de liaison (`linked_kind` + `linked_id`) et les 9 champs d'une
   action s'ajoutent au contrat `action-plan-items.ts` **en fin d'énumération**
   (GA-08) et à la table par une migration **d'ajout seulement** posée AVANT le
   code qui écrit (GA-11 / GA-12).
2. `userPlanActionSchema` ne bouge pas.
3. Rien n'est recopié : la vue du plan lit `usePlanItems`, qui lit la ligne.
