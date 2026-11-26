import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to?: string }) => <a href={to ?? '#'}>{children}</a>,
}))
type ApiCall = { path: string }
const apiFetch = vi.fn(async (_args: ApiCall): Promise<unknown> => ({}))
vi.mock('@/lib/api', () => ({ apiFetch: (args: ApiCall) => apiFetch(args) }))

const { PrivacyView } = await import('./PrivacyView')

/**
 * #4295.15 — recette production : /privacy rendait « Page introuvable ». L'écran lit le registre des durées de
 * conservation sur `GET /privacy/retention` (servi depuis longtemps, lu par personne), renvoie à la politique
 * publiée, et ne fabrique AUCUNE durée.
 */
function draw() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <PrivacyView />
    </QueryClientProvider>,
  )
}

describe('PrivacyView', () => {
  it('lit le registre servi par l’API : catégorie, durée et raison', async () => {
    apiFetch.mockResolvedValueOnce({
      sweepEnabled: true,
      rules: [
        { key: 'revoked_sessions', label: 'Sessions révoquées', days: 90, rationale: 'Sécurité' },
        { key: 'profile', label: 'Profil', days: null, rationale: 'Contrat' },
      ],
    })
    draw()
    expect(await screen.findByText('Sessions révoquées')).toBeInTheDocument()
    expect(apiFetch).toHaveBeenCalledWith({ path: '/privacy/retention' })
    expect(screen.getByText('90 jours')).toBeInTheDocument()
    expect(screen.getByText('Tant que le compte existe')).toBeInTheDocument()
    expect(screen.getByText(/purge automatique est active/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ouvrir Données & exports/ })).toHaveAttribute(
      'href',
      '/settings/mes-donnees',
    )
    expect(screen.getByRole('link', { name: /Lire la politique de confidentialité/ })).toHaveAttribute(
      'href',
      expect.stringMatching(/\/privacy$/),
    )
  })

  it('sait dire NON : un registre vide dit qu’il est vide, sans durée inventée ; une purge suspendue se dit', async () => {
    apiFetch.mockResolvedValueOnce({ sweepEnabled: false, rules: [] })
    draw()
    expect(await screen.findByText('Aucune durée de conservation n’est publiée pour l’instant.')).toBeInTheDocument()
    expect(screen.queryByText(/\d+ jours?/)).toBeNull()
  })

  it('une erreur de lecture se dit, avec un moyen de réessayer', async () => {
    apiFetch.mockRejectedValueOnce(new Error('boom'))
    draw()
    expect(await screen.findByText('Le registre n’a pas pu être chargé.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument()
  })
  it('grammaire Théo : h1 de page puis trois cartes dans l’ordre politique, registre, droits', async () => {
    apiFetch.mockResolvedValueOnce({ sweepEnabled: true, rules: [] })
    draw()
    await screen.findByText('Aucune durée de conservation n’est publiée pour l’instant.')
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.className).toMatch(/text-3xl/)
    const sections = ['privacy-policy', 'privacy-register', 'privacy-rights'].map(
      id => document.getElementById(id)!.closest('section')!,
    )
    for (const section of sections) expect(section.className).toMatch(/rounded-card/)
    for (let i = 1; i < sections.length; i++) {
      expect(sections[i - 1]!.compareDocumentPosition(sections[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })
})
