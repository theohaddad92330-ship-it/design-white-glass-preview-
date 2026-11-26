# Rapport N10 — branche claude/chantiers-restants-28-10

Registre : `.claude/notes/registre-2026-10-28-n10.md` (27 points). Aucune PR, aucune issue fermée. SHA : voir `git log` de la branche.

- **#4592.4** `ia-proxy.controller.ts` (garde démo, 400 `message_demo_unavailable`) ← `POST /ia/message` ; `message-demo-guard.spec.ts`. Jumeaux NON gardés : appelants internes de `ia.generateMessage` (`card-effect-ports.ts`, `message-style.service.ts`, `routines/routine-executors.ts`) — à auditer.
- **#4575.3/.4** `SidebarFooterActions.tsx` + 5 boutons (`pointer-coarse:size-11`) ← `NavUser.tsx` ; `footer-single-row.test.tsx`. Constat : 5×44 px > 216 px utiles ⇒ au doigt la rangée passe à la ligne.
- **#4576.4** `TalentDetailPage.tsx` (`ScreenGuideSlot`) ; `TalentDetail.test.tsx`. Jumeaux possibles (écrans `titleInScreen` qui dessinent leur en-tête sans poser l'emplacement) : non audités, ex. `AdvPage`, `MailboxPage`, `InvoicingPage`, `TimesheetsPage`, `SequencesPage`.
- **#4577.7** `InlineEditableField.tsx` (aria-describedby, fr/en) ← `TalentFieldGroup.tsx` et autres usages ; 2 tests.
- **#4548.2-.5** décision « neuf statuts » postée sur l'issue + garde `mission-timesheet-statuses.test.ts`.
- **Déjà là sur main** : #4579.5/.6/.9 (#4683), #4585.3/.4, #4591.1 (code).
- **Portes** : vitest ciblé (sidebar, InlineEditable, Talent, GA-33) 0 ; jest message-demo-guard + ia-proxy.controller.spec 0 ; contracts vitest 0 ; tsc web 0 erreur ; `check-types:tests` api 0 ; `lint:exports:types` 0. Python/pytest et recette navigateur : impossibles ici (pas d'API/BDD, venv ia non utilisé).
- **Questions** : (1) #4579.10 jusqu'où la sémantique ? (2) #4591.6 « non précisée » : décision 19/09 (l'absence se dit) vs doctrine 20/09 (liste) ? (3) #4592.3/#4609.2 : élargir `fetch_owned_contact` à l'espace (droit) ? (4) #4577.3/.6 : exposer la provenance par champ, sous quelle permission ; `cv_text`/`stack` restent-ils éditables ? (5) #4576.5/.9 : refonte de l'en-tête Talent sans maquette — validation Louis.
- **Non fait** : mesures navigateur (#4575.6/.7, #4576.7, #4585.8, preuves prod), tout BoondManager (non touché).
