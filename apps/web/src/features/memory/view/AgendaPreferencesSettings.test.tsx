import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgendaPreferences } from '@bellum/contracts'

const mutate = vi.fn()
let data: Partial<AgendaPreferences> | undefined = {}
let isLoading = false
let isError = false

vi.mock('@/features/memory/hooks/useAgendaPreferences', () => ({
  useAgendaPreferences: () => ({ data, isLoading, isError }),
  useSetAgendaPreferences: () => ({ mutate, isPending: false }),
}))

const { AgendaPreferencesSettings } = await import('./AgendaPreferencesSettings')

/**
 * #2101.17 — LES PRÉFÉRENCES D'AGENDA, réglées, changées, effacées.
 *
 * Même nuance que `ProtectedTimeSettings.test.tsx` : une lecture ÉCHOUÉE ne se
 * déguise pas en « rien réglé », et effacer retire vraiment la clé du sac,
 * jamais une valeur à `null` qui resterait une ligne muette du registre.
 */
describe('AgendaPreferencesSettings — les préférences d’agenda', () => {
  beforeEach(() => {
    mutate.mockReset()
    data = {}
    isLoading = false
    isError = false
  })

  it('sans réglage, les deux champs sont vides et le bouton « Revenir aux valeurs par défaut » est absent', () => {
    render(<AgendaPreferencesSettings />)
    expect(screen.getByLabelText('Minutes par dossier')).toHaveValue(null)
    expect(screen.getByLabelText('Créneaux en réserve')).toHaveValue(null)
    expect(screen.queryByRole('button', { name: 'Revenir aux valeurs par défaut' })).not.toBeInTheDocument()
  })

  it('montre les valeurs déjà réglées', () => {
    data = { dossierDurationMinutes: 30, reserveSlots: 2 }
    render(<AgendaPreferencesSettings />)
    expect(screen.getByLabelText('Minutes par dossier')).toHaveValue(30)
    expect(screen.getByLabelText('Créneaux en réserve')).toHaveValue(2)
  })

  it('pose la durée au blur, sur un brouillon neuf (défaut 1 créneau de réserve pour le champ non touché)', () => {
    render(<AgendaPreferencesSettings />)
    fireEvent.blur(screen.getByLabelText('Minutes par dossier'), { target: { value: '30' } })
    expect(mutate).toHaveBeenCalledWith({ dossierDurationMinutes: 30, reserveSlots: 1 })
  })

  it('refuse une durée hors bornes — sans l’écrire', () => {
    render(<AgendaPreferencesSettings />)
    fireEvent.blur(screen.getByLabelText('Minutes par dossier'), { target: { value: '5' } })
    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/durée par dossier doit .tre comprise/)
  })

  it('« Revenir aux valeurs par défaut » efface la clé — jamais une valeur à `null` posée pour rien', () => {
    data = { dossierDurationMinutes: 30, reserveSlots: 2 }
    render(<AgendaPreferencesSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Revenir aux valeurs par défaut' }))
    expect(mutate).toHaveBeenCalledWith(null)
  })

  it('une lecture ÉCHOUÉE ne se déguise pas en formulaire vide', () => {
    data = undefined
    isError = true
    render(<AgendaPreferencesSettings />)
    expect(screen.queryByLabelText('Minutes par dossier')).not.toBeInTheDocument()
  })

  it('#2770.28 (recette prod 08/10) — le formulaire se vide SANS rechargement quand la donnée retombe à rien', () => {
    data = { dossierDurationMinutes: 60, reserveSlots: 3 }
    const { rerender } = render(<AgendaPreferencesSettings />)
    expect(screen.getByLabelText('Minutes par dossier')).toHaveValue(60)
    expect(screen.getByLabelText('Créneaux en réserve')).toHaveValue(3)
    // Même instance de composant — la mutation `null` a déjà réussi et invalidé
    // la lecture, React re-rend avec la nouvelle donnée, jamais un rechargement.
    data = {}
    rerender(<AgendaPreferencesSettings />)
    expect(screen.getByLabelText('Minutes par dossier')).toHaveValue(null)
    expect(screen.getByLabelText('Créneaux en réserve')).toHaveValue(null)
  })

  it('#2770.28 (recette prod 08/10) — un blur SANS changement ne repose rien, pour ne jamais courir contre une remise à zéro en cours', () => {
    data = { dossierDurationMinutes: 60, reserveSlots: 3 }
    render(<AgendaPreferencesSettings />)
    // Le clic sur « Revenir aux valeurs par défaut » blur l'input encore focus — sans
    // ce garde, ce blur reposerait 60/3 et pourrait gagner la course contre le `null`.
    fireEvent.blur(screen.getByLabelText('Créneaux en réserve'), { target: { value: '3' } })
    expect(mutate).not.toHaveBeenCalled()
  })
})
