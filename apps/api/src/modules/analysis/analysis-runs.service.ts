import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  buildAnalysisVersioning,
  formatProfileVersion,
  medianDurationSeconds,
  parseRunProfileProvenance,
  recordedRunProfileProvenanceSchema,
  type AnalysisHistoryResponse,
  type AnalysisHistoryScope,
  type AnalysisRunDepth,
  type AnalysisScopeSelection,
  type RecordedRunProfileProvenance,
  type RunProfileProvenance,
} from '@bellum/contracts'
import {
  AnalysisRunEntity,
  type RunSourceHealth,
  type RunVerdictSnapshot,
} from '../../database/entities/analysis-run.entity'
import { businessUnitScopeClause, type BusinessUnitScopeClause } from '../accounts/business-unit-scope.clause'
import { returnedRows } from '../../database/returned-rows'
import { aggregateSourceHealth, type SourceHealthReport } from './source-health'

/**
 * La révision du pipeline qui exécute CE process — même source que
 * `GET /version`/`GET /health/status` (`health.controller.ts`,
 * `status.service.ts`) : `SENTRY_RELEASE` en premier (posé par Sentry AU
 * déploiement), puis les deux variables brutes que Railway/CI posent. `null`
 * (jamais `'unknown'`) quand aucune des trois n'est renseignée — la
 * convention de `analysisVersioningSchema` est `null` = non timbré, pas une
 * chaîne qui ressemblerait à une mesure.
 */
function resolveDeployRevision(): string | null {
  return process.env['SENTRY_RELEASE'] ?? process.env['RAILWAY_GIT_COMMIT_SHA'] ?? process.env['GIT_COMMIT'] ?? null
}

/**
 * #3212.7 (épopée #3235, lot E7) — le modèle Claude qui a produit CE run,
 * lu sur `analysis_runs.prompt_versions.model` (déjà timbré par IA,
 * `_prompt_versions_stamp`). `null` sur une forme illisible ou un run
 * antérieur à la colonne — jamais un modèle deviné.
 */
function modelOf(promptVersions: Record<string, unknown> | null): string | null {
  const model = promptVersions?.['model']
  return typeof model === 'string' && model.trim().length > 0 ? model : null
}

/**
 * #3212.4/.6 — la même liste de facteurs dominants + le même déclencheur
 * NO-GO qu'un run a déjà écrits dans son dossier, jamais recalculés. Un axe
 * sans état lisible n'entre pas dans la liste (silence, pas un facteur
 * inventé).
 */
function extractVerdictSnapshot(
  plan: Record<string, unknown> | undefined,
  profileVersion: string | null,
): RunVerdictSnapshot | null {
  const evaluation =
    plan && typeof plan['evaluation'] === 'object' ? (plan['evaluation'] as Record<string, unknown>) : null
  const verdict = evaluation && typeof evaluation['verdict'] === 'string' ? evaluation['verdict'].trim() : ''
  if (!verdict) return null

  const dossierRead =
    evaluation && typeof evaluation['dossier_read'] === 'object'
      ? (evaluation['dossier_read'] as Record<string, unknown>)
      : null
  const axes = Array.isArray(dossierRead?.['axes']) ? (dossierRead['axes'] as unknown[]) : []
  const dominantFactors = axes
    .filter(
      (axis): axis is Record<string, unknown> =>
        typeof axis === 'object' &&
        axis !== null &&
        typeof (axis as Record<string, unknown>)['key'] === 'string' &&
        ['strong', 'moderate'].includes(String((axis as Record<string, unknown>)['state'])),
    )
    .map(axis => axis['key'] as string)

  const noGo = dossierRead?.['no_go']
  const noGoTrigger =
    noGo && typeof noGo === 'object' && typeof (noGo as Record<string, unknown>)['what'] === 'string'
      ? ((noGo as Record<string, unknown>)['what'] as string)
      : null

  return { verdict, dominantFactors, noGoTrigger, profileVersion }
}

/** Terminal statuses a run can be flipped to once the worker/cancel path lands. */
type TerminalRunStatus = 'completed' | 'error' | 'canceled'

type RecordRunStartInput = {
  accountId: string
  userId: string
  workspaceId?: string | null
  scopeMode?: string | null
  siren?: string | null
  /** Cadrage saisi avant le débit (priorités + exclusions). Épinglé sur le run
   *  pour expliquer un dossier amputé et pouvoir le rejouer à l'identique.
   *  Absent ⇒ colonne NULL, jamais « aucune exclusion » affirmé à tort. */
  scopeSelection?: AnalysisScopeSelection | null
  /** #3212.3 (épopée #3235), lot E7 — `accounts.updated_at` au lancement (ISO),
   *  la révision de fiche que ce run a lue. Absent ⇒ colonne NULL, jamais une
   *  révision devinée (même convention que `analysis_version`). */
  accountContextVersion?: string | null
}

type CompleteRunInput = {
  status: TerminalRunStatus
  /** Accumulated LLM cost (USD, like ``accounts.api_cost_euros``). */
  costUsd?: number | null
  /** Per-phase prompt/version metadata from the graph result, when available. */
  promptVersions?: Record<string, unknown> | null
  /** #3235 — version mémoire marché lue par la phase plan (`null` = non lue). */
  marketMemoryVersion?: string | null
  /**
   * Which sources degraded during this run, and which were actually called.
   *
   * Stamped here rather than on ``accounts`` because only this table is
   * append-only and per-run: re-analysing an account overwrites its ``accounts``
   * row, so the previous run's degradations were erased, and ``updated_at`` is
   * not a run timestamp. Without an immutable, dated row there is no honest way
   * to answer "since when has Pappers been down".
   */
  sourceHealth?: RunSourceHealth | null
}

/**
 * #3212.4/.6 — la révision NOMMÉE d'un verdict qui a changé entre deux runs :
 * ancien verdict, nouveau verdict, cause(s), date. `impact` n'est pas un
 * champ séparé ici — le NO-GO de #3212 le lit comme « le nouveau verdict »
 * lui-même (passer de GO à NO-GO EST l'impact), jamais un second calcul.
 */
export type VerdictRevision = {
  previousVerdict: string
  newVerdict: string
  changedAt: Date
  /** #3235 (14/10) — le déclencheur NO-GO de chaque instantané, pour NOMMER le verdict comme la fiche. */
  previousNoGoTrigger?: string | null
  newNoGoTrigger?: string | null
  causes: string[]
}

