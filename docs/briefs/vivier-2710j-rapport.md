# Rapport — lot VIVIER (#4500, #4594) — 27/10/2026, branche `claude/vivier-2710j`, pas de PR

**Constat : rien à coder, tout est déjà sur `origin/main` (390bf0ef).** Aucun code modifié ; ce fichier est le seul ajout.

## #4500

- `#4500.4` Liste maquette lisible — **déjà livré**, non rouvert : cinq encarts, bandeau « 0 sur 9 », bandeau « CV lus avant le correctif » retirés (00a015cc, 97bc26e5) ; recherche + modale « Filtrer mon vivier » ; 5 colonnes ; pastille « 86 /100 · 3 axes sur 4 » ouvrable (25/10, `talents-vivier-4500-2510-rapport.md`). Specs relancées, vertes : `ConsultantsPage.theo`, `TalentFilterDialog` (parité de l'ancienne barre : test l.326), `VivierTableRow` — 67 tests verts avec `fit-suggestion-chips`.
- Le périmètre du brief dit `features/talents/**` : ce dossier n'existe pas, l'écran vit dans `features/consultants/**`. Je n'y ai rien touché.
- Questions pour Louis (présent aujourd'hui, absent de la maquette V22, jamais supprimé en silence) :
  1. Compétences : la maquette les écrit en une ligne « A · B · C » ; le code rend des pastilles qui passent à la ligne (choix du 25/10) alors que `e2e/tests/web/vivier-table-layout.spec.ts:429-435` exige UNE ligne — les deux se contredisent (spec rouge sur main). Arbitrage requis.
  2. Bandeau positif de la maquette « 3 CV lus cette semaine : 3 fiches qualifiées » : absent du code (≠ bandeau « avant le correctif », supprimé par décision). À confirmer : l'ajouter ?
  3. Gardés hors maquette : menu « ⋯ » étendu, panneau « Rapprochement par besoin », « Afficher N », pastilles de filtres actifs.
- Non mesuré : « chaque écran mesuré dans Chrome » (prod/démo) — pas de backend ni session ici.

## #4594

- Déjà corrigé en 26/10 (38e9fc6e) : `fit-suggestion-chips.ts` (`countWholeChips` + `useFittedChipCount`, largeur réelle, `hidden` pour les pastilles qui ne tiennent pas entières) ; « Voir tout » `shrink-0` hors du défilement.
- `#4594.2` (390 px) : **NON MESURÉ** — pas de navigateur 390 px sur /chat authentifié ici ; jsdom n'a pas de mise en page ; je ne le simule pas. Reste ouvert.
- `#4594.3` (mesure avant/après en px dans Chrome) : **NON MESURÉ**, pour la même raison (/chat exige une session). Reste ouvert ; à faire en recette Chrome sur la version déployée (attendu : dernière pastille entière, « Voir tout » à droite).
