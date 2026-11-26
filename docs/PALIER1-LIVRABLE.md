# Palier 1 — Livrable de fin de palier

**Statut : ✅ 100 % livré + largement dépassé.**
Branche `palier1` → PR **#276** (CI verte : Build · Types · Format · Lint · Test API · Test IA).
StepA déjà mergé sur `main` ; StepB + StepC + tous les gates de versement + le dépassement sont dans #276.

Tests à date : **API 236** · **IA 360** · **contracts 131** · **@bellum/shared 4** · **dashboard 4** · knip ✓.
Validé en réel : **e2e sur 5 entreprises** (Société Générale, Doctolib, Crédit Agricole, Bpifrance, OVHcloud) → 5/5 en 200, filtre d'entités OK, confiance calculée, preuves sourcées, mode dégradé encaissé.

---

## Lot A — Débloquer ✅

| #      | Objectif                                            | Livré | Preuve (code)                                                                                                | Test                                                 |
| ------ | --------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| **A1** | Réparer le 500 (filiales en objets + check protégé) | ✅    | `Subsidiary._coerce` (objet\|string) `app/models/outputs/research.py` ; optional-chaining                    | `test_phase1_research_200_with_pappers_subsidiaries` |
| **A2** | Brancher l'onglet Plan sur la Phase 4               | ✅    | `applyPlan` (merge JSONB) `accounts.service.ts` ; rendu **« Plan d'action »** dashboard                      | `analysis.persistence`, dashboard detail             |
| **A3** | Tests en CI dès J1 + garde-fou « pas de page vide » | ✅    | jobs CI Build/Types/Format/Lint/Test API/Test IA ; erreurs structurées (jamais 500 brut) `app/main.py`       | suites complètes en CI                               |
| **A4** | Fiabilité file : arrêt propre + délais cohérents    | ✅    | `app.enableShutdownHooks()` `main.ts` ; `ANALYSIS_WORKER_OPTIONS` lockDuration ; `cancel.py` bounded cleanup | worker specs                                         |

**Fin de lot atteinte :** SG (boîte à filiales) va au bout, onglet Plan rempli, un déploiement pendant une analyse ne la casse plus.

---

## Lot B — Mesurer, sourcer, fiabiliser ✅

