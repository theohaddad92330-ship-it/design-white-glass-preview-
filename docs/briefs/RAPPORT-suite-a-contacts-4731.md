# Rapport — suite A, #4731 : gestes CONTACT (branche claude/suite-a-contacts-4731)

Migré (`contacts.service.ts`, UN endroit : `contactGestureWhere` / `accountOfContactGestureWhere`, `where` en OU
`[{ id, workspace_id: ws }, { id, workspace_id: NULL, user_id }]`) :

- enrichir (`preflightEnrichment` + lecture du compte : pays `country_not_supported` et ancrage Apollo, `enrichContact`) ;
- éditer/statut (`updateStatus`, + drapeau de replan du compte en SQL brut), noter (`updateNote`), masquer (`setHidden`) ;
- écarter / réintégrer / départ (`excludeContact`, `restoreContact`, `declareContactDeparted`), relances d'un « marqué envoyé » ;
- préparer / envoyer (`prepareEmail`, `sendEmail`, `resolveSendAttempt`, `saveEmailDraft`, `confirmIdentity`, `findOwnedForAction`) ;
- lecture en lot `In(unique)` (`sendEmailBulk`), toujours UNE requête ; historique du contact (`user_actions`).
- `accountGestureWhere` (accounts.service.ts) : même OU, la ligne ancienne n'était plus atteinte par personne.
- Commentaire de `workspace-scoping.ts` mis à jour (état réel : comptes + contacts migrés).
  `user_id` toujours écrit sur les lignes neuves ; aucun rôle ni garde ajouté ; aucune garde touchée.
  Tests : `contacts.teammate-gestures.spec.ts` ROUGE d'abord (9 échecs nommant les gestes refusés) -> VERT 26/26.
  Spec comptes : +1 cas ligne ancienne, rouge -> vert (6/6). 18 suites ciblées : 671 verts. tsc : 3 `error TS`, toutes `@bellum/email` (env).
  Assertions corrigées avec leur raison en commentaire : `contacts.service.spec.ts` (3), `query-ratchet` (1) ; stub d'espace ajouté à 3 specs.
  Environnement : `pnpm install --frozen-lockfile --ignore-scripts` (zod 3 installé au lieu de 4) ; aucun fichier suivi touché.
  Pas fait : démo — vide à dessein, raison : l'espace de démo est SOLO par décision (#2117.14, DEMO_OWNER seul membre réel) ;
  un second membre la contredirait et élargit le lot. Le geste coéquipier est prouvé par le spec en mémoire, pas par le jeu de démo.
  Non migrés (hors liste du brief) : écritures contact par `update({ id })` après lecture gardée (déjà bornées par la lecture). Q : (1) second membre de démo, ou la solitude de l'espace reste-t-elle la règle ? (2) autres tables à `findOne({ id, user_id })` hors contacts/comptes à auditer ? Issue #4731 : NON fermée (ni PR ouverte), conformément au brief.
