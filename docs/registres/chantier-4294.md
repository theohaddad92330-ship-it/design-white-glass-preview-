# Registre CHANTIER-4294 — Analyse /search (pièces jointes, audit des doublons, DataForge)

Constat de code sur `origin/main` (26/10/2026). Jamais `écarté` : un point non livré reste `retenu` ou `reformulé` avec sa raison.

| Chantier | Demande                                                                                     | Sujet             | État    | Preuve                                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------- | ----------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| #4294.1  | Zip validé, pièce en échec : lancement libre                                                | #3623.5           | déjà là | `Search.tsx:133`, b2b59b80 ; recette navigateur non jouée (sélecteur natif)                                                                   |
| #4294.2  | Pièce lente rattachée après lancement                                                       | #3623.9           | déjà là | 4a13058a3 (rattachement tardif côté serveur) ; recette non jouée                                                                              |
| #4294.3  | Enjeu affiché une seule fois                                                                | #4142.2           | déjà là | `WhyNowSection.test.tsx` (4294.3)                                                                                                             |
| #4294.4  | HeadcountField effectif min/max                                                             | #4142.3           | déjà là | `features/search/components/HeadcountField.tsx` + test, branché dans `CadrageColumn.tsx`                                                      |
| #4294.5  | /search?company=Veolia → thèmes                                                             | #4142.4           | retenu  | recette navigateur requise, non jouable ici                                                                                                   |
| #4294.6  | Signaux quasi identiques repliés                                                            | #4142.5           | déjà là | `accounts.service.ts:4089`, `opportunity-cards.test.ts`, `signal-dedupe.test.ts`                                                              |
| #4294.7  | Secteur public / déjà travaillées reliés à une source                                       | #4142.6           | déjà là | `analysis-scope.ts` (NAF/INSEE), `analysis.persistence.ts:318` (CRM + missions)                                                               |
| #4294.8  | Point .10 : re-diagnostic puis code                                                         | #4142.10          | retenu  | décision 17/10 : lot V13, hors tranche                                                                                                        |
| #4294.9  | DataForge nourrit analyse et Laura (.1 outil, .2 plan, .3 prescripteurs, .4 « à vérifier ») | #4281             | déjà là | `dataforge_needs.py`, `radar_chat_tools.py`, `phase4_plan.py:1022`, tests `test_4294_9_*`                                                     |
| #4294.11 | Audit des doublons du portefeuille, en SIMULATION, sans les coquilles `error` vides         | #4142 (« audit ») | livré   | `account-duplicate-audit.ts` + `GET /accounts/duplicates/audit` ; specs `account-duplicate-audit.spec.ts`, `accounts.duplicate-audit.spec.ts` |
| #4294.12 | Écran / bouton de l'audit + traduction fr/en + démo                                         | #4142             | retenu  | hors tranche : l'API n'a pas encore d'appelant web (voir rapport)                                                                             |
| #4294.13 | Exécuter le rattachement en lot depuis l'audit                                              | #4142             | retenu  | écriture irréversible : jamais en exécution directe ; le geste unitaire `POST /accounts/:id/absorb` existe déjà                               |

## Décisions tranchées sans toi

- Audit en lecture seule, groupes par SIREN puis par nom normalisé : le geste « Rattacher » (#1111) existe déjà, on ne le duplique pas.
- Coquilles vides = prédicat `KEEP_NON_EMPTY_FAILED_SQL` réutilisé tel quel (GA-26), comptées à part (`emptyShells`).
