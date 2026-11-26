# Lot 630 — Divers 3/3 (#4833, #4837, #4845, #4873, #4886 ; #4869 et #4875 non livrés)

Périmètre : `apps/web/src/lib/api-error.ts`, `apps/web/src/features/consultants/view/detail/TalentFieldGroup.tsx`, `apps/web/src/features/accounts/model/accountsSearch.ts`, `apps/web/src/features/accounts/view/account-detail/tabs/veille/SignalPrograms.tsx`, `apps/web/src/i18n/locales/*/consultants.json`, `packages/contracts/src/schemas/segment-catchup.ts`, `apps/api/src/modules/demo/demo-dataset.ts`, `apps/web/src/test/jobs-sans-succes.test.ts`, `tools/ci/jobs-sans-succes.mjs`, `tools/ci/jobs-sans-succes.d.mts`, `apps/api/src/modules/demo/demo-signals-stale-collection-coverage.spec.ts`

## Ce que le lot fait

- #4886 : le schéma d'URL de /accounts accepte `canceled` (l'API le filtre) — « Voir les échecs » garde son axe.
- #4837 : #4754 inscrit à `SEGMENT_CAPABILITY_HISTORY.signals` (at = fusion réelle #4764) ; témoins de collecte fraîche (SNCF démo, tests web) datés après.
- #4833 : `extractError` nomme champ et règle d'un « Validation failed » ; la fiche talent dit quand le refus vient d'un autre champ.
- #4845 : le CTA « Programmes » annule ses défilements différés (cause du rouge sans test rouge).
- #4873 : script de routine `tools/ci/jobs-sans-succes.mjs` + test.

## Ce que le lot ne fait pas

- #4869 : exige `.github/workflows/ci.yml` (jeton sans scope `workflow`) ; et deux arbitrages ouverts (28 min ou sharder).
- #4845 point 3 (la CI nomme `Errors: N error`) : workflow, même blocage.
- #4875 : arbitrage de produit (le cadrage refuse l'incertitude sur une clé exigée, ou la porte l'accepte).
- #4833 : la cause exacte du refus sur la fiche 988e4220 n'est pas mesurée (corps du 400 non lu).
- Ne défait aucune décision ; décisions touchées nommées : #4402.1 (fiche talent inline, gardée), #4391 (défilement du CTA Programmes, gardé : même cible, mêmes délais), #4463 et #4503 (gardés), #4498.a (oneOrMany, gardé), #4437.5 et #4398.2 (entrées signals, gardées), #3922.3 (gardé).
