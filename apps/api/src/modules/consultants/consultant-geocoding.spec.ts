import { ConsultantsService } from './consultants.service'

/**
 * Le rayon en km, en vrai (écran Vivier, PDF-22 §01, décision de Louis du
 * 31/08/2026) — la moitié ÉCRITURE : `ConsultantsService` géocode la première
 * zone déclarée via la Base Adresse Nationale, à la création ET à la mise à
 * jour, et pose `latitude`/`longitude` sur la fiche.
 *
 * La moitié LECTURE (le filtre par rayon, en SQL) est couverte par
 * `talent.service.spec.ts` — deux fichiers, parce que ce sont deux services
 * différents qui ne partagent qu'`GeocodingService`.
 */

function serviceWith(
  overrides: { row?: Record<string, unknown>; geocoded?: { latitude: number; longitude: number } | null } = {},
) {
  const saved: Record<string, unknown>[] = []
  const repo = {
    // #3781 — la garde « personne effacée » lit `person_erasures` : aucune ici.
    manager: { find: async () => [] },
    create: (input: Record<string, unknown>) => ({ ...input }),
    save: async (entity: Record<string, unknown>) => {
      saved.push({ ...entity })
      return entity
    },
  }
  const geocodeCalls: string[] = []
  const geocoding = {
    geocode: async (query: string) => {
      geocodeCalls.push(query)
      return overrides.geocoded === undefined ? { latitude: 48.8566, longitude: 2.3522 } : overrides.geocoded
    },
  }
  const service = new ConsultantsService(
    repo as never,
    null as never,
    null as never,
    null as never,
    null as never,
    geocoding as never,
  )
  ;(service as unknown as { findScoped: () => Promise<unknown> }).findScoped = async () =>
    overrides.row ?? { id: 'c1', full_name: 'Nadia Berger', zones: [] }
  ;(service as unknown as { toWire: (r: unknown) => unknown }).toWire = (r: unknown) => r
  ;(service as unknown as { seedSkills: () => Promise<void> }).seedSkills = async () => undefined
  return { service, saved, geocodeCalls }
}

describe('ConsultantsService.create — géocode à la création', () => {
  it('géocode la PREMIÈRE zone, et pose latitude/longitude', async () => {
    const { service, saved, geocodeCalls } = serviceWith()

    await service.create('w1', 'u1', { full_name: 'Nadia Berger', zones: ['Paris', 'remote'] })

    expect(geocodeCalls).toEqual(['Paris'])
    expect(saved[0]?.latitude).toBe(48.8566)
    expect(saved[0]?.longitude).toBe(2.3522)
  })

  it('ne géocode PAS quand aucune zone n’est saisie — pas de centre à trouver', async () => {
    const { service, saved, geocodeCalls } = serviceWith()

    await service.create('w1', 'u1', { full_name: 'Nadia Berger' })

    expect(geocodeCalls).toEqual([])
    expect(saved[0]?.latitude).toBeUndefined()
  })

  it('pose `null`, jamais une coordonnée inventée, quand le géocodage échoue', async () => {
    const { service, saved } = serviceWith({ geocoded: null })

    await service.create('w1', 'u1', { full_name: 'Nadia Berger', zones: ['Villeinconnuedelaban'] })

    expect(saved[0]?.latitude).toBeNull()
    expect(saved[0]?.longitude).toBeNull()
  })

  it('la fiche s’enregistre QUAND MÊME si le géocodage échoue — ce n’est pas bloquant', async () => {
    const { service, saved } = serviceWith({ geocoded: null })

    await expect(service.create('w1', 'u1', { full_name: 'Nadia Berger', zones: ['Nulle part'] })).resolves.toBeTruthy()
    expect(saved).toHaveLength(1)
  })
})

describe('ConsultantsService.update — regéocode quand `zones` est renvoyé', () => {
  it('regéocode sur la ligne FUSIONNÉE — la nouvelle première zone, pas l’ancienne', async () => {
    const { service, saved, geocodeCalls } = serviceWith({
      row: { id: 'c1', full_name: 'Nadia Berger', zones: ['Paris'], engagement_kind: 'inconnu' },
    })

    await service.update('c1', 'w1', 'u1', { full_name: 'Nadia Berger', zones: ['Lyon'] })

    expect(geocodeCalls).toEqual(['Lyon'])
    expect(saved[0]?.zones).toEqual(['Lyon'])
  })

  it('ne géocode PAS quand `zones` n’est pas dans la requête — un TJM corrigé ne doit rien y toucher', async () => {
    const { service, geocodeCalls } = serviceWith({
      row: { id: 'c1', full_name: 'Nadia Berger', zones: ['Paris'], engagement_kind: 'inconnu' },
    })

    await service.update('c1', 'w1', 'u1', { full_name: 'Nadia Berger', tjm: 650 })

    expect(geocodeCalls).toEqual([])
  })

  it('efface les coordonnées quand `zones` devient vide', async () => {
    const { service, saved } = serviceWith({
      row: { id: 'c1', full_name: 'Nadia Berger', zones: ['Paris'], engagement_kind: 'inconnu' },
    })

    await service.update('c1', 'w1', 'u1', { full_name: 'Nadia Berger', zones: [] })

    expect(saved[0]?.latitude).toBeNull()
    expect(saved[0]?.longitude).toBeNull()
  })
})
