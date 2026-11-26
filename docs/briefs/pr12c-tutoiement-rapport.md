# Rapport pr12c-tutoiement

- Inventaire : les ~268 occurrences de la regex du brief étaient en grande majorité « rendez-vous » (faux positifs). Lecture structurelle de tous les JSON FR : l'interface tutoyait déjà, sauf 2 chaînes.
- conforme — point 2 : `fr/outreach.json` `approval.permission.messages_send` « (le vôtre) » → « (le tien) » ; `OdooSalesSection.tsx` repli « votre outil de gestion » → « ton outil de gestion ». Test `OutreachApprovalCenter.test.tsx` aligné.
- conforme — point 3 (non touchés, destinés à des tiers) : `brief.json` (questions au prospect), `briefing.json` (`conflictDialog.warnDialog.body`, `agenda.brief.pitch.sentence.*`), `outreach.json` (`libraryView.model.starter.*`). EN intacte.
- conforme — point 4 : `apps/web/src/architecture/ui-tutoie.test.ts`, exceptions NOMMÉES avec raison, prouve le refus (cas fabriqués : « Votre espace », « vôtre », « Connectez-vous », exception limitée à sa clé).
- conforme — point 6 : entrée changelog `2026-10-24-pr12c-tutoiement` fr/en.
- Aucune clé renommée, aucune mise en page, rien IA/API.

## À trancher par Louis

- `prospecting-session.ts:139` (« Est-ce vous qui portez le sujet… ») : question posée à un prospect, laissée au vouvoiement. Fixtures de tests citant « votre » : laissées (données de prospect).

## Tests

- `vitest ui-tutoie.test.ts` : 7/7 ; `packages/contracts src/changelog` : 36/36.
- `OutreachApprovalCenter.test.tsx` : non exécutable ici (le paquet `@bellum/contracts` n'est pas construit dans la VM, échec identique avant mon changement).
- `tsc -p apps/web` : 6574 `error TS`, tous d’environnement (3505 TS6305 « contracts/dist non construit », cascade en any) ; aucune erreur propre à mes fichiers hors TS6305. Non vérifiable à 0 dans cette VM : à confirmer par la CI.
- SHA code : dcce9e24b0
