import type { RunProfileProvenance } from '@bellum/contracts'
import type { AnalysisScopeSelection } from '@bellum/contracts'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/** One source that did not contribute to a run, and why.
 *
 * ``code`` is the machine-readable cause from the IA's shared ``DegradeReason``
 * vocabulary (``quota_exceeded``, ``unauthorized``, ``rate_limited``,
 * ``upstream_error``…). Absent when the recording site did not classify the
 * failure — an unclassified degradation must not pass for a classified one.
 * ``reason`` is the free-text detail a human reads. */
export type RunDegradedSource = {
  source: string
  reason: string
  code?: string
}

/**
 * What this run learned about the external sources.
 *
 * The two halves answer two different questions, and BOTH are needed:
 *  - ``degraded``: which sources failed, and why. Positive evidence of trouble.
 *  - ``observed``: which sources were actually called. Positive evidence that a
 *    source was exercised at all.
 *
 * Without ``observed`` we could not tell "Pappers answered fine" from "no run
 * touched Pappers", and reporting the second as the first would be inventing a
 * health status out of silence.
 */
export type RunSourceHealth = {
  degraded: RunDegradedSource[]
  observed: string[]
}

/**
 * #3212.4/.6 (épopée #3235) — instantané du verdict qu'un run a produit, pour
 * pouvoir en comparer deux successifs sans RECALCULER le dossier (« pourquoi
 * cela a changé » a besoin d'un diff structuré, pas d'un second jugement).
 *
 * `verdict` est la chaîne brute que la phase 4 écrit (`evaluation.verdict`,
 * `phase4_plan.py`) — la même que le badge de la fiche compte affiche via
 * `accountDisplayVerdict`. `dominantFactors` est la liste des clés d'axe déjà
 * marquées `strong`/`moderate` par `dossier_read.axes` (jamais recalculées).
 * `noGoTrigger` est le déclencheur nommé (`dossier_read.no_go.what`), `null`
 * quand aucun n'est levé. `profileVersion` reprend la MÊME valeur que
 * `buildAnalysisVersioning` (GA-26 — une dérivation vit à un seul endroit).
 */
export type RunVerdictSnapshot = {
  verdict: string
  dominantFactors: string[]
  noGoTrigger: string | null
  profileVersion: string | null
}

/**
 * Append-only record of every analysis run for an account (Théo restitution P0 :
 * « Un compte racine, plusieurs AnalysisRun. Historique, refresh, debug,
 * export »). Today re-analysing an account dedups by ``(workspace_id, siren)``
 * and OVERWRITES the same ``accounts`` row, so each fresh run erases the trace of
 * the previous one. This table keeps one immutable row per run instead, surfaced
 * in the account-detail « Historique des analyses » panel.
 *
 * API-owned (written by the analysis pipeline, read through the workspace-scoped
 * ``GET /accounts/:id/runs`` endpoint which gates on ``accounts`` membership), so
 * no RLS is enabled here — mirrors ``credit_ledger`` / the OAuth tables. Columns
 * stay as bare ``uuid`` (no hard FK) so the audit survives an account deletion.
 */
