# IA v2 eval bench (`app.eval`)

**"Mesure d'abord."** Les 4 axes IA v2 (judge anti-hallucination, LLM gateway,
data gateway, grounding) sont **ON par défaut** (politique zéro-flag) — ce banc
est le juge de leur qualité : il score un dossier d'analyse assemblé sur huit
métriques déterministes — **hallucination en tête** — et détecte toute
régression contre une baseline committée.

New, **isolated and additive**: it only READS analysis outputs and reuses the
shipped deterministic checks. It never changes engine behaviour. (Distinct from
the older `apps/ia/evals/` module, which is the #275 entities/zones golden.)

## Metrics

| Metric | What it measures | Reuses (production check) | Hard gate |
|--------|------------------|---------------------------|-----------|
| `faithfulness` | share of hard firmographic facts that are **sourced** (anti-hallucination) | live `research.grounding.kpi` (grounding pass) when present, else `quality_judge.judge_quality().factsMissingSource` + per-fact `grounding.sourceRefs` | `< 5%` facts non-sourced (`grounding_citations.KPI_MAX_NON_SOURCED_RATIO`) |
| `coherence` | internal consistency (no plan targeting an absent contact, scores in range, facts sourced) | `graph.judge.build_verdict` | no `critical` issue |
| `completeness` | required facts + core deliverables + golden expectations (SIREN exact, min entities, min plays…) | — | every sub-check passes |
| `contacts_quality` | ≥1 real decision-maker in the enriched contacts | `decision_role.classify_decision_role` / `is_it_decider` | ≥1 decider among named contacts |
| `plays_grounding` | share of recos (plays + offres structurées) **actionnables** : 6 champs SalesConnect + preuve fondée sur une source réelle | `play_completeness.evaluate_play_completeness` / `offer_provenance.evaluate_offer_completeness` | ≥1 reco `complete` quand il y a des recos |
| `buying_committee` | couverture des 5 sièges clés du comité d'achat (Knowledge Pack v2) | `knowledge.buying_committee.assemble_buying_committee` | ≥2 sièges couverts ET ≥1 buyer (economic/technical) |
| `source_freshness` | âge de l'évidence DATÉE la plus fraîche (échelle confidence) ; `expect.freshnessAsOf` épingle la date de référence (fixture qui ne rote jamais) | `confidence._real_date_freshness` | évidence < 18 mois (informational si rien de daté) |
| `no_invented_data` | zéro donnée fabriquée : SIREN plausible (9 chiffres + Luhn + non répété), zéro marqueur placeholder (lorem ipsum, contoso…), zéro email sur domaine réservé RFC-2606 | — | zéro violation |

`aggregate` is the weight-normalised mean (`faithfulness` 0.25,
`no_invented_data` 0.15, `coherence` 0.15, `completeness` 0.12,
`contacts_quality` 0.12, `plays_grounding` 0.11, `buying_committee` 0.05,
`source_freshness` 0.05).

The unit of input is one assembled dossier — the LangGraph final-state shape:
`{research, contacts | classified_contacts, plan, gate, judge?}`.

## Layout

| Path | Role |
|------|------|
| `metrics.py` | the eight scorers + `evaluate(analysis, golden?) → EvalReport`. Pure, deterministic, hermetic. |
| `report.py` | `MetricResult` / `EvalReport` (aggregation + subset pass/score). |
| `golden.py` | golden loader + bundled-fixture resolver. |
| `run.py` | the `python -m app.eval.run` CLI (bench + baseline + counter-example guard). |
| `gate.py` | the CI gate (`python -m app.eval.gate` / `pnpm eval:gate`): fast-skips when the prompt surface (`app/prompts/`, `services/domain_focus.py`, `app/eval/`) is unchanged vs the base branch, else replays the bench with `--check-baseline`. Doc: `agent_docs/eval-gate.md`. |
| `message_objectives.py` | #3695 — bench de comparaison des objectifs de message (`python -m app.eval.message_objectives`) : sur un même contact/compte/signal daté, l'objectif change le cadrage, garde le dossier, n'impose pas de rendez-vous, ne présente jamais un signal ancien comme récent. Mesure le CADRAGE envoyé au modèle, pas la prose rédigée. |
| `baseline.json` | **committed expected scores** — the regression reference. Regenerate ONLY after an intentional change (`--update-baseline`). |
| `golden/*.json` | reference-company **expectations** (structural: exact SIREN, sector present, has-subsidiaries, is-public, min entities, min plays). Values mirror the in-repo frozen `packages/contracts/.../research.<slug>.json` — no fabricated business claims. |
| `fixtures/*.json` | sample analysis dossiers to score. `*.analysis.json` are GOOD; `hallucinated.analysis.json` is the BAD counter-example the detectors must keep rejecting. Firmographic facts and sourced signals are the real in-repo values; **contacts are labelled placeholder test data (`_synthetic: true`), never claims about real people.** |

## Run (from `apps/ia`)

```bash
python -m app.eval.run                       # BENCH: all goldens + counter-example + Δ baseline
python -m app.eval.run --company doctolib    # one golden
python -m app.eval.run --source out.json     # score a produced dossier (no golden)
python -m app.eval.run --source out.json --company societe-generale  # + golden expectations
python -m app.eval.run --require faithfulness,coherence   # exit 1 only if these fail (CI gate)
python -m app.eval.run --check-baseline      # exit 1 on ANY regression vs baseline.json
python -m app.eval.run --update-baseline     # freeze current scores (after an INTENTIONAL change)
python -m app.eval.run --json                # machine-readable report
python -m app.eval.gate                      # CI GATE: skip si prompts inchangés vs origin/main, sinon bench + baseline
```

Exit code is `1` if any evaluated report fails the required metrics (all by
default), if the counter-example guard breaks (the bad dossier starts passing),
or — with `--check-baseline` — on any score drop > 0.005 / pass→fail flip.

### Measuring a real run (not hermetic)

```bash
python -m app.eval.run --live "Doctolib" --save doctolib.dossier.json
```

`--live` invokes the real LangGraph engine (`run_analysis_graph`) and scores its
final state. It needs API keys and hits live providers, so it is **off in tests**
and never runs in CI. Use it to compare the aggregate / `faithfulness` before and
after an engine change (e.g. after posing SERPER_API_KEY/TAVILY_API_KEY, or after
a break-glass kill-switch flip).

## Adding a golden

1. Drop `golden/<slug>.json` (`slug`, `company`, `expect{…}`, optional
   `fixture`). Keep `expect` **structural/verifiable** — no invented facts.
   `freshnessAsOf` (YYYY-MM-DD) pins the freshness reference date.
2. Add a `fixtures/<slug>.analysis.json` dossier (or pass `--source`). Derive it
   from a real run / in-repo frozen fixture — NEVER invent business data. Today
   only Doctolib + Société Générale have in-repo frozen research fixtures, hence
   2 goldens (+ the bad counter-example).
3. `python -m app.eval.run --company <slug>` then `--update-baseline`.

Tests: `tests/test_eval_metrics.py` (each metric good vs bad + report shape) and
`tests/test_eval_runner.py` (CLI + goldens + baseline + guard). Hermetic — no network.

## Recette golden (`recette/`, #2130) — prouver qu'une recommandation n'est pas du vent

Voisine du banc, mais autre question : le banc note un dossier sur huit métriques ;
la recette REJETTE une recommandation qui ne tient pas. Trois pièces et une commande :

| Pièce | Où |
|-------|-----|
| **15 comptes golden**, un par archétype (#2130.1-15) | `recette/accounts/*.json` |
| **13 vérifications** par compte — `attendu` / `vide_attendu` / `non_mesure` (#2130.16-28) | `expected` de chaque compte |
| **9 labels de qualité**, dont 5 posés par la machine (#2130.29-37) | `recette/grid.py` |
| **le cas générique qui fait ÉCHOUER le run** (#2130.38) | `recette/cas/recommandation-generique.dossier.json` |

```bash
python -m app.eval.recette                                 # rejoue les 15 dossiers de référence → 0
python -m app.eval.recette --account <slug> --dossier <f>  # note un dossier produit
python -m app.eval.recette --account pme-atelier-numerique-brevenne \
  --dossier app/eval/recette/cas/recommandation-generique.dossier.json   # → 1
```

Règle du corpus, non négociable : un compte est **soit** un nom FICTIF assumé
(marque « (fictif) », aucun identifiant de registre, sources sur `.invalid`),
**soit** une entreprise réelle dont chaque fait porte URL + date + trace relue
dans le dépôt — et tout le reste y est `non_mesure`, pas rempli d'à-peu-près.
`corpus_violations()` refuse les deux fautes ; « non mesuré » ne compte jamais
comme réussi. Tests : `tests/test_golden_recette.py`. Hermétique, sans modèle.

## Échantillons de production, corrections humaines (#2899)

- **Rejeu nocturne des échantillons anonymisés** — ``python -m app.eval.chat_samples_replay`` (``chat_samples_replay.py``).
  Hors CI. No-op sans ``ANTHROPIC_API_KEY`` ; ``CHAT_SAMPLES_REPLAY_ENABLED=false`` l'éteint ; plafond
  ``CHAT_SAMPLES_REPLAY_MAX`` (défaut 20). Modèle SANS outils ; un échantillon non anonyme n'est jamais rejoué ; une
  violation ne porte que son rang et la règle. Le planificateur (``.github/workflows``) l'appelle comme ``nightly``.
- **Corrections humaines comme cas golden** — ``chat_correction_motifs.py`` : le motif anonymisé AGRÉGÉ PAR FONCTION
  (GA-412), jamais le corps du message, jamais la personne (c64 / GA-240).
- **Schéma de tour multi-tour** — ``Tour`` / ``Canonique.conversation`` (``tests/copilote_scenario_metadata.py``) :
  un seul endroit ; ``HumanReview.tour`` est borné par ``Canonique.nb_tours``.
