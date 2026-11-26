import { ConsultantsService } from './consultants.service'

/**
 * #3406 (retour bêta #3406) — capitaliser une information TERRAIN, avec
 * consentement et sans mettre le consultant en difficulté. APPEND-ONLY, même
 * patron que `recordInterviewTrait` (BEL-SC-238) : une information reste dans
 * l'historique, jamais réécrite ni supprimée.
 */

function serviceWith(row: Record<string, unknown>) {
  const saved: Record<string, unknown>[] = []
  const repo = {
    findOne: async () => row,
    save: async (entity: Record<string, unknown>) => {
      Object.assign(row, entity)
      saved.push({ ...entity })
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
  field_reports: null,
  archived_at: null,
  archived_reason: null,
  review_status: 'qualified',
  contact_visible: true,
  finance_visible: true,
  tjm: null,
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
}

describe('recordFieldReport — capitaliser une information terrain', () => {
  it('sans aucune information capitalisée, la fiche rend une liste vide — jamais deviné', async () => {
    const { service } = serviceWith({ ...BASE_ROW })
    const result = await service.update('c1', 'w1', 'u1', { full_name: 'Nadia Berrada' })
    expect(result?.consultant.fieldReports).toEqual([])
  })

  it('enregistre une information avec sa provenance complète', async () => {
    const { service } = serviceWith({ ...BASE_ROW })
    const result = await service.recordFieldReport(
      'c1',
      'w1',
      'u1',
      {
        accountName: 'Société Générale',
        entity: 'DSI Marchés',
        possibleSponsor: 'Le directeur technique',
        decisionMakers: ['Un décideur cité'],
        peopleToContact: ['Une personne à contacter'],
        confidentialityLevel: 'confidentiel',
        confidence: 'moyenne',
        notForCommercialUse: true,
      },
      'Une commerciale',
    )
    expect(result?.fieldReports).toHaveLength(1)
    const report = result?.fieldReports?.[0]
    expect(report?.accountName).toBe('Société Générale')
    expect(report?.recordedByUserId).toBe('u1')
    expect(report?.recordedByName).toBe('Une commerciale')
    expect(report?.notForCommercialUse).toBe(true)
    expect(report?.confidentialityLevel).toBe('confidentiel')
    expect(typeof report?.declaredAt).toBe('string')
    expect(typeof report?.id).toBe('string')
  })

  it('EMPILE une seconde information, ne réécrit jamais la première — on archive, on ne supprime pas', async () => {
    const { service } = serviceWith({ ...BASE_ROW })
    await service.recordFieldReport(
      'c1',
      'w1',
      'u1',
      { confidentialityLevel: 'interne', confidence: 'faible', accountName: 'Première info' },
      'Une commerciale',
    )
    const second = await service.recordFieldReport(
      'c1',
      'w1',
      'u1',
      { confidentialityLevel: 'interne', confidence: 'forte', accountName: 'Seconde info' },
      'Une commerciale',
    )
    expect(second?.fieldReports).toHaveLength(2)
    expect(second?.fieldReports?.map(r => r.accountName)).toEqual(['Première info', 'Seconde info'])
  })

  it('rend `null` introuvable si le consultant n’existe pas dans le périmètre', async () => {
    const { service } = serviceWith({ ...BASE_ROW })
    ;(service as unknown as { findScoped: () => Promise<null> }).findScoped = async () => null
    const result = await service.recordFieldReport(
      'unknown',
      'w1',
      'u1',
      { confidentialityLevel: 'interne', confidence: 'faible' },
      'Une commerciale',
    )
    expect(result).toBeNull()
  })
})
