import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '@/i18n'
import { InlineProfileValue } from './InlineProfileValue'

// #4425 — une valeur qui vient d'un champ du profil se corrige là où on la lit.
describe('InlineProfileValue', () => {
  it('lit la valeur, puis ouvre un champ pré-rempli au clic sur Modifier', () => {
    render(<InlineProfileValue label="Site web" value="https://a.fr" onSave={vi.fn()} />)
    expect(screen.getByText('https://a.fr')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Modifier/ }))
    expect((screen.getByLabelText('Site web') as HTMLInputElement).value).toBe('https://a.fr')
  })

  it('envoie la valeur saisie (rognée) à onSave, puis referme', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<InlineProfileValue label="Site web" value="https://a.fr" onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: /Modifier/ }))
    fireEvent.change(screen.getByLabelText('Site web'), { target: { value: '  https://b.fr ' } })
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('https://b.fr'))
    await waitFor(() => expect(screen.queryByLabelText('Site web')).toBeNull())
  })

  it('Annuler referme sans rien envoyer', () => {
    const onSave = vi.fn()
    render(<InlineProfileValue label="Site web" value="https://a.fr" onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: /Modifier/ }))
    fireEvent.change(screen.getByLabelText('Site web'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: /Annuler/ }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText('https://a.fr')).toBeTruthy()
  })

  it('une valeur absente se dit « non renseigné », jamais 0 ni vide', () => {
    render(<InlineProfileValue label="Consultants" value={null} onSave={vi.fn()} />)
    expect(screen.getByText(/Non renseigné/)).toBeTruthy()
    expect(screen.queryByText('0')).toBeNull()
  })

  it('verrouillé : aucun bouton Modifier, la raison est dite', () => {
    render(
      <InlineProfileValue label="Site web" value="https://a.fr" onSave={vi.fn()} lockedReason="Réservé aux admins" />,
    )
    expect(screen.queryByRole('button', { name: /Modifier/ })).toBeNull()
    expect(screen.getByText('Réservé aux admins')).toBeTruthy()
  })

  it('un échec d’enregistrement garde le champ ouvert et le dit', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('boom'))
    render(<InlineProfileValue label="Site web" value="a" onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: /Modifier/ }))
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByLabelText('Site web')).toBeTruthy()
  })

  it('liste fermée : un sélecteur nommé (jamais un champ libre), valeur courante envoyée telle quelle', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <InlineProfileValue
        label="Positionnement"
        value="Régie pure"
        options={[
          { value: 'Régie pure', label: 'Régie pure' },
          { value: 'Généraliste', label: 'Généraliste' },
        ]}
        onSave={onSave}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Modifier/ }))
    expect(screen.getByRole('combobox', { name: 'Positionnement' })).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Régie pure'))
  })
})
