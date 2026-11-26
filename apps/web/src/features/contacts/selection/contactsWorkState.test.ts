import { beforeEach, describe, expect, it } from 'vitest'
import { contactsWorkState } from './contactsWorkState'

const contact = (id: string) => ({ id, full_name: id })

describe('contactsWorkState (#3713.9)', () => {
  beforeEach(() => contactsWorkState.reset())

  it('rend la sélection mémorisée au retour de la fiche', () => {
    contactsWorkState.save({ selected: new Map([['a', contact('a')]]), scrollY: 480 })
    const back = contactsWorkState.read()
    expect([...back.selected.keys()]).toEqual(['a'])
    expect(back.scrollY).toBe(480)
  })

  it('part vide : aucune sélection ni position inventées', () => {
    const empty = contactsWorkState.read()
    expect(empty.selected.size).toBe(0)
    expect(empty.scrollY).toBeNull()
  })

  it('une sélection vidée volontairement est oubliée, pas ressuscitée', () => {
    contactsWorkState.save({ selected: new Map([['a', contact('a')]]), scrollY: 10 })
    contactsWorkState.save({ selected: new Map(), scrollY: 0 })
    expect(contactsWorkState.read().selected.size).toBe(0)
  })
})

describe('contactsWorkState — changement de compte', () => {
  it('ne rend jamais la sélection d’une autre identité', async () => {
    const { useCurrentUserStore } = await import('@/stores/currentUserStore')
    useCurrentUserStore.setState({ currentUser: { id: 'u1' } as never })
    contactsWorkState.save({ selected: new Map([['a', contact('a')]]), scrollY: 5 })
    useCurrentUserStore.setState({ currentUser: { id: 'u2' } as never })
    expect(contactsWorkState.read().selected.size).toBe(0)
    useCurrentUserStore.setState({ currentUser: null })
  })
})
