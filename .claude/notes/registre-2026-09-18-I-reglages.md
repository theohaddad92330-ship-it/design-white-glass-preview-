# LOT I — les réglages que personne ne peut poser

base : 4de833423 — 18/09/2026
branche : feat/reglages-sans-ecran-18-09
commit livré : fa41cd203 (gates repassées vertes après coup, voir rapport)

| # | Demande | Zone | État | Preuve en recette |
|---|---|---|---|---|
| I.1 | Un endroit dans les réglages pour poser/modifier/remettre à « non réglé » le seuil de marge | `apps/web/src/features/settings/view/FinanceSettingsView.tsx`, `hooks/useMarginThreshold.ts`, `lib/margin-threshold-api.ts`, route `apps/web/src/routes/settings/finance.tsx`, nav `components/sidebar/items.settings.ts` | **Livré** | Ouvrir Réglages › Seuil de marge (rôle `finance`/`admin`/`owner`) : formulaire pré-rempli, `Enregistrer` appelle `PATCH /delivery/finance/margin-threshold` (test `FinanceSettingsView.test.tsx:59-89`), `Remettre à « non réglé »` envoie `{thresholdPercent: null}` (test ligne 92-108). Lecture par `GET /delivery/finance/margin` — la MÊME route que `/pilotage/finance`, aucune route dupliquée (`margin-threshold-api.ts:1-27`). |
| I.2 | « non réglé » reste un inconnu NOMMÉ, jamais `0` ni un défaut inventé | `FinanceSettingsView.tsx:119-125` | **Livré** | `value === null` → `<UnknownValue reason={t('notSet')}>` (« aucune alerte ne se déclenche »), jamais `?? 0`. Test `FinanceSettingsView.test.tsx:44-51` vérifie l'absence de tout `0` affiché ou en `displayValue`. |
| I.3 | Permission reprise de l'API (`finance:write` pour régler), pas inventée ; sans droit on voit la valeur, pas le formulaire | `FinanceSettingsView.tsx:45-49` | **Livré** | `canRead = finance:read \|\| finance:read:own` (exactement ce que `GET margin` accepte déjà côté API) ; `canEdit = finance:write` (exactement `PATCH margin-threshold`). Testé : rôle `sales` (lecture seule) voit la valeur sans formulaire (test ligne 111-119) ; rôle `member` (aucun droit financier) voit un refus NOMMÉ (`ScreenState state="permission"`), sans appel réseau (test ligne 121-128). Aucun nouveau contrôle de permission inventé — pas d'arrêt nécessaire. |
| I.4 | Formulaire de fiche de BU (`capacityAvailableConsultants`, `quarterObjective`, + `consultantCount`/`teamSize`/`portfolioNote` préexistants non saisissables) appelant `PATCH /business-units/:id` | `apps/web/src/features/business-units/view/BusinessUnitAdminView.tsx`, `hooks/useBusinessUnitAdmin.ts`, `api.ts` (+`update`), route `apps/web/src/routes/settings/business-units.tsx`, nav | **Livré** | Les 5 champs éditables par BU active, pré-remplis (test `BusinessUnitAdminView.test.tsx:81-91`) ; `Enregistrer — <nom>` envoie `PATCH /business-units/:id` avec les 5 champs (test ligne 115-144). Permission reprise de l'API : `team:manage` pour écrire (comme `PATCH /business-units/:id`), lecture ouverte à tout membre comme `@WorkspaceRead()` (test ligne 146-155, rôle `sales`). |
| I.5 | Champ vide → `null` (jamais `?? 0`), affiché non mesuré avec le nom de ce qui manque | `BusinessUnitAdminView.tsx:230-252` (`FicheField`) | **Livré** | `toDraft(null) === ''` (jamais `'0'`) ; affichage `<UnknownValue reason={t('fields.unset')}>` sous le libellé du champ concerné. Test ligne 93-113 : BU « Équipe Nouvelles activités » (les 5 champs `null`) → aucun `displayValue('0')`, ≥1 occurrence de « non renseigné ». |
| I.6 | Semis démo (`demo-dataset.ts` + `demo-coverage.ts`) : un seuil réglé, une BU avec capacité renseignée, un cas volontairement vide classé avec sa raison | `apps/api/src/modules/demo/demo-dataset.ts` (+`DEMO_MARGIN_ALERT_THRESHOLD_PERCENT`), `demo-seed.service.ts` (+`seedMarginThreshold`) | **Livré, partiellement hors de ce lot** | Seuil de marge : NOUVEAU semis à 20 % sur l'espace de démo (`demo-seed.service.ts`, méthode `seedMarginThreshold`), testé par `demo-seed.service.spec.ts` (« règle le seuil d'alerte de marge… »). BU capacité/objectif : **déjà seedés par un lot antérieur (CP2, décision Louis 17/09)** — `DEMO_BUSINESS_UNITS` porte déjà « Agence Lyon » (capacité 5, objectif renseigné) et « Équipe Nouvelles activités » (les deux `null`, volontairement) ; je n'ai rien eu à ajouter là. `demo-coverage.ts` **non touché** : `workspaces.margin_alert_threshold_percent` est une COLONNE du workspace, pas une table `workspace_id`-scopée purgée — hors du périmètre que ce fichier classe (vérifié : `workspaces` n'y apparaît jamais, contrairement à `business_units` qui y est déjà classée SEEDÉE ligne ~473). Aucune garde CI ne l'exige pour cette colonne. |

## Gates — état à la fin (après le commit `fa41cd203`, toutes repassées après le plafond de tours)

- `tsc --noEmit -p apps/web/tsconfig.json` → vert
- `vitest run src/features/settings src/features/business-units` → 10 fichiers, 62 tests, vert
- `jest apps/api/src/modules/demo` → 75 suites, 1177 tests, vert
- `jest apps/api/src/architecture/product-screens-catalog-covers-routes.spec.ts` (GA-265) → vert (les 2 nouvelles routes `/settings/finance` et `/settings/business-units` sont cataloguées dans `packages/contracts/src/schemas/product-screens-catalog.ts`)
- `pnpm --filter @bellum/api check-types:tests` → vert
- `pnpm lint:exports:types` (knip) → vert
- `vitest run` sur `packages/contracts/src/schemas/product-screens-catalog.test.ts` → 19 tests, vert
- `prettier --list-different` sur les 22 fichiers touchés → aucun diff

## Ce qui reste ouvert

- Aucun point du lot n'est bloqué. `demo-coverage.ts` volontairement non modifié (raison ci-dessus, I.6).
- Le routeTree.gen.ts a été régénéré à la main (script Node appelant `@tanstack/router-generator`, `worktree-ready.sh` interdisant `pnpm build`) : à surveiller si un futur `pnpm build` le régénère différemment (ne devrait pas, mêmes routes).
