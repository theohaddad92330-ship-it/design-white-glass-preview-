import { markObservedAgainstKnown } from './observed-esn'

const ALTEN = { esnName: 'ALTEN', persons: 9, certainty: 'forte' as const }
const SII = { esnName: 'Groupe SII', persons: 5, certainty: 'forte' as const }
const CAP = { esnName: 'Capgemini', persons: 3, certainty: 'moyenne' as const }

describe('markObservedAgainstKnown', () => {
  it('marque une société que l’espace connaît déjà — les deux sources concordent', () => {
    const lines = markObservedAgainstKnown([ALTEN], ['ALTEN'])

    expect(lines).toEqual([{ ...ALTEN, alsoKnown: true }])
  })

  it('rapproche « Groupe SII » et « SII » — sinon l’écran afficherait deux fois la même société', () => {
    expect(markObservedAgainstKnown([SII], ['SII'])[0].alsoKnown).toBe(true)
    expect(markObservedAgainstKnown([{ ...SII, esnName: 'SII' }], ['Groupe SII'])[0].alsoKnown).toBe(true)
  })

  it('laisse une société INCONNUE de l’espace — les deux sources divergent, les deux restent', () => {
    const lines = markObservedAgainstKnown([ALTEN, CAP], ['Sopra Steria'])

    expect(lines.map(line => line.alsoKnown)).toEqual([false, false])
    expect(lines).toHaveLength(2)
  })

  it('n’écrase RIEN — le nombre de personnes et la certitude traversent intacts', () => {
    const lines = markObservedAgainstKnown([ALTEN], ['ALTEN'])

    expect(lines[0].persons).toBe(9)
    expect(lines[0].certainty).toBe('forte')
  })

  it('conserve l’ORDRE du corpus — re-trier ici ferait une seconde source de vérité', () => {
    const lines = markObservedAgainstKnown([ALTEN, SII, CAP], [])

    expect(lines.map(line => line.esnName)).toEqual(['ALTEN', 'Groupe SII', 'Capgemini'])
  })

  it('ignore un nom connu VIDE — une clé vide rapprocherait toutes les sociétés', () => {
    const lines = markObservedAgainstKnown([ALTEN], ['', '   '])

    expect(lines[0].alsoKnown).toBe(false)
  })

  it('rend une liste vide sur une observation vide, sans jeter', () => {
    expect(markObservedAgainstKnown([], ['ALTEN'])).toEqual([])
  })
})
