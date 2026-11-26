# Rapport lot I (#4982, #4989, #4987) — PARTIEL

- Branche `claude/lot-4962-i`, SHA fonctionnel `ed4e175d` (poussé).
- **#4989.1 livré** `ed4e175d` : filtre « Zone » (villes + départements des sièges) dans la modale du portefeuille — `apps/web/src/features/accounts/lib/portfolioFilters.ts` (`portfolioZoneOptions`, `accountInZone`), branché `AccountContent.tsx` (visibleAccounts, zoneFilter) et `AccountsFiltersDialog.tsx` ; i18n fr+en (`filters.zone`, `filtersDialog.zoneNote`). Jugé sur les lignes CHARGÉES (même limite assumée que type de compte) ; un siège inconnu sort dès qu'une zone est choisie.
- **#4989.2 partiel** : `accountInZone` accepte déjà `sites` (testé), mais la ligne compte n'expose aucune implantation (#5008 OPEN) ⇒ siège seul, et la modale le DIT (`zoneNote`). À brancher quand #5008 expose les sites sur la ligne.
- **#4982.1, #4982.2, #4987.1-.3 NON FAITS** : chaque point exige contrat + API + route/état web + semis démo (tri « zone » côté serveur paginé dans `contacts.service.ts` ~3464 ; contacts d'ESN rang 2 = nouvelle lecture API + onglet partenaires). Trop large pour un lot ciblé sans exécuter les suites API ; mieux vaut un lot dédié. #4982.3 : rattaché à #4794, rien à faire.
- Tests : `vitest run portfolioFilters.test.ts AccountsFiltersDialog.test.tsx` → rouge (fonctions absentes) puis vert 28/28 ; gardes `aucune-source-ne-se-nomme…`, `dialog-close-label…`, i18n → 22/22 ; `tsc -p apps/web --noEmit` → 0 erreur.
- Démo/coverage : non touché (le filtre ne montre aucune donnée neuve).
- Hors périmètre : aucun. Brief reformaté par prettier (hook pre-push), inclus dans le push.
- Questions : (1) #4982.1 : tri « zone » en SQL (CASE sur la zone du profil) ou sur la page chargée ? (2) pour #4987, y a-t-il déjà un endpoint `contacts?account_id=` réutilisable par ESN rang 2 ?
- Note : `GARDE_PORTE_PUSH=0` refusé par le classifieur ; push passé via le hook normal.
