import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #3923 — DÉCISION LOUIS 09/10 : les métiers placés se déclarent au complément
 * Temps 2 ET dans « Mon profil ». UN seul stockage (GA-26) : ce champ écrit
 * `placed_roles` par la MÊME sauvegarde que le profil (`PUT /esn-profile`).
 */

const getMineMock = vi.fn()
const updateMineMock = vi.fn()
const getInferenceMock = vi.fn()
vi.mock('@/features/profile/api', () => ({
  esnProfileKeys: {
    mine: ['esn-profile', 'mine'],
    workspaceMeta: ['esn-profile', 'workspace-meta'],
    placedRolesInference: ['esn-profile', 'placed-roles-inference'],
  },
  esnProfileApi: {
    getMine: () => getMineMock(),
    updateMine: (answers: unknown) => updateMineMock(answers),
    getWorkspaceMeta: () => Promise.resolve({ shared: false, canEditCompany: true }),
    getPlacedRolesInference: () => getInferenceMock(),
    dismissInferredPlacedRole: vi.fn(),
  },
}))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'me' }, loading: false }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { PlacedRolesSection } = await import('./PlacedRolesSection')

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <PlacedRolesSection />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  getMineMock.mockReset()
  updateMineMock.mockReset()
  getInferenceMock.mockReset()
  getInferenceMock.mockResolvedValue({ roles: [], declared: true, needsQuestion: false, computedAt: null })
})

describe('PlacedRolesSection (#3923)', () => {
  it('montre les métiers placés déclarés', async () => {
    getMineMock.mockResolvedValue({ placed_roles: ['Développeur', 'Data'] })
    renderSection()
    expect(await screen.findByText('Développeur')).toBeInTheDocument()
    expect(screen.getByText('Data')).toBeInTheDocument()
  })

  it('aucun métier déclaré : le dit, sans en inventer un', async () => {
    getMineMock.mockResolvedValue({ placed_roles: [] })
    renderSection()
    expect(await screen.findByText(/Aucun métier déclaré/)).toBeInTheDocument()
    expect(updateMineMock).not.toHaveBeenCalled()
  })

  it('ajouter « Cloud » enregistre placed_roles par la sauvegarde du profil', async () => {
    getMineMock.mockResolvedValue({ placed_roles: ['Développeur'] })
    updateMineMock.mockResolvedValue({ placed_roles: ['Développeur', 'Cloud'] })
    renderSection()
    const input = await screen.findByRole('textbox', { name: 'Métiers que tu places' })
    await userEvent.type(input, 'Cloud{Enter}')
    expect(updateMineMock).toHaveBeenCalledWith({ placed_roles: ['Développeur', 'Cloud'] })
  })

  // Métiers placés DÉDUITS (11/10/2026) — « Confirmer » passe par la MÊME sauvegarde.
  it('confirmer un métier déduit l’ajoute aux métiers DÉCLARÉS', async () => {
    getMineMock.mockResolvedValue({ placed_roles: ['Développeur'] })
    getInferenceMock.mockResolvedValue({
      roles: [{ role: 'Analyste SOC', evidence: [{ source: 'onboarding', excerpt: 'SOC managé' }], evidenceCount: 1 }],
      declared: true,
      needsQuestion: false,
      computedAt: null,
    })
    updateMineMock.mockResolvedValue({ placed_roles: ['Développeur', 'Analyste SOC'] })
    renderSection()
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmer Analyste SOC' }))
    expect(updateMineMock).toHaveBeenCalledWith({ placed_roles: ['Développeur', 'Analyste SOC'] })
  })
})
