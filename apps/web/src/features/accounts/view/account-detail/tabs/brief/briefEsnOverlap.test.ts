import { describe, expect, it } from 'vitest'
import { withoutEsnOverlap } from './briefEsnOverlap'

const kpi = (label: string, value: string | number) => ({ label, value })
const row = (rubric: string, meaning = 'm') => ({ rubric, known: 'k', meaning })

describe('#4323.1 — une seule ligne ESN : la tuile et la rubrique ESN s’effacent derrière la liste', () => {
  it('retire la tuile « ESN confirmées » et la rubrique « ESN EN PLACE », garde le reste', () => {
    const out = withoutEsnOverlap({
      kpis: [kpi('ESN CONFIRMÉES', 2), kpi('SITES', 525)],
      what_i_know: [row('IDENTITÉ'), row('ESN EN PLACE', 'Attaque par le référencement')],
    })
    expect(out.kpis.map(k => k.label)).toEqual(['SITES'])
    expect(out.what_i_know.map(r => r.rubric)).toEqual(['IDENTITÉ'])
  })

  it('garde la lecture « ce que ça veut dire » de la rubrique retirée : l’information ne se perd pas', () => {
    const out = withoutEsnOverlap({ kpis: [], what_i_know: [row('ESN EN PLACE', 'Attaque par le référencement')] })
    expect(out.esnMeaning).toBe('Attaque par le référencement')
  })

  it('sait dire NON : un libellé qui contient « esn » dans un autre mot n’est pas retiré, ni sans ESN', () => {
    const out = withoutEsnOverlap({
      kpis: [kpi('RESNICK', 1), kpi('PRIX', 650)],
      what_i_know: [row('ACHATS'), row('BESOINS')],
    })
    expect(out.kpis).toHaveLength(2)
    expect(out.what_i_know).toHaveLength(2)
    expect(out.esnMeaning).toBeNull()
  })
})
