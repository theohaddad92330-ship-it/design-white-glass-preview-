import { describe, expect, it } from 'vitest'
import { phraseFonctionsRetenues, valeurPartContestee } from './reply-contestations.logic'

// #2442.10 (lot W9) — un retour absent se dit « non mesuré », jamais « 0 % ».
describe('contestations de Laura — libellés', () => {
  it('une part se lit en pourcentage entier', () => {
    expect(valeurPartContestee(0.25, 'fr')).toBe('25 %')
    expect(valeurPartContestee(0, 'fr')).toBe('0 %') // zéro retour contesté sur des retours MESURÉS : un vrai zéro
  })

  it('sans retour : « non mesuré » dans les deux langues, jamais « 0 % »', () => {
    expect(valeurPartContestee(null, 'fr')).toBe('non mesuré')
    expect(valeurPartContestee(null, 'en')).toBe('not measured')
  })

  it('les fonctions retenues se disent par un compte, sans nom ; rien à dire si aucune', () => {
    expect(phraseFonctionsRetenues(0, 5, 'fr')).toBeNull()
    expect(phraseFonctionsRetenues(1, 5, 'fr')).toBe('1 fonction non publiée : moins de 5 réponses distinctes.')
    expect(phraseFonctionsRetenues(3, 5, 'en')).toBe('3 functions not published: fewer than 5 distinct replies.')
  })
})
