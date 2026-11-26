# Rapport — CASCADE-ECRAN (25/10/2026)

Branche `claude/cascade-ecran-2510` (base `claude/cascade-plancher-5-2510`, 5db74cc4c6). Pas de PR. SHA : voir `git log` (commit unique « feat(web): cascade d'offres à l'écran »).

## Points → fichiers → AVANT → APRÈS

| Point                  | Fichier                                                                                                                            | AVANT                         | APRÈS (lu par le test)                                                                                                                                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contrat                | `packages/contracts/src/schemas/offers-cascade.ts` (+ test)                                                                        | aucun type de `offersCascade` | 6 tests verts : lecture null si absent/illisible, palier atteint = dernier « tenté », plancher atteint au palier 0 → aucune vue, `found` 0 → `null`                                                                                                                 |
| Texte « Recrutements » | `tabs/veille/OffersCascadeNotice.tsx`, câblé dans `TabSignal.tsx` (filtres Tous / Recrutements) ; i18n `accountWatch.json` fr + en | rien à l'écran                | test 1 : le texte nomme le palier (« intitulés voisins ») ; test 2 : cascade non déclenchée → `textContent` vide ; test 3 : « 3 offres du métier » + « hors métier » ; test 4 : aucune offre → « Aucune offre du métier », jamais « 0 » ; test 5 : version anglaise |
| Démo                   | `demo-dataset.ts` (SNCF), `demo-coverage.ts` (note), `demo-coverage.spec.ts`                                                       | clé absente                   | un dossier porte une cascade lisible par l'écran (spec vert, 5 tests ciblés)                                                                                                                                                                                        |

Rouge avant : le test web échouait sur « Failed to resolve import ./OffersCascadeNotice » (constaté). Le test contrat a été écrit avec le module dans la foulée : je n'ai PAS observé son rouge séparément.

## Classement démo retenu : SEEDÉE (SNCF)

Cascade déclenchée, 2 paliers tentés (sources, intitulés voisins), plancher atteint avec 6 offres ; SNCF porte déjà 8 signaux `recrutement`, donc 6 ≤ 8 reste cohérent avec la liste. Rien n'est « vide à dessein ». `offersCascade` n'étant pas une clé de `accountAnalysisSchema`, la garde des clés ne la voit pas : `demo-coverage.spec.ts` la tient à sa place.

## Contrôles

`tsc --noEmit` web : 0. Vitest ciblés : OffersCascadeNotice + TabSignal.layout (6), gardes i18n/architecture (8 + 294), contrats (6). Jest : `demo-coverage.spec.ts -t "cascade|contenu du dossier"` 5 verts. Prettier propre.

## Pas prouvé / à savoir

- Aucun rendu navigateur (pas de recette Chrome) ; la carte démo SNCF n'a pas été regardée à l'œil.
- Le nombre `found` de la démo est posé à la main, non recalculé sur la liste servie (le profil de métier décide ce qui est « du métier »).
- Le payload ne porte pas de code pour `reason` (texte libre FR) : l'écran ne s'en sert pas. Si on veut distinguer « plafond d'appels payés atteint » du « sous le plancher », il faut un code côté moteur.
- Le payload n'est écrit que si `belowFloor` ou `explicit` : un compte antérieur au moteur n'a pas la clé → aucune ligne (voulu).
- Jest complet de `demo/` et suites web complètes non lancés (CI).
