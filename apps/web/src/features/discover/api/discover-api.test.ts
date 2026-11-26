import { vi, beforeEach } from 'vitest'

// `vi.hoisted` so the spy exists before the hoisted `vi.mock` factory runs, and
// the module under test receives THE spy itself (no wrapper indirection — a
// wrapper re-throws outside the spy and vitest reports it as an unhandled error).
const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('@/lib/api', () => ({ apiFetch }))

const { discoverApi, __testing } = await import('./discover-api')

const candidate = {
  name: 'ACME',
  siren: '552100554',
  score: 70,
  portfolioState: 'new',
}

beforeEach(() => apiFetch.mockReset())

describe('unwrapEnvelope', () => {
  it('unwraps a { success, data } envelope', () => {
    expect(__testing.unwrapEnvelope({ success: true, data: { candidates: [] } })).toEqual({ candidates: [] })
  })

  it('leaves a flat response alone', () => {
    const flat = { candidates: [], query: {}, degraded: [] }
    expect(__testing.unwrapEnvelope(flat)).toBe(flat)
  })

  it('does not unwrap when candidates already sit at the root', () => {
    const payload = { candidates: [candidate], data: { candidates: [] } }
    expect(__testing.unwrapEnvelope(payload)).toBe(payload)
  })

  it('passes null through untouched', () => {
    expect(__testing.unwrapEnvelope(null)).toBeNull()
  })
})

describe('discoverApi.registry', () => {
  it('POSTs the query to the contract endpoint', async () => {
    apiFetch.mockResolvedValue({ candidates: [], query: {}, degraded: [] })
    await discoverApi.registry({ filters: { department: '75' }, limit: 24 })
    expect(apiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/ia/discover/registry',
        method: 'POST',
        body: { filters: { department: '75' }, limit: 24 },
      }),
    )
  })

  it('normalizes the payload — a SIREN-less candidate never reaches the UI', async () => {
    apiFetch.mockResolvedValue({
      candidates: [candidate, { name: 'Fabricant Fenêtres', siren: '' }],
      query: {},
      degraded: [],
    })
    const res = await discoverApi.registry({ filters: {}, limit: 24 })
    expect(res.candidates.map(c => c.name)).toEqual(['ACME'])
  })

  it('surfaces degraded sources', async () => {
    apiFetch.mockResolvedValue({ candidates: [], query: {}, degraded: [{ source: 'BODACC', reason: 'quota' }] })
    const res = await discoverApi.registry({ filters: {}, limit: 24 })
    expect(res.degraded).toEqual([{ source: 'BODACC', reason: 'quota' }])
  })

  it('forwards the abort signal', async () => {
    apiFetch.mockResolvedValue({ candidates: [] })
    const controller = new AbortController()
    await discoverApi.registry({ filters: {}, limit: 24 }, controller.signal)
    expect(apiFetch).toHaveBeenCalledWith(expect.objectContaining({ signal: controller.signal }))
  })

  // La propagation d'erreur (le transport ne doit JAMAIS masquer une panne en
  // renvoyant une liste vide) est vérifiée au niveau du hook, où react-query la
  // reçoit et où l'écran bascule sur son état d'erreur — cf. useDiscoverSearch.test.
})

describe('discoverApi.signals', () => {
  it('POSTs to the signals endpoint', async () => {
    apiFetch.mockResolvedValue({ candidates: [], query: {}, degraded: [] })
    await discoverApi.signals({ sources: ['tender'], sinceDays: 30, limit: 24 })
    expect(apiFetch).toHaveBeenCalledWith(expect.objectContaining({ path: '/ia/discover/signals' }))
  })

  it('handles the wrapped envelope shape end to end', async () => {
    apiFetch.mockResolvedValue({ success: true, data: { candidates: [candidate], query: {}, degraded: [] } })
    const res = await discoverApi.signals({ sources: ['tender'], sinceDays: 30, limit: 24 })
    expect(res.candidates).toHaveLength(1)
  })
})

describe('discoverApi.people (#4634)', () => {
  it('les critères de personnes partent dans GET /contacts, encodés', async () => {
    apiFetch.mockResolvedValue({ data: [] })
    await discoverApi.people({
      q: 'data',
      limit: 50,
      criteria: { title: 'DSI & CTO', location: 'Lyon', userStatus: 'replied' },
    })
    const path = apiFetch.mock.calls[0][0].path as string
    const search = new URLSearchParams(path.split('?')[1])
    expect(search.get('title')).toBe('DSI & CTO')
    expect(search.get('location')).toBe('Lyon')
    expect(search.get('userStatus')).toBe('replied')
    expect(search.get('q')).toBe('data')
  })

  it('SAIT DIRE NON — sans critère, la requête est exactement celle d’avant', async () => {
    apiFetch.mockResolvedValue({ data: [] })
    await discoverApi.people({ q: 'data', limit: 50 })
    expect(apiFetch.mock.calls[0][0].path).toBe('/contacts?q=data&limit=50')
  })
})
