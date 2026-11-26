# Capacité « Marchés locaux » — plan (04/10/2026)

Demande de Louis (04/10) : les classeurs marché (Lyon-Suisse, Lille, Nantes-Saint-Nazaire) n'ont aucun porteur → « Bellum doit
aussi être capable de gérer ça, durablement dans le produit, pas que dans les démos ». Plan conçu sur origin/main 37a217e639 +
les 3 branches de briefs. Tracker du chantier : `agent_docs/demo-clients-2026-10-04.md`.

## 1. Antériorité — on ÉTEND, pas de moteur neuf

- **Territoire** : `packages/contracts/src/schemas/territory.ts` (offres IT, ESN présentes, débordement, marchés publics BOAMP/DECP),
  `apps/api/src/modules/esn-directory/territory.controller.ts:46` (`POST territory/overview` :68), `apps/ia/app/services/territory_overview.py`.
  Granularité département. Plus aucun écran web n'appelle overview (`apps/web/src/features/territory/api/territory-api.ts:9-16`) ;
  Laura le lit via `get_territory_overview` (`apps/ia/app/services/chat_tools.py:6420`).
- **Veille territoriale** `/pilotage/marche` (`MarketWatch.tsx`, `market-watch.controller.ts:46`, `territory_subscriptions`/`territory_snapshots`,
  `chantiers-livres.md:438`) : « ce qui a bougé », hebdo, managerOnly (`sections.ts:754-771`).
- **Mémoire marché** : comptages par entreprise, par doctrine SANS département/ville/personne (`market-company-signal.entity.ts`) →
  n'enrichit qu'un compte déjà situé dans la zone.
- **Brief commercial de compte** : contrat `commercial-brief.ts:114-131` (sous-schémas réutilisables, non exportés), stockage
  `accounts.raw_analysis.commercial_brief` (`commercial-brief.step.ts`), IA sans état `apps/ia/app/routers/commercial_brief.py`,
  rendu `TabCommercialBrief.tsx:59`, convertisseur `apps/api/src/scripts/commercial-brief/`.
- **Prix propres à l'espace** : `project_needs.seniority/target_tjm_cents/location`, `missions.daily_rate/role_title/location` —
  seules sources légitimes d'une grille pour un client payant (`chantiers-livres.md:388`).
- **Galaxie** : `accounts.group_head_siren` (Mulliez = association familiale, non détectable par SIREN).
- **Coût IA** : `packages/contracts/src/billing/credit-weights.ts:96`.

## 2. Modèle — contrat `MarketBrief` distinct

