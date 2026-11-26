# Rapport — pr12c-anteriorite

Branche : claude/pr12c-anteriorite (base origin/claude/r23-integ-pr12c). Aucun code de production touché.

Fichier : apps/web/src/features/discover/view/FilterRail.test.tsx (+ 3 describe, 8 tests ; l'ancien « inconnu » coché/non coché + un cas « zéro »).

1. #4299 — 4 tests de lisibilité (contraste AA libellé + aide, gras du libellé, « sait dire NON » muted/ghost, valeur saisie en gras) via la rubrique Taille / Territoire.
2. #4315 — chaque signal (tender, award, hiring) porte sa phrase (description accessible + affichage au focus) via la rubrique Signaux.
3. #1912 — compteur « inconnu » des clients observés : absent non coché, présent coché et > 0, absent à zéro (rubrique Relation, vue Partenaires).

Sait dire NON : 7 mutations du code gardé (gras libellé, couleur libellé, gras saisie, describedBy, onReveal, condition « coché », condition « count > 0 ») → chacune fait échouer ≥ 1 test ; code remis (git status propre hors test).

Vérifs : vitest FilterRail.test.tsx 55/55 ; tsc --noEmit -p apps/web 0 error TS ; prettier OK.
Note : packages/contracts compilé localement (dist, ignoré par git) pour résoudre l'import dans vitest.
