import { describe, expect, it, vi } from 'vitest'
import { runEnrichmentBatch } from './enrichBatchRunner'

const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `c${i}` }))

/** #3822 / J1b — un lot de 21 contacts doit ressortir avec 21 issues, jamais 8. */
describe('runEnrichmentBatch', () => {
  it('rend une issue PAR contact, dans l ordre, même si certains échouent', async () => {
    const run = vi.fn(async (c: { id: string }) => {
      if (c.id === 'c1') throw new Error('boom')
      return c.id
    })
    const out = await runEnrichmentBatch(items(4), run, { concurrency: 2, perItemTimeoutMs: 1000 })
    expect(out.map(o => o.kind)).toEqual(['ok', 'error', 'ok', 'ok'])
    expect(out.map(o => o.item.id)).toEqual(['c0', 'c1', 'c2', 'c3'])
  })

  it('ne dépasse jamais la concurrence demandée', async () => {
    let live = 0
    let peak = 0
    const run = async () => {
      live += 1
      peak = Math.max(peak, live)
      await new Promise(r => setTimeout(r, 5))
      live -= 1
      return 'x'
    }
    await runEnrichmentBatch(items(9), run, { concurrency: 3, perItemTimeoutMs: 1000 })
    expect(peak).toBe(3)
  })

  it('un contact qui ne répond jamais est déclaré en échec (timeout) et le lot continue', async () => {
    const run = async (c: { id: string }) => {
      if (c.id === 'c0') return new Promise<string>(() => undefined)
      return c.id
    }
    const out = await runEnrichmentBatch(items(3), run, { concurrency: 1, perItemTimeoutMs: 20 })
    expect(out[0]!.kind).toBe('error')
    expect(out[1]!.kind).toBe('ok')
    expect(out[2]!.kind).toBe('ok')
  })

  it('un arrêt (signal) nomme les contacts non traités au lieu de les taire', async () => {
    const ctrl = new AbortController()
    const run = async (c: { id: string }) => {
      if (c.id === 'c1') ctrl.abort()
      return c.id
    }
    const out = await runEnrichmentBatch(items(5), run, { concurrency: 1, perItemTimeoutMs: 1000, signal: ctrl.signal })
    expect(out.map(o => o.kind)).toEqual(['ok', 'ok', 'not_processed', 'not_processed', 'not_processed'])
  })

  it('stopOn : crédits épuisés ⇒ les suivants ne partent pas, ils sont non traités', async () => {
    const run = async (c: { id: string }) => {
      if (c.id === 'c1') throw Object.assign(new Error('402'), { status: 402 })
      return c.id
    }
    const out = await runEnrichmentBatch(items(4), run, {
      concurrency: 1,
      perItemTimeoutMs: 1000,
      stopOn: e => (e as { status?: number }).status === 402,
    })
    expect(out.map(o => o.kind)).toEqual(['ok', 'error', 'not_processed', 'not_processed'])
  })

  it('signale la progression', async () => {
    const seen: number[] = []
    await runEnrichmentBatch(items(3), async c => c.id, {
      concurrency: 1,
      perItemTimeoutMs: 1000,
      onProgress: (done, total) => seen.push(done * 10 + total),
    })
    expect(seen).toEqual([13, 23, 33])
  })
})
