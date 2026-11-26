import { describe, expect, it } from 'vitest'
import { expertiseTokens, matchingExpertises, stackMatchesExpertises } from './market-expertise-match.js'

describe('expertiseTokens — plier deux vocabulaires écrits par des humains différents', () => {
  it('retire les accents : « Sécurité » et « securite » sont le même mot', () => {
    expect([...expertiseTokens('Sécurité')]).toEqual([...expertiseTokens('securite')])
  })

  it('coupe la ponctuation de saisie : « Cloud & DevOps » donne deux jetons', () => {
    expect([...expertiseTokens('Cloud & DevOps')].sort()).toEqual(['cloud', 'devops'])
  })

  it('garde `+` et `#`, qui sont DANS le nom de la technologie', () => {
    expect([...expertiseTokens('C++')]).toEqual(['c++'])
    expect([...expertiseTokens('C#')]).toEqual(['c#'])
  })

  it('GARDE les noms courts : `Go` et `C#` sont des technologies, pas des mots vides', () => {
    expect([...expertiseTokens('Go')]).toEqual(['go'])
    expect([...expertiseTokens('C#')]).toEqual(['c#'])
  })

  it('jette une lettre isolée, qui recouperait trop pour vouloir dire quelque chose', () => {
    expect([...expertiseTokens('R')]).toEqual([])
  })

  it('jette les mots vides, qui rapprocheraient n’importe quoi', () => {
    expect([...expertiseTokens('Data and Cloud')].sort()).toEqual(['cloud', 'data'])
    expect([...expertiseTokens('des projets pour les DSI')].sort()).toEqual(['dsi', 'projets'])
  })

  it('jette « IT », qui recoupe la moitié du corpus sans rien dire d’une expertise', () => {
    expect([...expertiseTokens('Infrastructure IT')]).toEqual(['infrastructure'])
  })
})

describe('stackMatchesExpertises — ce qui se recoupe, et ce qui NE se recoupe PAS', () => {
  it('recoupe sur un jeton commun, même noyé dans un libellé plus large', () => {
    expect(stackMatchesExpertises(['DevOps'], ['Cloud & DevOps'])).toBe(true)
    expect(stackMatchesExpertises(['Kubernetes', 'Terraform'], ['Infrastructure Cloud', 'Terraform'])).toBe(true)
  })

  it('NE rapproche PAS « Java » et « JavaScript » — le défaut d’un `includes` sur la chaîne', () => {
    expect(stackMatchesExpertises(['JavaScript'], ['Java'])).toBe(false)
    expect(stackMatchesExpertises(['Java'], ['JavaScript'])).toBe(false)
  })

  it('NE rapproche PAS deux compétences qui ne partagent qu’un mot de liaison', () => {
    expect(stackMatchesExpertises(['Tests and Recette'], ['Design and Marque'])).toBe(false)
  })

  it('rend FAUX sans expertise déclarée — la question ne se pose pas, elle ne se répond pas « tout »', () => {
    expect(stackMatchesExpertises(['Kubernetes'], [])).toBe(false)
  })

  it('rend FAUX sur une pile vide', () => {
    expect(stackMatchesExpertises([], ['Data'])).toBe(false)
  })

  it('rend FAUX quand les expertises déclarées ne portent aucun jeton significatif', () => {
    expect(stackMatchesExpertises(['Data'], ['et', 'de'])).toBe(false)
  })

  it('n’est pas sensible à la casse ni aux accents des deux côtés', () => {
    expect(stackMatchesExpertises(['SÉCURITÉ'], ['securite applicative'])).toBe(true)
  })
})

describe('matchingExpertises — #1591.1, laquelle de mes expertises pousser', () => {
  it('rend LES expertises qui recoupent, dans l’ordre où elles sont déclarées', () => {
    expect(matchingExpertises(['Data', 'Java', 'AWS', 'PMO'], ['Data / IA', 'Cloud AWS', 'Product'])).toEqual([
      'Data / IA',
      'Cloud AWS',
    ])
  })

  it('sans observation, aucune expertise n’est recommandée — jamais toutes', () => {
    expect(matchingExpertises([], ['Data / IA'])).toEqual([])
  })

  it('sans expertise déclarée, la question ne se pose pas', () => {
    expect(matchingExpertises(['Data', 'Java'], [])).toEqual([])
  })

  it('⚠️ ne recoupe pas « Java » et « JavaScript » — ce ne sont pas la même compétence', () => {
    expect(matchingExpertises(['JavaScript'], ['Java'])).toEqual([])
  })

  it('⚠️ garde les NOMS courts que la première version jetait (`C#`, `Go`)', () => {
    expect(matchingExpertises(['Go', 'C#'], ['Go', 'C#'])).toEqual(['Go', 'C#'])
  })

  it('`stackMatchesExpertises` est le MÊME appariement, pas un second', () => {
    const observed = ['Data', 'Kubernetes']
    const expertises = ['Cloud & DevOps', 'Data']
    expect(stackMatchesExpertises(observed, expertises)).toBe(matchingExpertises(observed, expertises).length > 0)
  })
})
