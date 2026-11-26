import { describe, expect, it } from 'vitest'
import { contactsAlreadyInSequence, duplicateEmailContacts, homonymContacts } from './audience-validation'

describe('duplicateEmailContacts (#2202.19)', () => {
  it('signale deux contacts qui partagent la même adresse e-mail', () => {
    const chosen = [
      { id: '1', full_name: 'Claire Dubois', email: 'claire@example.com' },
      { id: '2', full_name: 'C. Dubois', email: 'claire@example.com' },
      { id: '3', full_name: 'Marc Petit', email: 'marc@example.com' },
    ]
    expect(duplicateEmailContacts(chosen).map(c => c.id)).toEqual(['1', '2'])
  })

  it('compare sans tenir compte de la casse ni des espaces', () => {
    const chosen = [
      { id: '1', full_name: 'Claire Dubois', email: ' Claire@Example.com ' },
      { id: '2', full_name: 'C. Dubois', email: 'claire@example.com' },
    ]
    expect(duplicateEmailContacts(chosen).map(c => c.id)).toEqual(['1', '2'])
  })

  it("ne signale rien quand chaque adresse n'apparaît qu'une fois", () => {
    const chosen = [
      { id: '1', full_name: 'Claire Dubois', email: 'claire@example.com' },
      { id: '2', full_name: 'Marc Petit', email: 'marc@example.com' },
    ]
    expect(duplicateEmailContacts(chosen)).toEqual([])
  })

  it("ignore les contacts sans e-mail — l'absence ne fait jamais doublon", () => {
    const chosen = [
      { id: '1', full_name: 'Claire Dubois', email: null },
      { id: '2', full_name: 'Marc Petit', email: null },
    ]
    expect(duplicateEmailContacts(chosen)).toEqual([])
  })
})

describe('contactsAlreadyInSequence (#2202.22)', () => {
  const chosen = [
    { id: '1', full_name: 'Claire Dubois' },
    { id: '2', full_name: 'Marc Petit' },
  ]

  it('signale un contact déjà dans une séquence ACTIVE', () => {
    const sequences = [{ contact_id: '1', status: 'active' as const }]
    expect(contactsAlreadyInSequence(chosen, sequences)).toEqual(['1'])
  })

  it('signale un contact déjà dans une séquence EN PAUSE', () => {
    const sequences = [{ contact_id: '2', status: 'paused' as const }]
    expect(contactsAlreadyInSequence(chosen, sequences)).toEqual(['2'])
  })

  it("ne signale pas une séquence TERMINÉE ou ANNULÉE — ce n'est plus « déjà en séquence »", () => {
    const sequences = [
      { contact_id: '1', status: 'completed' as const },
      { contact_id: '2', status: 'cancelled' as const },
    ]
    expect(contactsAlreadyInSequence(chosen, sequences)).toEqual([])
  })

  it("ne devine RIEN tant que les séquences n'ont pas répondu — pas de faux négatif", () => {
    expect(contactsAlreadyInSequence(chosen, undefined)).toEqual([])
  })

  it('ne signale que les contacts réellement sélectionnés, jamais tout le workspace', () => {
    const sequences = [{ contact_id: '99', status: 'active' as const }]
    expect(contactsAlreadyInSequence(chosen, sequences)).toEqual([])
  })
})

describe('homonymContacts (#3701.8)', () => {
  it('regroupe deux personnes de même nom sans les fusionner', () => {
    const chosen = [
      { id: '1', full_name: 'Claire Dubois', email: 'claire@a.fr' },
      { id: '2', full_name: ' claire  DUBOIS ', email: 'claire@b.fr' },
      { id: '3', full_name: 'Marc Petit', email: 'marc@a.fr' },
    ]
    expect(homonymContacts(chosen).map(group => group.map(c => c.id))).toEqual([['1', '2']])
  })

  it("ignore l'accent et la casse, jamais l'ordre des mots", () => {
    const chosen = [
      { id: '1', full_name: 'Éloïse Martin', email: null },
      { id: '2', full_name: 'eloise martin', email: null },
      { id: '3', full_name: 'Martin Eloise', email: null },
    ]
    expect(homonymContacts(chosen).map(group => group.map(c => c.id))).toEqual([['1', '2']])
  })

  it('ne regroupe jamais une fiche sans nom ni deux fois la même fiche', () => {
    const chosen = [
      { id: '1', full_name: '', email: null },
      { id: '2', full_name: '  ', email: null },
      { id: '3', full_name: 'Marc Petit', email: null },
    ]
    expect(homonymContacts(chosen)).toEqual([])
  })
})
