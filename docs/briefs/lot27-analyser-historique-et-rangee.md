# Lot 27 — Analyser · historique et rangée en cours (#4760, #4598, #4741)

Périmètre : apps/api/src/modules/accounts/accounts.service*.ts, apps/api/src/modules/analysis/analysis.persistence.ts, apps/api/src/modules/analysis/analysis.worker.ts, apps/api/src/modules/analysis/historical-needs-wiring-4760.spec.ts, apps/api/src/modules/demo/demo-dataset.ts, apps/api/src/modules/demo/demo-analysed-accounts.spec.ts, apps/web/src/features/accounts/view/account-detail/tabs/sections/CompanyPublicDataSection*.tsx, apps/web/src/i18n/locales/fr/accountDetail.json, apps/web/src/i18n/locales/en/accountDetail.json, packages/contracts/src/schemas/signal-layers-reader.ts, packages/contracts/src/schemas/signal-layers-reader.test.ts, packages/contracts/src/schemas/analysis/account-analysis.ts, apps/ia/app/services/site_credit_partners.py, apps/ia/tests/test_site_credit_partners.py, docs/briefs/lot27-\*.md

## Ce qu'on fait

- **#4760** : le dossier NOMME les besoins de plus de 180 jours. `recordHistoricalNeeds` ne journalisait qu'un compte
  (commentaire de recette du 29/10). Il écrit maintenant `raw_analysis.historical_needs` (label + date réelle), la fiche
  compte le rend (`HistoricalNeedsCard`), la démo le sème (Thales, Airbus, Renault ; EDF n'en a pas → aucune ligne),
  et une garde porte sur le DOSSIER (web + démo + câblage worker→persistance→SQL). Garde #4760, #4757 (les offres
  anciennes gardent leur bloc `JobSignalsCard` : elles ne se répètent pas dans la nouvelle carte, GA-26).
- **#4598** : DÉJÀ LIVRÉ — preuve `Search.tsx:677` (`isAnalyzing || planInFlight ? null : <AnalyzeModeTabs/>`), tests
  `Search.analyzingModes.test.tsx`, commit ebc5a2f9 (#4598.7). Rien recodé. Garde #4542 (renversé, écrit dans AnalyzeChrome.tsx).
- **#4741** (tranche) : « inconnue » est un état NOMMÉ dans la preuve du prestataire (`Activité non établie…`) au lieu d'un
  silence. Garde #4741, #4740.

## Ce qu'on ne fait pas

- #4741 reste OUVERTE : nature web/applicatif/infra/SI sur offres d'emploi du prestataire, communiqués, marchés publics,
  fiche du prestataire (taille, implantations), badge dédié à l'écran → exige une colonne (migration) sur `account_partners`
  ou une lecture directe d'`esnPresence`, et peut-être un fournisseur : arbitrage Louis.
- Aucune probabilité, aucun nouveau fournisseur, aucune migration, aucune fermeture d'issue.

Décisions touchées, nommées : garde #4537 et #4544 (ligne d'import lucide de CompanyPublicDataSection, une icône ajoutée) ; garde #4731, #4751, #4769 (`_evidence` de site_credit_partners : la branche « sans preuve » dit « activité non établie » au lieu de se taire) ; garde #4767 (import de types dans analysis.persistence, `HistoricalNeeds` ajouté).
