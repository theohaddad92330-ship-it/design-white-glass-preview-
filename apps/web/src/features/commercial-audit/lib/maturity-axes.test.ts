import { describe, expect, it } from 'vitest'
import type { ProfileContext } from '@bellum/contracts'
import { auditMaturityAxisIdValues, MINIMUM_SCORE_AXES } from '@bellum/contracts'
import { computeCommercialMaturity } from './maturity-axes'

/**
 * #2065.1-.18 — un score n'est jamais nu : ses 12 axes sont TOUJOURS présents
 * et NOMMÉS, qu'ils soient mesurés ou non. Ce fichier garde cette promesse.
 */

const FULL_CONTEXT: ProfileContext = {
  esnArchetype: 'boutiqueExpert',
  sellingPosture: 'expertiseRare',
  idealAccountProfile: {
    size: 'eti',
    sectorsPriority: ['Banque', 'Assurance'],
    decisionLevel: 'director',
    entryStrategy: 'multiThread',
  },
  analysisParameters: {
    braveQueriesCount: 12,
    firecrawlPagesCount: 6,
    contactsTarget: 40,
    analysisDepth: 'deep',
    maxTokensResearch: 12000,
    focusAreas: ['Cloud', 'Data'],
  },
  messagingStyle: {
    tone: 'directExpert',
    messageLength: 'concise',
    valuePropositionAngle: 'Expertise cloud rare',
    differentiationPoints: ['Référence vérifiable', 'Consultants en CDI'],
    avoid: [],
  },
  coachingInsights: {
    mainWeakness: 'x',
    keyAdvice: 'y',
    cadenceRecommendation: { analysesPerWeek: 4, messagesPerDay: 6, followUpsPerWeek: 10 },
    kpiTargets: { accountsPerMonth: 10, rdvPerMonth: 5, conversionRateTarget: '10%' },
  },
}

describe('computeCommercialMaturity — les 12 axes sont TOUJOURS nommés', () => {
  it('rend toujours exactement les 12 axes, contexte absent ou plein', () => {
    expect(computeCommercialMaturity(undefined).axes).toHaveLength(auditMaturityAxisIdValues.length)
    expect(computeCommercialMaturity(FULL_CONTEXT).axes).toHaveLength(auditMaturityAxisIdValues.length)
    const ids = computeCommercialMaturity(undefined)
      .axes.map(a => a.id)
      .sort()
    expect(ids).toEqual([...auditMaturityAxisIdValues].sort())
  })

  it('sans profil, chaque axe calculable est « inconnu » avec un gap nommé — jamais un score à zéro', () => {
    const maturity = computeCommercialMaturity(undefined)
    const offerClarity = maturity.axes.find(a => a.id === 'offerClarity')
    expect(offerClarity?.state).toBe('unknown')
    expect(offerClarity?.score).toBeNull()
    expect(offerClarity?.gaps?.length).toBeGreaterThan(0)
  })

  it('des axes structurellement non mesurables aujourd’hui (preuve, qualification client, sécurisation candidat, capitalisation, alignement équipe) restent « inconnu » même avec un profil complet', () => {
    const maturity = computeCommercialMaturity(FULL_CONTEXT)
    for (const id of [
      'proof',
      'clientQualification',
      'candidateSecurisation',
      'capitalisation',
      'teamAlignment',
    ] as const) {
      const axis = maturity.axes.find(a => a.id === id)
      expect(axis?.state, id).toBe('unknown')
      expect(axis?.score, id).toBeNull()
    }
  })

  it('un profil complet mesure offerClarity, targeting, access, commercialCapacity, followUpDiscipline, dataAndTools, measurement', () => {
    const maturity = computeCommercialMaturity(FULL_CONTEXT)
    for (const id of [
      'offerClarity',
      'targeting',
      'access',
      'commercialCapacity',
      'followUpDiscipline',
      'dataAndTools',
      'measurement',
    ] as const) {
      const axis = maturity.axes.find(a => a.id === id)
      expect(axis?.state, id).toBe('measured')
      expect(axis?.score, id).not.toBeNull()
      expect(axis?.level, id).not.toBeNull()
    }
  })

  it(`un profil complet porte ${7} axes évalués — bien au-dessus du minimum de ${MINIMUM_SCORE_AXES}, donc un score global existe`, () => {
    const maturity = computeCommercialMaturity(FULL_CONTEXT)
    expect(maturity.score).not.toBeNull()
    expect(maturity.max).toBeGreaterThan(0)
  })

  it('sans profil du tout, moins de 3 axes sont évaluables : AUCUN score global, mais les axes restent visibles', () => {
    const maturity = computeCommercialMaturity(undefined)
    expect(maturity.score).toBeNull()
    expect(maturity.reason).not.toBeNull()
    expect(maturity.axes).toHaveLength(auditMaturityAxisIdValues.length)
  })

  it('un axe non évaluable ne pèse jamais dans `max` — sinon le score mesurerait la complétude de nos données', () => {
    const maturity = computeCommercialMaturity(FULL_CONTEXT)
    const evaluated = maturity.axes.filter(a => a.score !== null)
    // max = somme des maximums des seuls axes évalués (3 points par axe ici).
    expect(maturity.max).toBe(evaluated.length * 3)
  })
})

describe('axe ciblage — #4422.3 spécialisation fonctionnelle', () => {
  const FIVE_SECTORS: ProfileContext = {
    ...FULL_CONTEXT,
    idealAccountProfile: {
      ...FULL_CONTEXT.idealAccountProfile!,
      sectorsPriority: ['Transport', 'Logistique', 'Industrie', 'Distribution', 'Agroalimentaire'],
    },
  }
  const targeting = (answers?: Parameters<typeof computeCommercialMaturity>[1]) =>
    computeCommercialMaturity(FIVE_SECTORS, answers).axes.find(axis => axis.id === 'targeting')!

  it('forfait spécialisé supply chain, 5 secteurs → pas de dispersion, et le pourquoi est dit', () => {
    const axis = targeting({ workspace_profile: 'forfait_conseil', offer_domains: ['SUPPLY_CHAIN_SOP'] })
    expect(axis.gaps?.join(' ')).not.toMatch(/disperse/)
    expect(axis.evidence?.join(' ')).toContain(
      'Spécialisation fonctionnelle : la diversité de secteurs n’est pas une dispersion',
    )
  })

  it('régie multi-métiers, 5 secteurs → dispersion conservée', () => {
    const axis = targeting({ workspace_profile: 'staffing', offer_domains: ['SUPPLY_CHAIN_SOP', 'TREASURY_WC'] })
    expect(axis.gaps?.join(' ')).toMatch(/disperse/)
  })
})
