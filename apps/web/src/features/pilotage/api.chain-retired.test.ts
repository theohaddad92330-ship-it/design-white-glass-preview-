import { PILOTAGE_LEVELS, type PilotageReport } from '@bellum/contracts'
import { describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

const { pilotageApi } = await import('./api')

// R21-FIX point 4b (15/10) : « Qualité Bellum 0 % » encore sur le Cockpit alors que Qualité est retirée.
describe('pilotageApi.chain — Qualité n’est plus un maillon affiché', () => {
  it('écarte le maillon retiré de la lecture, garde tous les autres', async () => {
    const levels = PILOTAGE_LEVELS.map(level => ({ level, status: 'ok', metrics: [] }))
    apiFetch.mockResolvedValue({ levels } as unknown as PilotageReport)

    const report = await pilotageApi.chain()

    expect(levels.map(l => l.level)).toContain('qualite')
    expect(report.levels.map(l => l.level)).not.toContain('qualite')
    expect(report.levels).toHaveLength(PILOTAGE_LEVELS.length - 1)
  })
})
