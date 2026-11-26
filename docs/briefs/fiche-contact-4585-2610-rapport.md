# Fiche contact — « Rôle & périmètre » en un seul bloc (#4585, grille #4523)

Décision Louis 26/10 appliquée : voie 1, UN bloc pleine largeur ; renommage du pli écarté.

- `ContactRoleBlock` (nouveau) : section `contact-role`, titre unique `roleScope.title`, trois cartes côte à côte
  (`lg:grid-cols-[1fr_1.4fr_1fr]`) : séniorité/secteur/périmètre/budget · priorité par axes · utilité commerciale.
- `ContactRoleScope` : prop `bare` (sans carte ni titre) — le titre en double disparaît à la source.
- `ContactDetail.tsx` : carte et pli `contact-fold-role` retirés de la colonne gauche ; le bloc ouvre les rangées pleine
  largeur (avant « Prochaines actions »). `ANCHOR_FOLD` vide, clé de pli `role` supprimée, `folds.role` retirée (fr/en).
- Ancre `SCORE_BREAKDOWN_ID` : toujours montée (plus de pli) ; `goToScore` y mène. Anciens `?tab=role|score|scoring|perimetre`
  → ancres `contact-role` / `contact-score-breakdown`.
- 6 axes conservés ; non évaluables nommés (« non évaluable »), jamais « 0 » (test).
- Garde `ContactDetail.layout.test.ts` mise à jour (#4585 + #2610) : elle attendait le pli à gauche, attend son absence.
- Tests : ContactRoleBlock (3), layout (12), ContactDetail (14), contactDetailTabs (9), ContactRoleScope (7) verts.

## Pas fait

- Aucune mesure en px rendue ni capture Chrome 1280/clair-sombre (pas de navigateur/prod ici) : à faire en recette.
- Pas de grille #4523 supplémentaire (la colonne gauche garde Informations clés ; la grille avait déjà des rangées).
- Démo : aucune donnée nouvelle (mêmes données qu'avant, seul l'emplacement change).
- Suite complète / check-types racine : CI.
