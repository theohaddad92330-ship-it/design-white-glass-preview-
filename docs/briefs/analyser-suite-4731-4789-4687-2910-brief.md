# Lot 30 — Analyser · suite (#4731, #4789, #4687)

Périmètre : `apps/api/src/modules/contacts/*`, `apps/web/src/routes/accounts/*`, `apps/web/src/routeTree.gen.ts`

## Ce que le lot fait

- **#4731 (P0)** — suite du lot A (PR #4769, qui a ouvert `AccountsService`) : `ContactsService` portait la même barrière
  `WHERE id = ? AND user_id = <appelant>`. Onze gestes passent à la clé d'ESPACE (`contactGestureWhere`) : statut, note,
  brouillon (rédaction), préparer le message, confirmer l'identité, masquer, écarter, réintégrer, départ déclaré,
  relances d'un geste déclaratif, pré-contrôle d'enrichissement (+ le compte lu pour l'enrichir). L'enrichissement en lot
  (`ContactEnrichmentService.enqueueBulk`) passe par la même porte d'espace. L'appelant paie ses crédits (inchangé).
- **#4789** — `/accounts/<id>/analyze` et `/analyse` redirigent vers le dossier du compte (lecture 1 de l'issue : alias).
- **#4687** — déjà livré (PR #4708 : `fromAts()` → `ATS_CONFIG_SOURCE` → `AtsCredentialsService`, rattrapage par segment dans
  `segment-catchup.service.ts`). Clos par preuve, sans recoder (voir PR).

## Ce que le lot ne fait pas

- Les ENVOIS (`sendEmail`, `sendEmailBulk`, `resolveSendAttempt`) et l'entrée MCP (`findOwnedForAction`) gardent la portée
  stricte `user_id` : ils parlent au nom de la boîte mail / du jeton de l'appelant. QUESTION produit à Louis : faut-il
  les ouvrir à l'espace ?
- Jumeaux hors périmètre, nommés : `crm.service.ts:1348`, `linkedin.service.ts:82/131`, `lemlist.service.ts:102/163`,
  `outreach-automation.adapter.ts:123` (filtre `user_id` sur un contact) — à trancher avec la même question.
- Pas d'écran « relancer l'analyse » (lecture 2 de #4789) : s'ouvrira sur une demande qui le décrit.
- La preuve en production de #4731 (Adel enrichit, enrichit un contact, prépare un message) reste à faire en recette.

## Droits

- Qui voit / modifie : tout membre de l'espace de l'appelant agit sur les contacts de l'espace (rôle sans effet, doctrine c76).
- Qui est REFUSÉ : un utilisateur d'un AUTRE espace → `not_found`, aucune écriture (test `contacts.teammate-gestures.spec.ts`).
- Aucune route ni garde nouvelle ; la barrière de propriété (`user_id`) est remplacée par la barrière d'espace.

## Décisions touchées

Garde #4661 (commentaire de portée de `contacts.service.ts` réécrit, sens conservé), garde #4752 (ligne du commentaire de `canReadContact`),
garde #4537 et #4544 (montage de `contact-declared-touch.spec.ts`), garde #4627 et #4631 (une assertion de `contacts.service.spec.ts`
passe de `user_id` à `workspace_id`, intention inchangée). Garde #4609.3 (lecture par espace, `canReadContact` — inchangée, réutilisée), #4731/#4769 (étendu aux contacts),
#4658 (alias du verbe principal, étendu à la forme avec identifiant).
