# Rapport — Lot A, #4731 (droits d'équipe) — PARTIEL

Branche : `claude/bedros-a-droits-equipe-4731` (base `origin/main`). SHA : voir `git log` (test `eeb5f2c5`, correctif `d9ea72fa`).

## Cause

Les LECTURES passent par l'espace (`ContactsService.findOne`, `findOneForWorkspace`), mais les ÉCRITURES filtrent
`WHERE user_id = <appelant>` — un filtre de propriété (qui a lancé l'analyse), pas de droit. Le coéquipier voit le compte, son geste touche 0 ligne ou rend `not_found`.
Les rôles et `account-access/**` ne sont PAS en cause (aucun changement).

## Fait (dans le périmètre)

- Test rouge puis vert : `accounts.teammate-gestures.spec.ts` (dépôt en mémoire qui applique les `where` ; 2 membres d'un espace + 1 d'un autre espace).
- `accounts.service.ts` : `archive`, `delete`, `setCommercialStatus`, `markAnalyzing`, `markCancelled` filtrent désormais sur l'ESPACE de l'appelant (`accountGestureWhere`). Un autre espace reste refusé (test).
- `accounts.service.spec.ts` : 8 assertions `{id, user_id}` passées à `{id, workspace_id}`.

## Tests lancés (ciblés)

- jest : teammate-gestures, accounts.service, accounts.permissions, accounts.favorite-ownership-filter → 287 verts, 3 rouges.
  Les 3 rouges (« comptes fantômes » x2, `findAccountsByWorkspace` ordre par défaut) échouent AUSSI sur `origin/main` sans mes changements (vérifié par stash : 3 failed / 258 passed).
- `tsc --noEmit -p apps/api` : seules erreurs = `@bellum/email` non construit (3 fichiers mailer/notifications, hors lot, d'environnement).

## NON fait — hors périmètre du brief (à trancher / autre lot)

`apps/api/src/modules/contacts/contacts.service.ts` porte la MÊME barrière sur les gestes contact — c'est le cas « enrichir un contact » de l'issue :

- `preflightEnrichment` l.4731 (`contacts.findOne({id, user_id})` → `not_found` pour le coéquipier) ; l.4810 et l.4898 (compte lu par `user_id` : refus `country_not_supported` / ancrage Apollo perdu).
- Même filtre l.4373, 4390, 4424, 4499, 4696, 4709, 6173, 6323, 6352, 6467, 6546, 6591, 6611, 6641, 6679 (édition, rédaction, écartement…).
  Je n'y ai pas touché (périmètre explicite, lots parallèles). Sans ce correctif l'issue n'est PAS fermée côté contacts.
  Non vérifié : chemins de rédaction (`message-drafts`) et analyse (`analysis.*`, qui ont déjà un repli par espace).

## Questions ouvertes

1. Autoriser l'édition de `contacts.service.ts` (même patron `workspace_id` que `findOne`) ?
2. Rôles exacts de Bedros et d'Adel, et même espace ? (ligne « À préciser » de l'issue ; non bloquant ici).
3. Comptes legacy `workspace_id` NULL : le nouveau filtre ne les atteint plus par un non-propriétaire (voulu) — mais le propriétaire d'un compte sans espace perd aussi son geste ; à confirmer qu'il n'en reste pas.
