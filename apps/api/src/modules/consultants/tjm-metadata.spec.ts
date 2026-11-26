import { ConsultantsService } from './consultants.service'

/**
 * #2948 (#2329.12/.13/.14/.16) — devise, source, contexte, date et
 * confidentialité d'un TJM. Même patron que `consent-restrictions.spec.ts` :
 * un axe SÉPARÉ, écrit et relu sans toucher au reste de la fiche.
 */

function serviceWith(row: Record<string, unknown>) {
  const saved: Record<string, unknown>[] = []
  const repo = {
    findOne: async () => row,
    save: async (entity: Record<string, unknown>) => {
      Object.assign(row, entity)
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
  return { service, saved }
}

const BASE_ROW = {
  id: 'c1',
  full_name: 'Karim Belaïd',
  kind: 'consultant',
  source: null,
  seniority: 'senior',
  availability: 'immediate',
  contract_type: 'freelance',
  engagement_kind: 'independant',
  stack: [],
  sectors: [],
  zones: [],
  references: [],
  languages: [],
  clearances: [],
  consent_given_at: null,
  consent_expires_at: null,
  consent_basis: null,
  consent_restrictions: null,
  archived_at: null,
  archived_reason: null,
  review_status: 'qualified',
  contact_visible: true,
  finance_visible: true,
  tjm: null,
  tjm_metadata: null,
  created_at: new Date('2026-09-26T00:00:00Z'),
  updated_at: new Date('2026-09-26T00:00:00Z'),
}

describe('tjm_metadata — écriture et lecture, distinct du montant', () => {
  it('écrit devise/source/contexte/date/confidentialité et les relit', async () => {
    const { service } = serviceWith({ ...BASE_ROW })
    const result = await service.update('c1', 'w1', 'u1', {
      full_name: 'Karim Belaïd',
      tjm_metadata: {
        currency: 'EUR',
        source: 'Déclaré par le consultant',
        context: 'Mission précédente chez un intégrateur',
        observed_at: '2026-06-01',
        confidential: true,
      },
    })
    expect(result?.consultant.tjm_metadata).toEqual({
      currency: 'EUR',
      source: 'Déclaré par le consultant',
      context: 'Mission précédente chez un intégrateur',
      observed_at: '2026-06-01',
      confidential: true,
    })
    // Le montant lui-même n'a pas bougé — deux axes indépendants.
    expect(result?.consultant.tjm).toBeNull()
  })

  it('`null` RETIRE la métadonnée — jamais un objet vide qui affirmerait « renseigné »', async () => {
    const { service } = serviceWith({
      ...BASE_ROW,
      tjm_metadata: { currency: 'EUR', source: null, context: null, observed_at: null, confidential: false },
    })
    const result = await service.update('c1', 'w1', 'u1', { full_name: 'Karim Belaïd', tjm_metadata: null })
    expect(result?.consultant.tjm_metadata).toBeNull()
  })

  it('absente de l’entrée, la métadonnée existante n’est pas touchée', async () => {
    const existing = { currency: 'USD', source: null, context: null, observed_at: null, confidential: false }
    const { service, saved } = serviceWith({ ...BASE_ROW, tjm_metadata: existing })
    await service.update('c1', 'w1', 'u1', { full_name: 'Karim Belaïd' })
    expect(saved[0].tjm_metadata).toEqual(existing)
  })
})