| #      | Objectif                                               | Livré | Preuve                                                                                                                                          | Test                                                          |
| ------ | ------------------------------------------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **B1** | Télémétrie coût bout-en-bout                           | ✅    | `_compute_cost` (haiku 1/5, opus 5/25) ; cost par phase sur `meta.token_usage` ; worker accumule → `api_cost_euros` ; `GET /internal/telemetry` | api/ia suites                                                 |
| **B2** | Figer le format (packages/shared + fixtures + test CI) | ✅    | **`@bellum/shared`** (JSON Schema research) + 2 fixtures (SG, Doctolib) + **test ajv**                                                          | `research-data.fixtures.test.ts`, `research.contract.test.ts` |
| **B3** | Citer ses sources sur les Faits                        | ✅    | `sources.py` : registry + citations dures (SIREN) + **evidence (extrait + date)**                                                               | `test_sources.py` (9)                                         |
| **B4** | Score de confiance calculé (pas demandé à l'IA)        | ✅    | `confidence.py` : couverture · ancrage SIREN · **extrait cité** · fraîcheur · complétude                                                        | `test_confidence.py` (8)                                      |
| **B5** | Mode dégradé sources (Firecrawl ne tue plus l'analyse) | ✅    | phase-1 try/except → `partial_success` + warning `firecrawl=down`                                                                               | `test_phase1_research_degrades_on_firecrawl_terminal_error`   |

**Fin de lot atteinte :** coût + temps réels par analyse ; format figé branchable Mattéo ; sources avec plan B ; chaque fait porte source + extrait + date + confiance.

---

## Lot C — Capitaliser, accélérer, piloter ✅

| #      | Objectif                                     | Livré | Preuve                                                                                                              | Test                          |
| ------ | -------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **C1** | Cache résultat (clé SIREN, <30j, par client) | ✅    | `findCompletedByUserAndCompany` + `CACHE_MAX_AGE_DAYS=30` ; short-circuit `analysis.service.ts:142` → réutilise, $0 | api cache tests               |
| **C2** | Fraîcheur + refresh ciblé (étape 1 seule)    | ✅    | `age_days` + `POST /analysis/:id/refresh` (re-run Phase 1) `analysis.controller.ts:83`                              | analysis-ondemand spec        |
| **C3** | Cache IA + réponses plus courtes             | ✅    | `cache_control: ephemeral` sur les system prompts `claude_service.py:136`                                           | `test_claude_service.py` (17) |
| **C4** | Paralléliser le plan (étape 4)               | ✅    | 6 sections en `asyncio.gather` `phase4_plan.py:124`                                                                 | `test_phase4_plan.py`         |
| **C5** | Dashboard monitoring + commande de démo      | ✅    | app **Next.js `dashboard-manager`** + **`pnpm demo`** (zéro infra)                                                  | `demo-server.test.mjs`        |

**Fin de lot atteinte :** re-lancer une boîte déjà analysée (même client, <30j) ≈ 0 $ ; tout lisible au dashboard ; démo par commande.

---

## VALEUR (Théo) ✅

Top-3 contacts avec ≥1 décideur IT (`decisionRole=TECHNICAL`), score, pourquoi, **1 message réel** — `getTopContacts` `analysis-telemetry.service.ts`, rendu dashboard (« ✓ décideur IT présent »).

---

## 🚀 Au-delà du palier (dépassement)

**Latence / parallélisation**

- **F1** — résolution SIREN sur les pages **déjà scrapées** (fini le double-scrape, ~45-90 s économisées + supprime un risque de wipeout 60 s).
- **F2** — Pappers tourne **concurremment** au scrape Firecrawl.
- **F4** — fallback contacts : 5 requêtes persona **en parallèle** (~5×).
- **F7** — Firecrawl `Semaphore` 3→5 (la limite locale bridait sous le throttle).
- Confirmé : phase-1 (3 prompts), phase-3 (batches), phase-4 (6 sections) déjà parallélisés.

**Résolution SIREN robuste** — quand la marque ≠ raison sociale (OVHcloud → OVH GROUPE SA), lecture du SIREN sur les **mentions légales** (Luhn-validé, **host-guardé** : jamais le SIREN d'une autre boîte). Prouvé en réel : OVHcloud → 424761419, 18 filiales, confiance 50→98.

**Vers le deck Skaizen**

- **Zones de chasse P1/P2/P3** déterministes sur les entités (« 14 entités · 4 priorités ») + `entityTierCounts`.
- **Tags de source** PUBLIC / HYPOTHÈSE par fait (deck p.6).
- **Filtre d'entités** : le graphe Pappers crache ~98 nœuds (SCI/holdings/GIE) → `meaningfulSubsidiaries` (SG : 98 → ~3 opérantes).

**Dashboard (bien au-delà du monitoring)**

- KPIs (taux de succès, durée moyenne) + **graphes** SVG zéro-dep (coût, statuts).
- **Audit par phase** — coût / temps / tokens / source-health par phase (« d'où viennent les infos »).
- Page **Contrat (Mattéo)** (JSON Schema lisible), **console API** (tester des requêtes), page **Démo**, **registry des sources**, **Lancer une analyse** (une phase ou le pipeline complet).

**Contrat enrichi** — `@bellum/shared` documente `priorityTier`, `priorityRank`, `entityTierCounts`, `sources.{evidence,tags}` ; fixtures SG/Doctolib alignées sur le deck.

---

## Exemples concrets (réels)

**Société Générale** — SIREN 552120222 · 98 filiales → 3 opérantes (26 SCI/holdings filtrées) · 14 entités tierées (4 P1 / 6 P2 / 4 P3) · confiance 100/high · 5 faits sourcés (extrait+date) · ~$0.40 phase-1.

**OVHcloud** — marque ≠ raison sociale → SIREN résolu via mentions légales → 424761419 · 18 filiales · confiance 98/high (était 50/medium sans SIREN).

**e2e 5/5** — SG, Doctolib, Crédit Agricole, Bpifrance, OVHcloud : 200, filtre OK (SG 26 / CA 14 / Bpi 7 noise retirés ; Doctolib & OVH 0 = pas de faux positif), confiance calculée, mode dégradé Firecrawl encaissé.

---

## Comment vérifier

```bash
# tests
cd apps/api && npx jest                      # 236
cd apps/ia && pytest -q                       # 360
cd packages/contracts && npx vitest run       # 131
pnpm --filter @bellum/shared test             # 4
pnpm --filter @bellum/dashboard-manager test  # 4
pnpm lint:exports:types                        # knip

# démo (zéro infra)
pnpm --filter @bellum/dashboard-manager demo   # http://localhost:3005

# analyse réelle depuis le dashboard
#   onglet « Lancer une analyse » → entreprise + portée (une phase ou 1→4)
```
