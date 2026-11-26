import { z } from 'zod'
import { lauraContextModeSchema, type LauraContextMode } from './laura-context-mode.js'
import { discoverOriginCriteriaSchema } from './discover-origin.js'

/* ------------------------------------------------------------------------ */
/*  #2293 (LAU-FINAL-034) — LE LOT D'ANALYSES MULTI-COMPTES.                  */
/*                                                                          */
/*  ARBITRAGE D'ARCHITECTURE (23/09/2026, tranché sans Louis) :              */
/*  le « job parent » est une LIGNE (`analysis_batches`) qui suit ses         */
/*  sous-jobs (`analysis_batch_items`) ; chaque sous-job EST une analyse      */
/*  unitaire ordinaire (`POST /analysis/start`, même file BullMQ, même        */
/*  idempotence, même débit, même remboursement sur échec). Pas de second     */
/*  pipeline, pas de `FlowProducer` : un parent BullMQ aurait dupliqué le     */
/*  débit, la reprise et le remboursement que l'analyse unitaire porte déjà   */
/*  (GA-26 — un réglage vit à un seul endroit).                              */
/*                                                                          */
/*  Le statut du PARENT n'est jamais stocké : il s'agrège de ses sous-jobs    */
/*  (`summarizeAnalysisBatch`), et l'état d'un sous-job se LIT sur son        */
/*  analyse (`batchItemStateFromAnalysis`). Une colonne l'aurait figé.        */
/* ------------------------------------------------------------------------ */

/**
 * #2293.6 — les huit états individuels d'un sous-job, dans l'ordre de la
 * demande. `partial` = l'analyse s'est arrêtée APRÈS avoir livré des phases
 * (#2478 : « une grande partie a fonctionné ») — jamais confondu avec `failed`.
 *
 * `needs_resolution` (#2283.32, ajouté en fin — GA-08) est distinct de
 * `to_confirm` : `to_confirm` est une ambiguïté de NOM, avant tout lancement
 * (le registre rend plusieurs SIREN pour une saisie) ; `needs_resolution` est
 * une ambiguïté d'IDENTITÉ trouvée PENDANT l'analyse déjà lancée et terminée
 * (le Résolveur d'identité #2284 rend `entity_resolution.state === 'ambiguous'`
 * malgré un SIREN unique au départ — homonyme de taille/secteur incompatible).
 * Dans les deux cas, l'utilisateur choisit : demander une résolution (ouvrir
 * le dossier, #2284.65-.69 le sait déjà faire) ou exclure ce sous-job du lot
 * (`AnalysisBatchesService.exclude`) — jamais bloquer les autres.
 */
export const ANALYSIS_BATCH_ITEM_STATES = [
  'resolved',
  'to_confirm',
  'queued',
  'running',
  'partial',
  'done',
  'failed',
  'canceled',
  'needs_resolution',
] as const
export type AnalysisBatchItemState = (typeof ANALYSIS_BATCH_ITEM_STATES)[number]

/** États qu'aucune lecture ultérieure ne fera plus bouger. */
const TERMINAL_ITEM_STATES: readonly AnalysisBatchItemState[] = [
  'partial',
  'done',
  'failed',
  'canceled',
  'needs_resolution',
]

export function isTerminalBatchItemState(state: AnalysisBatchItemState): boolean {
  return TERMINAL_ITEM_STATES.includes(state)
}

/**
 * #2293.3 — d'où vient la liste d'entrée : les huit sources de la demande.
 * `laura` = une liste proposée par le copilote (la demande « résultats Laura »).
 */
export const ANALYSIS_BATCH_SOURCES = [
  'names',
  'identifiers',
  'target_list',
  'discover',
  'portfolio',
  'import',
  'laura',
  'saved_search',
] as const
export type AnalysisBatchSource = (typeof ANALYSIS_BATCH_SOURCES)[number]

/**
 * #2293.4 « limite du plan » — un lot porte au plus 50 entreprises (la recette
 * de la demande : « cinquante comptes »). Au-delà, la préview refuse plutôt
 * que de tronquer en silence.
 */
export const ANALYSIS_BATCH_MAX_ITEMS = 50

