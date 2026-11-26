import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #4427.1 — la carte Lemlist : la forme des autres cartes à clé (Odoo) — un
 * bouton, la saisie dans une boîte, la clé masquée, un refus qui ne vide rien.
 */
const state = vi.hoisted(() => ({
  connected: false,
  connect: vi.fn(),
  disconnect: vi.fn(),
}))
vi.mock('@/features/lemlist/api', () => ({
  useLemlistStatus: () => ({ data: { connected: state.connected, connectedAt: null }, isLoading: false }),
  useConnectLemlist: () => ({ mutateAsync: state.connect, isPending: false }),
  useDisconnectLemlist: () => ({ mutate: state.disconnect, isPending: false }),
}))
vi.mock('./ConnectorDiagnostics', () => ({ ConnectorDiagnostics: () => null }))

const { LemlistCard } = await import('./LemlistCard')

describe('la carte Lemlist (#4427.1)', () => {
  beforeEach(() => {
    state.connected = false
    state.connect.mockReset()
    state.disconnect.mockReset()
  })

  it('se rend avec son nom, sans AUCUN champ dans la grille', () => {
    render(<LemlistCard state="available" tools={[]} />)
    expect(screen.getByText('Lemlist')).toBeInTheDocument()
    expect(document.querySelectorAll('input').length).toBe(0)
  })

  it('ouvre la saisie : UNE clé, masquée, envoyée rognée', async () => {
    state.connect.mockResolvedValueOnce({ connected: true, connectedAt: null })
    render(<LemlistCard state="available" tools={[]} />)
    await userEvent.click(screen.getByRole('button', { name: /Connecter Lemlist/i }))
    const inputs = document.querySelectorAll('input')
    expect(inputs.length).toBe(1)
    expect(inputs[0]?.getAttribute('type')).toBe('password')
    await userEvent.type(inputs[0] as HTMLInputElement, '  ma-cle  ')
    await userEvent.click(screen.getByRole('button', { name: /^Connecter$/i }))
    expect(state.connect).toHaveBeenCalledWith({ apiKey: 'ma-cle' })
  })

  it('un refus s’affiche sous le champ, et la saisie survit', async () => {
    state.connect.mockRejectedValueOnce(new Error('Lemlist a refusé cette clé d’API.'))
    render(<LemlistCard state="available" tools={[]} />)
    await userEvent.click(screen.getByRole('button', { name: /Connecter Lemlist/i }))
    const input = document.querySelector('input') as HTMLInputElement
    await userEvent.type(input, 'fausse')
    await userEvent.click(screen.getByRole('button', { name: /^Connecter$/i }))
    expect(await screen.findByText(/refusé cette clé/)).toBeInTheDocument()
    expect((document.querySelector('input') as HTMLInputElement).value).toBe('fausse')
  })

  it('connectée : elle le dit et propose de déconnecter', async () => {
    state.connected = true
    render(<LemlistCard state="connected" tools={[]} />)
    await userEvent.click(screen.getByRole('button', { name: /Déconnecter/i }))
    expect(state.disconnect).toHaveBeenCalled()
  })
})
