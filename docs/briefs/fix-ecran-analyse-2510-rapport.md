# Rapport — FIX-ÉCRAN-ANALYSE (#4541, #4542, #4543)

Branche `claude/fix-ecran-analyse-2510`, base `origin/main` (af76f469). Pas de PR.

## #4541 — barre « En cours » retirée

- `OngoingOperationsStrip` (+ test) supprimé, démontage dans `__root.tsx`, entrée retirée de la garde `Banner.test.tsx`.
- Clés i18n orphelines `analysis:operations.{analysisOf,analysisUnnamed,backToDossier,more_*}` retirées en fr et en (`operations.status.*` reste : `ImportWizard` s'en sert).
- Gardes remplaçantes : `routes/root-sans-barre-en-cours.test.ts` (la racine ne remonte pas la barre, rouge avant) ; `BackgroundTasksSheet.test.tsx` (« Voir ce qui est déjà trouvé » mène à `/accounts/<id analysé>` — le mock `Link` ignorait la destination) ; `BackgroundTasksIndicator.test.tsx` (rien ne tourne → ne rend rien, aucun « 0 »).
- Cheminement : pastille → tiroir « Ce qui tourne » → carte → lien vers le compte (un clic de plus que l'ancienne barre).

## #4542 — onglets écrasés

- Cause : `overflow-x-auto` ramène la hauteur minimale auto d'un enfant flex à 0 ; sans `shrink-0` la carte `flex-1` comprimait la rangée. Fix : `shrink-0` sur le tablist (`AnalyzeChrome.tsx`).
- Preuve Chromium (`docs/briefs/fix-ecran-analyse-2510-preuve-onglets.cjs`, maquette flex fidèle, barre de 40 px présente, hauteurs 900/768/500) : sans `shrink-0` 10 px, avec 54 px.
- Garde jsdom `AnalyzeModeTabs.test.tsx` (classe `shrink-0`, rouge avant ; cibles min-h-11).
- Limite : preuve sur maquette CSS, pas sur l'app rendue (pas de back/auth ici). Recette live à faire.

## #4543 — « Rien n'a été noté comme inconnu »

- Source unique des inconnues du brief : `raw_analysis.unknowns`. Vide, le bloc dit désormais « Aucune inconnue n'est renseignée… ce n'est pas la preuve qu'il n'y en a pas » (fr/en), plus d'affirmation de vide.
- Garde (`AccountBrief.test.tsx`) : synthèse nommant des inconnues + source vide → pas de « rien n'a été noté » (rouge avant) ; source renseignée → liste sans repli.
- Non fait : la phrase « achats et concurrence restent inconnus » est de la prose libre (`priority_justification`, non retrouvée en structuré). Je n'ai pas parsé la prose ni inventé d'inconnues : unifier réellement la source demande que l'analyse émette ces inconnues dans `unknowns` (hors périmètre moteur).

## Gates

vitest ciblé : brief, sidebar, search/components, routes, layout, i18n verts (paquets workspace `contracts/utils/errors/observable` construits localement pour que vitest résolve). `tsc --noEmit -p apps/web` : code 0, aucune erreur.