/**
 * #3235 (recette prod 13/10) — la COMPARAISON des deux dernières analyses terminées, toujours rendue dès que
 * deux existent : `changed` (ancien → nouveau + causes), `unchanged` (même verdict depuis `unchangedSince`, avec ce
 * qui a bougé), `unreadable` (une des deux n'a pas conservé son verdict — nommé, jamais deviné).
 */
export type VerdictComparison = {
  status: 'changed' | 'unchanged' | 'unreadable'
  previousVerdict: string | null
  newVerdict: string | null
  previousAt: Date
  latestAt: Date
  /** `unchanged` : la plus ancienne analyse consécutive qui portait déjà ce verdict. */
  unchangedSince?: Date
  /**
   * #3235 (r40) — `true` quand UN SEUL run terminé a conservé son verdict : « même verdict depuis le <date de ce
   * run> » est alors tout ce qui est établi, les analyses antérieures n'ont pas gardé le leur (jamais deviné).
   */
  onlyOneRunCarriesVerdict?: boolean
  /**
   * #3235 (14/10) — le déclencheur NO-GO de chaque instantané (`null` = aucun, ou instantané absent) : le chat
   * NOMME le verdict (PRUDENT → RÉSERVE ; STOP → METTRE EN VEILLE / ÉCARTER selon ce déclencheur) avec le MÊME
   * vocabulaire que la fiche, jamais le code brut.
   */
  previousNoGoTrigger?: string | null
  newNoGoTrigger?: string | null
  causes: string[]
}

const DEFAULT_RUNS_LIMIT = 20
const MAX_RUNS_LIMIT = 50

/** 24 h reads naturally ("Pappers est HS depuis 3 h") and is short enough that a
 *  resolved incident stops shouting on its own. */
const DEFAULT_HEALTH_WINDOW_HOURS = 24
/** A week back: past that, a provider outage is history, not an alert. */
const MAX_HEALTH_WINDOW_HOURS = 24 * 7
/** Defensive ceiling — the report is a rollup, not a run listing. */
const MAX_HEALTH_RUNS = 500

/**
 * Append-only history of analysis runs (Théo P0 : « Un compte racine, plusieurs
 * AnalysisRun. Historique, refresh, debug, export »). Owns the ``analysis_runs``
 * table:
 *  - {@link recordStart} — one row per launch (``AnalysisService.start``);
 *  - {@link completeLatest} — flips the newest row terminal (worker success /
 *    failure, user cancel);
 *  - {@link listForAccount} — newest-first read backing the account-detail panel.
 *
 * Writes are BEST-EFFORT: a history-log failure must never break the analysis
 * hot path, so every method swallows its own errors (logger.warn) instead of
 * throwing.
 */
@Injectable()
export class AnalysisRunsService {
  private readonly logger = new Logger(AnalysisRunsService.name)

  constructor(
    @InjectRepository(AnalysisRunEntity)
    private readonly runs: Repository<AnalysisRunEntity>,
  ) {}

