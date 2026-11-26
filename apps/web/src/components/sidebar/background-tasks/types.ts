import type { BrailleVariant } from '@bellum/ui'
import { i18n } from '@/i18n'

export type Status = 'running' | 'completed' | 'error'

/** Libellé du statut, résolu à l'appel pour suivre la langue active. */
// i18n keys: tasks.status.running | tasks.status.completed | tasks.status.error
export function statusLabel(status: Status): string {
  return i18n.t(`analysis:tasks.status.${status}`)
}

/**
 * Minimum perceived "running" duration. A task that finishes faster than this
 * (e.g. a profile auto-save returning in 200 ms) is held in the running state
 * until the threshold elapses, so the indicator is actually visible to the
 * user instead of flashing for one frame.
 */
export const MIN_RUNNING_MS = 800

/** Unified row shape derived from any task source. */
export type DisplayTask = {
  /** Source-prefixed id ("analysis:..", "task:..") so React keys stay unique. */
  key: string
  title: string
  /** Short label shown in the closed pill (defaults to title). */
  label: string
  /** Variant of the braille grid loader. */
  loaderVariant: BrailleVariant
  subtitle?: string
  status: Status
  /** #3666 (Louis 13/10, « étapes, pas de % ») — l'étape MESURÉE en cours
   *  (« Étape 4 sur 9 : décideurs »), jamais une barre chiffrée. */
  stepLabel?: string
  /** Set when a row should link to /accounts/$id (analyses only for now). */
  accountId?: string
  /** Stable id for the originating store, used by the dismiss button. */
  sourceId: string
  source: 'analysis' | 'task'
  startedAt: number
}

export type DismissFn = (entry: DisplayTask) => void