@Entity({ name: 'analysis_runs' })
@Index(['account_id', 'created_at'])
export class AnalysisRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  account_id: string

  @Column('uuid')
  user_id: string

  // Team scope (multi-user). Nullable so a run whose workspace couldn't be
  // resolved is still recorded rather than silently dropped.
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  // analyzing | completed | error | canceled — mirrors the account's analysis
  // status vocabulary. Starts 'analyzing' at launch, flipped by the worker on
  // the terminal event.
  @Column('text', { default: 'analyzing' })
  status: string

  // Périmètre d'analyse choisi au lancement (group/france/subsidiaries/
  // it_digital/…). Nullable: legacy launches / default perimeter.
  @Column('text', { nullable: true })
  scope_mode: string | null

  // SIREN of the entity the run was locked onto (scope lock). Nullable for
  // non-French entities or free-text launches.
  @Column('text', { nullable: true })
  siren: string | null

  // Cadrage saisi à l'écran de confirmation AVANT le débit (Théo P0-02 étape 3) :
  // priorités + exclusions d'entités/thèmes. Épinglé sur le run pour expliquer
  // un dossier amputé et pouvoir rejouer le run à l'identique. NULL = lancement
  // sans cadrage, ou run antérieur à la colonne.
  @Column('jsonb', { nullable: true })
  scope_selection: AnalysisScopeSelection | null

  // Accumulated LLM cost of the run. Stored in USD like ``accounts.api_cost_euros``
  // (Anthropic bills USD; the ``_eur`` name is a legacy convention).
  @Column('numeric', { precision: 10, scale: 4, nullable: true })
  cost_eur: string | null

  // Per-phase prompt/version metadata captured from the graph result, when
  // available (debug/repro). Free-form JSON — the shape follows the graph.
  @Column('jsonb', { nullable: true })
  prompt_versions: Record<string, unknown> | null

  // Snapshot of the resolved ESN seller profile (``profileData``) that
  // CONDITIONED this run — captured at launch so a resume/replay reproduces the
  // ORIGINAL inputs instead of re-deriving the CURRENT profile (which may have
  // been edited between the run and the resume). Reproducibility (Théo P0-08).
  // Additive, nullable: NULL = run older than the column, or a launch whose
  // profile couldn't be captured → resume falls back to the current profile.
  @Column('jsonb', { nullable: true })
  seller_context: Record<string, unknown> | null

  // Le profil qui a conditionné ce run, et le droit d'appeler ce run
  // « personnalisé » (recette finale §13/§53). Distinct de `seller_context`, qui
  // garde les VALEURS : celui-ci garde le VERDICT et les versions — sans quoi on
  // ne peut ni reproduire (quelle révision ?) ni expliquer (pourquoi générique ?).
  // NULL = run antérieur à la colonne, c'est-à-dire INCONNU — jamais « générique ».
  @Column('jsonb', { nullable: true })
  profile_provenance: RunProfileProvenance | null

  // Which external sources degraded during this run, and which were actually
  // called. See the AnalysisRunSourceHealth migration for why this lives here
  // rather than on ``accounts``: only an append-only, per-run, timestamped row
  // can answer "since when". NULL = run older than the column, i.e. UNKNOWN —
  // never "everything was fine".
  @Column('jsonb', { nullable: true })
  source_health: RunSourceHealth | null

  // #2318.5 → #3212.3 — révision du pipeline (déploiement) qui a exécuté ce
  // run (SENTRY_RELEASE/RAILWAY_GIT_COMMIT_SHA/GIT_COMMIT), timbrée au
  // lancement. NULL = run antérieur à la colonne, ou déploiement non
  // identifié — jamais une valeur devinée.
  @Column('text', { nullable: true })
  analysis_version: string | null

  // #2318.5 → #3212.3, lot E7 du 28/09 — révision de la fiche compte (CRM)
  // qui a nourri ce run (`accounts.updated_at` au lancement), timbrée au
  // même moment qu'`analysis_version`. NULL = run antérieur à la colonne.
  @Column('text', { nullable: true })
  account_context_version: string | null

  // #3235 (#3212.3) — version du jeu de données mémoire marché que la phase
  // plan de CE run a RÉELLEMENT lu, timbrée à la complétion. NULL = run
  // antérieur à la colonne ou qui n'a pas consulté la mémoire marché.
  @Column('text', { nullable: true })
  market_memory_version: string | null

  // #3212.4/.6 — instantané du verdict de CE run, timbré à la fin de la phase
  // plan. NULL = run antérieur à la colonne, run sans plan (gate no-go), ou
  // capture ratée — jamais un verdict deviné.
  @Column('jsonb', { nullable: true })
  verdict_snapshot: RunVerdictSnapshot | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @Column('timestamptz', { nullable: true })
  completed_at: Date | null

  // Théo B r2-mes-analyses.N1 — les utilisateurs qui ont RETIRÉ ce run de leur historique. Un masque par personne :
  // le run et le dossier du compte restent intacts, un collègue le voit toujours.
  @Column('uuid', { array: true, default: () => "'{}'" })
  hidden_by_user_ids: string[]

  /**
   * #2318.5 — les neuf identifiants de version (`buildAnalysisVersioning`),
   * attachés en mémoire par `AnalysisRunsService.listForAccount`. PAS une
   * colonne : déclaration TS pure (aucun `@Column`), donc TypeORM ne la
   * persiste ni ne la lit — elle n'existe qu'après l'assemblage.
   */
  versioning?: import('@bellum/contracts').AnalysisVersioning
}
