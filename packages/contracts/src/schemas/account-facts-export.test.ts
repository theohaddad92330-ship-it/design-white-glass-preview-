import { describe, expect, it } from 'vitest'
import type { AccountFact } from './account-facts.js'
import {
  ACCOUNT_FACTS_EXPORT_COLUMNS,
  accountFactsExportCells,
  accountFactsExportRequestSchema,
} from './account-facts-export.js'
import { OUR_SUPPLIERS, supplierNamesIn } from './tool-naming.js'

const fact = (over: Partial<AccountFact> & Pick<AccountFact, 'kind' | 'date' | 'label'>): AccountFact => ({
  weight: 1,
  ageDays: 10,
  ...over,
})

describe('#4073.1 — les faits du compte dans un export', () => {
  it('rend, par colonne, le fait le plus RÉCENT de sa nature : date + libellé', () => {
    const cells = accountFactsExportCells([
      fact({ kind: 'hiring', date: '2025-01-10', label: 'Data engineer' }),
      fact({ kind: 'hiring', date: '2026-03-02', label: 'Architecte cloud' }),
      fact({ kind: 'need', date: '2026-02-01T09:00:00.000Z', label: 'Refonte SI' }),
      fact({ kind: 'signal', date: '2026-04-01', label: 'Levée de fonds' }),
      fact({ kind: 'deal_won', date: '2024-06-30', label: 'Migration ERP' }),
      fact({ kind: 'deal_lost', date: '2025-11-15', label: 'TMA' }),
      fact({ kind: 'mission', date: '2026-01-05', label: 'Mission Paris' }),
    ])
    expect(cells).toEqual({
      lastHiring: '2026-03-02 — Architecte cloud',
      lastNeed: '2026-02-01 — Refonte SI',
      lastSignal: '2026-04-01 — Levée de fonds',
      dealWon: '2024-06-30 — Migration ERP',
      dealLost: '2025-11-15 — TMA',
      mission: '2026-01-05 — Mission Paris',
    })
  })

  it('une absence = cellule VIDE, jamais « 0 » ni un tiret', () => {
    const cells = accountFactsExportCells([fact({ kind: 'note', date: '2026-01-01', label: 'RDV' })])
    for (const column of ACCOUNT_FACTS_EXPORT_COLUMNS) expect(cells[column]).toBe('')
    expect(Object.values(accountFactsExportCells([])).every(cell => cell === '')).toBe(true)
  })

  it('une date illisible écarte le fait : jamais une date devinée', () => {
    expect(accountFactsExportCells([fact({ kind: 'need', date: 'bientôt', label: 'X' })]).lastNeed).toBe('')
  })

  it('la requête borne la liste et exige des uuid', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    expect(accountFactsExportRequestSchema.safeParse({ accountIds: [id] }).success).toBe(true)
    expect(accountFactsExportRequestSchema.safeParse({ accountIds: ['x'] }).success).toBe(false)
    expect(accountFactsExportRequestSchema.safeParse({ accountIds: Array(501).fill(id) }).success).toBe(false)
  })
})

describe('#4073.2 — aucun nom de source ni de système dans un export', () => {
  const names = OUR_SUPPLIERS.map(supplier => supplier.name)

  it('sait dire NON : un nom injecté dans le libellé ne sort pas, la nature et la date restent', () => {
    for (const name of names) {
      const cells = accountFactsExportCells([
        fact({ kind: 'signal', date: '2026-04-01', label: `Levée de fonds vue chez ${name}` }),
        fact({ kind: 'hiring', date: '2026-03-02', label: `${name}: Architecte cloud` }),
        fact({ kind: 'mission', date: '2026-01-05', label: `Mission (${name.toUpperCase()})` }),
      ])
      for (const cell of Object.values(cells)) expect(supplierNamesIn(cell)).toEqual([])
      expect(cells.lastSignal).toBe('2026-04-01')
      expect(cells.lastHiring).toBe('2026-03-02')
    }
  })

  it('ne retire rien à un libellé propre (la garde ne attrape pas ce qu’elle ne vise pas)', () => {
    expect(
      accountFactsExportCells([fact({ kind: 'need', date: '2026-02-01', label: 'Bravoure & apollons' })]).lastNeed,
    ).toBe('2026-02-01 — Bravoure & apollons')
  })

  it('ne porte aucun champ de provenance : les colonnes sont les six natures, rien d’autre', () => {
    expect([...ACCOUNT_FACTS_EXPORT_COLUMNS]).toEqual([
      'lastHiring',
      'lastNeed',
      'lastSignal',
      'dealWon',
      'dealLost',
      'mission',
    ])
  })
})
