import { describe, expect, it } from 'vitest'
import type { RecordFieldAudit } from '@bellum/contracts'
import { recordHistoryCorrectionViews } from './recordHistoryView'

function entry(over: Partial<RecordFieldAudit> = {}): RecordFieldAudit {
  return {
    id: 'a-1',
    entityType: 'account',
    entityId: 'acc-1',
    field: 'headquarters',
    oldValue: null,
    newValue: null,
    source: 'human',
    actorId: null,
    actorName: 'Louis',
    createdAt: '2026-09-18T09:00:00.000Z',
    rule: null,
    ...over,
  }
}

// #2318.6 — LAU-FINAL-059, CORRECTION UTILISATEUR : « source contestée » doit
// nommer la source de la valeur REMPLACÉE, jamais celle de l'écriture entrante.
describe('recordHistoryCorrectionViews', () => {
  it('la ligne la plus RÉCENTE conteste la source de la ligne plus ANCIENNE, même champ', () => {
    // Journal trié newest-first, comme ProvenanceService.history le rend.
    const entries = [
      entry({ id: 'a-2', field: 'headquarters', oldValue: 'Lyon', newValue: 'Paris', source: 'human' }),
      entry({ id: 'a-1', field: 'headquarters', oldValue: null, newValue: 'Lyon', source: 'pipeline' }),
    ]
    const views = recordHistoryCorrectionViews(entries)
    expect(views[0].contestedSource).toBe('pipeline')
    // La plus ancienne n'avait rien avant : rien à contester.
    expect(views[1].contestedSource).toBeNull()
  })

  it('ignore les lignes d’un AUTRE champ pour trouver la source précédente', () => {
    const entries = [
      entry({ id: 'a-3', field: 'headquarters', oldValue: 'Lyon', newValue: 'Paris', source: 'human' }),
      entry({ id: 'a-2', field: 'sector', oldValue: 'Banque', newValue: 'Finance', source: 'human' }),
      entry({ id: 'a-1', field: 'headquarters', oldValue: null, newValue: 'Lyon', source: 'pipeline' }),
    ]
    const views = recordHistoryCorrectionViews(entries)
    expect(views[0].contestedSource).toBe('pipeline')
  })

  it('aucune ligne antérieure connue pour ce champ : `null`, jamais une source devinée', () => {
    const views = recordHistoryCorrectionViews([entry({ oldValue: 'Lyon', newValue: 'Paris' })])
    expect(views[0].contestedSource).toBeNull()
  })
})
