import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { accountsApi } from '@/features/accounts/api'
import { renderWithRouter, resetTestQueryClient } from '@/test-utils/renderWithRouter'
import { AccountsCrmFusionBanner } from './AccountsCrmFusionBanner'

vi.mock('@/features/accounts/api', async importOriginal => {
  const original = await importOriginal<typeof import('@/features/accounts/api')>()
  return { ...original, accountsApi: { ...original.accountsApi, crmFusionSweep: vi.fn() } }
})
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' } }) }))
const team = vi.hoisted(() => ({ role: 'admin' as string }))
vi.mock('@/features/team/hooks/useTeam', () => ({ useTeam: () => ({ team: { workspace: { role: team.role } } }) }))

const report = (found: number, dryRun: boolean, merged = 0) => ({
  dryRun,
  found,
  merged,
  ambiguous: 0,
  humanDecided: 0,
  deferred: 0,
  pairs: [],
})

/**
 * #4603.4 — `POST /accounts/crm-fusions/sweep` existait (simulation par défaut, `integrations:manage`) sans AUCUN
 * appelant dans `apps/web` : le stock de paires déjà créées n'était jamais rattrapé. Cette bannière EST l'appelant.
 */
describe('AccountsCrmFusionBanner — #4603.4', () => {
  beforeEach(() => {
    resetTestQueryClient()
    team.role = 'admin'
    vi.mocked(accountsApi.crmFusionSweep).mockReset()
  })

  it('simule d’abord (rien d’écrit), COMPTE les paires et offre de les fusionner', async () => {
    vi.mocked(accountsApi.crmFusionSweep).mockResolvedValue(report(3, true))
    renderWithRouter(<AccountsCrmFusionBanner />)
    expect(await screen.findByText(/3 sociétés/i)).toBeInTheDocument()
    expect(accountsApi.crmFusionSweep).toHaveBeenCalledWith(true)
    expect(screen.getByRole('button', { name: /fusionner/i })).toBeInTheDocument()
  })

  it('le geste fusionne (dryRun false) puis dit ce qui a été fait, compté', async () => {
    vi.mocked(accountsApi.crmFusionSweep).mockImplementation(async dryRun =>
      dryRun ? report(2, true) : report(2, false, 2),
    )
    renderWithRouter(<AccountsCrmFusionBanner />)
    await userEvent.click(await screen.findByRole('button', { name: /fusionner/i }))
    await waitFor(() => expect(accountsApi.crmFusionSweep).toHaveBeenCalledWith(false))
    expect(await screen.findByText(/2 comptes fusionnés/i)).toBeInTheDocument()
  })

  it('aucune paire : AUCUNE ligne, jamais « 0 paire » (GA-18/19)', async () => {
    vi.mocked(accountsApi.crmFusionSweep).mockResolvedValue(report(0, true))
    const { container } = renderWithRouter(<AccountsCrmFusionBanner />)
    await waitFor(() => expect(accountsApi.crmFusionSweep).toHaveBeenCalled())
    expect(container.querySelector('[data-testid="accounts-crm-fusion-banner"]')).toBeNull()
    expect(screen.queryByText(/0/)).not.toBeInTheDocument()
  })

  it('REFUS : un commercial (sans integrations:manage) ne déclenche rien et ne voit rien', async () => {
    team.role = 'sales'
    const { container } = renderWithRouter(<AccountsCrmFusionBanner />)
    expect(accountsApi.crmFusionSweep).not.toHaveBeenCalled()
    expect(container.querySelector('[data-testid="accounts-crm-fusion-banner"]')).toBeNull()
  })

  it('la simulation échoue (403, réseau) : rien d’affiché, rien d’inventé', async () => {
    vi.mocked(accountsApi.crmFusionSweep).mockRejectedValue(new Error('403'))
    const { container } = renderWithRouter(<AccountsCrmFusionBanner />)
    await waitFor(() => expect(accountsApi.crmFusionSweep).toHaveBeenCalled())
    expect(container.querySelector('[data-testid="accounts-crm-fusion-banner"]')).toBeNull()
  })
})
