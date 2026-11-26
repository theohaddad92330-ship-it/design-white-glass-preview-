import { ConsultantsService } from './consultants.service'

/**
 * #3410 (retour bêta #3410) — quatre préférences nouvelles sur la fiche
 * consultant : « une préférence négative est aussi importante qu'une
 * compétence positive » (Louis). Même patron que `consent-restrictions.spec.ts`.
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
  preferred_client_types: null,
  refused_clients: null,
  environments_to_avoid: null,
  non_negotiable_conditions: null,
  archived_at: null,
  archived_reason: null,
  review_status: 'qualified',
  contact_visible: true,
  finance_visible: true,
  tjm: null,
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
}

describe('préférences #3410 — écriture et lecture', () => {
  it('écrit les quatre champs et les rend sous consultant.preferences', async () => {
    const { service } = serviceWith({ ...BASE_ROW })
    const result = await service.update('c1', 'w1', 'u1', {
      full_name: 'Nadia Berrada',
      preferred_client_types: ['Grand compte'],
      refused_clients: ['Ancien Client SA'],
      environments_to_avoid: ['Astreinte'],
      non_negotiable_conditions: 'Pas de déplacement le vendredi',
    })
    expect(result?.consultant.preferences.preferredClientTypes).toEqual(['Grand compte'])
    expect(result?.consultant.preferences.refusedClients).toEqual(['Ancien Client SA'])
    expect(result?.consultant.preferences.environmentsToAvoid).toEqual(['Astreinte'])
    expect(result?.consultant.preferences.nonNegotiableConditions).toBe('Pas de déplacement le vendredi')
  })

  it('`null` RETIRE la condition non négociable — jamais une chaîne vide', async () => {
    const { service } = serviceWith({ ...BASE_ROW, non_negotiable_conditions: 'Ancienne condition' })
    const result = await service.update('c1', 'w1', 'u1', {
      full_name: 'Nadia Berrada',
      non_negotiable_conditions: null,
    })
    expect(result?.consultant.preferences.nonNegotiableConditions).toBeNull()
  })

  it('absents de l’entrée, les champs existants ne sont pas touchés', async () => {
    const { service, saved } = serviceWith({
      ...BASE_ROW,
      refused_clients: ['Déjà refusé SA'],
      non_negotiable_conditions: 'Condition en place',
    })
    await service.update('c1', 'w1', 'u1', { full_name: 'Nadia Berrada' })
    expect(saved[0].refused_clients).toEqual(['Déjà refusé SA'])
    expect(saved[0].non_negotiable_conditions).toBe('Condition en place')
  })

  it('sans donnée connue, la lecture rend des listes vides et `null` — jamais deviné', async () => {
    const { service } = serviceWith({ ...BASE_ROW })
    const result = await service.update('c1', 'w1', 'u1', { full_name: 'Nadia Berrada' })
    expect(result?.consultant.preferences.preferredClientTypes).toEqual([])
    expect(result?.consultant.preferences.refusedClients).toEqual([])
    expect(result?.consultant.preferences.environmentsToAvoid).toEqual([])
    expect(result?.consultant.preferences.nonNegotiableConditions).toBeNull()
  })
})
