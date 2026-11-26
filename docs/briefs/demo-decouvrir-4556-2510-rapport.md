# Rapport — DEMO-DECOUVRIR-4556 (#4556)

Branche `claude/demo-decouvrir-4556-2510` · commit point 3 : `8a40a47d` (le rapport est le commit suivant). Pas de PR.

| Point                                | Commit          | AVANT                            | APRÈS (lu par le test)                                                                                                                                                                           |
| ------------------------------------ | --------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 Liste Découvrir semée, ≥ 8 comptes | aucun (déjà là) | mesuré en prod : cartes absentes | `demoDiscoverResponse({})` rend 26 cartes dont 16 comptes RÉELS (BNP, SG, AXA, Airbus, Thales…) avec secteur + ville ; taille `null` jamais « 0 »                                                |
| 2 Levée + lien d'annonce             | aucun (déjà là) | —                                | Aubrac et Askelia (comptes « (démo) ») portent une levée avec URL `https://…example` ; AUCUN compte réel n'en porte                                                                              |
| 3 Dossier Occitanie                  | `8a40a47d`      | 0 « hors zone », aucun cadrage   | Airbus : run `region · Occitanie`; Maëlle Castan (Toulouse, en tête), Jonas Reimers (Nantes) et Inès Kerdraon (Saint-Nazaire) `hors zone (Occitanie)`, Anaïs Roussel `location` null non écartée |
| 4 Garde `demo-coverage`              | `8a40a47d`      | —                                | `DEMO_OCCITANIE_DOSSIER_COVERAGE` classée seedée ; rien déplacé vers « vide à dessein »                                                                                                          |

## Tests qui disent NON (`demo-occitanie-dossier-coverage.spec.ts`)

- cadrage Occitanie, contact en zone, contact hors zone, contact sans lieu : **rouge sur l'ancien code : oui** (4 rouges, module et données absents), verts ensuite.
- « sait dire NON » (hors zone jamais dans la zone) : vert d'emblée, c'est une garde de cohérence.
- Liste Découvrir ≥ 8 comptes réels, tailles jamais « 0 », levée avec lien : **rouge sur l'ancien code : NON** — déjà verts, la liste existait ; ils verrouillent l'existant.

## Contrôles

- `tsc --noEmit` : 3 erreurs, toutes `@bellum/email` introuvable (paquet non construit sur la VM), aucune dans le diff.
- `jest src/modules/demo` : 419 suites, 1 rouge (`demo-seed.service.spec.ts`, #2165.38 : « tout contact porte un lieu … France »). Corrigé : exception explicite pour le lieu inconnu posé à dessein, relance verte (147/147). Le projet utilise Jest, pas vitest.

## Limites / non fait — à trancher

- **« Visible sans cliquer Explorer »** : non fait. `/discover` s'ouvre volontairement SANS requête (#4493.7) ; changer l'arrivée est un changement web, hors du périmètre du semis.
- **« Reprendre » / « Albi · 250 à 999 »** : il n'existe PAS de table de résultats de recherche ; « Reprendre » relit le localStorage du navigateur (`readLastSearch`) et rejoue la requête vers la liste scriptée, qui rend déjà 26 cartes pour `city`. Un « zéro carte » vient donc d'un filtre côté web (taille 250–999 ?) ; à reproduire dans Chrome.
- **Levée sur un compte RÉEL** : non fait. Poser une levée de fonds sur BNP/Airbus/etc. serait une donnée inventée (règle 2 de `demo-discover-real-companies.ts`, « JAMAIS de donnée fictive »). Le lien existe sur les comptes « (démo) » (domaine `.example`). Décision Louis requise.
- Trois interlocuteurs ajoutés sont fictifs (« (démo) ») : un lieu de travail n'est pas posé sur une personne réelle.
- Chrome : vérifier l'onglet Contacts d'Airbus (zone d'abord, motif lisible) — le web ne lit aujourd'hui que les motifs « hors site » et « Hors du périmètre… » (`geoExcluded.ts`), pas « hors zone » : l'avis sur le bandeau est à confirmer à l'écran. Le contact au lieu inconnu est masqué par le filtre pays de Découvrir (#2621.1), pas de l'onglet Contacts.
