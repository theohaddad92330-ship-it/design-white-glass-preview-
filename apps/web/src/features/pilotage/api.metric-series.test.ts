import { describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (args: unknown) => apiFetch(args) }))

import { pilotageApi } from './api'

describe('pilotageApi.metricSeries — #3483.1', () => {
  it('borne la lecture par un délai : jamais un « Chargement » éternel', async () => {
    apiFetch.mockResolvedValue({ series: [], monthsCovered: 0 })
    await pilotageApi.metricSeries(12)
    const args = apiFetch.mock.calls[0]?.[0] as { path: string; signal?: AbortSignal }
    expect(args.path).toBe('/pilotage/metric-series?months=12')
    expect(args.signal).toBeInstanceOf(AbortSignal)
    expect(args.signal?.aborted).toBe(false)
  })
})
