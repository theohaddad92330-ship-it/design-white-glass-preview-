import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

/**
 * Théo D settings-compte.R2 — Sécurité en rubriques : l'authentification (2FA,
 * sessions — les vraies actions, A1), l'accès aux données qui RENVOIE vers
 * l'endroit où il se gère, et « Supprimer mes données » qui garde la
 * suppression du compte (A5, RGPD c67).
 *
 * Les lignes qui portent leur propre logique ont leurs propres tests ; ici on
 * ne vérifie que la composition de la page.
 */
vi.mock('../components/security/TwoFactorRow', () => ({ TwoFactorRow: () => <div data-testid="two-factor" /> }))
vi.mock('../components/security/ActiveSessionsRow', () => ({
  ActiveSessionsRow: () => <div data-testid="sessions" />,
}))
vi.mock('../components/security/DeleteAccountRow', () => ({
  DeleteAccountRow: () => <div data-testid="delete-account" />,
}))

const { SecurityView } = await import('./SecurityView')

beforeEach(async () => {
  await i18n.changeLanguage('fr')
})

describe('SecurityView — rubriques', () => {
  it('garde la double authentification et les sessions actives (A1)', async () => {
    renderWithRouter(<SecurityView />)
    expect(await screen.findByTestId('two-factor')).toBeInTheDocument()
    expect(screen.getByTestId('sessions')).toBeInTheDocument()
  })

  it('« Accès aux données » renvoie vers les membres et les connecteurs, sans les refaire', async () => {
    renderWithRouter(<SecurityView />)
    expect(await screen.findByText('Accès aux données')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voir les accès' })).toHaveAttribute('href', '/settings/team')
    expect(screen.getByRole('link', { name: 'Voir les connecteurs' })).toHaveAttribute('href', '/integrations')
  })

  it('« Supprimer mes données » porte mes éléments personnels ET la suppression du compte (A5)', async () => {
    renderWithRouter(<SecurityView />)
    expect(await screen.findByText('Supprimer mes données')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Gérer mes données/ })).toHaveAttribute('href', '/settings/mes-donnees')
    expect(screen.getByTestId('delete-account')).toBeInTheDocument()
  })

  it('« Ta session » porte le mot de passe : « Changer » ouvre sa fenêtre, qui dit où part le lien', async () => {
    renderWithRouter(<SecurityView />)
    expect(await screen.findByText('Ta session')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Changer' }))
    expect(await screen.findByRole('dialog', { name: 'Changer de mot de passe' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Envoyer le lien' })).toBeInTheDocument()
  })

  it('structure Théo V22 : Ta session, Accès aux données, Supprimer mes données — dans cet ordre, et « Gérer mes données » renvoie vers Mes données', async () => {
    renderWithRouter(<SecurityView />)
    const titles = (await screen.findAllByRole('heading', { level: 2 })).map(h => h.textContent)
    const order = ['Ta session', 'Accès aux données', 'Supprimer mes données'].map(title => titles.indexOf(title))
    expect(order.every(index => index >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(screen.getByRole('link', { name: /Gérer mes données/ })).toHaveAttribute('href', '/settings/mes-donnees')
  })
})
