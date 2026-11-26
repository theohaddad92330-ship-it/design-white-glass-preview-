# Rapport correctif CI — integration/vieilles-vague2-01-11 (run 41292084970)

SHA poussé (code) : 095e6e4087 ; le rapport est le commit suivant.

1. GA-33 RoutineDetailPage : FAIT. `text-destructive` est aussi refusé par la garde ; mis `text-[var(--danger-soft-text)]`. Garde intacte.
2. GA-34 AnalysisEntityQuestionCard : FAIT (cherry-pick 8140a408fb). 4ca31c50c5 NON repris : conflit, la tête a déjà `@RequirePermission('analysis:run')` ; endpoint-guards vert sans lui.
3. GA-251 CreateTargetListFromSelectionDialog : FAIT, 3 `<select>` → `SelectField` ; test du dialogue réécrit avec `chooseOption`.
4. migrations.spec : FAIT. 1796610000400 < max existant (1796610003098) → 1796610003100 ; classe, name, agent_docs, rapport L13 mis à jour.
5. Test (Web) (3) : vert dans le run. Rouges restants du run : Web 1/2/4 et API 1 (logs non relus un par un).
   Tests : jest migrations.spec + endpoint-guards 27/27 ; vitest type-scale, no-native-select, dialogue (16) verts ; theme-parity vert avant le dernier correctif (hors 2 échecs du dialogue, corrigés ensuite).
   Non fait : tsc -p apps/web inexploitable (dist contracts non construit, TS6305). Commits en fix(web|api) : le scope `ci` est refusé par commitlint.
