import { deriveAccountStrategy5P } from '@bellum/contracts'
import { COMMERCIAL_BRIEF_BY_COMPANY, briefPartners } from './commercial-brief-seed'
import { DEMO_SPRINT_PARTNER_ROUTE_PARTNER } from './demo-dataset'

/**
 * #3684.6 — parité démo des trois états de « l'ESN citée en stratégie » : déclarée par l'équipe,
 * observée seule, relation non documentée. Aucune donnée neuve : les trois états existent déjà dans
 * les briefs réels et la déclaration CGI de la route partenaire — ce garde le PROUVE par la
 * dérivation de production (`deriveAccountStrategy5P`), jamais par un compte recopié.
 */
function passageOf(partners: Parameters<typeof deriveAccountStrategy5P>[0]['partners']) {
  return deriveAccountStrategy5P({
    accountId: '11111111-1111-4111-8111-111111111111',
    analysis: {},
    contacts: [],
    partners,
  }).passage
}

describe('#3684.6 — les trois états de l’ESN citée sont tous démontrables', () => {
  it('déclarée par l’équipe : CGI chez BNP Paribas', () => {
    const seed = DEMO_SPRINT_PARTNER_ROUTE_PARTNER
    const passage = passageOf([
      { name: seed.name, rank: seed.rank, relationship: seed.relationship, source: 'declared' },
    ])
    expect(passage.cited_esns?.[0]).toMatchObject({ name: 'CGI', certainty: 'probable_relation', founded: true })
    expect(passage.partner.value).toBe('CGI')
  })

  it('observée seule : une ESN d’un brief réel reste une piste à vérifier, jamais un partenaire', () => {
    const observed = Object.values(COMMERCIAL_BRIEF_BY_COMPANY).flatMap(brief => briefPartners(brief))
    expect(observed.length).toBeGreaterThan(0)
    const passage = passageOf(
      observed.slice(0, 1).map(p => ({
        name: p.name,
        rank: p.rank,
        relationship: p.relationship,
        source: p.partnerSource,
        scope: p.scope,
      })),
    )
    expect(passage.cited_esns?.[0]).toMatchObject({
      certainty: 'historic_observation',
      founded: false,
      next_check: 'confirm_relation',
    })
    expect(passage.partner.status).toBe('missing')
  })

  it('relation non documentée : un brief sans ESN ne fait aucune ligne', () => {
    const none = Object.values(COMMERCIAL_BRIEF_BY_COMPANY).filter(brief => briefPartners(brief).length === 0)
    expect(none.length).toBeGreaterThan(0)
    expect(passageOf([]).relation_documented).toBe(false)
  })
})
