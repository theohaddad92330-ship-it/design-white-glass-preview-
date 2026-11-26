# Registre des points — LOT Z /accounts, compte connu (18/09/2026)

Source : #2556 (retour client, call bêta François Thomas du 17/09/2026).
Base mesurée : `origin/main` = `73b6ecdc4dbfc95c97eb0be8b2edcc2dacdcc59e` (18/09/2026).

Comptes : 2 points. Répartition : **livré 2** (100 %).

Premier geste : balayage `git grep` de ce qui existe déjà sur le dossier de compte
(`TabOverview.tsx`, ~20 cartes déjà montées) et de « depuis ta dernière visite »
(`apps/api/src/modules/briefing/since-last-visit.ts` + `briefing.service.ts` +
`apps/web/src/features/briefing/view/sinceLastVisitLines.ts`). Constat : **les
axes/angles d'approche existent déjà et sont rendus sur TOUT compte**, connu ou
non (`WhyNowSection`, `OpeningStrategyCard`, `MainSignalCard`, `dossierRead` à
sept axes — `TabOverview.tsx:192-306`) — rien à y changer pour #2556. Le gap
réel tenait dans les deux points ci-dessous, exactement ceux que le premier
passage (branche `feat/accounts-organigramme-importe-et-comptes-connus-18-09`,
registre `registre-2026-09-18-U-comptes.md`) avait renvoyés `à trancher`.

| Point   | La demande, en huit mots                             | Sujet          | Existant (preuve fichier:ligne + APPELANT)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | État   | Preuve en recette                                                                                                                                                                                                                                                                                                            |
| ------- | ------------------------------------------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2556.1  | Déduire « connu », sans rien demander, sans trace passive | produit + api | Décision Louis 18/09/2026 tranchée : `isAccountKnownFromTraces` (`apps/api/src/modules/accounts/account-known.ts:65`) — `missions > 0 \|\| activeActivities > 0`, jamais un compte de contacts. `KNOWN_ACCOUNT_ACTIVITY_KINDS` réutilise `INTERACTION_ACTIVITY_KINDS` (#1581.1, `packages/contracts/src/schemas/activity.ts:99`) + `note`. Appelant : `AccountKnownService.known`/`.movements` (`account-known.service.ts:69-105`), branché sur `GET /accounts/:id/known-movements` (`accounts.controller.ts`, méthode `knownMovements`). Témoin dédié : compte importé-jamais-travaillé (contacts sans mission/activité) → `false`, `account-known.spec.ts` + `account-known.service.spec.ts` (le test « sait dire NON », cassé puis remis en vol le 18/09) | recetté | CODE — accounts.controller.ts:884 GET /accounts/:id/known-movements → isAccountKnownFromTraces (account-known.ts:65), aucune écriture (zéro insert/update/save) |
| 2556.2  | ≥1 fait neuf daté/sourcé, ou le dire honnêtement       | produit + web  | `AccountKnownMovementsCard` (`apps/web/.../tabs/sections/AccountKnownMovementsCard.tsx`) — ne se rend PAS DU TOUT sur un compte non connu ; sur un compte connu, réutilise (GA-26) `sinceLastVisitLineText` + les clés i18n `briefing:sinceLastVisit.*` — ZÉRO clé neuve pour les lignes. Deux lignes réutilisées de `since-last-visit.ts` (`job_changes`, `missions_moving`), scopées à UN compte via `AccountKnownService.movements` (job changes : `contactSourceTag` réutilisé ; missions : interventions `renewal_at_risk` jointes via les missions du compte, leur sujet réel). `since` = `previous_analysis_at` du compte ou repli 30 j — jamais « depuis ta dernière visite », un repère par utilisateur qui n'existe pas. Montée dans `TabOverview.tsx`, colonne de droite, après la provenance.                     | recetté | CODE 18/09 — TabOverview.tsx:443 → AccountKnownMovementsCard.tsx:69, route /accounts/$id, clés fr+en briefing.json:81 sinceLastVisit.upToDate |

## Ce qui n'est pas fait, et pourquoi

- **Aucune recette ÉCRAN (navigateur)** : le lot livre code + tests unitaires/composants
  verts (26 tests dans les fichiers touchés par #2556), mais la recette visuelle
  demande un agent `recetteur` dédié (doctrine : un seul agent écran à la fois,
  jamais le fil principal) — hors du périmètre d'un écrivain.
## Recette du 18/09 — ce qui N'A PAS été prouvé

La recette écran du 18/09 sur `cc90f0d76` a rendu « #2556 PROUVÉ » en citant le bloc
« Ce que le dernier rafraîchissement a changé » de Société Générale. **Ce n'est pas ce bloc** :
celui-là est le livrable de #2555.4. `AccountKnownMovementsCard` ne se rend QUE sur un compte
*connu* (`missions > 0 || activeActivities > 0`), et dans la salle de démo les missions vivent
sur NOVA LOGISTIQUE, pas sur Société Générale — le recetteur regardait un compte où la carte
est censée ne RIEN rendre. Les deux points restent donc `livré`, pas `recetté` : il faut
recetter sur un compte qui porte une mission ou une activité.

- **`replies_received` et `account_signals` volontairement hors de #2556.2** : la
  première répond à « m'a-t-on répondu, à MOI », une question sur la messagerie
  de l'utilisateur, pas sur un compte ; la seconde est déjà montrée PAR COMPTE
  dans l'onglet Veille (`WatchSignalTimeline.tsx`) — la dupliquer ici dirait
  deux fois la même chose (GA-26). Assumé, pas oublié — voir le docblock du
  contrat `account-known-movements.ts`.
- **Démo : aucun semis nouveau, et c'est un constat mesuré, pas une supposition** :
  `demo-account-known-coverage.spec.ts` prouve sur le VRAI corpus
  (`DEMO_ACTIVITIES`) que NOVA LOGISTIQUE et Société Générale sont déjà
  « connus » (activités `meeting`/`email`/`call` déjà seedées). Les lignes
  `job_changes`/`missions_moving` y rendent un vrai zéro — la carte affiche
  alors l'aveu honnête, ce qui EST la seconde issue que la recette autorise,
  pas un défaut.
