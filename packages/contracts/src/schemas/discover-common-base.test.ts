import { describe, expect, it } from 'vitest'
import {
  DISCOVER_NEED_RECENT_MONTHS,
  discoverCandidateSchema,
  discoverCommonBaseCandidateSchema,
  discoverNeedFiltersSchema,
} from './discover.js'

/**
 * #4793.1 / #4791.2 (Louis 31/10) — la base COMMUNE fabrique des candidats ; leur carte porte un besoin DATÉ.
 * Contrat API → IA (`discoverCommonBaseCandidateSchema`) et champ de carte (`observedNeed`).
 */
describe('discoverCandidateSchema — observedNeed (#4791.2)', () => {
  const base = {
    name: 'Base Commune',
    siren: '700000001',
    nafCode: null,
    sector: null,
    city: null,
    department: null,
    headcountRange: null,
    creationDate: null,
    score: null,
    scoreFactors: [],
    angle: null,
    suggestedRoles: [],
    portfolioState: 'new' as const,
    accountId: null,
    sources: [],
    signals: [],
  }

  it('porte un besoin daté (récent OU historique, aucune borne d’âge)', () => {
    const parsed = discoverCandidateSchema.parse({ ...base, observedNeed: { label: 'Java', date: '2019-03-12' } })
    expect(parsed.observedNeed).toEqual({ label: 'Java', date: '2019-03-12' })
  })

  it('refuse un besoin sans date — une ligne sans date n’affiche aucun besoin', () => {
    expect(discoverCandidateSchema.safeParse({ ...base, observedNeed: { label: 'Java' } }).success).toBe(false)
    expect(discoverCandidateSchema.safeParse({ ...base, observedNeed: { label: 'Java', date: '' } }).success).toBe(
      false,
    )
  })

  it('reste absent sans besoin observé', () => {
    expect(discoverCandidateSchema.parse(base).observedNeed).toBeUndefined()
  })
})

describe('discoverCommonBaseCandidateSchema — le contrat API → IA (#4793.1)', () => {
  it('exige un SIREN réel et un nom', () => {
    expect(discoverCommonBaseCandidateSchema.safeParse({ siren: '700000001', name: 'X' }).success).toBe(true)
    expect(discoverCommonBaseCandidateSchema.safeParse({ siren: '7000', name: 'X' }).success).toBe(false)
    expect(discoverCommonBaseCandidateSchema.safeParse({ siren: '700000001', name: '' }).success).toBe(false)
  })

  it('ne porte AUCUN champ d’espace (strict : un workspaceId est refusé)', () => {
    expect(
      discoverCommonBaseCandidateSchema.safeParse({ siren: '700000001', name: 'X', workspaceId: 'ws-a' }).success,
    ).toBe(false)
  })
})

/**
 * #5203 (lot 782) — le besoin porte sa NATURE (recrutement, mission, projet) ; les filtres « période » et « nature »
 * des besoins voyagent dans les filtres de recherche. Aucun champ d'identité de personne dans le contrat.
 */
describe('#5203 — nature du besoin et filtres de besoins', () => {
  it('le candidat de la base commune porte une nature facultative', () => {
    const parsed = discoverCommonBaseCandidateSchema.parse({
      siren: '700000001',
      name: 'Acme',
      observedNeed: { label: 'Java', date: '2022-05-01', nature: 'mission' },
    })
    expect(parsed.observedNeed?.nature).toBe('mission')
    expect(
      discoverCommonBaseCandidateSchema.safeParse({
        siren: '700000001',
        name: 'Acme',
        observedNeed: { label: 'Java', date: '2022-05-01', nature: 'inconnue' },
      }).success,
    ).toBe(false)
  })

  it('un candidat issu des besoins passés de l’espace est marqué, sans champ d’identité', () => {
    const parsed = discoverCommonBaseCandidateSchema.parse({ siren: '700000001', name: 'Acme', fromSpace: true })
    expect(parsed.fromSpace).toBe(true)
  })

  it('les filtres de besoins : période et nature', () => {
    expect(discoverNeedFiltersSchema.parse({ needsPeriod: 'old', needsNature: ['mission', 'projet'] })).toEqual({
      needsPeriod: 'old',
      needsNature: ['mission', 'projet'],
    })
    expect(discoverNeedFiltersSchema.safeParse({ needsPeriod: 'hier' }).success).toBe(false)
    expect(DISCOVER_NEED_RECENT_MONTHS).toBe(6)
  })
})
