import type { ReactElement, ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

vi.mock('@tanstack/react-router', async () => {
  const { forwardRef } = await import('react')
  return {
    Link: forwardRef<HTMLAnchorElement, { to: string; children?: ReactNode }>(({ to, children, ...rest }, ref) => (
      <a ref={ref} href={to} {...rest}>
        {children}
      </a>
    )),
  }
})

const { BetProfilesSection } = await import('./BetProfilesSection')

function renderSection(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

const ROWS = [
  { id: 'a1', name: 'SNCF', horizon: 'long', size: 'very_large', access: null, resource: 'Équipe data' },
  { id: 'a2', name: 'RATP', horizon: null, size: null, access: null, resource: null },
]

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  apiFetch.mockReset()
})

/**
 * #3245 (recette prod 02/10) — « aucune UI de déclaration du profil de pari
 * (endpoint API seul) » : la déclaration se fait depuis Réglages › Charge
 * commerciale, dossier par dossier, avec le MÊME dialogue que le menu du dossier.
 */
describe('#3245 — déclarer le profil de pari depuis Réglages', () => {
  it('liste chaque dossier avec ce qui en est déclaré, et un non-déclaré reste nommé « Non déclaré »', async () => {
    apiFetch.mockResolvedValue(ROWS)
    renderSection(<BetProfilesSection />)
    const sncf = (await screen.findByText('SNCF')).closest('[data-bet-row]') as HTMLElement
    expect(within(sncf).getByText(/Pari long/)).toBeInTheDocument()
    expect(within(sncf).getByText(/Très grand compte/)).toBeInTheDocument()
    // L'accès n'est pas déclaré sur ce dossier : aucune ligne « Accès ouvert » inventée.
    expect(within(sncf).queryByText(/Accès ouvert|Compte fermé/)).toBeNull()
    // Un dossier sans rien de déclaré ne fait AUCUNE ligne : il se compte dans une phrase (#3245, 03/10).
    expect(screen.queryByText('RATP')).toBeNull()
    expect(screen.queryByText('Non déclaré')).toBeNull()
    expect(screen.getByText('1 dossier sans profil de pari')).toBeInTheDocument()
    expect(apiFetch).toHaveBeenCalledWith({ path: '/accounts/bet-profiles' })
  })

  it('« Déclarer » ouvre le dialogue du dossier, et l’enregistrement passe par la route existante', async () => {
    apiFetch.mockImplementation((args: { path: string; method?: string }) => {
      if (args.path === '/accounts/bet-profiles') return Promise.resolve(ROWS)
      if (args.method === 'PATCH') return Promise.resolve({ id: 'a2' })
      return Promise.resolve({ horizon: null, size: null, access: null, resource: null })
    })
    renderSection(<BetProfilesSection />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Déclarer un dossier' }))
    const ratp = (await screen.findByText('RATP')).closest('[data-bet-row]') as HTMLElement
    await user.click(within(ratp).getByRole('button', { name: /Déclarer/ }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/accounts/a2/bet-profile', method: 'PATCH' }),
      ),
    )
  })

  it('aucun dossier : l’écran le dit au lieu d’une liste vide muette', async () => {
    apiFetch.mockResolvedValue([])
    renderSection(<BetProfilesSection />)
    expect(await screen.findByText(/Aucun dossier à déclarer/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ouvrir les dossiers' })).toHaveAttribute('href', '/accounts')
  })

  it('une lecture en échec se dit, sans inventer de profil', async () => {
    apiFetch.mockRejectedValue(new Error('boom'))
    renderSection(<BetProfilesSection />)
    expect(await screen.findByText(/Je n’ai pas pu lire les profils de pari/)).toBeInTheDocument()
  })

  // Recette prod 03/10 : 68 lignes « Non déclaré » sur 4461 px, sans pagination.
  it('#3245 — 68 dossiers non déclarés ne font PAS 68 lignes : une phrase, puis une liste paginée à la demande', async () => {
    const undeclared = Array.from({ length: 68 }, (_, i) => ({
      id: `u${i}`,
      name: `Dossier ${String(i).padStart(2, '0')}`,
      horizon: null,
      size: null,
      access: null,
      resource: null,
    }))
    apiFetch.mockResolvedValue([...ROWS.slice(0, 1), ...undeclared])
    renderSection(<BetProfilesSection />)
    expect(await screen.findByText('68 dossiers sans profil de pari')).toBeInTheDocument()
    expect(document.querySelectorAll('[data-bet-row]')).toHaveLength(1)

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Déclarer un dossier' }))
    expect(document.querySelectorAll('[data-bet-row]')).toHaveLength(1 + 8)
    // #3245 (recette 03/10 Y21) — « ×2 une fois déplié » : la phrase ne se lit qu'UNE fois.
    expect(screen.getAllByText('68 dossiers sans profil de pari')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Voir 8 dossiers de plus' }))
    expect(document.querySelectorAll('[data-bet-row]')).toHaveLength(1 + 16)
  })

  it('⚠️ SAIT DIRE NON — tout est déclaré : aucune phrase « sans profil », aucun bouton de dépliage', async () => {
    apiFetch.mockResolvedValue(ROWS.slice(0, 1))
    renderSection(<BetProfilesSection />)
    await screen.findByText('SNCF')
    expect(screen.queryByText(/sans profil de pari/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Déclarer un dossier' })).toBeNull()
  })
})
