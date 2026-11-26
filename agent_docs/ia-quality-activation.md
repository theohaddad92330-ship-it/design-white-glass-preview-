# IA v2 — axes ON par défaut, kill-switches break-glass & banc d'éval qualité

> Décision Louis (2026-07-16) : **politique zéro-flag**. Les 4 axes IA v2 —
> Judge anti-hallucination, LLM Gateway, Data Gateway, Grounding — sont **ON
> PAR DÉFAUT**, sans feature flag. Le seul contrôle restant est un
> kill-switch d'urgence par axe (break-glass), absent par défaut.
> Ce document est le rapport « v2 ON par défaut » : état de chaque axe,
> kill-switches, audit incident-428, résultats du banc d'éval, et la
> recommandation FIRECRAWL_MAX_PAGES.

## 1. État des 4 axes — TOUS déjà ON par défaut sur `main`

Constat d'audit : les 4 flags avaient déjà été **collapsés dans le produit**
sur `main` le 15/07 (avant cette mission). Aucun check de flag ne restait dans
le code — la politique zéro-flag était donc déjà appliquée ; cette PR ajoute ce
qui manquait (kill-switches break-glass + banc d'éval + audit).

| Axe                                     | Ce qu'il fait                                                                                                                                                                                                                                                                                                                | Où                                                                                                                                                        | ON depuis (commit) | Coût marginal                                                                                |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------- |
| **Judge** (ex-`JUDGE_V2`)               | Node de validation anti-hallucination APRÈS le plan : facts non sourcés, scores hors bornes, plan ciblant un contact absent, contacts placeholder. **Advisory** — flagge, ne bloque jamais.                                                                                                                                  | `app/graph/judge.py`, câblé `app/graph/builder.py` (node `phase_judge`)                                                                                   | `3650e069` (15/07) | **0** — déterministe, zéro appel Claude                                                      |
| **LLM Gateway** (ex-`LLM_GATEWAY_V2`)   | Tout `call_claude` route par `llm_gateway.complete` : résolution `{provider, model}` par tâche. Routage par défaut = Anthropic + modèle de l'appelant → **byte-identique** au chemin direct. Overrides réels : `LLM_GATEWAY_ROUTING` / `LLM_ROUTE_<TASK>` / `OPENAI_API_KEY`.                                                | `app/services/llm_gateway.py`, dispatch dans `claude_service.call_claude`                                                                                 | `b211f18d` (15/07) | **0** en routage par défaut (même appel Anthropic)                                           |
| **Data Gateway** (ex-`DATA_GATEWAY_V2`) | Waterfall de recherche web **Serper → Tavily → Brave** : hits ADDITIONNELS dédupliqués par URL, ajoutés APRÈS le cut [:20] du bloc Brave (jamais de source retirée). **Activation = présence de clé** : sans `SERPER_API_KEY`/`TAVILY_API_KEY`/`BRAVE_API_KEY`, provider skippé sans réseau ; sans aucune clé → no-op total. | `app/services/data_gateway.py`, câblé `phase1_research` (tâche lancée en parallèle du scrape — latence absorbée)                                          | `c0ae1429` (15/07) | ~0 latence (parallèle) ; coût = requêtes Serper/Tavily si clés posées                        |
| **Grounding** (ex-`GROUNDING_V2`)       | Passe Citations native distincte : `sourceRefs` **inhallucinables** par fait firmographique + KPI « <5 % de faits non sourcés ». Best-effort — `(None, None)` si rien à grounder, n'échoue jamais la recherche.                                                                                                              | `app/services/grounding_citations.ground_facts_v2`, câblé `phase1_research` (gather concurrent avec l'enrichissement vocabulaire — tail = max, pas somme) | `c0ae1429` (15/07) | ~1 appel Claude bounded (max_tokens 1200) par run, comptabilisé dans le token_usage de phase |

**Env à poser par Louis (Railway, service IA) pour donner des dents au Data
Gateway** : `SERPER_API_KEY` (Google SERP via serper.dev) et/ou
`TAVILY_API_KEY` (tavily.com). Sans elles le waterfall retombe sur la clé
Brave existante ; avec elles, Serper gagne en premier (SERP Google plus riche).
Rate-limit déjà en place (limiter partagé `serper`/`tavily`, 60 rpm / 5 concur.).

## 2. Kill-switches break-glass (cette PR)

