import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const currentUserId = vi.fn<() => string | null>(() => 'u-1')

vi.mock('@/stores/currentUserStore', () => ({
  useCurrentUserStore: (selector: (state: { currentUser: { id: string } | null }) => unknown) =>
    selector({ currentUser: currentUserId() === null ? null : { id: currentUserId() as string } }),
}))

const { usePaymentColumns, paymentColumnsStorageKey } = await import('./usePaymentColumns')
const { DEFAULT_PAYMENT_COLUMNS, PAYMENT_COLUMN_KEYS, PINNED_PAYMENT_COLUMN } = await import('./columns')

beforeEach(() => {
  window.localStorage.clear()
  currentUserId.mockReturnValue('u-1')
})

describe('le choix des colonnes des paiements', () => {
  it('part des défauts quand rien n’a été retenu', () => {
    const { result } = renderHook(() => usePaymentColumns())
    expect(result.current.visible).toEqual([...DEFAULT_PAYMENT_COLUMNS])
  })

  it('garde l’ORDRE canonique, jamais celui des clics', () => {
    // Sans cela, cocher « Retard » puis « Mission » donnerait un tableau
    // différent de celui du voisin qui a coché dans l'autre sens.
    const { result } = renderHook(() => usePaymentColumns())
    act(() => result.current.toggle('reminders', true))
    act(() => result.current.toggle('mission', true))
    const canonical = PAYMENT_COLUMN_KEYS.filter(key => result.current.visible.includes(key))
    expect(result.current.visible).toEqual(canonical)
  })

  it('REFUSE de décocher la colonne épinglée — la règle vit dans le hook', () => {
    // Une garde qui vivrait dans le rendu du bouton disparaîtrait au premier
    // autre appelant.
    const { result } = renderHook(() => usePaymentColumns())
    act(() => result.current.toggle(PINNED_PAYMENT_COLUMN, false))
    expect(result.current.isVisible(PINNED_PAYMENT_COLUMN)).toBe(true)
  })

  it('écrit sous une clé qui porte l’IDENTIFIANT de l’utilisateur', () => {
    // La cause racine « premier cookie = mauvaise identité » a déjà mélangé la
    // démonstration et un vrai compte sur la même machine.
    const { result } = renderHook(() => usePaymentColumns())
    act(() => result.current.toggle('mission', true))
    expect(window.localStorage.getItem(paymentColumnsStorageKey('u-1'))).toContain('mission')
  })

  it('n’écrit RIEN quand personne n’est connecté', () => {
    // Une clé anonyme serait ensuite servie au premier utilisateur qui se
    // connecte sur cette machine.
    currentUserId.mockReturnValue(null)
    const { result } = renderHook(() => usePaymentColumns())
    act(() => result.current.toggle('mission', true))
    // ⚠️ `.length` et non `Object.keys` : le faux `localStorage` de cet
    // environnement expose ses MÉTHODES comme clés énumérables, si bien que
    // `Object.keys` rend six entrées sur un stockage parfaitement vide. Le test
    // aurait échoué en accusant un code qui n'écrit rien.
    expect(window.localStorage.length).toBe(0)
  })

  it('ÉCARTE une clé inconnue sans faire tomber le reste', () => {
    // Une colonne retirée du produit ne doit pas rendre son tableau illisible à
    // ceux qui l'avaient cochée.
    window.localStorage.setItem(paymentColumnsStorageKey('u-1'), JSON.stringify(['status', 'colonne-disparue']))
    const { result } = renderHook(() => usePaymentColumns())
    expect(result.current.visible).toEqual([PINNED_PAYMENT_COLUMN, 'status'])
  })

  it('retombe sur les défauts devant un contenu illisible', () => {
    window.localStorage.setItem(paymentColumnsStorageKey('u-1'), 'pas du json')
    const { result } = renderHook(() => usePaymentColumns())
    expect(result.current.visible).toEqual([...DEFAULT_PAYMENT_COLUMNS])
  })

  it('remet les défauts sur demande', () => {
    const { result } = renderHook(() => usePaymentColumns())
    act(() => result.current.toggle('status', false))
    expect(result.current.isVisible('status')).toBe(false)
    act(() => result.current.reset())
    expect(result.current.visible).toEqual([...DEFAULT_PAYMENT_COLUMNS])
  })

  it('porte la colonne « cession », BRANCHÉE sur le domaine affacturage (31/08/2026)', () => {
    // La place était réservée entre `validation` et `payable` ; elle est
    // maintenant remplie — voir `columns.ts` et `PaymentsPage.tsx`.
    expect(PAYMENT_COLUMN_KEYS).toContain('cession')
    expect(DEFAULT_PAYMENT_COLUMNS).toContain('cession')
  })
})
