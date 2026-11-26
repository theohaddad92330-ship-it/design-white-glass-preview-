# Lot 88 — Fiche compte · P1 (#4802)

Périmètre : packages/contracts/src/schemas/access.ts, packages/contracts/src/schemas/access.test.ts, packages/contracts/src/schemas/community-facts.ts, apps/api/src/migrations/1796584275703-AccessFactsWidenKindAccessStatus.ts, apps/api/src/modules/account-access/account-access.service.ts, apps/api/src/modules/contacts/contacts.service.ts, apps/api/src/modules/contacts/contacts.service.spec.ts, apps/api/src/modules/demo/demo-seed.service.ts, apps/web/src/features/accounts/view/account-detail/tabs/TabAccess.tsx, apps/web/src/features/accounts/view/account-detail/tabs/TabAccess.accessStatus.test.tsx, apps/web/src/i18n/locales/en/access.json, apps/web/src/i18n/locales/fr/access.json

## Diagnostic (l'APPELANT)

`access_referenced` / `access_to_build` sont posés par `applyAccessStatus` (#4271), appelé via `loadAccessStatus(es)` qui ne lit que des faits CALCULÉS (`account_partners` rang 1, `account_entities.rank1_incumbent`). Aucune écriture humaine n'existait : l'état était inatteignable depuis l'écran.

## Ce que fait le lot

1. Nouvelle nature de fait `access_status` (inconnu · referenced · to_build) dans `access_facts` — CHECK élargi par migration AVANT le code (GA-11/12). Valeur validée par le contrat.
2. `AccessLandscape.accessStatus` (null tant que rien n'est posé) ; geste à trois boutons sur l'onglet Accès, via le POST `:id/access` existant (même droit `records:write`, aucune route ni garde neuve).
3. `loadAccessStatus` / `loadAccessStatuses` : l'état posé à la main PRIME sur le calcul, sans péremption (« une correction humaine gagne toujours ») ; « inconnu » posé = ordre inchangé. Réordonne, ne filtre pas (c76) — prouvé par test (mêmes contacts, deux ordres).
4. Démo : état posé sur BPCE (référencé) et sur le compte à bâtir (`DEMO_PERSONAL_ACCESS_EXTRA_SEEDS`) ; `access_facts` déjà classée seedée dans demo-coverage.
5. Famille : `access_status` classé non agrégeable en communauté (lecture privée à l'espace).

## Ce que le lot ne fait pas / ne défait pas

- Ne touche pas au calcul existant (rang 1 / incumbent) ni à `applyAccessStatus`. Ne défait aucune décision.
- #4565 : gardé — l'intégration VI a posé ces lignes de `contacts.service.ts`; seule la docblock/lecture de `loadAccessStatus` s'étend, rien n'est défait.
- #4271 et #4292.11 : gardés (même priorité, mêmes loaders).
- N'ajoute aucune probabilité, aucun « 0 » : absence = « Accès inconnu », inchangé.
- Ne fusionne pas, ne ferme aucune issue. Points #4292.9/.10 : à rejouer en recette après déploiement.
