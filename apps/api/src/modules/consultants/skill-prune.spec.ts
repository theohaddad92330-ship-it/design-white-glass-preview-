import { pruneDeclaredSkills } from './skill-seed'

// #3812.1 — retirer un mot de la liste libre retire la compétence DÉCLARÉE
// correspondante du référentiel, jamais une compétence prouvée (mission,
// entretien, CV, validation).
describe('pruneDeclaredSkills', () => {
  const run = async (stack: string[]) => {
    const calls: { sql: string; params: unknown[] }[] = []
    await pruneDeclaredSkills(
      {
        query: async (sql: string, params: unknown[] = []) => {
          calls.push({ sql, params })
        },
      },
      { consultantId: 'c1', stack },
    )
    return calls
  }

  it('ne supprime que la source `declared` et que ce qui n’est plus dans la liste', async () => {
    const [call] = await run(['Java', 'K8s'])
    expect(call?.sql).toContain("source = 'declared'")
    expect(call?.sql).toContain('<> ALL')
    expect(call?.params).toEqual(['c1', ['java', 'kubernetes']])
  })

  it('une liste vidée retire toutes les compétences déclarées, rien d’autre', async () => {
    const [call] = await run([])
    expect(call?.params).toEqual(['c1', []])
    expect(call?.sql).toContain("source = 'declared'")
  })
})
