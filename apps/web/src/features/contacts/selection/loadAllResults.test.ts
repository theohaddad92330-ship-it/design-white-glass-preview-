import { describe, expect, it, vi } from 'vitest'
import { loadAllResults, SELECT_ALL_CAP } from './loadAllResults'

type Row = { id: string }
const rows = (from: number, n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: `c${from + i}` }))

function pager(total: number, size = 25) {
  let loaded = size
  return {
    first: rows(0, Math.min(size, total)),
    fetchNext: vi.fn(async () => {
      loaded = Math.min(total, loaded + size)
      return { rows: rows(0, loaded), hasNextPage: loaded < total, failed: false }
    }),
  }
}

describe('loadAllResults (#3701.3)', () => {
  it('charge les 47 résultats de recette, pages après pages', async () => {
    const p = pager(47)
    const out = await loadAllResults({ loaded: p.first, hasNextPage: true, total: 47, fetchNext: p.fetchNext })
    expect(out.rows).toHaveLength(47)
    expect(out.capped).toBe(false)
    expect(out.failed).toBe(false)
  })

  it('plafonne à 250 et le DIT : 250 chargés sur 300, jamais « tous »', async () => {
    const p = pager(300)
    const out = await loadAllResults({ loaded: p.first, hasNextPage: true, total: 300, fetchNext: p.fetchNext })
    expect(SELECT_ALL_CAP).toBe(250)
    expect(out.rows).toHaveLength(250)
    expect(out.capped).toBe(true)
    expect(out.total).toBe(300)
  })

  it('250 résultats pile ne sont pas plafonnés', async () => {
    const p = pager(250)
    const out = await loadAllResults({ loaded: p.first, hasNextPage: true, total: 250, fetchNext: p.fetchNext })
    expect(out.rows).toHaveLength(250)
    expect(out.capped).toBe(false)
  })

  it('une page en échec rend ce qui est chargé et marque l’échec', async () => {
    const out = await loadAllResults({
      loaded: rows(0, 25),
      hasNextPage: true,
      total: 100,
      fetchNext: async () => ({ rows: rows(0, 25), hasNextPage: true, failed: true }),
    })
    expect(out.rows).toHaveLength(25)
    expect(out.failed).toBe(true)
  })
})
