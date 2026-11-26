import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u-1' }, loading: false }) }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

const { ActionLevelSettings } = await import('./ActionLevelSettings')

function renderView(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  apiFetch.mockReset()
})

// #2896 / #2449.34 — le niveau d'action visible (et réglable) dans les paramètres du travail.
describe('#2449.34 — ActionLevelSettings', () => {
  it('sans réglage, le défaut est coché et NOMMÉ comme défaut', async () => {
    apiFetch.mockResolvedValue({ level: null })
    renderView(<ActionLevelSettings />)

    expect(await screen.findByRole('radio', { name: /Selon ta demande \(par défaut\)/ })).toBeChecked()
    expect(apiFetch).toHaveBeenCalledWith({ path: '/actions/level' })
  })

  it('lit le niveau réglé, et propose les trois niveaux réglables — jamais « Automatiser »', async () => {
    apiFetch.mockResolvedValue({ level: 'prepare' })
    renderView(<ActionLevelSettings />)

    expect(await screen.findByRole('radio', { name: /^Préparer/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /^Répondre seulement/ })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: /^Exécuter/ })).not.toBeChecked()
    expect(screen.queryByRole('radio', { name: /^Automatiser/ })).toBeNull()
    // Automatiser n'est pas caché en silence : on dit où il vit.
    expect(screen.getByRole('link', { name: /Voir les routines/ })).toHaveAttribute('href', '/settings/routines')
  })

  it('choisir un niveau l’écrit par la route, pour soi', async () => {
    apiFetch.mockImplementation((args: { method?: string; body?: unknown }) =>
      Promise.resolve(args.method === 'PUT' ? args.body : { level: null }),
    )
    renderView(<ActionLevelSettings />)

    await userEvent.click(await screen.findByRole('radio', { name: /^Répondre seulement/ }))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith({ path: '/actions/level', method: 'PUT', body: { level: 'respond_only' } }),
    )
  })

  it('revenir au défaut envoie `null` — la clé est retirée, pas écrite', async () => {
    apiFetch.mockImplementation((args: { method?: string; body?: unknown }) =>
      Promise.resolve(args.method === 'PUT' ? args.body : { level: 'execute' }),
    )
    renderView(<ActionLevelSettings />)

    await userEvent.click(await screen.findByRole('radio', { name: /Selon ta demande/ }))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith({ path: '/actions/level', method: 'PUT', body: { level: null } }),
    )
  })

  it('NON : une lecture échouée ne s’affiche pas « par défaut »', async () => {
    apiFetch.mockRejectedValue(new Error('boom'))
    renderView(<ActionLevelSettings />)

    expect(await screen.findByText(/Le niveau d'action n'a pas pu être lu/)).toBeInTheDocument()
    expect(screen.queryByRole('radio')).toBeNull()
  })
})
