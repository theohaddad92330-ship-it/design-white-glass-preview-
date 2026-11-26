import type { Contact } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { filterContacts, groupContacts } from './contactGrouping'
import { approachFit, sortForApproach } from './contactApproachOrder'

/**
 * #3686.4 — l'ordre dans un groupe ne dépend plus du SEUL rang IA : le
 * périmètre travaillé (le texte de la recherche) et l'accessibilité entrent
 * dans l'ordre. Le rang IA reste la clé de base ; rien n'est filtré ni inventé.
 */
function person(full_name: string, extra: Partial<Contact>): Contact {
  return {
    id: full_name,
    full_name,
    account_id: 'a1',
    entity: 'Groupe X',
    decision_role: 'economic',
    email_verified: false,
    phone: null,
    ...extra,
  } as unknown as Contact
}

const dirigeantGroupe = person('Hélène Roux', {
  title: 'Directrice générale groupe',
  priority: 1,
  email_verified: true,
})
const respPerimetre = person('Marc Faure', {
  title: 'Responsable infogérance',
  scope: 'Infogérance et exploitation',
  priority: 3,
})
const names = (list: Contact[]) => list.map(c => c.full_name)

describe('sortForApproach', () => {
  it('sans motif : le rang IA seul décide (dirigeant groupe devant)', () => {
    expect(names(sortForApproach([respPerimetre, dirigeantGroupe], ''))).toEqual(['Hélène Roux', 'Marc Faure'])
  })

  it('avec un motif de périmètre : le responsable du périmètre passe devant le dirigeant groupe', () => {
    expect(names(sortForApproach([dirigeantGroupe, respPerimetre], 'infogerance'))).toEqual([
      'Marc Faure',
      'Hélène Roux',
    ])
  })

  it('un titre qui contient le motif pèse moins qu’un périmètre qui le porte', () => {
    expect(approachFit(respPerimetre, 'infogérance')).toBe(2)
    expect(approachFit(person('T', { title: 'Directeur infogérance groupe', priority: 2 }), 'infogérance')).toBe(1)
    expect(approachFit(dirigeantGroupe, 'infogérance')).toBe(0)
  })

  it('à rang égal, la personne joignable (e-mail vérifié ou téléphone) passe devant', () => {
    const a = person('A Muet', { priority: 2 })
    const b = person('B Joignable', { priority: 2, phone: '+33 1 23 45 67 89' })
    expect(names(sortForApproach([a, b], ''))).toEqual(['B Joignable', 'A Muet'])
  })

  it('l’accessibilité ne l’emporte jamais sur le rang IA', () => {
    const top = person('Top muet', { priority: 1 })
    const low = person('Bas joignable', { priority: 4, email_verified: true })
    expect(names(sortForApproach([low, top], ''))).toEqual(['Top muet', 'Bas joignable'])
  })

  it('ne retire personne et ne modifie pas le tableau reçu', () => {
    const input = [dirigeantGroupe, respPerimetre]
    const out = sortForApproach(input, 'infogérance')
    expect(out).toHaveLength(2)
    expect(names(input)).toEqual(['Hélène Roux', 'Marc Faure'])
  })
})

describe('groupContacts — #3686 : une personne = un seul groupe, ordre par motif', () => {
  it('range chaque personne dans UN groupe (pas comptée deux fois) et applique le motif', () => {
    const groups = groupContacts([dirigeantGroupe, respPerimetre], 'persona', 'infogérance')
    expect(groups.flatMap(g => names(g.contacts)).sort()).toEqual(['Hélène Roux', 'Marc Faure'])
    const sameRole = groupContacts(
      [dirigeantGroupe, { ...respPerimetre, decision_role: 'economic' } as Contact],
      'persona',
      'infogérance',
    )
    expect(names(sameRole[0].contacts)).toEqual(['Marc Faure', 'Hélène Roux'])
  })
})

describe('filterContacts — le périmètre est cherchable (#3686.4)', () => {
  it('trouve le responsable par son périmètre, même si le titre ne le dit pas', () => {
    const c = person('Zoé Lin', { title: 'Directrice', scope: 'Cybersécurité', priority: 2 })
    const out = filterContacts(
      [c, dirigeantGroupe],
      'cybersécurité',
      { role: 'all', entity: 'all', level: 'all' },
      () => null,
    )
    expect(names(out)).toEqual(['Zoé Lin'])
  })
})
