import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { MissionExtractionInput } from './mission-extraction'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

const INPUT: MissionExtractionInput = { text: 'Fiche de mission — Acme Corp' }

/**
 * #2560 — ce que ce fichier garde :
 *
 *  1. Un succès de l'API voyage TEL QUEL — aucun champ n'est reconstruit ici.
 *  2. Une panne RÉSEAU rend `unavailable`, jamais une exception : l'appelant
 *     (le dialogue de création) ne doit jamais avoir à distinguer « le
 *     serveur a répondu 'unavailable' » de « la requête n'est jamais partie ».
 */
describe('extractMission', () => {
  beforeEach(() => apiFetch.mockReset())

  it('envoie le corps tel quel vers /delivery/missions/extract', async () => {
    const { extractMission } = await import('./mission-extraction')
    apiFetch.mockResolvedValue({
      status: 'ok',
      costUsd: 0.0013,
      fields: {
        accountName: { value: 'Acme Corp', confidence: 0.9, sourceExcerpt: 'Fiche de mission — Acme Corp' },
        roleTitle: { value: null, confidence: 0, sourceExcerpt: '' },
        startedOn: { value: null, confidence: 0, sourceExcerpt: '' },
        endsOn: { value: null, confidence: 0, sourceExcerpt: '' },
        dailyRate: { value: null, confidence: 0, sourceExcerpt: '' },
        days: { value: null, confidence: 0, sourceExcerpt: '' },
      },
    })

    const result = await extractMission(INPUT)

    expect(apiFetch).toHaveBeenCalledWith({ path: '/delivery/missions/extract', method: 'POST', body: INPUT })
    expect(result.status).toBe('ok')
    expect(result.fields.accountName.value).toBe('Acme Corp')
  })

  it('une panne réseau rend `unavailable`, jamais une exception qui remonterait', async () => {
    const { extractMission } = await import('./mission-extraction')
    // ⚠️ `-Once` : voir le commentaire jumeau dans `receipt-extraction.test.ts`
    // — la forme STICKY fait échouer ce test sur un rejet non intercepté par
    // Vitest, alors même que `extractMission` le capte correctement.
    apiFetch.mockRejectedValueOnce(new Error('Failed to fetch'))

    const result = await extractMission(INPUT)

    expect(result.status).toBe('unavailable')
    expect(result.costUsd).toBeNull()
    expect(result.fields.accountName.value).toBeNull()
    expect(result.fields.days.value).toBeNull()
  })
})
