import type { Consultant, ConsultantMatch } from '@bellum/contracts'
import { buildInterviewBrief } from './interview-brief'
import type { MatchTarget } from './consultant-matching'

/**
 * #2189.23-.30 (épopée #2940) — le brief d'entretien, distinct du brief de
 * soutenance : objectif, pitch, deux expériences, gaps, objections, questions
 * pour le consultant. Déterministe, sans invention.
 */
const CONSULTANT = {
  id: '1',
  workspace_id: null,
  kind: 'consultant',
  source: null,
  last_contact_at: null,
  archived_at: null,
  archived_reason: null,
  review_status: 'qualified' as const,
  consent: { givenAt: null, expiresAt: null, basis: null, restrictions: null },
  full_name: 'Nadia Fournier',
  title: 'Ingénieure sécurité',
  seniority: 'senior',
  years_experience: 8,
  availability: 'immediate',
  available_from: null,
  contract_type: 'cdi',
  engagement_kind: 'salarie' as const,
  partner_account_id: null,
  contact_visible: true,
  finance_visible: true,
  tjm: 620,
  stack: ['SOC', 'Splunk', 'Elastic', 'QRadar'],
  sectors: ['Banque'],
  zones: ['IDF'],
  education: [],
  mobility: {
    zones: null,
    remote: null,
    travel: null,
    relocation: null,
    siteFrequency: null,
    international: null,
    restrictions: null,
  },
  process: { inProgress: null, exclusive: null, otherInterviews: null, decisionDeadline: null },
  positioningAgreement: { tjmValidatedAt: null, cvValidatedAt: null, otherProcessesKnown: false },
  preferences: { wantedSectors: [], refusedSectors: [], refusedTechnologies: [], wantedContractKinds: [] },
  references: ['SOC 24/7 assureur', 'CERT groupe industriel', 'Astreinte banque de détail'],
  languages: [],
  clearances: [],
  wants: 'du SOC',
  notes: null,
  cv_text: null,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
} satisfies Consultant

const TARGET: MatchTarget = { label: 'Renfort SOC', sector: 'Banque' }

const MATCH = {
  consultant_id: '1',
  full_name: 'Nadia Fournier',
  score: 88,
  verdict: 'fortement_defendable',
  breakdown: [],
  skills: [],
  gaps: ['pas de Spark Streaming'],
  recommendedStep: 'proposer ce profil au client',
  reasons: ['compétences en commun : SOC, Splunk'],
  risks: ['TJM à confirmer'],
  blocked: false,
  unevaluated: [],
  clientHistory: null,
} satisfies ConsultantMatch

describe('buildInterviewBrief', () => {
  it('nomme le besoin dans l’objectif', () => {
    const brief = buildInterviewBrief(CONSULTANT, TARGET, MATCH)
    expect(brief.objective).toContain('Renfort SOC')
    expect(brief.objective).toContain('Nadia Fournier')
  })

  it('construit un pitch à partir du titre, de l’expérience et de la stack', () => {
    const brief = buildInterviewBrief(CONSULTANT, TARGET, MATCH)
    expect(brief.pitch).toContain('Ingénieure sécurité')
    expect(brief.pitch).toContain('8 ans')
    expect(brief.pitch).toContain('SOC')
  })

  it('retient les DEUX premières références, jamais plus', () => {
    const brief = buildInterviewBrief(CONSULTANT, TARGET, MATCH)
    expect(brief.keyExperiences).toEqual(['SOC 24/7 assureur', 'CERT groupe industriel'])
  })

  it('sépare gaps (ce qui manque) et objections (les risques reformulés)', () => {
    const brief = buildInterviewBrief(CONSULTANT, TARGET, MATCH)
    expect(brief.gaps).toEqual(['pas de Spark Streaming'])
    expect(brief.objections.join(' ')).toContain('TJM à confirmer')
    expect(brief.gaps).not.toEqual(brief.objections)
  })

  it('fournit un gabarit de questions pour le consultant, jamais vide', () => {
    const brief = buildInterviewBrief(CONSULTANT, TARGET, MATCH)
    expect(brief.consultantQuestions.length).toBeGreaterThan(0)
  })

  it('n’invente pas d’expérience quand le profil n’en a aucune', () => {
    const brief = buildInterviewBrief({ ...CONSULTANT, references: [] }, TARGET, MATCH)
    expect(brief.keyExperiences).toEqual([])
  })
})