Le SEUL contrôle restant — **absent par défaut, à ne poser qu'en incident** :

| Env (=true pour couper) | Effet                                                                                                                                       | Lecture                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `JUDGE_DISABLED`        | retire le node judge du graphe (plus d'event `judge_completed`)                                                                             | au build du graphe — effectif au run suivant (session Postgres) ; restart pour le graphe module-level |
| `LLM_GATEWAY_DISABLED`  | ignore TOUT routage (`LLM_GATEWAY_ROUTING`/`LLM_ROUTE_*`) → dispatch direct Anthropic + modèle appelant (chemin pré-gateway byte-identique) | à chaque appel (pas de restart)                                                                       |
| `DATA_GATEWAY_DISABLED` | `DataGateway.search()` → `[]` sans réseau (plus de hits additionnels)                                                                       | à chaque appel                                                                                        |
| `GROUNDING_DISABLED`    | `ground_facts_v2` → `(None, None)` sans appel Claude (plus de clé `grounding`/KPI)                                                          | à chaque appel                                                                                        |

Truthy = `1/true/yes/on` (insensible à la casse) ; absent/vide/toute autre
valeur = axe actif. Module : `apps/ia/app/services/kill_switch.py` ; documenté
dans `apps/ia/.env.example`. Un axe coupé **dégrade, ne casse jamais** — chaque
site d'appel tolère déjà la valeur vide correspondante. Couverture :
`tests/test_kill_switches.py` (26 tests : défaut ON / `=true` OFF / non-truthy
ON par axe + le param explicite `judge=True` gagne sur le switch).

## 3. Audit incident-428 (events graphe vs `graphEventSchema` du worker)

Rappel de l'incident : tout event émis par le graphe IA DOIT être déclaré dans
le `graphEventSchema` du worker NestJS, sinon `parse` jette sur la frame et
fait échouer un run pourtant terminé.

**Verdict : ✅ conforme.** Émetteurs (tous dans `app/graph/builder.py::stream_analysis_graph`) :

| Event émis (IA)                               | Déclaré worker (`apps/api/src/modules/ia/ia.client.ts`)  |
| --------------------------------------------- | -------------------------------------------------------- |
| `phase_completed`                             | ✅                                                       |
| `phase_skipped`                               | ✅                                                       |
| `phase_failed`                                | ✅                                                       |
| `judge_completed` (node judge, ON par défaut) | ✅ (avec commentaire explicite « MUST be in this enum ») |
| `run_completed`                               | ✅                                                       |
| `run_failed`                                  | ✅                                                       |
| `run_skipped` (gate no-go)                    | ✅                                                       |

Les autres axes (gateways, grounding) n'émettent **aucun** event graphe — ils
vivent à l'intérieur de la phase research / du chemin d'appel LLM. Avec
`JUDGE_DISABLED=true`, `judge_completed` n'est simplement plus émis (le schéma
worker le tolère : l'enum déclare, n'exige pas). `analysis.worker.ts` consomme
`data.judge` — vérifié présent.

## 4. Banc d'éval qualité (`python -m app.eval.run`)

Le juge de la qualité v2-ON : 8 métriques **déterministes** (réutilisent les
checks produit — jamais de logique parallèle), baseline committée, guard
contre-exemple. Voir `apps/ia/app/eval/README.md` pour le détail des métriques.

### Résultats (état committé — baseline `apps/ia/app/eval/baseline.json`)

| compte                        | faithfulness | coherence | completeness | contacts | plays | committee | freshness | no-fake | **aggregate** | verdict          |
| ----------------------------- | ------------ | --------- | ------------ | -------- | ----- | --------- | --------- | ------- | ------------- | ---------------- |
| doctolib                      | 1.00         | 1.00      | 1.00         | 1.00     | 1.00  | 0.40      | 0.00ⁱ     | 1.00    | **0.92**      | PASS             |
| societe-generale              | 1.00         | 1.00      | 1.00         | 1.00     | 0.50  | 0.40      | 0.00ⁱ     | 1.00    | **0.86**      | PASS             |
| hallucinated (contre-exemple) | 0.00         | 0.30      | 0.80         | 0.40     | 0.00  | 0.00      | 0.00ⁱ     | 0.00    | **0.19**      | FAIL (attendu ✓) |

ⁱ = informational : les fixtures gelées ne portent que des dates année-seule
(« 2025 », valeur réelle du fixture in-repo) → pas d'évidence datée parseable.
Sur un run réel, la métrique lit les vraies dates BODACC/France-Travail/news
(gate < 18 mois), épinglable par golden (`expect.freshnessAsOf`).

