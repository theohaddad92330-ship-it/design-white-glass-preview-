import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setPortfolioVisibilitySchema } from '@bellum/contracts'
import { TEAM_KEY } from '@/features/team/hooks/useTeam'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { PortfolioVisibilityCard } = await import('./PortfolioVisibilityCard')

function renderCard(props: { visibility: 'open' | 'restricted' | null; canManage: boolean }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(
    <QueryClientProvider client={client}>
      <PortfolioVisibilityCard {...props} />
    </QueryClientProvider>,
  )
  return { invalidate }
}

const open = () => screen.getByRole('radio', { name: /Ouvert à toute l’équipe/ })
const restricted = () => screen.getByRole('radio', { name: /Cloisonné par commercial/ })

beforeEach(() => {
  apiFetch.mockReset()
  apiFetch.mockResolvedValue({ visibility: 'restricted' })
})

describe('le cloisonnement de portefeuille', () => {
  it('affiche comme ACTIVE la valeur que le serveur a envoyée', () => {
    // Le sens qui compte : l'écran LIT le serveur, il ne se souvient pas de ce
    // qu'il a écrit. Sans cette moitié, un réglage enregistré ailleurs (ou par
    // quelqu'un d'autre) ne se verrait jamais.
    renderCard({ visibility: 'restricted', canManage: true })
    expect(restricted()).toHaveAttribute('aria-checked', 'true')
    expect(open()).toHaveAttribute('aria-checked', 'false')
  })

  it('n’invente AUCUNE option active quand le serveur ne renvoie pas la valeur', () => {
    // ⚠️ Le défaut serveur est 'open'. Le présenter comme le réglage en cours
    // sans l'avoir lu mentirait à toute ESN qui a cloisonné — et la mention
    // écrite est ce qui distingue « inconnu » de « ouvert ».
    renderCard({ visibility: null, canManage: true })
    expect(open()).toHaveAttribute('aria-checked', 'false')
    expect(restricted()).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText(/n’est pas encore affichable ici/)).toBeInTheDocument()
  })

  it('envoie au serveur un corps qui satisfait le schéma du contrat', async () => {
    renderCard({ visibility: 'open', canManage: true })
    await userEvent.click(restricted())
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))

    const call = apiFetch.mock.calls[0]?.[0] as { path: string; method: string; body: unknown }
    expect(call.path).toBe('/workspaces/portfolio-visibility')
    expect(call.method).toBe('PATCH')
    // `expect.anything()` ne garderait rien : le corps est parsé contre le
    // schéma zod que le DTO NestJS utilise, donc un renommage de champ ou une
    // valeur hors énumération casse ici et non en production.
    const parsed = setPortfolioVisibilitySchema.safeParse(call.body)
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.visibility).toBe('restricted')
  })

  it('invalide la MÊME clé de cache que l’écran Équipe lit', async () => {
    // La clé est IMPORTÉE, jamais recopiée : une clé ré-écrite à la main
    // n'invalide rien et l'écran garde l'ancienne valeur (défaut déjà trouvé en
    // recette sur la carte voisine).
    const { invalidate } = renderCard({ visibility: 'open', canManage: true })
    await userEvent.click(restricted())
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: TEAM_KEY }))
  })

  it('laisse voir le réglage à un non-propriétaire, désactivé et EXPLIQUÉ', async () => {
    // Le serveur réserve l'écriture au propriétaire (`assertRole(['owner'])`).
    // Cacher la carte laisserait un admin croire que le cloisonnement n'existe
    // pas ; la désactiver en disant pourquoi lui dit à qui s'adresser.
    renderCard({ visibility: 'open', canManage: false })
    expect(open()).toBeDisabled()
    expect(restricted()).toBeDisabled()
    expect(screen.getByText(/Seul le propriétaire de l’espace peut changer ce réglage/)).toBeInTheDocument()
    await userEvent.click(restricted())
    expect(apiFetch).not.toHaveBeenCalled()
  })
})
