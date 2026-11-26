import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProtectedTime } from '@bellum/contracts'

const mutate = vi.fn()
let data: ProtectedTime | null | undefined = null
let isLoading = false
let isError = false

vi.mock('@/features/memory/hooks/useProtectedTime', () => ({
  useProtectedTime: () => ({ data, isLoading, isError }),
  useSetProtectedTime: () => ({ mutate, isPending: false }),
}))

const { ProtectedTimeSettings } = await import('./ProtectedTimeSettings')

/**
 * #2101.13 — LE TEMPS PROTÉGÉ, réglé, changé, effacé.
 *
 * Même nuance que `ReplyPreferencesSettings.test.tsx` : une lecture ÉCHOUÉE ne
 * se déguise pas en « rien réglé », et effacer retire vraiment la clé du sac,
 * jamais une valeur à `null` qui resterait une ligne muette du registre.
 */
describe('ProtectedTimeSettings — le temps protégé', () => {
  beforeEach(() => {
    mutate.mockReset()
    data = null
    isLoading = false
    isError = false
  })

  it('sans réglage, les deux champs sont vides et le bouton « Ne plus protéger » est absent', () => {
    render(<ProtectedTimeSettings />)
    expect(screen.getByLabelText('Début')).toHaveValue('')
    expect(screen.getByLabelText('Fin')).toHaveValue('')
    expect(screen.queryByRole('button', { name: 'Ne plus protéger' })).not.toBeInTheDocument()
  })

  it('montre la fenêtre déjà réglée', () => {
    data = { startMinute: 9 * 60, endMinute: 18 * 60 }
    render(<ProtectedTimeSettings />)
    expect(screen.getByLabelText('Début')).toHaveValue('09:00')
    expect(screen.getByLabelText('Fin')).toHaveValue('18:00')
  })

  it('pose la fenêtre au blur, sur un brouillon neuf (défaut 9h–18h pour le champ non touché)', () => {
    render(<ProtectedTimeSettings />)
    fireEvent.blur(screen.getByLabelText('Début'), { target: { value: '08:30' } })
    expect(mutate).toHaveBeenCalledWith({ startMinute: 8 * 60 + 30, endMinute: 18 * 60 })
  })

  it('refuse une fin avant le début — sans écrire une fenêtre inversée', () => {
    data = { startMinute: 9 * 60, endMinute: 18 * 60 }
    render(<ProtectedTimeSettings />)
    fireEvent.blur(screen.getByLabelText('Fin'), { target: { value: '08:00' } })
    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/heure de fin doit .tre apr.s/)
  })

  it('« Ne plus protéger » efface la clé — jamais une valeur à `null` posée pour rien', () => {
    data = { startMinute: 9 * 60, endMinute: 18 * 60 }
    render(<ProtectedTimeSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Ne plus protéger' }))
    expect(mutate).toHaveBeenCalledWith(null)
  })

  it('une lecture ÉCHOUÉE ne se déguise pas en formulaire vide', () => {
    data = undefined
    isError = true
    render(<ProtectedTimeSettings />)
    expect(screen.queryByLabelText('Début')).not.toBeInTheDocument()
  })
})
