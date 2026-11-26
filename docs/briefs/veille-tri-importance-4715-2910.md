# Lot 93 — Veille · P2 (#4715) : « Plus forts » devient « Plus importants »

Périmètre : apps/web/src/features/accounts/view/account-detail/tabs/veille/WatchFilters*.tsx, apps/web/src/features/accounts/model/watch.ts, apps/web/src/features/accounts/model/watchData.ts, apps/web/src/i18n/locales/*/accountWatch.json, docs/briefs/veille-tri-importance-4715-2910.md, apps/web/src/architecture/fiches-absence-is-not-zero.test.ts

## Diagnostic

Le tri lisait `signal.score ?? 0` ; aucun score numérique n'existe (ni modèle, ni contrat) : le tri réussissait sans rien trier.
Arbitrage : option 2 de l'issue (recommandée) — trier sur `signalImportance` (`high` actif et sourcé, `medium` actif sans source, `low` archivé), qui existe déjà.

## Ce qu'on fait

- `WatchSignal.importance` posé dans `normalizeSignal` par `signalImportance` (la règle partagée, pas une seconde dérivation).
- Tri `importance` : high → medium → low → sans importance (âge inconnu, jamais deviné), stable à égalité.
- Libellé fr « Plus importants », en « Most important » (clé `sortImportance`, `sortScore` retiré — ancien libellé « Highest potential » aussi).
- Test qui sait dire NON : entrée en ordre inverse, un `?? 0` échoue.

## Ce qu'on ne fait pas

- Aucun score numérique, aucune pondération par type (non décidé, non promis — doctrine « un score n'est jamais nu »).
- Pas de changement de contrat, d'API ni de démo : le dataset démo porte déjà des signaux sourcés ET archivés (Société Générale 7 dont 1 archive, SNCF 14 dont 1 archive), le tri y est donc visible.
- Aucune décision `#NNN` touchée par `git blame` sur les lignes modifiées (ligne 150 d'origine : aucune référence).
- garde #4565 (ligne d'import de `watch.ts`, seul l'import de `SignalImportance` s'y ajoute).
- Garde GA-18/19 étendue (`apps/web/src/architecture/fiches-absence-is-not-zero.test.ts`) : retrait de la dispense périmée « right.score ?? 0 », la ligne n'existe plus.