const sirenSchema = z.string().regex(/^\d{9}$/)

const analysisBatchInputSchema = z.object({
  name: z
    .string()
    .transform(value => value.trim())
    .pipe(z.string().min(1).max(200)),
  siren: sirenSchema.optional(),
  // Origine « suggestion » (Découvrir) — relayée TELLE QUELLE au lancement de
  // CE sous-job (`startAnalysisSchema`), pour la seule traçabilité du run.
  suggestion_id: z.string().min(1).max(200).optional(),
  suggestion_reason: z.string().min(1).max(2000).optional(),
  // #3819 (lot RBB) — et ses critères Découvrir, persistés sur le compte du sous-job.
  suggestion_criteria: discoverOriginCriteriaSchema.optional(),
})
export type AnalysisBatchInput = z.infer<typeof analysisBatchInputSchema>

/** Corps de `POST /analysis-batches/preview` ET de `POST /analysis-batches` — la même liste. */
export const createAnalysisBatchSchema = z.object({
  source: z.enum(ANALYSIS_BATCH_SOURCES),
  items: z.array(analysisBatchInputSchema).min(1).max(ANALYSIS_BATCH_MAX_ITEMS),
  // #2922 — le mode de contexte CHOISI pour ce lot (chip `analysis_batch`,
  // `SurfaceContextChip`). ADDITIF : absent ⇒ chaque sous-job retombe sur le
  // défaut de l'espace, exactement comme un lancement unitaire sans mode
  // (`startAnalysisSchema.context_mode`). UN choix pour tout le lot, jamais un
  // par entreprise — la chip se pose une fois, au-dessus de la liste.
  context_mode: lauraContextModeSchema.optional(),
})

/** Corps de `POST /analysis-batches/:id/items/:itemId/confirm` — l'entité choisie. */
export const confirmAnalysisBatchItemSchema = z.object({ siren: sirenSchema })

/** Une entité proposée pour lever une ambiguïté — rien d'autre que ce qui permet de choisir. */
export interface AnalysisBatchCandidate {
  name: string
  siren: string
  city: string | null
}

/**
 * Clé de dédoublonnage : le SIREN quand il est connu, sinon le nom normalisé
 * (casse, accents, ponctuation et espaces). « BPCE » et « bpce » sont le même
 * compte ; deux noms distincts portant le même SIREN aussi.
 */
export function analysisBatchItemKey(input: { name: string; siren?: string | null }): string {
  if (input.siren) return `siren:${input.siren}`
  const normalized = input.name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  return `name:${normalized}`
}

/** Garde la première occurrence de chaque compte et COMPTE ce qui a été retiré (#2293.4 « doublons »). */
export function dedupeAnalysisBatchInputs<T extends { name: string; siren?: string | null }>(
  inputs: readonly T[],
): { unique: T[]; duplicates: number } {
  const seen = new Set<string>()
  const unique: T[] = []
  for (const input of inputs) {
    const key = analysisBatchItemKey(input)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(input)
  }
  return { unique, duplicates: inputs.length - unique.length }
}

/**
 * L'état d'un sous-job LU sur son analyse (`GET /analysis/status/:accountId`).
 * `null` = l'analyse ne dit rien (job introuvable) : on garde le dernier état
 * connu plutôt que d'en deviner un.
 *
 * #2283.32 — `entityAmbiguity` porte le verdict du Résolveur d'identité
 * (#2284, `raw_analysis.entity_resolution`) au moment où l'analyse se termine.
 * Absent/`null` : identité résolue sans ambiguïté, l'analyse est bien `done`.
 * Renseigné : l'analyse a livré son travail (rien n'est perdu), mais le
 * sous-job reste `needs_resolution` — jamais `done` sur une identité encore en
 * question.
 */
export function batchItemStateFromAnalysis(status: {
  state: 'active' | 'completed' | 'failed' | 'canceled' | 'not_found'
  phase: string | null
  completedPhases: readonly string[]
  entityAmbiguity?: { candidates: AnalysisBatchCandidate[] } | null
}): AnalysisBatchItemState | null {
  switch (status.state) {
    case 'completed':
      return status.entityAmbiguity ? 'needs_resolution' : 'done'
    case 'canceled':
      return 'canceled'
    case 'failed':
      return status.completedPhases.length > 0 ? 'partial' : 'failed'
    case 'active':
      return status.phase || status.completedPhases.length > 0 ? 'running' : 'queued'
    default:
      return null
  }
}