  /**
   * #3288 — durée MÉDIANE (secondes) d'un run terminé de cet espace, par palier
   * de profondeur. `null` = non mesurée (moins de trois runs terminés, ou
   * lecture en échec) — jamais une durée inventée. Un run sans profondeur
   * enregistrée est l'analyse d'avant le palier : `verified`.
   */
  async medianSecondsByDepth(workspaceId: string): Promise<Record<AnalysisRunDepth, number | null>> {
    const empty = { quick: null, verified: null, deep: null } as Record<AnalysisRunDepth, number | null>
    try {
      const rows = (await this.runs.query(
        `SELECT COALESCE(scope_selection->>'depth', 'verified') AS depth,
                EXTRACT(EPOCH FROM (completed_at - created_at))::float AS seconds
           FROM analysis_runs
          WHERE workspace_id = $1 AND status = 'completed' AND completed_at IS NOT NULL
          ORDER BY created_at DESC
          LIMIT 300`,
        [workspaceId],
      )) as Array<{ depth: string | null; seconds: number }>
      const byDepth: Record<AnalysisRunDepth, number[]> = { quick: [], verified: [], deep: [] }
      for (const row of rows) {
        const depth = (row.depth ?? 'verified') as AnalysisRunDepth
        if (byDepth[depth]) byDepth[depth].push(Number(row.seconds))
      }
      return {
        quick: medianDurationSeconds(byDepth.quick),
        verified: medianDurationSeconds(byDepth.verified),
        deep: medianDurationSeconds(byDepth.deep),
      }
    } catch (error) {
      this.logger.warn('Failed to measure run durations (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
      })
      return empty
    }
  }

  /**
   * Append an ``analyzing`` run row at launch. Never throws.
   *
   * Returns the new row's id — the **correlation key** the activity journal
   * needs. `user_actions` records "Analyse lancée" as an immutable past event
   * with no way back to the run it launched, so its status could only ever be a
   * constant ("En cours", forever). Handing the id back lets that row be
   * resolved against the real state machine, which lives here.
   *
   * `null` when the insert failed (best-effort, as before) — the caller then
   * writes an action row with no correlation key, which reports an UNKNOWN
   * outcome rather than a fabricated one.
   */
  async recordStart(input: RecordRunStartInput): Promise<string | null> {
    try {
      const result = await this.runs.insert({
        account_id: input.accountId,
        user_id: input.userId,
        workspace_id: input.workspaceId ?? null,
        status: 'analyzing',
        scope_mode: input.scopeMode ?? null,
        siren: input.siren ?? null,
        scope_selection: input.scopeSelection ?? null,
        analysis_version: resolveDeployRevision(),
        account_context_version: input.accountContextVersion ?? null,
      })
      const id = result.identifiers[0]?.id
      return typeof id === 'string' ? id : null
    } catch (error) {
      this.logger.warn('Failed to record analysis run start (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
        accountId: input.accountId,
      })
      return null
    }
  }

  /**
   * Flip the account's latest run terminal (+ ``completed_at``). ``cost_eur`` and
   * ``prompt_versions`` are only overwritten when supplied (``COALESCE`` keeps any
   * value already stamped). Never throws.
   */
  async completeLatest(accountId: string, input: CompleteRunInput): Promise<void> {
    try {
      await this.runs.manager.query(
        `
        UPDATE analysis_runs
           SET status = $2,
               completed_at = now(),
               cost_eur = COALESCE($3, cost_eur),
               prompt_versions = COALESCE($4::jsonb, prompt_versions),
               source_health = COALESCE($5::jsonb, source_health),
               market_memory_version = COALESCE($6, market_memory_version)
         WHERE id = (
           SELECT id FROM analysis_runs
            WHERE account_id = $1
            ORDER BY created_at DESC
            LIMIT 1
         )
        `,
        [
          accountId,
          input.status,
          input.costUsd ?? null,
          input.promptVersions ? JSON.stringify(input.promptVersions) : null,
          input.sourceHealth ? JSON.stringify(input.sourceHealth) : null,
          input.marketMemoryVersion ?? null,
        ],
      )
    } catch (error) {
      this.logger.warn('Failed to complete analysis run (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
        accountId,
      })
    }
  }

  /**
   * ───────────────────────────────────────────────────────────────────────
   * LES RUNS QUE PERSONNE NE FERMAIT — mesuré le 03/11/2026
   * ───────────────────────────────────────────────────────────────────────
   * {@link completeLatest} ne ferme QUE le dernier run d'un compte, et le
   * faucheur (`StuckAnalysisReaper`) ne regarde que les comptes restés
   * `analyzing`. Trois populations échappaient donc aux deux :
   *
   *  - un run qui n'est PLUS le dernier de son compte (l'utilisateur a relancé
   *    une analyse pendant que l'ancien run pendait) ;
   *  - un run dont le compte a été passé terminal par un autre chemin — le cas
   *    normal après un redémarrage de conteneur en plein run (un le 03/11 à
   *    15:41), qui tue le worker entre l'écriture du compte et la fermeture du
   *    run ;
   *  - un run dont le compte a été fauché : le faucheur appelle bien
   *    `completeLatest`, mais ne touche pas les runs plus anciens.
   *
   * Ces lignes restaient `analyzing` **pour toujours** — et c'est exactement ce
   * que mesure l'alerte `job_bloque` (elle lit `analysis_runs`, pas `accounts`).
   * D'où le mail « 10 analyses encore en cours, la plus ancienne date de
   * 205 min » toutes les heures, alors que le faucheur tournait et ne trouvait
   * RIEN à faucher : il regardait l'autre table.
   *
   * Ce que cette requête ne fait PAS :
   *  - elle ne touche aucun run d'une salle de démonstration (le semis en pose
   *    un `analyzing` à dessein — `active_analysis_by_colleague`) ;
   *  - elle ne touche aucun run dont le compte porte encore un job vivant
   *    (`liveAccountIds`) : un run en cours ne se ferme jamais sous son worker ;
   *  - elle n'invente pas un succès. `completed` n'est écrit que pour le DERNIER
   *    run d'un compte qui porte réellement un plan — la même réconciliation que
   *    le faucheur fait au niveau du compte. Tout le reste est `error`.
   */
  async reconcileStaleRuns(
    cutoff: Date,
    liveAccountIds: string[],
    limit: number,
  ): Promise<{ reconciled: number; failed: number }> {
    try {
      const rows = returnedRows<{ status: string }>(
        await this.runs.manager.query(
          `
          UPDATE analysis_runs r
             SET status = CASE
                   WHEN a.raw_analysis -> 'plan' IS NOT NULL
                    AND r.id = (SELECT x.id FROM analysis_runs x
                                 WHERE x.account_id = r.account_id
                                 ORDER BY x.created_at DESC LIMIT 1)
                   THEN 'completed' ELSE 'error' END,
                 completed_at = now()
            FROM accounts a
           WHERE a.id = r.account_id
             AND r.id IN (
               SELECT r2.id
                 FROM analysis_runs r2
                 JOIN accounts a2 ON a2.id = r2.account_id
                WHERE r2.status = 'analyzing'
                  AND r2.created_at < $1
                  AND NOT (r2.account_id = ANY($2::uuid[]))
                  AND NOT EXISTS (
                        SELECT 1 FROM workspaces w
                         WHERE w.id = a2.workspace_id AND w.is_demo = true)
                ORDER BY r2.created_at ASC
                LIMIT $3
             )
          RETURNING r.status
          `,
          [cutoff, liveAccountIds, limit],
        ),
      )
      const reconciled = rows.filter(r => r.status === 'completed').length
      return { reconciled, failed: rows.length - reconciled }
    } catch (error) {
      // Best-effort comme tout le faucheur : ce balayage répare un symptôme,
      // il ne doit jamais empêcher le reste du tick.
      this.logger.warn('Failed to reconcile stale analysis runs (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
      })
      return { reconciled: 0, failed: 0 }
    }
  }

  /**
   * #3212.4/.6 — timbre le verdict de CE run juste après que la phase plan
   * l'a écrit sur le compte (`AnalysisWorker`, après `savePlan`). Séparé de
   * {@link completeLatest} : un run peut se terminer sans plan (gate no-go),
   * et cet appel-ci porte sa propre raison de ne rien écrire (verdict
   * illisible) plutôt que de dépendre du statut terminal. Best-effort — une
   * capture ratée ne doit jamais faire échouer l'analyse déjà réussie.
   */
  async stampVerdictSnapshot(accountId: string, plan: Record<string, unknown> | undefined): Promise<void> {
    // Même chaîne que `buildAnalysisVersioning` (GA-26) — lue via
    // `getProfileProvenance`, déjà écrite par `recordProfileProvenance` au
    // lancement, jamais recalculée depuis les réponses brutes.
    const profileVersion = formatProfileVersion(await this.getProfileProvenance(accountId))
    const snapshot = extractVerdictSnapshot(plan, profileVersion)
    if (!snapshot) return
    try {
      // Même motif que `completeLatest`/`stampSourceHealth` : le run courant
      // n'est pas thread à travers la file BullMQ, on cible donc le plus
      // récent par compte plutôt qu'un id qu'on n'a pas ici.
      await this.runs.manager.query(
        `
        UPDATE analysis_runs
           SET verdict_snapshot = $2::jsonb
         WHERE id = (
           SELECT id FROM analysis_runs
            WHERE account_id = $1
            ORDER BY created_at DESC
            LIMIT 1
         )
        `,
        [accountId, JSON.stringify(snapshot)],
      )
    } catch (error) {
      this.logger.warn('Failed to stamp run verdict snapshot (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
        accountId,
      })
    }
  }

  /**
   * Snapshot the resolved ESN seller profile that conditioned a run (P0-08).
   * Called right after ``profileData`` is resolved at launch. Best-effort — a
   * failure never blocks the analysis (the run just won't be reproducible).
   */
  async recordSellerContext(runId: string, sellerContext: Record<string, unknown>): Promise<void> {
    try {
      await this.runs.manager.query(`UPDATE analysis_runs SET seller_context = $2::jsonb WHERE id = $1`, [
        runId,
        JSON.stringify(sellerContext),
      ])
    } catch (error) {
      this.logger.warn('Failed to record run seller context (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
        runId,
      })
    }
  }

  /**
   * Fige la PROVENANCE du profil sur le run (recette finale §13/§53 — P0-02).
   *
   * Jumelle de {@link recordSellerContext}, et délibérément séparée d'elle :
   * celle-là garde les VALEURS du profil, celle-ci garde le VERDICT (le run
   * a-t-il le droit de se dire personnalisé ?) et les VERSIONS. Les fusionner
   * rendrait impossible de répondre « pourquoi ce dossier est-il générique ? »
   * sans réinterpréter un instantané de réponses — c'est-à-dire en refaisant, à
   * la lecture, un jugement qui appartient au lancement.
   *
   * Best-effort comme sa jumelle : une écriture ratée coûte une explication,
   * jamais l'analyse.
   */
  async recordProfileProvenance(runId: string, provenance: RecordedRunProfileProvenance): Promise<void> {
    try {
      // #2005.11 — une recommandation ne part pas sans les versions de ses trois
      // couches : le schéma d'ÉCRITURE les exige (la contrainte SQL
      // `analysis_runs_profile_layer_versions_check` en garde la forme).
      const recorded = recordedRunProfileProvenanceSchema.parse(provenance)
      await this.runs.manager.query(`UPDATE analysis_runs SET profile_provenance = $2::jsonb WHERE id = $1`, [
        runId,
        JSON.stringify(recorded),
      ])
    } catch (error) {
      this.logger.warn('Failed to record run profile provenance (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
        runId,
      })
    }
  }

  /**
   * La provenance du profil du dernier run d'un compte — ce que l'écran affiche
   * pour répondre à « avec quel profil ce dossier a-t-il été fait ? ».
   *
   * `null` couvre deux cas qu'il ne faut surtout pas confondre à l'affichage :
   * aucun run, ou un run antérieur à la colonne. Dans les deux, la réponse
   * honnête est « on ne sait pas » — jamais « générique ».
   */
  async getProfileProvenance(accountId: string): Promise<RunProfileProvenance | null> {
    try {
      const row = await this.runs.findOne({
        where: { account_id: accountId },
        order: { created_at: 'DESC' },
        select: ['profile_provenance'],
      })
      return parseRunProfileProvenance(row?.profile_provenance ?? null)
    } catch (error) {
      this.logger.warn('Failed to read run profile provenance (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
        accountId,
      })
      return null
    }
  }

  /**
   * #2148.11 — QUI a lancé le dernier run de ce compte : la PROVENANCE d'un
   * résultat mutualisé DANS l'espace (jamais cross-workspace, voir
   * `agent_docs/doctrine.md:35-36` — GA-43). La donnée est déjà écrite par
   * `recordStart` sur CHAQUE run (`user_id`) ; personne ne la relisait pour
   * nommer qui a produit un dossier qu'un collègue réutilise sans le savoir
   * avoir demandé.
   *
   * `null` couvre « aucun run » — jamais un auteur deviné.
   */
  async getLastRunUserId(accountId: string): Promise<string | null> {
    try {
      const row = await this.runs.findOne({
        where: { account_id: accountId },
        order: { created_at: 'DESC' },
        select: ['user_id'],
      })
      return row?.user_id ?? null
    } catch (error) {
      this.logger.warn('Failed to read last run user (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
        accountId,
      })
      return null
    }
  }

  /**
   * The seller-profile snapshot of an account's latest run, so a resume replays
   * the ORIGINAL inputs instead of re-deriving the current profile (P0-08).
   * Returns ``null`` when no run carries one (older run / capture failed) → the
   * caller falls back to the current profile. Never throws.
   */
  async getSellerContext(accountId: string): Promise<Record<string, unknown> | null> {
    try {
      const row = await this.runs.findOne({
        where: { account_id: accountId },
        order: { created_at: 'DESC' },
        select: ['seller_context'],
      })
      return row?.seller_context ?? null
    } catch (error) {
      this.logger.warn('Failed to read run seller context (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
        accountId,
      })
      return null
    }
  }

  /**
   * #3434.3 — le périmètre (mode + cadrage) du run le plus récent d'un compte :
   * « ce dossier a-t-il déjà été cadré, ou porte-t-il le groupe entier ? ».
   * `null` = aucun run lisible (ancien dossier, lecture en échec) — jamais un
   * périmètre deviné. Ne lève jamais.
   */
  async getLastRunScope(
    accountId: string,
  ): Promise<{ scopeMode: string | null; scopeSelection: AnalysisScopeSelection | null } | null> {
    try {
      const row = await this.runs.findOne({
        where: { account_id: accountId },
        order: { created_at: 'DESC' },
        select: ['scope_mode', 'scope_selection'],
      })
      return row ? { scopeMode: row.scope_mode ?? null, scopeSelection: row.scope_selection ?? null } : null
    } catch (error) {
      this.logger.warn('Failed to read last run scope (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
        accountId,
      })
      return null
    }
  }

  /**
   * The confirmed collection scope (priorités + exclusions) of an account's
   * latest run — read by the on-demand targeted contact re-search so a later
   * « chercher plus » cannot re-collect an entity/theme the commercial excluded
   * before the run (Théo p8 : « corriger le scope AVANT de payer la collecte »,
   * et p22 : « ne jamais réinjecter »). ``null`` when no run carries one (older
   * run / launch without cadrage) → the re-search proceeds unfiltered, exactly
   * as before. Never throws — a scope read must not break the enrich button.
   */
  async getScopeSelection(accountId: string): Promise<AnalysisScopeSelection | null> {
    try {
      const row = await this.runs.findOne({
        where: { account_id: accountId },
        order: { created_at: 'DESC' },
        select: ['scope_selection'],
      })
      return row?.scope_selection ?? null
    } catch (error) {
      this.logger.warn('Failed to read run scope selection (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
        accountId,
      })
      return null
    }
  }

  /**
   * Théo B r2-mes-analyses.N1/A5 — l'historique des analyses LANCÉES dans l'espace, du plus récent au plus ancien.
   *
   * `space` (défaut de l'écran) lit tout l'espace, `me` les seuls runs de l'appelant. L'espace vient de la session ;
   * le cloisonnement d'unité s'applique au COMPTE du run (la même règle que les listes de comptes), et les lignes que
   * l'appelant a retirées n'en font pas partie. Une panne de lecture rend une liste vide : l'écran ne casse pas.
   */
  async listHistory(input: {
    workspaceId: string
    viewerId: string
    scope: AnalysisHistoryScope
    businessUnitScope: BusinessUnitScopeClause
    limit?: number
  }): Promise<AnalysisHistoryResponse> {
    const limit = Math.min(Math.max(1, Math.trunc(input.limit ?? 50)), 100)
    const params: unknown[] = [input.workspaceId, input.viewerId]
    const clause = businessUnitScopeClause(
      input.businessUnitScope,
      'a.business_unit_id',
      `SELECT unnest($${params.length + 1}::uuid[])`,
    )
    if (input.businessUnitScope && input.businessUnitScope.businessUnitIds.length > 0) {
      params.push([...input.businessUnitScope.businessUnitIds])
    }
    params.push(limit)
    try {
      const rows = (await this.runs.query(
        `SELECT r.id, r.account_id, a.company_name, a.headquarters, r.status, r.scope_mode,
                r.scope_selection->>'depth' AS depth, r.created_at, r.completed_at, r.user_id,
                p.first_name, p.last_name
           FROM analysis_runs r
           JOIN accounts a ON a.id = r.account_id AND a.status <> 'deleted'
           LEFT JOIN profiles p ON p.user_id = r.user_id
          WHERE r.workspace_id = $1
            AND NOT ($2::uuid = ANY(r.hidden_by_user_ids))${input.scope === 'me' ? '\n            AND r.user_id = $2' : ''}${clause ? `\n            AND ${clause}` : ''}
          ORDER BY r.created_at DESC
          LIMIT $${params.length}`,
        params,
      )) as Array<{
        id: string
        account_id: string
        company_name: string | null
        headquarters: string | null
        status: string
        scope_mode: string | null
        depth: string | null
        created_at: Date | string
        completed_at: Date | string | null
        user_id: string
        first_name: string | null
        last_name: string | null
      }>
      const iso = (value: Date | string): string => (value instanceof Date ? value.toISOString() : value)
      const runs = rows.map(row => ({
        id: row.id,
        accountId: row.account_id,
        companyName: row.company_name,
        headquarters: row.headquarters,
        status: row.status as AnalysisHistoryResponse['runs'][number]['status'],
        scopeMode: row.scope_mode,
        depth: (['quick', 'verified', 'deep'] as const).find(depth => depth === row.depth) ?? null,
        startedAt: iso(row.created_at),
        completedAt: row.completed_at ? iso(row.completed_at) : null,
        startedBy: {
          userId: row.user_id,
          name: [row.first_name, row.last_name].filter(Boolean).join(' ') || null,
        },
        mine: row.user_id === input.viewerId,
      }))
      return { runs, counts: { space: runs.length, mine: runs.filter(run => run.mine).length } }
    } catch (error) {
      this.logger.warn('listHistory failed (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
        workspaceId: input.workspaceId,
      })
      return { runs: [], counts: { space: 0, mine: 0 } }
    }
  }

  /**
   * Théo B r2-mes-analyses.N1 — « Retirer cet élément de l'historique » : masque la ligne pour l'appelant, sur un run
   * de son espace qu'il a lancé lui-même. Un run de collègue n'est jamais touché. `false` = rien retiré.
   */
  async hideForUser(input: { runId: string; userId: string; workspaceId: string }): Promise<boolean> {
    const rows = returnedRows(
      await this.runs.query(
        `UPDATE analysis_runs
          SET hidden_by_user_ids = array_append(hidden_by_user_ids, $2::uuid)
        WHERE id = $1 AND user_id = $2 AND workspace_id = $3
          AND NOT ($2::uuid = ANY(hidden_by_user_ids))
        RETURNING id`,
        [input.runId, input.userId, input.workspaceId],
      ),
    )
    return rows.length > 0
  }

  /**
   * Runs for one account, newest-first, capped. The caller (accounts controller)
   * has already gated the account on the workspace, so this is a plain
   * account-scoped read. Returns ``[]`` on a DB error so the account detail
   * screen never fails because of a history-panel blip.
   */
  async listForAccount(accountId: string, limit: number = DEFAULT_RUNS_LIMIT): Promise<AnalysisRunEntity[]> {
    const capped = Math.min(Math.max(1, Math.trunc(limit)), MAX_RUNS_LIMIT)
    try {
      const rows = await this.runs.find({
        where: { account_id: accountId },
        order: { created_at: 'DESC' },
        take: capped,
      })
      // #2318.5 — LAU-FINAL-059, VERSIONING : chaque run porte désormais ses
      // neuf identifiants. Mutation EN PLACE (pas un `.map`) : le tableau
      // reste la MÊME référence, seule chaque ligne gagne un champ de plus —
      // aucun appelant existant qui compare le résultat par identité ne casse.
      for (const row of rows) {
        row.versioning = buildAnalysisVersioning(row)
      }
      return rows
    } catch (error) {
      this.logger.error('listForAccount error', { error, accountId })
      return []
    }
  }

  /**
   * The two most recent COMPLETED runs of an account, oldest first, for a
   * caller that must compare successive dossiers (#3212.4 — pourquoi cela a
   * changé). `null` when fewer than two completed runs exist: a revision
   * needs a BEFORE and an AFTER, never a guess from a single dossier.
   */
  private async lastTwoCompletedRuns(accountId: string): Promise<[AnalysisRunEntity, AnalysisRunEntity] | null> {
    try {
      const rows = await this.runs.find({
        where: { account_id: accountId, status: 'completed' },
        order: { created_at: 'DESC' },
        take: 2,
      })
      if (rows.length < 2) return null
      return [rows[1] as AnalysisRunEntity, rows[0] as AnalysisRunEntity]
    } catch (error) {
      this.logger.warn('Failed to read the last two completed runs (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
        accountId,
      })
      return null
    }
  }

  /**
   * Ce qui a bougé entre deux instantanés : modèle, facteurs dominants, déclencheur NO-GO, profil vendeur, pipeline,
   * scoring. Vide = rien de nommable (jamais une cause inventée). Partagé par {@link explainVerdictChange}
   * (verdict changé) et {@link compareLastRuns} (changé OU identique) — une dérivation à un seul endroit (GA-26).
   */
  private revisionCauses(
    previous: AnalysisRunEntity,
    latest: AnalysisRunEntity,
    before: RunVerdictSnapshot,
    after: RunVerdictSnapshot,
  ): string[] {
    const causes: string[] = [...this.runRowCauses(previous, latest)]
    const addedFactors = after.dominantFactors.filter(f => !before.dominantFactors.includes(f))
    const removedFactors = before.dominantFactors.filter(f => !after.dominantFactors.includes(f))
    if (addedFactors.length > 0) causes.push(`nouveaux facteurs dominants : ${addedFactors.join(', ')}`)
    if (removedFactors.length > 0) causes.push(`facteurs dominants disparus : ${removedFactors.join(', ')}`)
    if (before.noGoTrigger !== after.noGoTrigger) {
      causes.push(
        after.noGoTrigger
          ? `déclencheur NO-GO nommé : ${after.noGoTrigger}`
          : `le déclencheur NO-GO précédent (${before.noGoTrigger}) n'est plus levé`,
      )
    }
    if (before.profileVersion !== after.profileVersion) {
      causes.push(
        `le profil vendeur a changé (${before.profileVersion ?? 'inconnu'} → ${after.profileVersion ?? 'inconnu'})`,
      )
    }
    return causes
  }

  /**
   * #3235 (recette prod 14/10, Thales) — les causes qui tiennent aux LIGNES de run, sans instantané de verdict :
   * modèle, révision du pipeline, version de scoring, sources dégradées d'un seul des deux runs. Un ancien run sans
   * `verdict_snapshot` garde donc des causes à nommer (« aucune cause enregistrée » était faux). Une donnée absente
   * d'un des deux runs ne se cite jamais (`null` ≠ 0, jamais devinée). Une source dégradée dans les DEUX runs n'est
   * pas ce qui a changé.
   */
  private runRowCauses(previous: AnalysisRunEntity, latest: AnalysisRunEntity): string[] {
    const causes: string[] = []
    // #3212.7 (épopée #3235, lot E7) — scénario « modèle différent ». Lu sur
    // les DEUX LIGNES de run (`prompt_versions.model`, timbré par IA à
    // `run_completed` — `_prompt_versions_stamp`, `builder.py`), jamais
    // dupliqué dans `verdict_snapshot` : `stampVerdictSnapshot` tourne à la
    // phase `plan`, avant que `prompt_versions` n'existe sur la ligne.
    const modelBefore = modelOf(previous.prompt_versions)
    const modelAfter = modelOf(latest.prompt_versions)
    if (modelBefore && modelAfter && modelBefore !== modelAfter) {
      causes.push(`le modèle a changé (${modelBefore} → ${modelAfter})`)
    }
    // #3235 (réserve, recette 07/10) — pipeline et scoring : réutilise `buildAnalysisVersioning` (GA-26, même
    // dérivation que l'écran « Versioning de ce run »), jamais un second calcul.
    const versionsBefore = buildAnalysisVersioning(previous)
    const versionsAfter = buildAnalysisVersioning(latest)
    if (
      versionsBefore.analysis_version &&
      versionsAfter.analysis_version &&
      versionsBefore.analysis_version !== versionsAfter.analysis_version
    ) {
      causes.push(
        `la révision du pipeline a changé (${versionsBefore.analysis_version} → ${versionsAfter.analysis_version})`,
      )
    }
    if (
      versionsBefore.scoring_version &&
      versionsAfter.scoring_version &&
      versionsBefore.scoring_version !== versionsAfter.scoring_version
    ) {
      causes.push(
        `la version de scoring a changé (${versionsBefore.scoring_version} → ${versionsAfter.scoring_version})`,
      )
    }
    // #3235 (14/10) — les sources dégradées : lues sur les deux runs seulement quand les DEUX ont une santé
    // enregistrée (absente = inconnue, jamais « saine »).
    const healthBefore = previous.source_health
    const healthAfter = latest.source_health
    if (healthBefore && healthAfter) {
      const degradedBefore = new Set(healthBefore.degraded.map(d => d.source))
      const degradedAfter = new Set(healthAfter.degraded.map(d => d.source))
      const nowDegraded = [...degradedAfter].filter(source => !degradedBefore.has(source))
      const recovered = [...degradedBefore].filter(source => !degradedAfter.has(source))
      if (nowDegraded.length > 0) {
        causes.push(`source dégradée sur la dernière analyse seulement : ${nowDegraded.join(', ')}`)
      }
      if (recovered.length > 0) {
        causes.push(`source de nouveau disponible sur la dernière analyse : ${recovered.join(', ')}`)
      }
    }
    return causes
  }

  /**
   * #3212.4 — « pourquoi cela a changé » : compare les deux DERNIERS runs
   * terminés du même compte et NOMME ce qui a changé entre les deux
   * instantanés déjà écrits (jamais un second jugement du modèle — un diff,
   * pas un recalcul).
   *
   * `null` couvre trois cas distincts, tous honnêtes en « rien à expliquer » :
   * moins de deux runs terminés, l'un des deux runs sans `verdict_snapshot`
   * (run antérieur à la colonne, ou gate no-go sans plan), ou un verdict
   * identique (aucune révision à signaler).
   */
  async explainVerdictChange(accountId: string): Promise<VerdictRevision | null> {
    const runs = await this.lastTwoCompletedRuns(accountId)
    if (!runs) return null
    const [previous, latest] = runs
    const before = previous.verdict_snapshot
    const after = latest.verdict_snapshot
    if (!before || !after || before.verdict === after.verdict) return null

    const causes = this.revisionCauses(previous, latest, before, after)

    return {
      previousVerdict: before.verdict,
      newVerdict: after.verdict,
      changedAt: latest.completed_at ?? latest.created_at,
      previousNoGoTrigger: before.noGoTrigger,
      newNoGoTrigger: after.noGoTrigger,
      // Jamais vide : un verdict qui change sans aucune cause NOMMÉE serait
      // exactement le NO-GO de #3212 (« sans pouvoir expliquer ce qui a
      // changé ») — la seule cause qu'on peut alors honnêtement nommer.
      causes: causes.length > 0 ? causes : ['cause non capturée par cet instantané'],
    }
  }

  /**
   * #3235 (recette prod 13/10, Thales — 4 analyses) — « Pourquoi le verdict a changé ? » : la comparaison des deux
   * dernières analyses terminées, rendue dès que deux existent. Contrairement à {@link explainVerdictChange}
   * (`null` quand le verdict est identique — d'où le « aucune révision disponible » de Laura), un verdict
   * IDENTIQUE se dit (« même verdict depuis le … ») avec ce qui a bougé.
   *
   * RATTRAPAGE EN LECTURE (« un correctif de collecte rattrape l'existant ») : la dernière analyse sans instantané
   * (antérieure à la colonne, ou capture ratée) lit le verdict COURANT du dossier (`currentVerdict`, celui que
   * l'écran affiche) ; une analyse ANTÉRIEURE sans instantané n'a plus de verdict à lire — le compte
   * `accounts` est écrasé à chaque relance — elle se nomme `unreadable`, jamais un verdict deviné.
   */
  async compareLastRuns(accountId: string, currentVerdict?: string | null): Promise<VerdictComparison | null> {
    let rows: AnalysisRunEntity[]
    try {
      rows = await this.runs.find({
        where: { account_id: accountId, status: 'completed' },
        order: { created_at: 'DESC' },
        take: 10,
      })
    } catch (error) {
      this.logger.warn('Failed to read the completed runs for comparison (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
        accountId,
      })
      return null
    }
    if (rows.length < 2) return null
    const latest = rows[0] as AnalysisRunEntity
    // #3235 (r40, Thales) — « l'ancien verdict n'a pas été conservé » : on compare les DEUX dernières analyses qui
    // PORTENT un verdict, en sautant celles qui ne l'ont pas gardé. Le dernier run, lui, a le rattrapage en lecture.
    const previous = (rows.slice(1).find(run => run.verdict_snapshot) ?? rows[1]) as AnalysisRunEntity
    const at = (run: AnalysisRunEntity): Date => run.completed_at ?? run.created_at
    const fallback = currentVerdict?.trim() || null
    const after: RunVerdictSnapshot | null =
      latest.verdict_snapshot ??
      (fallback ? { verdict: fallback, dominantFactors: [], noGoTrigger: null, profileVersion: null } : null)
    const before = previous.verdict_snapshot
    const base = {
      previousAt: at(previous),
      latestAt: at(latest),
      previousNoGoTrigger: before?.noGoTrigger ?? null,
      newNoGoTrigger: after?.noGoTrigger ?? null,
    }
    // #3235 (14/10) — les causes des LIGNES de run (modèle, pipeline, scoring, sources) ne dépendent d'aucun
    // instantané : elles se nomment même quand un verdict est illisible.
    const rowCauses = this.runRowCauses(previous, latest)
    if (!before && after && !rows.slice(1).some(run => run.verdict_snapshot)) {
      // Un seul run porte un verdict (le dernier, ou le courant du dossier) : on dit depuis quand, rien de plus.
      return {
        status: 'unchanged',
        previousVerdict: after.verdict,
        newVerdict: after.verdict,
        ...base,
        previousAt: at(latest),
        unchangedSince: at(latest),
        onlyOneRunCarriesVerdict: true,
        causes: [],
      }
    }
    if (!before || !after) {
      return {
        status: 'unreadable',
        previousVerdict: before?.verdict ?? null,
        newVerdict: after?.verdict ?? null,
        ...base,
        causes: rowCauses,
      }
    }
    // Sans instantané propre, `after` ne porte que le verdict : comparer des facteurs vides à ceux de l'avant
    // dirait « tout a disparu » — faux. Les causes ne se nomment que sur deux instantanés réels.
    const causes = latest.verdict_snapshot ? this.revisionCauses(previous, latest, before, after) : rowCauses
    if (before.verdict !== after.verdict) {
      return {
        status: 'changed',
        previousVerdict: before.verdict,
        newVerdict: after.verdict,
        ...base,
        causes: causes.length > 0 ? causes : ['cause non capturée par cet instantané'],
      }
    }
    let unchangedSince = at(previous)
    for (const run of rows.slice(2)) {
      if (run.verdict_snapshot?.verdict !== after.verdict) break
      unchangedSince = at(run)
    }
    return {
      status: 'unchanged',
      previousVerdict: before.verdict,
      newVerdict: after.verdict,
      ...base,
      unchangedSince,
      causes,
    }
  }

  /**
   * Quand le run COURANT de ce compte a-t-il commencé ?
   *
   * C'est la **frontière entre deux runs**, et elle existe pour une raison
   * précise : les points de contrôle de phase vivent dans l'outbox, clés par
   * `(accountId, jobId)`, et le `jobId` est DÉTERMINISTE — même utilisateur,
   * même entreprise, même identifiant. Une relance héritait donc des points de
   * contrôle du run précédent : le dossier s'annonçait à 100 % dès la première
   * seconde, et surtout le worker en déduisait `resume: true` et SAUTAIT les
   * phases de recherche, contacts et classification — une « actualisation » qui
   * ne collectait rien tout en débitant son crédit.
   *
   * `analysis_runs` porte exactement la bonne granularité : une ligne par
   * LANCEMENT ({@link recordStart}, appelé par `AnalysisService.start` et par
   * lui seul). Une reprise (« Reprendre ») et une nouvelle tentative BullMQ
   * n'en créent pas — elles continuent le même run et gardent donc, à raison,
   * ses points de contrôle.
   *
   * `null` = aucune ligne (run antérieur à la table, ou insertion best-effort
   * en échec) ou lecture impossible. L'appelant DOIT le lire « aucune preuve »
   * et non « aucune borne » : rejouer une phase coûte cher, en sauter une à
   * tort coûte le dossier entier.
   */
  async latestStartedAt(accountId: string): Promise<Date | null> {
    try {
      const row = await this.runs.findOne({
        where: { account_id: accountId },
        order: { created_at: 'DESC' },
      })
      return row?.created_at ?? null
    } catch (error) {
      this.logger.warn('Failed to read the current run start (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
        accountId,
      })
      return null
    }
  }

  /**
   * Stamp the latest run's source health WITHOUT touching its status.
   *
   * Exists for the failure path. A run that dies carries its ``degraded_sources``
   * on the terminal ``run_failed`` event just like a successful one, but the
   * worker throws on that event and never reaches {@link completeLatest} — so the
   * one moment we most want to know which brick broke was the one moment we
   * threw the answer away. Called before the throw; the later
   * ``completeLatest({status: 'error'})`` COALESCEs and keeps what we wrote.
   *
   * Never throws — a telemetry write must not change how a run fails.
   */
  async stampSourceHealth(accountId: string, sourceHealth: RunSourceHealth): Promise<void> {
    try {
      await this.runs.manager.query(
        `
        UPDATE analysis_runs
           SET source_health = $2::jsonb
         WHERE id = (
           SELECT id FROM analysis_runs
            WHERE account_id = $1
            ORDER BY created_at DESC
            LIMIT 1
         )
        `,
        [accountId, JSON.stringify(sourceHealth)],
      )
    } catch (error) {
      this.logger.warn('Failed to stamp run source health (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
        accountId,
      })
    }
  }

  /**
   * Cross-tenant source-health report over the recent run history.
   *
   * Operator monitoring: reads every run in the window that carries a stamped
   * ``source_health``, and lets {@link aggregateSourceHealth} turn them into a
   * per-source status. Deliberately NOT user-scoped (a provider outage is not a
   * tenant-level fact) — the caller gates it behind ``InternalSecretGuard``.
   *
   * Runs with a NULL ``source_health`` are excluded rather than counted as
   * healthy: they predate the column or died before the terminal event, and in
   * both cases they say nothing about the sources. On a DB error the report
   * comes back EMPTY and flagged `unavailable` (screen: "lecture impossible") — a monitoring
   * screen must fail to "I don't know", never to "all good".
   */
  async sourceHealthReport(windowHours = DEFAULT_HEALTH_WINDOW_HOURS): Promise<SourceHealthReport> {
    const hours = Math.min(Math.max(1, Math.trunc(windowHours) || DEFAULT_HEALTH_WINDOW_HOURS), MAX_HEALTH_WINDOW_HOURS)
    const now = new Date()
    try {
      const rows = (await this.runs.manager.query(
        `
        SELECT created_at, source_health
          FROM analysis_runs
         WHERE source_health IS NOT NULL
           AND created_at >= $1
         ORDER BY created_at DESC
         LIMIT $2
        `,
        [new Date(now.getTime() - hours * 3_600_000), MAX_HEALTH_RUNS],
      )) as Array<{ created_at: Date | string; source_health: RunSourceHealth | null }>

      return aggregateSourceHealth(
        (rows ?? []).map(r => ({
          createdAt: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
          sourceHealth: r.source_health,
        })),
        { now, windowHours: hours },
      )
    } catch (error) {
      this.logger.error('sourceHealthReport error', { error, tags: { feature: 'source-health' } })
      // Supervision 30/09 : `unavailable` distingue une panne de lecture d'une fenêtre sans run.
      return {
        window: { hours, runsConsidered: 0, oldestRunAt: null, newestRunAt: null },
        sources: [],
        unavailable: true,
      }
    }
  }

  /**
   * Aggregate the tracked cost across an account's run history — cost transparency
   * per account (Drive backlog #12, Matteo gap-analysis). Reads only stored
   * ``analysis_runs.cost_eur`` values (nothing invented): the run count, the SUM
   * across the history, and the newest run's cost. ``cost_eur`` is a Postgres
   * ``numeric`` (arrives as a string), so figures are coerced to numbers here.
   * Returns zeros/nulls on a DB error so the cost endpoint never breaks the
   * account-detail read.
   */
  async costSummaryForAccount(
    accountId: string,
  ): Promise<{ analysesCount: number; totalCostUsd: number | null; lastRunCostUsd: number | null }> {
    try {
      const rows = (await this.runs.manager.query(
        `
        SELECT
          COUNT(*)::int AS count,
          SUM(cost_eur) AS total_cost,
          (
            SELECT cost_eur FROM analysis_runs
             WHERE account_id = $1
             ORDER BY created_at DESC
             LIMIT 1
          ) AS last_cost
        FROM analysis_runs
        WHERE account_id = $1
        `,
        [accountId],
      )) as Array<{
        count: number | string | null
        total_cost: number | string | null
        last_cost: number | string | null
      }>
      const row = rows?.[0]
      const toNumberOrNull = (value: number | string | null | undefined): number | null => {
        if (value === null || value === undefined) return null
        const n = Number(value)
        return Number.isFinite(n) ? n : null
      }
      const count = Number(row?.count ?? 0)
      return {
        analysesCount: Number.isFinite(count) ? count : 0,
        totalCostUsd: toNumberOrNull(row?.total_cost),
        lastRunCostUsd: toNumberOrNull(row?.last_cost),
      }
    } catch (error) {
      this.logger.error('costSummaryForAccount error', { error, accountId })
      return { analysesCount: 0, totalCostUsd: null, lastRunCostUsd: null }
    }
  }

  /**
   * #2306.24 — LA VUE AGRÉGÉE : quels comptes du portefeuille ont été analysés
   * avec un profil ESN plus ancien que celui d'aujourd'hui.
   *
   * La fiche compte répond déjà à cette question un compte à la fois
   * (``ranWithOlderProfile`` / ``:id/profile-provenance``, `run-profile.ts`) —
   * rien n'agrégeait sur le portefeuille entier. MÊME prédicat (`< current`),
   * jamais un second calcul : `esnProfileVersion` du run le plus récent d'un
   * compte comparé à `currentEsnProfileVersion`.
   *
   * `currentEsnProfileVersion: null` (on ne sait pas lire le profil
   * aujourd'hui) rend `[]` sans même interroger la base — on ne construit pas
   * un avertissement sur une comparaison impossible (même règle que
   * `ranWithOlderProfile`). Best-effort : une erreur de lecture rend `[]`,
   * jamais une panne d'écran.
   */
  async listAccountsWithOlderProfile(
    workspaceId: string,
    businessUnitScope: { businessUnitIds: readonly string[]; includeUnassigned: true } | null,
    currentEsnProfileVersion: number | null,
  ): Promise<{ accountId: string; companyName: string; esnProfileVersion: number }[]> {
    if (currentEsnProfileVersion === null) return []
    try {
      const params: unknown[] = [workspaceId]
      let businessUnitClause = ''
      if (businessUnitScope) {
        if (businessUnitScope.businessUnitIds.length > 0) {
          params.push(businessUnitScope.businessUnitIds)
          businessUnitClause = ` AND (a.business_unit_id = ANY($${params.length}) OR a.business_unit_id IS NULL)`
        } else {
          businessUnitClause = ' AND a.business_unit_id IS NULL'
        }
      }
      params.push(currentEsnProfileVersion)
      const currentVersionParam = params.length
      const rows = (await this.runs.manager.query(
        `
        SELECT a.id AS account_id, a.company_name, latest.esn_profile_version
        FROM accounts a
        JOIN LATERAL (
          SELECT (ar.profile_provenance ->> 'esnProfileVersion')::int AS esn_profile_version
          FROM analysis_runs ar
          WHERE ar.account_id = a.id
          ORDER BY ar.created_at DESC
          LIMIT 1
        ) latest ON true
        WHERE a.workspace_id = $1
          AND a.status = 'completed'
          ${businessUnitClause}
          AND latest.esn_profile_version IS NOT NULL
          AND latest.esn_profile_version < $${currentVersionParam}
        ORDER BY a.company_name ASC
        `,
        params,
      )) as Array<{ account_id: string; company_name: string; esn_profile_version: number }>
      return rows.map(row => ({
        accountId: row.account_id,
        companyName: row.company_name,
        esnProfileVersion: row.esn_profile_version,
      }))
    } catch (error) {
      this.logger.warn('Failed to list accounts with an older ESN profile (non-fatal)', { error, workspaceId })
      return []
    }
  }
}
