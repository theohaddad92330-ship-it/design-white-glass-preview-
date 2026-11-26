import { beforeEach, describe, expect, it, vi } from 'vitest'
import { talentSearchQuerySchema } from '@bellum/contracts'

/**
 * #3488 — « Ton vivier est vide » alors que le dossier nomme des consultants :
 * les 20 fiches de l'espace étaient ARCHIVÉES, et `search()` ne transmettait
 * pas `includeArchived` — « Afficher les archivés » n'atteignait jamais le
 * serveur. Chaque filtre du contrat DOIT voyager.
 */
const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

const { consultantsApi } = await import('./api')

function sentParams(): URLSearchParams {
  const { path } = apiFetch.mock.calls[0]?.[0] as { path: string }
  return new URLSearchParams(path.split('?')[1])
}

beforeEach(() => {
  apiFetch.mockReset().mockResolvedValue({ items: [], total: 0, page: 1, limit: 25 })
})

describe('consultantsApi.search — le transport des filtres (#3488)', () => {
  it('transmet includeArchived : « Afficher les archivés » atteint le serveur', async () => {
    await consultantsApi.search({ page: 1, limit: 20, skills: [], includeArchived: true })
    expect(sentParams().get('includeArchived')).toBe('true')
  })

  it('ne transmet rien quand includeArchived est absent ou faux (le serveur coerce « false » en true)', async () => {
    await consultantsApi.search({ page: 1, limit: 20, skills: [] })
    expect(sentParams().has('includeArchived')).toBe(false)
  })

  it('transmet chaque autre filtre du contrat que le client ne savait pas dire', async () => {
    await consultantsApi.search({
      skills: [],
      reviewStatus: 'needs_review',
      radiusKm: 30,
      zone: 'Paris',
      minYearsExperience: 5,
      noMissionMonths: 3,
      consentState: 'expired',
      provenSkillsOnly: true,
      completeness: 'incomplete',
    })
    const sent = Object.fromEntries(sentParams())
    expect(sent).toMatchObject({
      reviewStatus: 'needs_review',
      radiusKm: '30',
      minYearsExperience: '5',
      noMissionMonths: '3',
      consentState: 'expired',
      provenSkillsOnly: 'true',
      completeness: 'incomplete',
    })
  })

  it('tout ce que le client envoie est accepté tel quel par le contrat du serveur', async () => {
    await consultantsApi.search({
      skills: [],
      includeArchived: true,
      reviewStatus: 'qualified',
      completeness: 'enriched',
    })
    const parsed = talentSearchQuerySchema.parse({ ...Object.fromEntries(sentParams()), skills: [] })
    expect(parsed.includeArchived).toBe(true)
    expect(parsed.reviewStatus).toBe('qualified')
  })
})
