import type { LauraJobView } from '@bellum/contracts'

/**
 * #5045 — le statut V8 d'un travail de Laura, DÉRIVÉ de l'état réel du job.
 * Aucune horloge côté client, aucune durée ni fourchette : l'état vient du
 * serveur (relecture `POLL_MS`), jamais d'une minuterie.
 */
type JobKicker = 'running' | 'awaiting' | 'done' | 'interrupted' | 'failed' | 'partial' | 'unknown'

interface JobStatus {
  kicker: JobKicker | null
  /** L'étape en cours lue au serveur, sinon la première à faire — jamais devinée. */
  current: { key: string; label: string } | null
  done: number
  total: number
  /** Faux tant que rien n'est parti : la carte garde alors « Rien n'est lancé ». */
  started: boolean
}

const KICKER_OF: Partial<Record<LauraJobView['state'], JobKicker>> = {
  planned: 'running',
  running: 'running',
  awaiting_approval: 'awaiting',
  done: 'done',
  cancelled: 'interrupted',
  failed: 'failed',
  partial: 'partial',
  unknown: 'unknown',
}

export function jobStatusOf(view: LauraJobView): JobStatus {
  const kicker = KICKER_OF[view.state] ?? null
  const steps = view.brief.steps
  const active = kicker === 'running' || kicker === 'awaiting'
  const step = active ? (steps.find(s => s.status === 'running') ?? steps.find(s => s.status === 'todo')) : undefined
  return {
    kicker,
    current: step ? { key: step.key, label: step.label } : null,
    done: view.progress.done,
    total: view.progress.total,
    started: kicker !== null,
  }
}
