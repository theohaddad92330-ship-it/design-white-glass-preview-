import type { WorkspaceActivityItem } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { activityCsvRows } from './activity-csv'

const item = (over: Partial<WorkspaceActivityItem> = {}): WorkspaceActivityItem => ({
  id: '11111111-1111-4111-8111-111111111111',
  event: 'member_invited',
  actor: { name: 'Théo Haddad', email: 'theo@exemple.fr' } as WorkspaceActivityItem['actor'],
  target: 'claire@exemple.fr',
  detail: 'rôle Commercial',
  occurredAt: '2026-10-21T16:20:00.000Z',
  ...over,
})

const labels = {
  header: ['Date', 'Par', 'Changement', 'Cible', 'Détail'],
  event: (name: string) => `événement ${name}`,
}

describe('Théo D settings-outils.A4 — l’export du journal', () => {
  it('une ligne d’en-tête, puis une ligne par fait, dans l’ordre reçu', () => {
    const rows = activityCsvRows([item(), item({ id: '22222222-2222-4222-8222-222222222222', target: null })], labels)
    expect(rows[0]).toEqual(labels.header)
    expect(rows).toHaveLength(3)
    expect(rows[1]).toEqual([
      '2026-10-21T16:20:00.000Z',
      'Théo Haddad',
      'événement member_invited',
      'claire@exemple.fr',
      'rôle Commercial',
    ])
  })

  it('⚠️ SAIT DIRE NON — une valeur absente reste VIDE, jamais « null » ni « 0 »', () => {
    const [, row] = activityCsvRows([item({ target: null, detail: null })], labels)
    expect(row?.[3]).toBe('')
    expect(row?.[4]).toBe('')
  })

  it('un acteur sans nom se lit par son e-mail, en clair', () => {
    const [, row] = activityCsvRows(
      [item({ actor: { name: null, email: 'theo@exemple.fr' } as WorkspaceActivityItem['actor'] })],
      labels,
    )
    expect(row?.[1]).toBe('theo@exemple.fr')
  })
})
