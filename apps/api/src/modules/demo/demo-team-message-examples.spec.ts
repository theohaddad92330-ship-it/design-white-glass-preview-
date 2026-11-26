import { DEMO_TEAM_MESSAGE_EXAMPLES } from './demo-team-continuity'

// #4158.50 — la bibliothèque de la salle montre deux exemples d'équipe, dont un écrit par un collègue fictif.
describe('DEMO_TEAM_MESSAGE_EXAMPLES (#4158.50)', () => {
  it('sème deux exemples, un par l’occupant et un par le collègue fictif', () => {
    expect(DEMO_TEAM_MESSAGE_EXAMPLES).toHaveLength(2)
    expect(DEMO_TEAM_MESSAGE_EXAMPLES.map(example => example.author).sort()).toEqual(['colleague', 'owner'])
  })

  it('ne cite ni chiffre ni résultat : rien à vérifier avant de le relire', () => {
    for (const example of DEMO_TEAM_MESSAGE_EXAMPLES) expect(example.body).not.toMatch(/\d{2,}\s*%|\d+\s*M€/)
  })
})
