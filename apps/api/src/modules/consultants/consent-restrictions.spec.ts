import { ConsultantsService } from './consultants.service'

/**
 * #2185.57 — « Consentement : restrictions » : ce que la personne a EXCLU de
 * son accord (« pas de mission chez tel concurrent »). Distinct de
 * `consent_basis` — une restriction borne l'USAGE, pas le fondement.
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
  full_name: 'Nadia Berrada',
  kind: 'consultant',
  source: null,
  seniority: 'senior',
  availability: 'immediate',
  contract_type: 'cdi',
  engagement_kind: 'salarie',
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
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
}

describe('consent_restrictions — écriture et lecture, distinctes de consent_basis', () => {
  it('écrit la restriction saisie et la rend dans consent.restrictions', async () => {
    const { service } = serviceWith({ ...BASE_ROW })
    const result = await service.update('c1', 'w1', 'u1', {
      full_name: 'Nadia Berrada',
      consent_restrictions: 'Pas de mission chez un concurrent direct',
    })
    expect(result?.consultant.consent.restrictions).toBe('Pas de mission chez un concurrent direct')
    // La base légale, elle, n'a pas bougé — les deux axes sont indépendants.
    expect(result?.consultant.consent.basis).toBeNull()
  })

  it('`null` RETIRE la restriction — jamais une chaîne vide qui affirmerait « aucune »', async () => {
    const { service } = serviceWith({ ...BASE_ROW, consent_restrictions: 'Ancienne restriction' })
    const result = await service.update('c1', 'w1', 'u1', {
      full_name: 'Nadia Berrada',
      consent_restrictions: null,
    })
    expect(result?.consultant.consent.restrictions).toBeNull()
  })

  it('absente de l’entrée, la restriction existante n’est pas touchée', async () => {
    const { service, saved } = serviceWith({ ...BASE_ROW, consent_restrictions: 'Restriction en place' })
    await service.update('c1', 'w1', 'u1', { full_name: 'Nadia Berrada' })
    expect(saved[0].consent_restrictions).toBe('Restriction en place')
  })
})
