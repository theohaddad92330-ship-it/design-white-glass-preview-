import {
  ANALYSIS_DEPTH_PRESETS,
  ANALYSIS_SCOPE_MODE_LABELS,
  type AnalysisRun,
  type AnalysisRunDepth,
  type AnalysisScopeMode,
  type AnalysisVersioning,
  type VerdictRevision,
} from '@bellum/contracts'
import { i18n } from '@/i18n'
import { formatDate } from '@/lib/locale'

/**
 * View helpers for the account-detail « Historique des analyses » panel (Théo P0 :
 * « Un compte racine, plusieurs AnalysisRun. Historique, refresh, debug,
 * export »). Pure functions — unit-tested — so the panel component stays a thin
 * renderer.
 */

type RunStatusTone = 'success' | 'danger' | 'neutral' | 'info'

/**
 * La couleur de texte par tonalité — UN seul endroit (GA-26). `AccountRunsContainer`
 * (historique des analyses) et `RunningJobsBlock` (#2147.5, brief « Aujourd'hui »)
 * la partagent : deux copies auraient divergé le jour où une tonalité change de
 * couleur.
 */
export const RUN_STATUS_TONE_CLASS: Record<RunStatusTone, string> = {
  success: 'text-[var(--success-soft-text)] dark:text-[var(--success-soft-text)]',
  danger: 'text-[var(--danger-soft-text)] dark:text-[var(--danger-soft-text)]',
  info: 'text-[var(--bellum-text-accent)]',
  neutral: 'text-[var(--bellum-text-secondary)]',
}

type AnalysisRunView = {
  id: string
  dateLabel: string
  statusLabel: string
  statusTone: RunStatusTone
  scopeLabel: string
  /** #3288 — « Approfondie · 15 pages lues » : la profondeur du run (absente = « Vérifiée », l'analyse d'avant les paliers). */
  depthLabel: string
}

const STATUS_TONES: Record<string, RunStatusTone> = {
  analyzing: 'info',
  completed: 'success',
  error: 'danger',
  canceled: 'neutral',
}

/** Label + colour tone for a run status; unknown values pass through neutral. */
export function runStatusView(status: string): { label: string; tone: RunStatusTone } {
  const tone = STATUS_TONES[status]
  if (tone == null) return { label: status, tone: 'neutral' }
  // i18n keys: runStatus.analyzing | runStatus.completed | runStatus.error | runStatus.canceled
  return { label: i18n.t(`accounts:runStatus.${status}`), tone }
}

/** Canonical perimeter label for the run's scope; unknown/missing degrade
 *  gracefully (raw value, or the default-perimeter label). */
export function scopeModeLabel(scope: string | null | undefined): string {
  if (!scope) return i18n.t('accounts:scopeMode.default')
  if (!(scope in ANALYSIS_SCOPE_MODE_LABELS)) return scope
  // i18n keys: scopeMode.groupe | scopeMode.france | scopeMode.filiales | scopeMode.it_digital | scopeMode.startups | scopeMode.custom
  return i18n.t(`accounts:scopeMode.${scope as AnalysisScopeMode}`)
}

/**
 * #2915.3 — la date ET l'heure LOCALE d'une analyse (« 31/10 à 14:05 »), l'année seulement quand ce n'est pas
 * l'année en cours. Passe par `formatDate` (`@/lib/locale`, la seule dérivation « date lisible », GA-26).
 * ``—`` pour une date absente ou illisible : jamais « Invalid Date ».
 */
