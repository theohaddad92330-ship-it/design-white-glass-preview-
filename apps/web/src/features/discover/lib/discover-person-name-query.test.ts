import { describe, expect, it } from 'vitest'
import { personNameForView, readPersonNameQuery } from './discover-person-name-query'

// #4574.7 — le nom se lit aussi depuis la vue ENTREPRISES, qui bascule alors sur la vue des personnes.
describe('personNameForView (#4574.7)', () => {
  it('vue Entreprises : « Marion Sagnard » est lu, et la vue des personnes s’ouvre', () => {
    expect(personNameForView('accounts', 'Marion Sagnard')).toEqual({
      query: { fullName: 'Marion Sagnard' },
      switchToContacts: true,
    })
  })

  it('vue Personnes : lu, sans changer de vue', () => {
    expect(personNameForView('contacts', 'Marion Sagnard')?.switchToContacts).toBe(false)
  })

  it('SAIT DIRE NON : une compétence, une autre vue, ou un seul mot ne sont jamais lus comme un nom', () => {
    expect(personNameForView('accounts', 'dev vue')).toBeNull()
    expect(personNameForView('accounts', 'Marion')).toBeNull()
    expect(personNameForView('partners', 'Marion Sagnard')).toBeNull()
  })
})

/**
 * #4574 — le nom se tape dans le champ libre du rail : « Marion Sagnard chez Bedrock ».
 * La lecture est DÉTERMINISTE et prudente : en cas de doute elle ne reconnaît PAS de personne
 * (la recherche garde son chemin d'avant) — jamais un nom deviné.
 */
describe('readPersonNameQuery', () => {
  it('un prénom et un nom', () => {
    expect(readPersonNameQuery('Marion Sagnard')).toEqual({ fullName: 'Marion Sagnard' })
  })

  it('« chez » / « at » / « @ » nomme l’entreprise supposée', () => {
    expect(readPersonNameQuery('Marion Sagnard chez Bedrock')).toEqual({
      fullName: 'Marion Sagnard',
      organizationName: 'Bedrock',
    })
    expect(readPersonNameQuery('Marion Sagnard at Bedrock AI')).toEqual({
      fullName: 'Marion Sagnard',
      organizationName: 'Bedrock AI',
    })
    expect(readPersonNameQuery('Marion Sagnard @ Bedrock')).toEqual({
      fullName: 'Marion Sagnard',
      organizationName: 'Bedrock',
    })
  })

  it('accents, traits d’union, particules, nom en capitales', () => {
    expect(readPersonNameQuery('Jean-Pierre de La Fontaine')).toEqual({ fullName: 'Jean-Pierre de La Fontaine' })
    expect(readPersonNameQuery('Élodie MARTIN chez Orange')).toEqual({
      fullName: 'Élodie MARTIN',
      organizationName: 'Orange',
    })
  })

  it('espaces superflus ignorés', () => {
    expect(readPersonNameQuery('  Marion   Sagnard  chez   Bedrock ')).toEqual({
      fullName: 'Marion Sagnard',
      organizationName: 'Bedrock',
    })
  })

  it.each([
    '',
    '   ',
    'Marion',
    'cloud azure',
    'ESN cybersécurité à Toulouse',
    'Consultant SAP chez Bedrock',
    'Cloud Azure',
    'Data Engineer',
    'qui recrute des développeurs Java',
    'Marion Sagnard Bedrock Paris Lyon Lille',
    'Marion Sagnard chez',
    'chez Bedrock',
    'Marion 2 Sagnard',
  ])('« %s » : aucune personne reconnue', text => {
    expect(readPersonNameQuery(text)).toBeNull()
  })
})
