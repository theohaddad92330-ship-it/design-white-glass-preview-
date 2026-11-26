import { describe, expect, it } from 'vitest'
import { COMMERCIAL_LIFECYCLE_VALUES } from './account.js'
import { RELATION_STATUS_OF_LIFECYCLE, relationStatusOf } from './account-relation-status.js'

describe('statuts de relation (Théo A comptes-liste.R4 — 7 → 3)', () => {
  it('range CHAQUE statut actuel : aucun n’est perdu', () => {
    for (const value of COMMERCIAL_LIFECYCLE_VALUES) {
      expect(RELATION_STATUS_OF_LIFECYCLE[value]).toBeDefined()
    }
  })

  it('correspondance écrite', () => {
    expect(relationStatusOf('customer')).toEqual({ primary: 'client', secondary: null })
    expect(relationStatusOf('opening')).toEqual({ primary: 'opening', secondary: null })
    expect(relationStatusOf('inbox')).toEqual({ primary: 'to_open', secondary: null })
    expect(relationStatusOf('watching')).toEqual({ primary: 'to_open', secondary: null })
    expect(relationStatusOf('opportunity')).toEqual({ primary: 'to_open', secondary: null })
  })

  it('Hors priorité et En veille sont un état SECONDAIRE, jamais un quatrième statut', () => {
    expect(relationStatusOf('archived')).toEqual({ primary: 'to_open', secondary: 'out_of_priority' })
    expect(relationStatusOf('dormant')).toEqual({ primary: 'to_open', secondary: 'on_hold' })
  })

  it('une ligne antérieure à la colonne (absent) se lit comme « inbox »', () => {
    expect(relationStatusOf(undefined)).toEqual({ primary: 'to_open', secondary: null })
  })

  // #4584.3 — « À ouvrir » (étiquette des cartes) et « Relations actives » (tuile de la bande) ne se contredisent
  // jamais : la tuile compte `commercial_status IN ('customer','opening')` (`ACTIVE_RELATIONS_PREDICATE`,
  // `accounts.service.ts`), et l'étiquette « À ouvrir » est celle de TOUS les autres statuts. Sept statuts, deux
  // actifs, cinq « À ouvrir » : aucun compte n'est à la fois l'un et l'autre, aucun n'est ni l'un ni l'autre.
  it('#4584.3 — « À ouvrir » est exactement le complément des « Relations actives » (2 + 5 = 7)', () => {
    const activeInBand = ['customer', 'opening']
    const toOpen = COMMERCIAL_LIFECYCLE_VALUES.filter(value => relationStatusOf(value).primary === 'to_open')
    const active = COMMERCIAL_LIFECYCLE_VALUES.filter(value => relationStatusOf(value).primary !== 'to_open')
    expect(COMMERCIAL_LIFECYCLE_VALUES).toHaveLength(7)
    expect([...active].sort()).toEqual([...activeInBand].sort())
    expect(toOpen).toHaveLength(5)
    expect(toOpen.filter(value => activeInBand.includes(value))).toEqual([])
  })
})