export function formatRunDate(iso: string | null | undefined): string {
  const date = formatDate(iso, {
    day: '2-digit',
    month: '2-digit',
    ...(iso && new Date(iso).getFullYear() !== new Date().getFullYear() ? { year: 'numeric' as const } : {}),
  })
  const time = formatDate(iso, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  if (date === null || time === null) return '—'
  return i18n.t('accountDetail:runs.dateAt', { date, time })
}

/** #3288 — la profondeur d'un run et le nombre de pages lues (la table `ANALYSIS_DEPTH_PRESETS` que le
 *  débit et l'IA lisent) ; un run sans palier est « vérifiée ». */
export function runDepthLabel(depth: AnalysisRunDepth | undefined): string {
  const resolved: AnalysisRunDepth = depth ?? 'verified'
  return i18n.t('accounts:runDepth.label', {
    depth: i18n.t(`accounts:runDepth.${resolved}`),
    count: ANALYSIS_DEPTH_PRESETS[resolved].pages,
  })
}

/** Project one run onto the compact history-row view, anchored on its launch
 *  date (``created_at``). */
export function toAnalysisRunView(run: AnalysisRun): AnalysisRunView {
  const { label, tone } = runStatusView(run.status)
  return {
    id: run.id,
    dateLabel: formatRunDate(run.created_at),
    statusLabel: label,
    statusTone: tone,
    scopeLabel: scopeModeLabel(run.scope_mode),
    depthLabel: runDepthLabel(run.scope_selection?.depth),
  }
}

type VersioningLine = { key: string; label: string; value: string }

/**
 * #2318.5 — LAU-FINAL-059, VERSIONING : les NEUF identifiants qu'une analyse
 * conserve (`buildAnalysisVersioning`, packages/contracts), mis en forme pour
 * l'écran. `date` et `scope` sont déjà rendus par `toAnalysisRunView`
 * (dateLabel/scopeLabel) — cette fonction couvre les SEPT autres, pour que le
 * même run n'affirme pas deux fois la même date sous deux formes.
 *
 * Un identifiant `null` (aucun sous-système ne le timbre encore) se dit « non
 * mesuré » — jamais absent de la liste, jamais un zéro ou un tiret muet
 * (GA-18/19, étendu aux chaînes de version par `analysis-versioning.ts`).
 */
export function versioningLines(versioning: AnalysisVersioning | undefined): VersioningLine[] {
  if (!versioning) return []
  const notMeasured = i18n.t('accounts:versioning.notMeasured')
  const promptVersion =
    versioning.prompt_version && typeof versioning.prompt_version === 'object'
      ? i18n.t('accounts:versioning.promptVersionPhases', { count: Object.keys(versioning.prompt_version).length })
      : notMeasured

  const entries: [string, string][] = [
    ['analysis_version', versioning.analysis_version ?? notMeasured],
    ['profile_version', versioning.profile_version ?? notMeasured],
    ['prompt_version', promptVersion],
    ['account_context_version', versioning.account_context_version ?? notMeasured],
    ['dataforge_version', versioning.dataforge_version ?? notMeasured],
    [
      'market_memory_version',
      versioning.market_memory_version ?? i18n.t('accounts:versioning.marketMemoryNotConsulted'),
    ],
    ['scoring_version', versioning.scoring_version ?? notMeasured],
  ]

  // #3235 (02/10) — la version de la mémoire marché n'existe que si le plan a
  // RÉELLEMENT lu un compte couvert. Un run sans version le DIT (« non
  // consultée »), au lieu de laisser croire que la ligne est cassée : cet état
  // est NOMMÉ, il n'est ni « non mesuré » ni un zéro.
  return entries.map(([key, value]) => ({ key, label: i18n.t(`accounts:versioning.field.${key}`), value }))
}

type VerdictRevisionView = {
  previousVerdict: string
  newVerdict: string
  changedAtLabel: string
  causes: string[]
}

/**
 * #3212.4/.6 (épopée #3235) — la révision de verdict, mise en forme pour
 * `AccountRunsContainer`. `formatRunDate` MÊME fonction que les lignes de
 * run (GA-26) — un changement de format de date ne doit pas diverger entre
 * les deux affichages du même compte.
 */
export function verdictRevisionView(revision: VerdictRevision | null | undefined): VerdictRevisionView | null {
  if (!revision) return null
  return {
    previousVerdict: revision.previousVerdict,
    newVerdict: revision.newVerdict,
    changedAtLabel: formatRunDate(revision.changedAt),
    causes: revision.causes,
  }
}
