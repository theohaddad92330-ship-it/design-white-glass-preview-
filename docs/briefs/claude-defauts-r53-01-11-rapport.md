# Rapport — défauts r53 (01/11)

Branche `claude/defauts-r53-01-11`.

- #2164.29/.30/.34/.38/.39 — fait (606217ce) : `AccountKnowledgeScreen` monte « Ce que je ferais maintenant », `AccountChangesCard` (nouveau / déjà connu) et `RefreshOutcomeCard` quand un brief existe ; `TabOverview`/`BellumReadCard` ne les redisent pas (`refreshLifted`, GA-26). Test rouge→vert (+NON sans brief). Démo : `last_refresh` déjà semé (demo-dataset.ts), rien à ajouter.
- #2157.17 — fait (e5020615) : la fiche retirée se nomme parmi les écartées (« retirée de l’aperçu », FR/EN). Le répertoire passait déjà `excluded` (désinscrits) ; le trou était le retrait par ligne. Test rouge→vert (+NON).
- #2408.40 — fait : toute colonne de `MissionsTable` réserve un `w-` (Statut, etc.) ; la table déborde, son conteneur défile (`overflow-x-auto`). Test rouge→vert.
- Fragment `changes/defauts-r53-01-11.yml`. Aucun test web nouveau fichier : pas de `classer-tests-node`.
- tsc --noEmit (apps/web) vert. Non fait : `pnpm ci:local` ; mesure réelle 1221/1440 px (jsdom ne met rien en page).
- SHA de tête : 5dbadf8b (ce rapport inclus dans le commit suivant)
