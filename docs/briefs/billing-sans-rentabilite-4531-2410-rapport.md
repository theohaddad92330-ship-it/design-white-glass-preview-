# Rapport — billing-sans-rentabilite (#4531, 24/10)

Branche `claude/billing-sans-rentabilite-2410`. Revient sur le calculateur de rentabilité (dossier du 26/08, point 34 ; 8b978267b8, 28/08).

- **#4531.1** `Billing.tsx` : deux onglets (Abonnement · Factures & paiement), `BillingTab` sans `'rentabilite'`. Test : deux onglets, aucun « Rentabilité » (rouge -> vert).
- **#4531.2** Supprimés : `ProfitabilityCalculator.tsx` + test, `model/profitability.ts` + test, bloc `profitability` et `tabs.profitability` de `billing.json` (fr, en). `git grep ProfitabilityCalculator\|computeProfitability apps/` vide. knip (`lint:exports:types`) vert.
- **#4531.3** `figma-sync` `billing.ts` : carte du calculateur et ses 3 notes retirées ; `completeness.test.ts` ajusté. `tests-node.generated.ts` et `test-durations.json` : lignes des fichiers supprimés retirées.
- **#4531.4** L'onglet ne vit pas dans l'URL (état local, `billingSearchSchema` sans `tab`) : `?tab=rentabilite` est ignoré et l'écran s'ouvre sur Abonnement. Test ajouté.

Intacts : `features/mission-tracking/**`, l'entrée de changelog `2026-08-28-calculateur-de-rentabilite`.

## Vérifié

tsc web 0 erreur ; `src/features/billing` + `src/i18n` : 1415 tests verts ; figma-sync `src/spec` : 227 verts ; knip vert.

## Écarts / à savoir

- `test-durations.json` : éditée à la main (2 lignes), son script exige un rapport vitest complet.
- `tests-node.generated.ts` : le script ajoute aussi 4 suites sans rapport (portfolioFilters, discover-framing, discover-overview, todayStale) ; non prises, hors périmètre — seule la ligne supprimée est retirée.
- `src/architecture` + `src/test` : 5 fichiers rouges en local, tous « Failed to resolve @bellum/utils » (paquet non construit sur la VM), sans lien avec le lot ; à confirmer par la CI.
- Scopes commitlint : `web` / `tooling`.
