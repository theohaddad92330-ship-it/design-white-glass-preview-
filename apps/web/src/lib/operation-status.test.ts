import { describe, expect, it } from 'vitest'
import { analysisOperationStatus, importOperationStatus, importReadableByLaura, importStage } from './operation-status'

describe('#3666.3 — un seul vocabulaire d’état pour les opérations longues', () => {
  it('analyse : starting = en attente, analyzing = en cours', () => {
    expect(analysisOperationStatus({ state: 'starting', warnings: [] })).toBe('pending')
    expect(analysisOperationStatus({ state: 'analyzing', warnings: [] })).toBe('running')
  })

  it('analyse : terminée sans avertissement = terminée ; avec sources dégradées = partielle', () => {
    expect(analysisOperationStatus({ state: 'completed', warnings: [] })).toBe('completed')
    expect(analysisOperationStatus({ state: 'completed', warnings: [{ code: 'x', message: 'y' }] })).toBe('partial')
  })

  it('analyse : une erreur est « interrompue », jamais « terminée »', () => {
    expect(analysisOperationStatus({ state: 'error', warnings: [] })).toBe('interrupted')
  })

  it('analyse : idle n’est pas une opération → null (SAIT DIRE NON)', () => {
    expect(analysisOperationStatus({ state: 'idle', warnings: [] })).toBeNull()
  })

  it('import : brouillon/simulé = en attente (rien n’est écrit)', () => {
    expect(importOperationStatus('draft')).toBe('pending')
    expect(importOperationStatus('simulated')).toBe('pending')
  })

  it('import : appliqué = terminé ; arrêté en route = partiel ; échec = interrompu', () => {
    expect(importOperationStatus('applied')).toBe('completed')
    expect(importOperationStatus('partial')).toBe('partial')
    expect(importOperationStatus('failed')).toBe('interrupted')
  })

  it('import : annulé ou état inconnu → null, jamais un statut deviné', () => {
    expect(importOperationStatus('rolled_back')).toBeNull()
    expect(importOperationStatus('zzz')).toBeNull()
  })

  it('import : fichier reçu ≠ import terminé', () => {
    expect(importStage('draft')).toBe('received')
    expect(importStage('simulated')).toBe('received')
    expect(importStage('applied')).toBe('written')
    expect(importStage('partial')).toBe('written')
    expect(importStage('failed')).toBeNull()
    expect(importStage('rolled_back')).toBeNull()
  })

  it('#3666.6 import : exploitable par Laura dès que des lignes sont écrites, jamais avant', () => {
    expect(importReadableByLaura('applied')).toBe(true)
    expect(importReadableByLaura('partial')).toBe(true)
    expect(importReadableByLaura('draft')).toBe(false)
    expect(importReadableByLaura('simulated')).toBe(false)
    expect(importReadableByLaura('failed')).toBe(false)
    expect(importReadableByLaura('rolled_back')).toBe(false)
  })
})
