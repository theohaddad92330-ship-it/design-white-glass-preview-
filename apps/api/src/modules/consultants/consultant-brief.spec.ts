import type { Consultant, ConsultantMatch } from '@bellum/contracts'
import { buildConsultantBrief } from './consultant-brief'
import type { MatchTarget } from './consultant-matching'

/**
 * Brief de soutenance (annexe méthodo p22). Déterministe : forces = raisons du
 * match, objections = risques du match, plan J+30. Sans invention.
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
  years_experience: null,
  availability: 'immediate',
  available_from: null,
  contract_type: 'cdi',
  engagement_kind: 'salarie' as const,
  partner_account_id: null,
  contact_visible: true,
  finance_visible: true,
  tjm: 620,
  stack: ['SOC', 'Splunk'],
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
  references: ['SOC 24/7 assureur'],
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
  // #2330.1/.5 — le verdict NOMMÉ ; ce fixture correspond à un profil non
  // bloqué et bien noté.
  verdict: 'fortement_defendable',
  breakdown: [],
  skills: [],
  gaps: [],
  recommendedStep: 'proposer ce profil au client',
  reasons: ['compétences en commun : SOC, Splunk'],
  risks: ['TJM à confirmer'],
  blocked: false,
  // Le champ NOMME les critères qu'on n'a pas pu noter (D870). Ici le score
  // est mesuré, donc la liste est vide — ce qui n'est PAS la même chose qu'un
  // score absent : `score: null` + `unevaluated` non vide serait l'autre cas.
  unevaluated: [],
  clientHistory: null,
} satisfies ConsultantMatch

describe('buildConsultantBrief', () => {
  it('reprend le compte et le besoin dans le contexte', () => {
    const brief = buildConsultantBrief(CONSULTANT, TARGET, MATCH)
    expect(brief.context).toContain('Banque')
    expect(brief.context).toContain('Renfort SOC')
  })

  it('transforme les raisons du match en forces et les risques en objections', () => {
    const brief = buildConsultantBrief(CONSULTANT, TARGET, MATCH)
    expect(brief.strengths.join(' ')).toContain('SOC, Splunk')
    expect(brief.objections.join(' ')).toContain('TJM à confirmer')
  })

  it('donne un plan J+30 en jalons', () => {
    const brief = buildConsultantBrief(CONSULTANT, TARGET, MATCH)
    expect(brief.planJ30.length).toBeGreaterThanOrEqual(3)
    expect(brief.planJ30.join(' ')).toContain('J+30')
  })

  it('n’invente pas de risque quand le match n’en a aucun', () => {
    const brief = buildConsultantBrief(CONSULTANT, TARGET, { ...MATCH, risks: [] })
    expect(brief.objections.length).toBe(1)
    expect(brief.objections[0]).toContain('Aucun risque détecté')
  })
})
