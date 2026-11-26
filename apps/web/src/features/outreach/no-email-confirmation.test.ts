import { describe, expect, it } from 'vitest'
import { needsNoEmailConfirmation, noEmailContactIds } from './no-email-confirmation'

const withEmail = { id: 'c1', email: 'jean@corp.fr' }
const noEmail = { id: 'c2', email: null }
const alsoNoEmail = { id: 'c3', email: null }

describe('noEmailContactIds', () => {
  it('retient les contacts sans e-mail, et eux seuls', () => {
    expect(noEmailContactIds([withEmail, noEmail, alsoNoEmail])).toEqual(['c2', 'c3'])
  })

  it('une sélection entièrement pourvue ne retient personne', () => {
    expect(noEmailContactIds([withEmail])).toEqual([])
  })
})

describe('needsNoEmailConfirmation', () => {
  it('arrête le clic quand un contact sans e-mail n’a pas été confirmé', () => {
    expect(needsNoEmailConfirmation([withEmail, noEmail], new Set())).toBe(true)
  })

  it('laisse passer une sélection entièrement pourvue en e-mail', () => {
    expect(needsNoEmailConfirmation([withEmail], new Set())).toBe(false)
  })

  it('laisse passer un contact sans e-mail déjà confirmé', () => {
    expect(needsNoEmailConfirmation([noEmail], new Set(['c2']))).toBe(false)
  })

  it('un DEUXIÈME contact sans e-mail, ajouté après coup, redemande la confirmation', () => {
    // La confirmation porte sur un ENSEMBLE : confirmer c2 ne dispense pas c3.
    expect(needsNoEmailConfirmation([noEmail, alsoNoEmail], new Set(['c2']))).toBe(true)
  })
})
