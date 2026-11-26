/**
 * #2123.46/.47 — la clé de requête `GET /plan-items/mine`, PARTAGÉE.
 *
 * ⚠️ Ce fichier portait aussi un hook `useMyPlanActions`, appelant de
 * `MyPlanTasks` (« Mes tâches du plan », section de `/actions`). DÉCISION
 * Louis 17/09/2026 : cette section faisait DOUBLE EMPLOI avec l'onglet
 * « Mes relances » du Centre d'actions (`useMyActions`, MÊME clé, MÊME route
 * `GET /plan-items/mine`) — deux listes de la même chose divergent le jour où
 * l'une gagne un filtre (loi 4 du tome 7). L'onglet est gardé, `MyPlanTasks`
 * et son hook sont retirés ; seule la clé survit, parce que `usePlanItems`
 * (création d'une tâche depuis le plan d'un compte) et `useMyActions`
 * (l'onglet « Mes relances ») en ont chacun besoin pour rester d'accord sur
 * QUEL cache invalider/lire.
 */
export const myPlanActionsKey = ['plan-items', 'mine'] as const
