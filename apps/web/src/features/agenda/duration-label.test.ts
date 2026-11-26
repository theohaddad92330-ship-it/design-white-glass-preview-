import { durationLabel } from './duration-label'

describe('durationLabel', () => {
  it('garde les minutes pour ce qui est court', () => {
    // « 0 h 45 » se lit moins bien que « 45 min ».
    expect(durationLabel(45)).toBe('45 min')
    expect(durationLabel(15)).toBe('15 min')
  })

  it('passe aux heures au-delà de soixante minutes', () => {
    // « 300 min libres » est exact et illisible : personne ne convertit de tête.
    expect(durationLabel(300)).toBe('5 h')
    expect(durationLabel(60)).toBe('1 h')
  })

  it('n’écrit pas un zéro qui n’ajoute rien', () => {
    expect(durationLabel(120)).toBe('2 h')
  })

  it('complète les minutes à deux chiffres', () => {
    // « 2 h 5 » se lirait comme deux heures cinquante.
    expect(durationLabel(125)).toBe('2 h 05')
    expect(durationLabel(150)).toBe('2 h 30')
  })

  it('accepte le suffixe d’une autre langue', () => {
    expect(durationLabel(150, 'hr')).toBe('2 hr 30')
  })

  it('ne rend jamais une durée négative', () => {
    expect(durationLabel(-10)).toBe('0 min')
  })
})
