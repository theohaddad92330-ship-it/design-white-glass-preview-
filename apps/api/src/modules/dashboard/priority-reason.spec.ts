import { shortReason } from './priority-reason'

/**
 * « C'est moche ça sert à rien » — signalé en bêta sur la carte « Mes
 * priorités », dont chaque ligne déversait une consigne de deux cents
 * caractères, coupée à mi-mot par la largeur de la colonne.
 */
describe('shortReason', () => {
  it('laisse une raison courte intacte', () => {
    expect(shortReason('Relance à faire : rappeler Claire')).toBe('Relance à faire : rappeler Claire')
  })

  it('coupe sur un MOT entier, jamais au milieu', () => {
    const long =
      'Contacter Filipe Silva (Head of Data & Analytics, Total Express) par email personnalisé en référençant les 3 postes data ouverts'
    const out = shortReason(long)
    expect(out.length).toBeLessThanOrEqual(91)
    expect(out.endsWith('…')).toBe(true)
    // Ce qui identifie l'action — qui, où — survit à la coupe.
    expect(out).toContain('Filipe Silva')
    // Et aucun mot n'est tranché.
    expect(long).toContain(out.slice(0, -1))
  })

  it('ne laisse pas de ponctuation avant les points de suspension', () => {
    const out = shortReason('a'.repeat(80) + ' fin, ' + 'b'.repeat(40))
    expect(out).not.toMatch(/[,;:]…$/)
  })

  it('écrase les espaces multiples et les retours à la ligne', () => {
    // Une consigne recopiée depuis un plan d'action en contient souvent.
    expect(shortReason('Relance\n\n  à   faire')).toBe('Relance à faire')
  })

  it('coupe quand même un mot interminable', () => {
    // Sans repli, une chaîne sans espace rendrait la phrase entière — le défaut
    // qu'on corrige.
    const out = shortReason('x'.repeat(300))
    expect(out.length).toBeLessThanOrEqual(91)
  })

  it('tolère une raison vide', () => {
    expect(shortReason('')).toBe('')
  })
})
