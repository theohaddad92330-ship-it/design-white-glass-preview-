import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { SessionUser } from '@bellum/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionContext } from '@/features/auth/session-context'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { chooseOption } from '@/test/select'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('@/lib/api', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch,
}))

const { AssignSelectionDialog } = await import('./AssignSelectionDialog')

function candidate(over: Partial<DiscoverCandidate> = {}): DiscoverCandidate {
  return {
    name: 'ACME',
    siren: '552100554',
    nafCode: null,
    sector: null,
    city: null,
    department: null,
    headcountRange: null,
    creationDate: null,
    score: 70,
    scoreMax: 100,
    scoreUnmeasured: [],
    dataConfidence: null,
    scoreFactors: [],
    signals: [],
    angle: null,
    suggestedRoles: [],
    portfolioState: 'analyzed',
    accountId: 'acc-1',
    sources: [],
    ...over,
  }
}

type FetchArgs = { path: string; method?: string; body?: unknown }

function mockApi(members: Array<{ userId: string; fullName: string | null; email: string | null }> = []) {
  apiFetch.mockImplementation(async (args?: FetchArgs) => {
    const { path, method } = args ?? { path: '' }
    if (path === '/workspaces/members' && (method ?? 'GET') === 'GET') {
      return members.map(member => ({ ...member, role: 'member', isSelf: false }))
    }
    if (path.endsWith('/assign') && method === 'PATCH') {
      return { id: 'assign-1', assigned_to: (args?.body as { assigned_to: string | null }).assigned_to }
    }
    return {}
  })
}

function renderDialog(userId: string, over: Partial<Parameters<typeof AssignSelectionDialog>[0]> = {}) {
  const props: Parameters<typeof AssignSelectionDialog>[0] = {
    open: true,
    onOpenChange: () => {},
    eligible: [candidate()],
    ineligibleCount: 0,
    onDone: () => {},
    ...over,
  }
  return renderWithRouter(
    <SessionContext.Provider value={{ user: { id: userId } as SessionUser, loading: false }}>
      <AssignSelectionDialog {...props} />
    </SessionContext.Provider>,
    '/discover',
  )
}

beforeEach(() => apiFetch.mockReset())

/**
 * #2166.58 — attribuer une sélection de Découvrir, même chemin d'écriture que
 * `AccountAssignSubmenu` (`PATCH /accounts/:id/assign`, une porte). Aucun
 * candidat de marché sans fiche compte n'est attribuable : #2166.55 nomme déjà
 * ce défaut pour la cible, l'attribution reprend la même règle.
 */
describe('AssignSelectionDialog (#2166.58)', () => {
  it('#2166.61 — montre les entreprises sélectionnées avant tout envoi', async () => {
    mockApi([{ userId: 'u-2', fullName: 'Chloé', email: null }])
    renderDialog('u-preview', {
      eligible: [candidate({ siren: '1', name: 'Banque Alpha' }), candidate({ siren: '2', name: 'Studio Beta' })],
    })
    expect(await screen.findByText('Banque Alpha')).toBeInTheDocument()
    expect(screen.getByText('Studio Beta')).toBeInTheDocument()
    expect(apiFetch).not.toHaveBeenCalledWith(expect.objectContaining({ method: 'PATCH' }))
  })

  it('nomme ce qui n’a pas de fiche compte plutôt que de le taire', async () => {
    mockApi()
    renderDialog('u-excluded', { ineligibleCount: 2 })
    expect(await screen.findByText(/2 éléments/i)).toBeInTheDocument()
  })

  it('attribue CHAQUE compte éligible au membre choisi, un appel par élément', async () => {
    mockApi([{ userId: 'u-2', fullName: 'Chloé', email: null }])
    const onDone = vi.fn()
    renderDialog('u-assign', {
      eligible: [candidate({ siren: '1', accountId: 'acc-1' }), candidate({ siren: '2', accountId: 'acc-2' })],
      onDone,
    })
    await chooseOption(await screen.findByRole('combobox'), 'u-2')
    fireEvent.click(screen.getByRole('button', { name: /^attribuer$/i }))

    await waitFor(() => {
      const assignCalls = apiFetch.mock.calls.filter(call => String((call[0] as FetchArgs).path).endsWith('/assign'))
      expect(assignCalls).toHaveLength(2)
    })
    expect(apiFetch).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/accounts/acc-1/assign', body: { assigned_to: 'u-2' } }),
    )
    expect(apiFetch).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/accounts/acc-2/assign', body: { assigned_to: 'u-2' } }),
    )
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
  })

  it('n’attrape pas ce qu’il ne vise pas : aucun candidat éligible désactive la soumission', async () => {
    mockApi([{ userId: 'u-2', fullName: 'Chloé', email: null }])
    renderDialog('u-empty', { eligible: [], ineligibleCount: 1 })
    await screen.findByText(/1 élément/i)
    expect(screen.getByRole('button', { name: /^attribuer$/i })).toBeDisabled()
  })
})
