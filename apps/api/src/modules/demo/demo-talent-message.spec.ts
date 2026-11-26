import { DEMO_TALENT_MESSAGE_DRAFT_COVERAGE } from './demo-coverage'
import { demoTalentMessage } from './demo-talent-message'

const FACTS = { firstName: 'Sophie', need: 'Tech lead Java', client: 'SNCF' }

// #4347 (craft rule n°9) — la fenêtre « Préparer un message » s'ouvre déjà rédigée AUSSI en démonstration.
describe('démo — le message au consultant est semé (#4347)', () => {
  it('est classé « seedé », avec sa raison écrite', () => {
    expect(DEMO_TALENT_MESSAGE_DRAFT_COVERAGE.state).toBe('seede')
    expect(DEMO_TALENT_MESSAGE_DRAFT_COVERAGE.reason).toMatch(/#4347/)
  })

  it.each(['email', 'linkedin', 'phone'] as const)(
    'le canal %s rend un texte non vide qui nomme le besoin',
    channel => {
      const draft = demoTalentMessage({ channel }, FACTS)
      expect(draft.body).toContain('Sophie')
      expect(draft.body).toContain('Tech lead Java')
      expect(draft.subject === null).toBe(channel !== 'email')
    },
  )

  it('sans besoin, rien n’est inventé : un message de prise de nouvelles', () => {
    const draft = demoTalentMessage({ channel: 'email' }, { firstName: 'Sophie', need: null, client: null })
    expect(draft.body).not.toMatch(/mission «/)
    expect(draft.body).toMatch(/disponibilité/)
  })

  it('nomme aucun fournisseur', () => {
    const all = (['email', 'linkedin', 'phone'] as const)
      .map(channel => demoTalentMessage({ channel }, FACTS).body)
      .join(' ')
    expect(all).not.toMatch(/HubSpot|Salesforce|Apollo|Pappers|Claude|Anthropic/)
  })
})
