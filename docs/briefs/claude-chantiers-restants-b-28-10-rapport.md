# Rapport lot N11 — branche `claude/chantiers-restants-b-28-10`, SHA poussé 665ef3fa (+ ce fichier)

Mesure : **0 issue sur 12** sans point `retenu` à la fin du lot (aucune n'avait un seul point ; chacune garde un point à l'œil, à la base ou à Louis). Registre : `.claude/notes/registre-2026-10-28-n11.md`.

- **#4599.2** `crm-import.service.ts:230`, `import-writer.service.ts:1181`, `csv-import.ts:154` ← `importContacts`/`writeContacts`/`parseContactCsv` → 3 tests rouges puis verts. Jumeau NON traité : `writeTalents` (même e-mail non gardé, hors périmètre « Contacts »).
- **#4599.6** `ContactKeyInfo.tsx:303,525` ← fiche contact → `ContactKeyInfo.email-absent.test.tsx` (3). Vaut pour TOUTE fiche sans e-mail jamais cherché.
- **#4599.7** `placeholder-email-catchup.service.ts:105,121` → lu par `RecordHistory` (`ContactRecordCard.tsx:198`) → spec du service (2 ajouts). Pas d'effet rétroactif.
- **#4603.11** `crm-import.service.ts:394,840` ← `importAccounts` → 4 tests (reprise, simulation, 2 NON). **#4603.10** `CLAUDE.md:174` + `agent_docs/doctrine.md`.
- **#4525.5** `ApproachPage.tsx:94` (Laura connaît l'écran) → 2 tests ; 3 des 5 comportements existaient déjà (17e36f98).
- **#4594.3** `laura-home-grid.tsx:313` (plus de colonne vide) → 2 tests. **#4578.2/.6** test d'ordre/tabulation ajouté (`guide-row`).
- **#4536.4/.5** tests `VoiceConversation.target.test.tsx` ; #4536.4 reste `retenu` : **preuve en recette à faire sur mobile**, rien mesuré à 390 px.
- **#4517.1/.2** déjà là sur main (951ff2a6, d7e6ab01) : aucun code. **#4605.7/.8, #4594.2, #4596.11, #4525.6** : `retenu`, œil/appareil requis.
- **#4559.7/.8** : SQL en lecture seule dans `.claude/notes/n11-4559-lectures-seules.sql`, NON exécuté (pas d'accès base).

Portes (sorties lues) : jest ciblé crm-import / csv-import / import-writer (×2) / placeholder-email-catchup / module-boundaries = 0 ; vitest ciblé ContactKeyInfo (7 fichiers, 82 tests), laura-home-grid (21), guide-row (4), VoiceConversation.target (2), ApproachPage (28) = 0 ; `tsc --noEmit` api et web : 0 ligne `error TS`, exit 0.

**Questions** : (1) #4603.4 — quel champ SIREN par CRM (Pipedrive, Salesforce, Attio, Odoo, Zoho) ? sans contrat vérifiable je n'ai rien deviné. (2) #4596.12 — souvenir « ignoré » : serveur ou appareil ? (3) #4525.5 — réintroduire les 4 objectifs d'appel dans le menu commun ? (4) #4554.5 zod 4 réservé ; #4554.6 : j'ai laissé les branches Dependabot intactes, à mettre à jour ? (5) #4603.10 : relire l'écriture de la doctrine. (6) #4599.7 : rejouer le rattrapage ? (7) #4286.13/.15 : issues non découpées, rien codé.