export type AnalysisBatchStatus = 'needs_confirmation' | 'running' | 'finished' | 'finished_with_failures' | 'canceled'

/** Statut agrégé du PARENT + compte par état — dérivé, jamais stocké. */
export function summarizeAnalysisBatch(
  states: readonly AnalysisBatchItemState[],
  canceledAt: string | null,
): { status: AnalysisBatchStatus; counts: Record<AnalysisBatchItemState, number>; total: number } {
  const counts = Object.fromEntries(ANALYSIS_BATCH_ITEM_STATES.map(state => [state, 0])) as Record<
    AnalysisBatchItemState,
    number
  >
  for (const state of states) counts[state] += 1
  const inFlight = counts.resolved + counts.queued + counts.running
  const status: AnalysisBatchStatus = canceledAt
    ? 'canceled'
    : inFlight > 0
      ? 'running'
      : counts.to_confirm + counts.needs_resolution > 0
        ? 'needs_confirmation'
        : counts.failed + counts.partial > 0
          ? 'finished_with_failures'
          : 'finished'
  return { status, counts, total: states.length }
}

/** #2293.4 — une ligne de la préview : ce que le lancement ferait pour CETTE entreprise. */
export interface AnalysisBatchPreviewItem {
  name: string
  siren: string | null
  resolution: 'resolved' | 'to_confirm'
  /** Proposées quand le nom seul ne désigne pas une entité unique. Vide sinon. */
  candidates: AnalysisBatchCandidate[]
  /** `cache_hit` = déjà analysé dans l'espace, rouvert sans débit ; `demo` = espace de démonstration. */
  scenario: 'fresh' | 'cache_hit' | 'demo' | null
  /** Crédits que CE lancement débiterait. `null` = rien à débiter tant que l'entité n'est pas confirmée. */
  credits: number | null
}

/**
 * #2293.4 — la préview du lot, avant tout lancement et tout débit.
 * `durationMinutes` est ABSENT à dessein : aucune durée n'est mesurée à
 * l'avance, et une estimation présentée comme un fait est refusée (doctrine).
 */
export interface AnalysisBatchPreview {
  items: AnalysisBatchPreviewItem[]
  duplicates: number
  counts: { resolved: number; toConfirm: number; alreadyAnalyzed: number; fresh: number }
  /** Somme EXACTE des débits des entreprises résolues et neuves — jamais un prix de grille. */
  totalCredits: number
  maxItems: number
  parallelRuns: number
  demo: boolean
}

/** Un sous-job tel que l'écran du lot le lit. */
export interface AnalysisBatchItem {
  id: string
  position: number
  name: string
  siren: string | null
  state: AnalysisBatchItemState
  accountId: string | null
  /**
   * Entités proposées pour lever une ambiguïté — sur `to_confirm` (le nom seul
   * ne désigne pas une entité au registre, avant lancement) ET sur
   * `needs_resolution` (#2283.32 : le Résolveur d'identité #2284 reste ambigu
   * une fois l'analyse terminée). Vide sinon.
   */
  candidates: AnalysisBatchCandidate[]
  /** Le code d'échec au lancement (`insufficient_credits`…) ; `null` sinon. */
  failureCode: string | null
  /** Vrai seulement si CE sous-job a déclenché un débit (analyse neuve lancée). */
  charged: boolean
}

export interface AnalysisBatch {
  id: string
  source: AnalysisBatchSource
  createdAt: string
  canceledAt: string | null
  status: AnalysisBatchStatus
  counts: Record<AnalysisBatchItemState, number>
  total: number
  /** Nombre de sous-jobs RÉELLEMENT débités — un fait, pas une estimation. */
  charged: number
  items: AnalysisBatchItem[]
  /** #2922 — `null` = aucun choix fait au lancement (défaut de l'espace appliqué). */
  contextMode: LauraContextMode | null
}
