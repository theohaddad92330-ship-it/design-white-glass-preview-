import type { AnalysisBatch } from '@bellum/contracts'

/** Ton de la pastille (variantes teintées de `Badge`) — la couleur dit un état, jamais un score. */
type BatchTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'default'

export function batchStatusTone(status: AnalysisBatch['status']): BatchTone {
  switch (status) {
    case 'finished':
      return 'success'
    case 'finished_with_failures':
      return 'warning'
    case 'running':
      return 'primary'
    case 'needs_confirmation':
      return 'info'
    case 'canceled':
      return 'default'
  }
}

/** L'état d'une entreprise du lot (ou de sa préview). Un état inconnu reste NEUTRE, jamais coloré au hasard. */
export function batchItemTone(state: string): BatchTone {
  switch (state) {
    case 'done':
      return 'success'
    case 'failed':
      return 'danger'
    case 'to_confirm':
    case 'needs_resolution':
      return 'warning'
    case 'running':
    case 'queued':
    case 'partial':
      return 'primary'
    case 'resolved':
      return 'info'
    default:
      return 'default'
  }
}
