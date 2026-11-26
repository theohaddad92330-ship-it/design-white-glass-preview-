import { describe, expect, it } from 'vitest'
import type { AccountHygieneByAccount } from '../api'
import { contactsEmailVerdict, nextActionVerdict } from './accountHygiene'

/**
 * Trois états, JAMAIS deux.
 *
 * « Le contrôle n'a pas pu être évalué » et « le contrôle est tenu » se
 * ressemblent à l'écran et ne veulent pas du tout dire la même chose. C'est le
 * défaut que tout ce chantier corrige, en plus petit : un silence qui se lit
 * « tout va bien ».
 */
function answer(over: Partial<AccountHygieneByAccount> = {}): AccountHygieneByAccount {
  return {
    withoutNextAction: { ids: [], truncated: false },
    contactsWithoutEmail: { byAccount: {}, truncated: false },
    ...over,
  }
}

describe('verdict « prochaine action » d’un compte', () => {
  it('dit « non mesuré » tant que la lecture n’a pas abouti', () => {
    expect(nextActionVerdict(undefined, 'acc-1')).toEqual({ state: 'unmeasured' })
  })

  it('dit « non mesuré » — et surtout pas « tenu » — quand la requête a échoué', () => {
    expect(nextActionVerdict(answer({ withoutNextAction: null }), 'acc-1')).toEqual({ state: 'unmeasured' })
  })

  it('désigne le compte concerné', () => {
    const data = answer({ withoutNextAction: { ids: ['acc-1', 'acc-9'], truncated: false } })
    expect(nextActionVerdict(data, 'acc-1')).toEqual({ state: 'breached' })
  })

  it('dit « tenu » pour un compte absent d’une lecture COMPLÈTE', () => {
    const data = answer({ withoutNextAction: { ids: ['acc-9'], truncated: false } })
    expect(nextActionVerdict(data, 'acc-1')).toEqual({ state: 'clear' })
  })

  it('refuse de conclure sur un compte absent d’une lecture BORNÉE', () => {
    // « On s'est arrêté avant lui » n'est pas « il va bien ». Un verdict tiré
    // d'un silence est exactement le défaut qu'on corrige ailleurs.
    const data = answer({ withoutNextAction: { ids: ['acc-9'], truncated: true } })
    expect(nextActionVerdict(data, 'acc-1')).toEqual({ state: 'unmeasured' })
  })

  it('désigne quand même un compte PRÉSENT dans une lecture bornée', () => {
    const data = answer({ withoutNextAction: { ids: ['acc-1'], truncated: true } })
    expect(nextActionVerdict(data, 'acc-1')).toEqual({ state: 'breached' })
  })
})

describe('verdict « contacts sans adresse » d’un compte', () => {
  it('porte le compte ET son dénominateur — « 3 » seul ne se lit pas', () => {
    const data = answer({
      contactsWithoutEmail: { byAccount: { 'acc-1': { count: 3, total: 7 } }, truncated: false },
    })
    expect(contactsEmailVerdict(data, 'acc-1')).toEqual({ state: 'breached', count: 3, total: 7 })
  })

  it('dit « non mesuré » quand la requête a échoué', () => {
    expect(contactsEmailVerdict(answer({ contactsWithoutEmail: null }), 'acc-1')).toEqual({ state: 'unmeasured' })
  })

  it('dit « tenu » pour un compte absent d’une lecture complète', () => {
    expect(contactsEmailVerdict(answer(), 'acc-1')).toEqual({ state: 'clear' })
  })

  it('refuse de conclure sur un compte absent d’une lecture bornée', () => {
    const data = answer({ contactsWithoutEmail: { byAccount: {}, truncated: true } })
    expect(contactsEmailVerdict(data, 'acc-1')).toEqual({ state: 'unmeasured' })
  })

  it('la borne de l’UNE ne rend pas l’AUTRE muette', () => {
    const data = answer({
      withoutNextAction: { ids: [], truncated: true },
      contactsWithoutEmail: { byAccount: {}, truncated: false },
    })
    expect(nextActionVerdict(data, 'acc-1')).toEqual({ state: 'unmeasured' })
    expect(contactsEmailVerdict(data, 'acc-1')).toEqual({ state: 'clear' })
  })
})
