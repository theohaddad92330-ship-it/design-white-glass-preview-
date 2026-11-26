# Registre — lot PLATEFORME-DIVERS (27/10/2026)

Branche `claude/plateforme-divers-2710k`, base `origin/main` 8b6d99fc. La plupart des points étaient déjà sur `main` (lots 2710j, vague IX) : rien n'a été recodé.

| Point                            | État                                            | Preuve                                                                                                                                                                          |
| -------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #4559 (6 identifiants étrangers) | déjà là                                         | garde d'écriture + refus testés : `consultant-manager.spec.ts`, `cv-studio.service.spec.ts`, `capitalisation.service.spec.ts:742`, `delivery.service.ts:2664` ; 120 tests verts |
| #4472 DPA                        | déjà là                                         | `lot-plateforme-2710j.md` (#4472.4-.7) ; 0 « à confirmer » dans `dpa.md`                                                                                                        |
| #4548 CRA                        | déjà là, tranché : NON à `not_due` / `received` | docblock `TIMESHEET_STATUSES` (`mission.ts:289`), aucun statut d'encaissement ajouté                                                                                            |
| #4595 tuile « Connecteurs… »     | déjà là                                         | `dashboard-manager/.../produit/page.tsx:754` : « mesure arrêtée le 25/10/2026 », jamais 0                                                                                       |
| #4605 (sept défauts)             | déjà là                                         | b10ed2a1, 91b36481 ; recette prod BLOCKED (401), preuve à la main                                                                                                               |
| #4654                            | livré                                           | `ScreenGuideSlot.tsx`, `CustomerPageContent.tsx`, `ScreenIntro.tsx`, `PlanningPage.tsx`, `ContactsIntro.tsx`                                                                    |
| #4658                            | livré                                           | `routes/analyze.tsx`, `routes/analyse.tsx`, `routes/accounts/$id.tsx` (redirection dans la définition de route)                                                                 |
| #4662                            | livré                                           | `Search.tsx` : le `<h1>` de l'attente nomme l'analyse et le compte                                                                                                              |
| #4600                            | déjà là                                         | `contact-duplicate-proposals.ts:172,310`, `identity-duplicates.ts:121` ; 36 tests verts                                                                                         |
| #4543                            | déjà là, SAUF le point .5                       | un seul lecteur `brief-unknowns.ts` ; le point .5 (« aucun concurrent » parmi les inconnues) n'est PAS touché : à valider produit                                               |
| #4500                            | déjà là                                         | `docs/registres` divers-métier ; mesures Chrome encore ouvertes                                                                                                                 |
| #4465                            | déjà là                                         | a5adc0b3 (fonction = poste en cours, parti rangé à part) ; le 404 `crm/push/.../provenance` relève du lot CRM                                                                   |
| #4593                            | livré                                           | `actions.json` fr/en `today.burst.summary.underMandate` ; `burstCopy.test.ts`                                                                                                   |

## Décision prise faute d'arbitrage, À CONFIRMER PAR LOUIS (27/10/2026)

#4593 : la doctrine du 21/09 gagne — « Fait » ne porte JAMAIS de preuve d'envoi. Le RÉCAP change, pas le geste : il nomme « Fait » et ne dit plus « Rien ne part tant que tu n'as pas cliqué sur Fait », phrase qui reliait le clic à un envoi.