- `commercial-brief.ts` : `export` des 8 sous-schémas (kpi, what_i_know, chart, price, esn, person, section, guardrail).
- `packages/contracts/src/schemas/market-brief.ts` (`.strict()`) :
  `zone {label, scope:'france'|'suisse', departments[] (INSEE), cantons[], cities[]}` (raffinement : france ⇒ ≥1 département, 0 canton ;
  suisse ⇒ l'inverse — jamais FR + CH mêlés, cf. D4), `generated_at`, `kpis` (≤6), `what_i_know` (≥1), `charts`, `esn`
  (`evidence_level:'observed'`), `people` (sous-schéma person réutilisé — voir Q2), `sections`, `guardrails` (≥1), et propres au marché :
  `price_grid?` `{currency:'EUR'|'CHF', period, sample_size, source_kind:'observed_needs'|'own_needs_missions', top_client?, rows:[{family, needs, median, junior?/confirmed?/senior?:{amount,n}, range?}]}`,
  `price_trend?` `[{year, needs, median}]`, `clients[]`, `groups[]` (galaxies), `calendar[]`, `rules[]`.
- Contrôles `packages/contracts/src/market-brief/controls.ts` (`checkMarketBrief`) : SCOPE_MIXED, CURRENCY_SCOPE, PRICE_CELL_UNDERSAMPLED
  (n<3 ⇒ cellule ABSENTE, jamais 0), PRICE_GRID_CONCENTRATED_UNSAID (client >50 % de l'échantillon ⇒ garde-fou qui le nomme),
  COVERAGE_AS_MARKET (GA-259 : « parmi les profils observés »), PROBABILITY_WORDING, SUPPLIER_NAMED, aucun prix d'un autre espace (GA-43).
- Comptes de la zone calculés À LA LECTURE (`linked_accounts:[{account_id,name,match:'site'|'headquarters'|'named_in_brief'}]`).
- Miroirs : `packages/shared/schemas/market-brief.schema.json`, `apps/ia/app/contracts/schemas/` (`sync_schemas.py`), `apps/ia/app/models/market_brief.py`.

## 3. Stockage, API, IA, parcours

- Table `market_zones` scopée espace (id, workspace_id, slug, label, scope, departments, cantons, cities, brief jsonb, brief_origin
  seed|generated, brief_generated_at, brief_cost_usd, input_checksum, created_by, timestamps ; unique (workspace_id, slug) ; RLS lecture membres).
- Module NestJS indépendant `apps/api/src/modules/market-brief/` : `GET /market-zones`, `GET /market-zones/:id` (brief + linked_accounts +
  marchés publics lus en direct, france), `POST /market-zones` (≤10/espace, ≤6 départements), `POST /market-zones/:id/brief`, `DELETE`.
  Faits internes via la façade `account-intelligence` (garde single-facade).
- Génération (client payant) : l'API assemble faits publics du territoire + comptes de la zone (faits de leurs briefs, sans statut de
  prospection) + grille de prix DÉTERMINISTE (besoins/missions de l'espace, familles `role_families`, n≥3) + KPIs déterministes ;
  IA `POST /market-brief` n'écrit que le narratif ; 502 hors contrat, 503 sans clé, rien de journalisé ; `MARKET_BRIEF_ENABLED`, throttle,
  cache 7 j par checksum, 0 violation avant écriture ; ~0,15 $/appel ; `CreditedAction 'market_brief'`.
- Parcours (pas de 5e onglet mobile) : Comptes › « Marchés locaux » (`/accounts/marches`, `/accounts/marches/$zoneId`), outil Laura
  `read_market_brief`, puce « Marché local : Lille → » sur la fiche compte, renvoi depuis `/pilotage/marche`.

## 4. Écran

Extraction des blocs génériques de `TabCommercialBrief` vers `apps/web/src/features/brief-blocks/` (sans régression), + PriceGrid
(n par cellule, cellule absente si n<3, garde-fou de concentration collé), PriceTrend (« données jusqu'à 2024 »), MarketCalendar,
LocalRules, GroupGalaxy, ZoneClients, PublicTenders, LinkedAccounts, ZonePeople. Mobile 768 px, GA-31/33/34, i18n `marketBrief` FR+EN.

## 5. Démo — 4 zones depuis les 3 classeurs, 0 appel LLM

Convertisseur `apps/api/src/scripts/market-brief/` qui IMPORTE xlsx-grid/table/cockpit/text-rules ; sortie
`apps/api/src/modules/demo/data/market-briefs/*.json` ; semis dans `market_zones` ; sources `agent_docs/sources/briefs-comptes-2026-10-04/`.

| Zone                                    | Onglets → destination                                                                                                                                                                                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lille (59)                              | COCKPIT → kpis/charts ; CE QUE JE SAIS → what_i_know ; GRILLE DE PRIX → price_grid (« 435 € (n=16) », top_client ADEO) ; TENDANCE → price_trend ; GALAXIE MULLIEZ → groups ; CLIENTS → clients ; ESN → esn ; BESOINS, COMPTES STRUCTURES → sections ; EXTERNES → people (Q2) ; GARDE-FOUS → guardrails |
| Nantes–Saint-Nazaire (44)               | COCKPIT, CE QUE JE SAIS ; FILIERES → calendar + section ; ENTREPRISES DU BASSIN → clients ; ESN ET INGÉNIERIES → esn ; COMPTES STRUCTURES → section ; EXTERNES → people ; GARDE-FOUS                                                                                                                   |
| Lyon et axe Genève (69, 01, 38, 73, 74) | COCKPIT Lyon ; CLIENTS ; SECTEURS, COMPÉTENCES, COMPTES STRUCTURES, AXE LYON-GENÈVE → sections ; BESOINS → section (hors zone en `-non-retenus`) ; ESN ; ANCIENS SANOFI → porté par le brief Sanofi ; EXTERNES → people                                                                                |
| Suisse romande (GE, VD)                 | MARCHÉ SUISSE → what_i_know + sections (fourchettes CHF en texte) ; RÈGLES SUISSE → rules ; CIBLES ABB → déjà dans le brief ABB ; GARDE-FOUS répartis                                                                                                                                                  |

Couverture démo : `market_zones` seedée, purge demo-reset, spec `demo-market-brief-coverage.spec.ts` (Lille → ADEO, Kiabi ; Nantes → Naval,
Chantiers ; Lyon → Sanofi ; Suisse → ABB).

## 6. Lots

- **L0 Contrat** (25 pts, seul, d'abord) : exports commercial-brief, market-brief.ts + test, controls + test, index, credit-weights + test, 2 JSON Schema, pydantic.
- **L1 API stockage + lecture** (35, après L0) : migration `market_zones` + spec, entité, module market-brief (controller, service, zone-accounts, price-grid + specs), app.module, table-scopes, demo-reset.
- **L2 IA** (30, après L0, ∥ L1) : router, prompt, tests, golden, model_policy.
- **L3 Génération branchée** (25, après L1+L2) : ia.client, endpoint, crédits, cache, throttle, `MARKET_BRIEF_ENABLED` dans env-reference.
- **L4a Web blocs** (30, après L0, ∥) : brief-blocks + TabCommercialBrief + composants marché + tests.
- **L4b Web parcours** (30, après L1+L4a) : routes, sections.ts, route-titles, vue + API, puce fiche compte, renvoi MarketWatch, i18n, changelog FR+EN.
- **L5 Démo** (35, après L0+L1 et fusion des briefs) : convertisseur marché + specs, JSON, seed, demo-coverage, spec couverture, knip.
- **L6 Laura** (20, après L1) : `read_market_brief`, bellum_api, rights_matrix, carte d'outil, pytest, parité démo.

Gardes : shared-tables-declared, migration-columns-declared, migration-neuve-est-la-plus-grande, demo-reset/demo-coverage,
account-intelligence-single-facade, market-memory-\*, never-creates-urgency, GA-43, GA-259, GA-18/19, GA-28/29/30, GA-31, GA-33, GA-34,
unicité des routes, territory-indicators-lead-somewhere, parité i18n, knip.

## 7. Questions / décisions

Voir le tracker (D5+). Recos tranchées sans Louis : Lyon-Suisse scindé en deux zones (D4) ; départements/cantons + libellé, ≤10 zones,
≤6 départements ; pas d'enrichissement web en v1 ; règles suisses = contenu du brief démo (pas de pack produit sans relecture juridique) ;
galaxies via `group_head_siren` en v1 ; libellé « Marchés locaux » / « Local markets ».
