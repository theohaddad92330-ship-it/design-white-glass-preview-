# Registre CHANTIER-4292 — fiche compte et contacts (lot du 26/10/2026)

Constat du lot : à `origin/main` (48861cd00), chaque point a déjà son code, sa trace `#4292.<k>` ou sa raison écrite.
Aucun code neuf n'a été écrit : en inventer pour remplir la tranche aurait doublonné l'existant.
Reste à faire pour tous les `déjà là` : le voir tourner en recette (aucun navigateur sur cette VM).

| Chantier | Demande                               | Sujet          | État      | Preuve                                                                                                                                                 |
| -------- | ------------------------------------- | -------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #4292.1  | Balayer les 4 écrans dits livrés      | fiche compte   | retenu    | audit à écran, pas de code ; recette navigateur requise                                                                                                |
| #4292.2  | Badge Décideur sur les voies d'accès  | accès          | déjà là   | `account-access.service.ts`, `personal-access-paths.spec.ts`, `TabPartners.decisionMaker.test.tsx` (ebc9422aa)                                         |
| #4292.3  | `external_execution_id` côté API      | actions        | déjà là   | contrat `action-plan-items.ts:507`, service `action-plan-items.service.ts:872` (idempotence, doublon refusé), `action-plan-items.service.spec.ts:2460` |
| #4292.4  | « Non mesuré » seulement sous score   | affichage      | reformulé | doctrine « on n'affiche pas ce qu'on n'a pas » (decision-louis-17-10 #3711.17)                                                                         |
| #4292.5  | File de pistes + semis démo           | pistes         | déjà là   | `chantiers-livres.md` § RETENUS-B : « X affichés sur Y », `QualificationLeadsQueue`                                                                    |
| #4292.6  | Entité vide : contacts gardés         | organigramme   | déjà là   | `HierarchyOrgView.entitySwitch.test.tsx` ; reste la recette Veolia                                                                                     |
| #4292.7  | Conséquence équipe/owner              | compte suivi   | reformulé | NO-GO ratifié (decision-louis-17-10 #4180)                                                                                                             |
| #4292.8  | Cas « rien de nouveau »               | compte suivi   | déjà là   | `AccountChangesCard.tsx:44` (`changes.nothingNew`), et « illisible » ≠ « rien » (`changes.unreadable`)                                                 |
| #4292.9  | Référencé : opérationnels devant      | interlocuteurs | déjà là   | `contact-ranking.ts` (accessStatus), `contact-ranking.spec.ts`                                                                                         |
| #4292.10 | À bâtir : décideurs devant            | interlocuteurs | déjà là   | `contact-ranking-deciders-first.spec.ts`, `PriorityPathSection.test.tsx`                                                                               |
| #4292.11 | Le top 10 change selon le statut      | interlocuteurs | déjà là   | `contacts.service.ts:2613` et `:2768`, `contacts.service.spec.ts`                                                                                      |
| #4292.12 | Aucun nom de source hors Intégrations | nommage        | déjà là   | garde `aucune-source-ne-se-nomme-dans-les-textes.test.ts`                                                                                              |
| #4292.13 | PDF gros compte                       | exports        | déjà là   | plafond `lib/account-pdf/normalize.ts:161`, CSP WebAssembly `b69ead5db` ; PDF Servier non régénéré ici                                                 |
| #4292.14 | Export CRM de compte                  | exports        | reformulé | = #4188 (decision-louis-17-10 #4073, export e-mail NO-GO)                                                                                              |
| #4292.15 | CSV classement Laura                  | exports        | déjà là   | `AccountRankingCard.tsx`, `AccountRankingCard.results.test.tsx` (1392a8621)                                                                            |
| #4292.16 | Bug d'affichage (numéro coupé)        | contact        | retenu    | numéro passé sous son étiquette (`ContactKeyInfo.test.tsx`) ; capture non lisible d'ici, pas d'autre défaut identifié                                  |
| #4292.17 | « Non vérifié » supprimé              | contact        | déjà là   | `ContactKeyInfo.tsx:140`, `:384`                                                                                                                       |
| #4292.18 | « Nature non vérifiée » supprimée     | contact        | déjà là   | `ContactKeyInfo.tsx:384`, `ContactKeyInfo.test.tsx`                                                                                                    |
