# Rapport — fix-recette-c-2510

Branche `claude/fix-recette-c-2510` (sans PR).

| Point                           | Pourquoi « livré » ne suffisait pas                                                                                                      | Correctif                                                                             | Test                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| #4292.13 aperçu PDF             | La CSP refusait le WebAssembly du moteur de mise en page de `@react-pdf/renderer` ; `worker-src 'self' blob:` existait déjà              | `'wasm-unsafe-eval'` dans `script-src` (`apps/web/vercel.json`), jamais `unsafe-eval` | `architecture/csp-apercu-pdf-sans-unsafe-eval.test.ts` |
| #4295.21 « estimé » partenaires | `TabPartners` n'utilisait jamais `EstimatedBadge`                                                                                        | Badge sur toute relation sans déclaration de l'espace ni qualification humaine        | `TabPartners.estimated.test.tsx`                       |
| #4286.11 demandeur              | La donnée arrivait aux cartes Découvrir/Veille/Bibliothèque, pas à la fiche compte (`BuyingSignals` n'appelait pas `OfferRequesterLine`) | Câblage `BuyingSignals` → `WhyNowItemList`                                            | `BuyingSignals.requester.test.tsx`                     |
| #4324.1 raison                  | Raison DSI déjà sur l'axe et la carte 5P ; absente sous « Rôles couverts »                                                               | Note « Aucun des N contacts n'a ce rôle posé » (+ intitulés DSI/RSSI non reconnus)    | `TabCoverage.test.tsx`                                 |
| Changelog                       | —                                                                                                                                        | `2026-10-25-fix-recette-c` FR + EN                                                    | `changelog.test.ts`                                    |

Tests : 5 specs ciblés verts ; `tsc --noEmit` de `apps/web` sans erreur.

## Non fait / à confirmer

- Diagnostic WebAssembly du PDF déduit de la CSP et de la dépendance, non reproduit en prod : à recetter sur la fiche Servier.
- THALES : si aucune offre n'a de dossier demandeur composé, la ligne reste absente (doctrine « on n'affiche pas ce qu'on n'a pas »). Prouvé par test avec donnée.
- Zéro contact : l'écran montre déjà son état vide, aucune raison ajoutée.
- Issues lues par REST (GraphQL bloqué).

## Recommandation

Si le PDF échoue encore en prod, lire la console : une autre directive (ex. `img-src` ou `connect-src`) serait en cause.
