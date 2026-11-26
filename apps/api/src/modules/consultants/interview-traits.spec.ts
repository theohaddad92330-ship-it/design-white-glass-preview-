import { ConsultantsService } from './consultants.service'

/**
 * BEL-SC-238 (#3267) — les traits observés en ENTRETIEN (communication,
 * autonomie) et le temps avant efficacité annoncé. Même patron que
 * `confirm-availability.spec.ts` : un geste explicite, jamais déduit.
 */

function serviceWith(row: Record<string, unknown>) {
  const saved: Record<string, unknown>[] = []
  const repo = {
    findOne: async () => row,
    save: async (entity: Record<string, unknown>) => {
      saved.push(entity)
      return entity
    },
  }
  const service = new ConsultantsService(
    repo as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
  )
  ;(service as unknown as { findScoped: () => Promise<unknown> }).findScoped = async () => row
  ;(service as unknown as { toWire: (r: unknown) => unknown }).toWire = (r: unknown) => r
  return { service, saved }
}

describe('recordInterviewTrait — un trait par entretien, jamais déduit du CV', () => {
  it('pose une première entrée, avec la source figée à "interview"', async () => {
    const { service, saved } = serviceWith({ id: 'c1', interview_traits: null })

    await service.recordInterviewTrait(
      'c1',
      'w1',
      'u1',
      { trait: 'communication', level: 'solide', note: null },
      'louis@bellum-it.com',
    )

    expect(saved).toHaveLength(1)
    const traits = saved[0].interview_traits as { trait: string; source: string }[]
    expect(traits).toHaveLength(1)
    expect(traits[0].trait).toBe('communication')
    expect(traits[0].source).toBe('interview')
  })

  it('REMPLACE l’entrée existante du même trait — l’entretien le plus récent fait foi, il ne s’empile pas', async () => {
    const { service, saved } = serviceWith({
      id: 'c1',
      interview_traits: [
        {
          trait: 'communication',
          level: 'a_developper',
          source: 'interview',
          note: 'premier entretien',
          recordedAt: '2026-01-01T00:00:00.000Z',
          recordedByName: null,
        },
      ],
    })

    await service.recordInterviewTrait(
      'c1',
      'w1',
      'u1',
      { trait: 'communication', level: 'fort', note: 'second entretien' },
      null,
    )

    const traits = saved[0].interview_traits as { trait: string; level: string; note: string | null }[]
    expect(traits).toHaveLength(1)
    expect(traits[0].level).toBe('fort')
    expect(traits[0].note).toBe('second entretien')
  })

  it('conserve les AUTRES traits déjà posés — un geste sur un trait ne touche pas les autres', async () => {
    const { service, saved } = serviceWith({
      id: 'c1',
      interview_traits: [
        {
          trait: 'autonomy',
          level: 'solide',
          source: 'interview',
          note: null,
          recordedAt: '2026-01-01T00:00:00.000Z',
          recordedByName: null,
        },
      ],
    })

    await service.recordInterviewTrait('c1', 'w1', 'u1', { trait: 'communication', level: 'fort', note: null }, null)

    const traits = saved[0].interview_traits as { trait: string }[]
    expect(traits.map(trait => trait.trait).sort()).toEqual(['autonomy', 'communication'])
  })

  it('rend `null` sur une fiche hors du périmètre de l’espace — jamais une écriture à l’aveugle', async () => {
    const repo = { findOne: async () => null, save: async () => null }
    const service = new ConsultantsService(
      repo as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
    )
    ;(service as unknown as { findScoped: () => Promise<unknown> }).findScoped = async () => null

    await expect(
      service.recordInterviewTrait('missing', 'w1', 'u1', { trait: 'communication', level: 'fort', note: null }, null),
    ).resolves.toBeNull()
  })
})

describe('recordRampUp — un fait unique, remplacé, jamais empilé', () => {
  it('pose la bande, la note et l’horodatage', async () => {
    const { service, saved } = serviceWith({ id: 'c1', ramp_up_band: null })

    const before = Date.now()
    await service.recordRampUp(
      'c1',
      'w1',
      'u1',
      { band: 'semaines', note: 'monte vite en charge' },
      'louis@bellum-it.com',
    )
    const after = Date.now()

    expect(saved[0].ramp_up_band).toBe('semaines')
    expect(saved[0].ramp_up_note).toBe('monte vite en charge')
    expect(saved[0].ramp_up_recorded_by_name).toBe('louis@bellum-it.com')
    const recordedAt = saved[0].ramp_up_recorded_at as Date
    expect(recordedAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(recordedAt.getTime()).toBeLessThanOrEqual(after)
  })

  it('REMPLACE la bande précédente plutôt que de l’empiler', async () => {
    const { service, saved } = serviceWith({ id: 'c1', ramp_up_band: 'mois', ramp_up_note: 'ancienne note' })

    await service.recordRampUp('c1', 'w1', 'u1', { band: 'immediat', note: null }, null)

    expect(saved[0].ramp_up_band).toBe('immediat')
    expect(saved[0].ramp_up_note).toBeNull()
  })
})
