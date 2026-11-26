import { skillsFromStack } from './skills-from-stack'

// #4433.8 — une fiche qui écrit ses compétences n'est pas « non évaluable » : lecture déclarée, jamais une preuve.
describe('skillsFromStack (#4433.8)', () => {
  it('lit la liste libre en compétences déclarées, niveau inconnu, sans preuve', () => {
    const skills = skillsFromStack(['React', 'Node.js'])
    expect(skills.map(skill => skill.term)).toEqual(['react', 'node.js'])
    for (const skill of skills) {
      expect(skill.source).toBe('declared')
      expect(skill.level).toBe('inconnu')
      expect(skill.proof).toBeNull()
      expect(skill.inferred).toBe(false)
    }
  })

  it('SAIT DIRE NON : une liste vide ou absente ne produit aucune compétence', () => {
    expect(skillsFromStack([])).toEqual([])
    expect(skillsFromStack(null)).toEqual([])
    expect(skillsFromStack(undefined)).toEqual([])
  })
})
