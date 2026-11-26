import { buildExpertiseCredibilityAudit, projectExpertiseGroundings, type ExpertiseGrounding } from '@bellum/contracts'
import {
  DEMO_AGREEMENT_CONFIRMED_CONSULTANT,
  DEMO_CONSULTANTS,
  DEMO_DELIVERY_CLIENT,
  DEMO_ESN_PROFILE,
  DEMO_EXPERTISE_GROUNDINGS,
} from './demo-dataset'

/**
 * Épopée #2880 (lot V33) — la salle montre les TROIS issues de l'audit à 3
 * états, et chaque preuve pointe un objet qui EXISTE dans la salle.
 */
describe('DEMO_EXPERTISE_GROUNDINGS (#2880)', () => {
  it('chaque objet source est un objet réel de la salle, relu par son nom', () => {
    const missionLabels = DEMO_DELIVERY_CLIENT.missions.map(m => m.label)
    const consultantNames = DEMO_CONSULTANTS.map(c => c.full_name)
    for (const g of DEMO_EXPERTISE_GROUNDINGS) {
      if (!g.source) continue
      if (g.source.type === 'mission') expect(missionLabels).toContain(g.source.name)
      else expect(consultantNames).toContain(g.source.name)
    }
  })

  it('« prouvé » a toujours une source (jamais inventé)', () => {
    for (const g of DEMO_EXPERTISE_GROUNDINGS) if (g.state === 'proven') expect(g.source).not.toBeNull()
  })

  it('l’audit de la salle montre les trois issues côte à côte', () => {
    const stored: ExpertiseGrounding[] = DEMO_EXPERTISE_GROUNDINGS.map((g, i) => ({
      id: `g-${i}`,
      expertiseKey: g.expertise_key,
      kind: g.kind,
      state: g.state,
      stateSource: 'user',
      sourceType: g.source?.type ?? null,
      sourceId: g.source ? `s-${i}` : null,
      sourceLabel: g.source?.name ?? null,
      label: g.label,
      confidentiality: g.confidentiality,
      archivedAt: null,
      createdAt: null,
      updatedAt: null,
    }))
    const groundings = projectExpertiseGroundings(DEMO_ESN_PROFILE, stored)
    const audit = buildExpertiseCredibilityAudit(DEMO_ESN_PROFILE.expertise_areas, groundings)
    expect(audit.map(a => [a.expertiseKey, a.knowHow.status, a.proof.status, a.sellableNow.status])).toEqual([
      ['Cloud & Infrastructure (AWS, Azure, GCP, Hosting)', 'established', 'established', 'established'],
      ['Data & Intelligence Artificielle', 'established', 'not_established', 'not_established'],
      ['Cybersécurité & Conformité', 'not_established', 'not_established', 'not_established'],
    ])
  })
})

describe('DEMO_AGREEMENT_CONFIRMED_CONSULTANT (#2175.29)', () => {
  it('est un consultant réel du vivier, POSITIONNÉ (CV parti) sur un besoin de la salle', () => {
    expect(DEMO_CONSULTANTS.map(c => c.full_name)).toContain(DEMO_AGREEMENT_CONFIRMED_CONSULTANT)
    const source = JSON.stringify(DEMO_DELIVERY_CLIENT)
    expect(source).toMatch(
      new RegExp(`"consultant":"${DEMO_AGREEMENT_CONFIRMED_CONSULTANT}"[^}]*"submitted_days_ago":\\d+`),
    )
  })
})
