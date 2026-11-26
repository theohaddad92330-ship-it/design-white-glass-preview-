import { describe, expect, it } from 'vitest'
import { consultantFieldReportSchema, recordConsultantFieldReportSchema } from './consultant-field-report.js'

/**
 * #3406 — capitaliser une information terrain, avec consentement et sans
 * mettre le consultant en difficulté. Ces tests protègent la forme du
 * contrat : rien d'inventé, un veto PAR INFORMATION, des crans NOMMÉS.
 */

const MINIMAL_INPUT = {
  confidentialityLevel: 'interne' as const,
  confidence: 'moyenne' as const,
}

describe('recordConsultantFieldReportSchema', () => {
  it('accepte le minimum : confidentialité et confiance, rien d’autre exigé', () => {
    expect(recordConsultantFieldReportSchema.safeParse(MINIMAL_INPUT).success).toBe(true)
  })

  it('refuse sans confidentialité ni confiance — deux crans obligatoires', () => {
    expect(recordConsultantFieldReportSchema.safeParse({}).success).toBe(false)
  })

  it('refuse une confidentialité ou une confiance hors énumération — jamais un chiffre inventé', () => {
    expect(recordConsultantFieldReportSchema.safeParse({ ...MINIMAL_INPUT, confidence: 0.7 as never }).success).toBe(
      false,
    )
    expect(
      recordConsultantFieldReportSchema.safeParse({ ...MINIMAL_INPUT, confidentialityLevel: 'public' as never })
        .success,
    ).toBe(false)
  })

  it('accepte la trame complète — les trois questions, groupées en champs structurés', () => {
    const result = recordConsultantFieldReportSchema.safeParse({
      ...MINIMAL_INPUT,
      accountName: 'Société Générale',
      entity: 'DSI Marchés',
      team: 'Plateformes de trading',
      manager: 'Un manager cité par le consultant',
      possibleSponsor: 'Le directeur technique',
      decisionMakers: ['Un décideur cité'],
      peopleToContact: ['Une personne à contacter'],
      introductionPossible: 'Peut présenter directement',
      technologies: ['Kubernetes'],
      partnersObserved: ['Un partenaire observé'],
      notForCommercialUse: false,
    })
    expect(result.success).toBe(true)
  })

  it('REFUSE un champ en trop — le contrat est strict', () => {
    expect(recordConsultantFieldReportSchema.safeParse({ ...MINIMAL_INPUT, extra: 'non' }).success).toBe(false)
  })
})

describe('consultantFieldReportSchema — la forme LUE', () => {
  const READ_SHAPE = {
    id: 'r1',
    accountId: null,
    accountName: 'Société Générale',
    entity: null,
    team: null,
    manager: null,
    project: null,
    technologies: [],
    teamSize: null,
    partnersObserved: [],
    painPoints: null,
    possibleSponsor: null,
    decisionMakers: [],
    uncoveredNeed: null,
    peopleToContact: [],
    introductionPossible: null,
    notForCommercialUse: true,
    confidentialityLevel: 'confidentiel' as const,
    usageAuthorization: null,
    scope: null,
    confidence: 'faible' as const,
    recordedByUserId: 'u1',
    recordedByName: 'Une commerciale',
    declaredAt: '2026-09-30T08:00:00.000Z',
  }

  it('accepte une entrée complète', () => {
    expect(consultantFieldReportSchema.safeParse(READ_SHAPE).success).toBe(true)
  })

  it('le veto « pas d’exploitation commerciale » est un booléen par information, jamais déduit', () => {
    expect(consultantFieldReportSchema.parse(READ_SHAPE).notForCommercialUse).toBe(true)
    expect(consultantFieldReportSchema.parse({ ...READ_SHAPE, notForCommercialUse: false }).notForCommercialUse).toBe(
      false,
    )
  })
})
