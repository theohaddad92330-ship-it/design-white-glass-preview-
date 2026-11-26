import { RECRUITMENT_STAGES } from '@bellum/contracts'
import { DEMO_CV_IMPORT_CONSULTANTS, DEMO_RECRUITMENT_SEED_SPECS } from './demo-dataset'

// Théo C talents-recrutement — l'écran Recrutement n'est pas vide en démo : des candidats rangés à plusieurs étapes.
describe('démo — recrutement semé', () => {
  it('chaque ligne désigne un candidat SEMÉ, par son rang parmi les homonymes', () => {
    for (const seed of DEMO_RECRUITMENT_SEED_SPECS) {
      const same = DEMO_CV_IMPORT_CONSULTANTS.filter(persona => persona.full_name === seed.persona)
      expect(same.length).toBeGreaterThan(seed.occurrence)
    }
  })

  it('range des personnes à plusieurs étapes, toutes valides, et dit pourquoi quand on met en veille', () => {
    const stages = new Set(DEMO_RECRUITMENT_SEED_SPECS.map(seed => seed.stage))
    expect(stages.size).toBeGreaterThanOrEqual(3)
    for (const stage of stages) expect((RECRUITMENT_STAGES as readonly string[]).includes(stage)).toBe(true)
    for (const seed of DEMO_RECRUITMENT_SEED_SPECS.filter(s => s.stage === 'on_hold')) expect(seed.reason).toBeTruthy()
  })

  it('un échange prévu porte sa date, jamais une autre étape', () => {
    for (const seed of DEMO_RECRUITMENT_SEED_SPECS) {
      expect(seed.stage === 'call_planned' ? (seed.inDays ?? 0) > 0 : seed.inDays === undefined).toBe(true)
    }
  })

  it('laisse au moins un candidat jamais rangé : « À qualifier » se voit aussi', () => {
    const ranked = DEMO_RECRUITMENT_SEED_SPECS.length
    expect(DEMO_CV_IMPORT_CONSULTANTS.length).toBeGreaterThan(ranked)
  })
})
