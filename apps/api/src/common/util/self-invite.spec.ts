import { dropSelfAttendees } from './self-invite'

/**
 * Garde-fou n°15 des méta-analyses. Le symptôme est discret : l'organisateur
 * reçoit sa propre invitation et son agenda garde un « en attente de réponse »
 * qui ne se résoudra jamais.
 */
describe('dropSelfAttendees', () => {
  it('retire l’organisateur de sa propre liste d’invités', () => {
    expect(dropSelfAttendees(['jean@acme.com', 'moi@bellum.fr'], 'moi@bellum.fr')).toEqual(['jean@acme.com'])
  })

  it('compare sans tenir compte de la casse ni des espaces', () => {
    expect(dropSelfAttendees([' MOI@Bellum.fr '], 'moi@bellum.fr')).toEqual([])
  })

  it('déduplique les invités', () => {
    expect(dropSelfAttendees(['jean@acme.com', 'Jean@ACME.com'], null)).toEqual(['jean@acme.com'])
  })

  it('sans adresse connue, ne retire personne — mieux vaut une invitation en trop qu’un invité perdu', () => {
    expect(dropSelfAttendees(['jean@acme.com'], null)).toEqual(['jean@acme.com'])
  })

  it('ignore les entrées vides', () => {
    expect(dropSelfAttendees(['', '   ', 'jean@acme.com'], null)).toEqual(['jean@acme.com'])
  })
})
