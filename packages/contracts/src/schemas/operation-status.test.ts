import { describe, expect, it } from 'vitest'
import {
  OPERATION_STATUSES,
  analysisOperationStatus,
  importOperationStatus,
  universalImportOperationStatus,
} from './operation-status.js'

describe('#4295.1 — un seul vocabulaire d’état pour le travail asynchrone', () => {
  it('cinq états, dans l’ordre de #3666.3 (jamais réordonnés, GA-08)', () => {
    expect(OPERATION_STATUSES).toEqual(['pending', 'running', 'completed', 'partial', 'interrupted'])
  })

  it('analyse et import CRM : la lecture déjà livrée (#3666.3) ne bouge pas', () => {
    expect(analysisOperationStatus({ state: 'completed', warnings: [{}] })).toBe('partial')
    expect(analysisOperationStatus({ state: 'error', warnings: [] })).toBe('interrupted')
    expect(importOperationStatus('partial')).toBe('partial')
    expect(importOperationStatus('failed')).toBe('interrupted')
  })

  it('import universel : envoi et file = en attente, traitement = en cours', () => {
    expect(universalImportOperationStatus({ status: 'uploading' })).toBe('pending')
    expect(universalImportOperationStatus({ status: 'queued' })).toBe('pending')
    expect(universalImportOperationStatus({ status: 'processing' })).toBe('running')
  })

  it('import universel : `done` = terminée, même avec des lignes écartées (l’écran dit « Terminé », #4051.10)', () => {
    expect(universalImportOperationStatus({ status: 'done' })).toBe('completed')
  })

  it('NON — un échec ou un envoi resté en suspens n’est jamais « terminé » : interrompu', () => {
    expect(universalImportOperationStatus({ status: 'failed' })).toBe('interrupted')
    expect(universalImportOperationStatus({ status: 'processing', interrupted: true })).toBe('interrupted')
    expect(universalImportOperationStatus({ status: 'done', interrupted: true })).not.toBe('completed')
  })

  it('NON — un état inconnu vaut `null`, jamais un statut deviné', () => {
    expect(universalImportOperationStatus({ status: 'zzz' })).toBeNull()
    expect(universalImportOperationStatus({ status: '' })).toBeNull()
  })
})
