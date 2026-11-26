import { BELLUM_NEAR_SIGNING_STAGES, isNearSigningCrmStage } from './near-signing'

/**
 * #3904 — DÉCISION LOUIS 09/10 : « proche de signer » = une opportunité au
 * stade proposition OU négociation. Un STADE déclaré, jamais une probabilité.
 */
describe('near-signing (#3904)', () => {
  it('Bellum : « profils présentés » (la proposition d’une ESN) et « négociation », rien d’autre', () => {
    expect([...BELLUM_NEAR_SIGNING_STAGES]).toEqual(['profiles_submitted', 'negotiation'])
  })

  it.each([
    ['Proposition envoyée', null],
    ['Négociation', null],
    ['Negotiation', null],
    [null, 'proposal'],
    [null, 'contractsent'],
    ['Devis envoyé', null],
  ])('CRM : le stade « %s » / « %s » est proche de signer', (label, stage) => {
    expect(isNearSigningCrmStage(stage, label)).toBe(true)
  })

  it.each([
    ['Qualification', 'qualifiedtobuy'],
    ['Premier rendez-vous', 'appointmentscheduled'],
    [null, null],
    ['', ''],
  ])('CRM : le stade « %s » / « %s » ne l’est PAS — jamais deviné', (label, stage) => {
    expect(isNearSigningCrmStage(stage, label)).toBe(false)
  })
})