- **Régression** : `--check-baseline` = exit 1 sur toute baisse > 0.005 ou
  pass→fail (baseline régénérable UNIQUEMENT après changement intentionnel via
  `--update-baseline`).
- **Guard permanent** : le dossier halluciné (SIREN 000000000, marqueur
  « contoso », plan vers contact fantôme, play sans preuve) doit continuer
  d'ÉCHOUER — s'il passe, ce sont les détecteurs qui ont régressé (exit 1).
- **Goldens** : 2 comptes (Doctolib, Société Générale) — les SEULS avec une
  fixture research gelée in-repo (`packages/contracts/src/fixtures/`). Règle
  du banc : jamais de fixture inventée → on reste à 2 + le contre-exemple ;
  tout nouveau golden se dérive d'un run réel (`--live "X" --save x.json`
  puis fixture + `--update-baseline`).
- **Mesurer un run réel avant/après un changement** :
  `python -m app.eval.run --live "Doctolib" --save d.json` (clés API requises,
  jamais en CI).

Tests du banc lui-même : 55 (métriques bonnes/mauvaises, CLI, baseline,
guard) — hermétiques.

## 5. Recommandation FIRECRAWL_MAX_PAGES

Constantes code (vérifiées) : défaut **7** (`app/services/research/firecrawl.py`),
prod Railway bridé à **3** ; scrape **parallèle, concurrence 5**
(`_SCRAPE_CONCURRENCY`), timeout **25 s/page** (`PER_URL_TIMEOUT_S`), timeout
de phase **180 s** (`FIRECRAWL_TIMEOUT_S`) ; budget prompt par catégorie
**4500 chars** (`FIRECRAWL_CHARS_PER_CATEGORY`) ; cache des scrapes OK
(re-analyses amorties).

Le wall-time se compte en **vagues de 5 pages** (concurrence 5), chaque vague
≈ le temps de sa page la plus lente (multi-s, borné 25 s) :

| réglage                            | vagues | wall-time estimé (typ. → borne) | couverture                                                                      | effet confidence                                                                                         |
| ---------------------------------- | ------ | ------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 3 (prod actuel)                    | 1      | ~5–25 s                         | top-3 par priorité — presse/officiel seulement, catégories entières « skipped » | axe technique dégradé : `fc_ratio = 3/7 = 0.43` (`_FC_ADEQUATE = 7`) — le dossier s'affiche moins fiable |
| **7 (défaut code — reco minimum)** | 2      | ~10–50 s                        | catégories fortes couvertes                                                     | `fc_ratio = 1.0` — axe technique plein                                                                   |
| **12 (reco gros comptes)**         | 3      | ~15–75 s                        | groupes/multi-entités : filiales + presse + officiel                            | `fc_ratio = 1.0` (capé)                                                                                  |

- Le coût **tokens prompt ne croît pas linéairement** avec les pages : le
  budget est capé PAR CATÉGORIE (4500 chars) — plus de pages = plus de
  catégories remplies (largeur), pas des prompts plus longs par catégorie.
- Le coût **crédits Firecrawl** croît ~linéairement (3→12 = ~4× le crawl par
  run) ; le cache absorbe les re-analyses.
- Même à 12 pages, la borne pire-cas (75 s) reste loin du timeout de phase
  (180 s) et le scrape est déjà en parallèle de Pappers/annuaire/news/gateway.

**Reco : passer la prod de 3 → 7 (aligne le défaut code ET `_FC_ADEQUATE`),
et 12 pour couvrir les gros comptes** si le budget crédits Firecrawl suit —
c'est ~+25–50 s de wall-time pire-cas par run pour une couverture x4, mesurable
avant/après au banc (`--live`).

## 6. Ce qui reste à faire (Louis)

1. **Poser en prod (Railway, service IA)** : `SERPER_API_KEY` et/ou
   `TAVILY_API_KEY` (Data Gateway avec dents) ; `FIRECRAWL_MAX_PAGES=7`
   (minimum) ou `12` (gros comptes).
2. **Ne PAS poser** les `*_DISABLED` — break-glass uniquement.
3. Après tout changement d'env : un run `--live` avant/après + le banc
   (`python -m app.eval.run --check-baseline`) pour objectiver le delta.
