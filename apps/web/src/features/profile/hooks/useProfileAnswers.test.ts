import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { EsnAnswers } from '@bellum/contracts'
import { useProfileAnswers } from './useProfileAnswers'

const base = (over: Partial<EsnAnswers> = {}): EsnAnswers =>
  ({ esn_name: 'Acme', placed_roles: [], ...over }) as unknown as EsnAnswers

describe('useProfileAnswers', () => {
  // #3923 — « Métiers placés enregistrés » puis « Profil enregistré », et rien
  // en base : un autre écran sauvegardait `placed_roles`, la cache se
  // rafraîchissait, mais le formulaire gardait ses valeurs d'AVANT et l'auto-save
  // les renvoyait en entier (placed_roles = []). Ce test sait dire NON : sans
  // rebasage des champs non touchés, `values.placed_roles` reste `[]`.
  it('#3923 — une sauvegarde externe d’un champ non touché rebase le formulaire, sans le rendre « modifié »', () => {
    const { result, rerender } = renderHook(({ answers }) => useProfileAnswers(answers), {
      initialProps: { answers: base() },
    })
    expect(result.current.dirty).toBe(false)

    rerender({ answers: base({ placed_roles: ['Recette'] }) })

    expect(result.current.values.placed_roles).toEqual(['Recette'])
    expect(result.current.dirty).toBe(false)
  })

  it('#3923 — un champ touché garde la saisie de l’utilisateur face à une sauvegarde externe', () => {
    const { result, rerender } = renderHook(({ answers }) => useProfileAnswers(answers), {
      initialProps: { answers: base() },
    })
    act(() => result.current.setField('esn_name', 'Acme 2'))
    expect(result.current.dirty).toBe(true)

    rerender({ answers: base({ placed_roles: ['Recette'] }) })

    expect(result.current.values.esn_name).toBe('Acme 2')
    expect(result.current.values.placed_roles).toEqual(['Recette'])
    expect(result.current.dirty).toBe(true)
  })

  it('une saisie rendue égale à la valeur enregistrée n’est plus « modifiée »', () => {
    const { result, rerender } = renderHook(({ answers }) => useProfileAnswers(answers), {
      initialProps: { answers: base() },
    })
    act(() => result.current.setField('esn_name', 'Acme 2'))
    rerender({ answers: base({ esn_name: 'Acme 2' }) })
    expect(result.current.dirty).toBe(false)
  })
})
