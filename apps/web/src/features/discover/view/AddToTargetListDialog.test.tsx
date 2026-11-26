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

const { toastSuccess } = vi.hoisted(() => ({ toastSuccess: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: vi.fn() } }))

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }))
vi.mock('@/router', () => ({ router: { navigate } }))

const { AddToTargetListDialog } = await import('./AddToTargetListDialog')

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

const STAMP = '2026-09-16T00:00:00.000Z'

/** Un `TargetList` complet et VALIDE au contrat — un double partiel fait
 *  échouer le PARSE de frontière en silence (même piège que #2156, voir
 *  `TargetListsContent.test.tsx`), et le dialogue resterait à tort sur
 *  « aucune cible existante ». */
function targetList(over: { id: string; name: string }) {
  return {
    id: over.id,
    name: over.name,
    objective: null,
    type: null,
    owner_user_id: null,
    team: null,
    visibility: 'workspace',
    source: 'manual',
    source_query: null,
    status: 'draft',
    counts: { measured: true, total: 0, ready_to_work: 0, to_review: 0 },
    next_action: null,
    sequence_id: null,
    prospecting_session_id: null,
    created_by: 'u1',
    created_at: STAMP,
    updated_at: STAMP,
    items: [],
  }
}

function mockApi(existingLists: Array<{ id: string; name: string }> = []) {
  apiFetch.mockImplementation(async (args?: FetchArgs) => {
    const { path, method } = args ?? { path: '' }
    if (path === '/target-lists' && (method ?? 'GET') === 'GET') {
      return { lists: existingLists.map(targetList) }
    }
    if (path === '/target-lists' && method === 'POST') return targetList({ id: 'new-list-1', name: 'Nouvelle cible' })
    if (path.includes('/items') && method === 'POST') {
      return {
        id: 'item-1',
        target_list_id: 'new-list-1',
        kind: 'account',
        ref_id: 'acc-1',
        label: null,
        sublabel: null,
        selection_reason: null,
        priority: null,
        owner_user_id: null,
        work_status: 'to_review',
        provenance: 'discover',
        refreshed_at: null,
        removed_at: null,
        removal_reason: null,
        next_action: null,
        notes: null,
        created_at: STAMP,
        updated_at: STAMP,
      }
    }
    return {}
  })
}

/**
 * ⚠️ `TARGET_LISTS_KEY` porte `user?.id` — un `userId` DISTINCT par scénario
 * évite qu'un test lise le cache laissé par le précédent (même piège que
 * `TargetListsContent.test.tsx`, qui isole son cas « liste vide » sur
 * `'u-empty'`). Le `queryClient` du harnais est un singleton de MODULE.
 */
function renderDialog(userId: string, over: Partial<Parameters<typeof AddToTargetListDialog>[0]> = {}) {
  const props: Parameters<typeof AddToTargetListDialog>[0] = {
    open: true,
    onOpenChange: () => {},
    eligible: [candidate()],
    ineligibleCount: 0,
    onDone: () => {},
    ...over,
  }
  return renderWithRouter(
    <SessionContext.Provider value={{ user: { id: userId } as SessionUser, loading: false }}>
      <AddToTargetListDialog {...props} />
    </SessionContext.Provider>,
    '/discover',
  )
}

beforeEach(() => {
  apiFetch.mockReset()
  toastSuccess.mockReset()
  navigate.mockReset()
})

/* #2166.61 — la prévisualisation précède l'exécution : le dialogue montre CE
 * QU'IL VA FAIRE avant que le clic ne parte. */
describe('AddToTargetListDialog (#2166.55 / #2166.61 / #2166.63 / #2166.76)', () => {
  it('montre les entreprises sélectionnées avant tout envoi', async () => {
    mockApi()
    renderDialog('u-preview', {
      eligible: [candidate({ siren: '1', name: 'Banque Alpha' }), candidate({ siren: '2', name: 'Studio Beta' })],
    })
    expect(await screen.findByText('Banque Alpha')).toBeInTheDocument()
    expect(screen.getByText('Studio Beta')).toBeInTheDocument()
    expect(apiFetch).not.toHaveBeenCalledWith(expect.objectContaining({ method: 'POST' }))
  })

  it('#2166.55 — nomme ce qui n’a pas de fiche compte plutôt que de le taire', async () => {
    mockApi()
    renderDialog('u-excluded', { ineligibleCount: 2 })
    expect(await screen.findByText(/2 éléments/i)).toBeInTheDocument()
  })

  it('#2166.63 — créer une nouvelle cible pose UNE création puis un ajout par élément sélectionné', async () => {
    mockApi()
    const onDone = vi.fn()
    renderDialog('u-create-new', {
      eligible: [candidate({ siren: '1', accountId: 'acc-1' }), candidate({ siren: '2', accountId: 'acc-2' })],
      onDone,
    })
    fireEvent.change(await screen.findByLabelText(/nom de la cible/i), { target: { value: 'Ma nouvelle cible' } })
    fireEvent.click(screen.getByRole('button', { name: /^ajouter$/i }))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/target-lists',
          method: 'POST',
          body: expect.objectContaining({ name: 'Ma nouvelle cible' }),
        }),
      ),
    )
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    const itemCalls = apiFetch.mock.calls.filter(call => String((call[0] as FetchArgs).path).includes('/items'))
    expect(itemCalls).toHaveLength(2)
    expect(itemCalls[0]?.[0]).toEqual(
      expect.objectContaining({
        path: '/target-lists/new-list-1/items',
        body: expect.objectContaining({ kind: 'account', ref_id: 'acc-1' }),
      }),
    )
  })

  it('#2166.76 — ajouter à une cible EXISTANTE fonctionne pour toute la sélection, sans créer de liste', async () => {
    mockApi([{ id: 'list-9', name: 'Cible du T4' }])
    renderDialog('u-existing', {
      eligible: [candidate({ siren: '1', accountId: 'acc-1' }), candidate({ siren: '2', accountId: 'acc-2' })],
    })
    const existingRadio = await screen.findByRole('radio', { name: /cible existante/i })
    // Le radio reste DÉSACTIVÉ tant que `/target-lists` n'a pas répondu — le
    // cliquer trop tôt ne changerait rien, silencieusement.
    await waitFor(() => expect(existingRadio).not.toBeDisabled())
    fireEvent.click(existingRadio)
    // Le menu n'est plus un `<select>` natif (GA-251) : c'est un combobox ARIA
    // qu'on OUVRE avant de cliquer son option. `fireEvent.change` n'y fait
    // rien — et un menu jamais ouvert ressemble exactement à une liste vide.
    await chooseOption(await screen.findByRole('combobox'), 'list-9')
    fireEvent.click(screen.getByRole('button', { name: /^ajouter$/i }))

    await waitFor(() => {
      const itemCalls = apiFetch.mock.calls.filter(call => String((call[0] as FetchArgs).path).includes('/items'))
      expect(itemCalls).toHaveLength(2)
    })
    expect(apiFetch).not.toHaveBeenCalledWith(expect.objectContaining({ path: '/target-lists', method: 'POST' }))
  })

  /**
   * #2149.31 — CONTINUITÉ DÉCOUVRIR → PRÉPARATION D'ACTION.
   *
   * Ajouter une sélection à une cible est le premier geste d'une campagne
   * (`campaign_label`, c74) — mais rien n'emmenait vers l'écran où cette
   * cible vit désormais (« Mes cibles », `/mes-cibles`). Le toast de succès
   * porte maintenant l'action, exactement comme la continuité symétrique
   * Découvrir → Comptes (#2149.30, `useDiscoverShortlist`).
   */
  it('#2149.31 — le succès offre un lien vers « Mes cibles »', async () => {
    mockApi()
    renderDialog('u-see-target-list', {
      eligible: [candidate({ siren: '1', accountId: 'acc-1' })],
    })
    fireEvent.change(await screen.findByLabelText(/nom de la cible/i), { target: { value: 'Campagne Q4' } })
    fireEvent.click(screen.getByRole('button', { name: /^ajouter$/i }))

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    const [, options] = toastSuccess.mock.calls[0] as [string, { action?: { label: string; onClick: () => void } }]
    expect(options?.action?.label).toBeTruthy()

    options!.action!.onClick()

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/accounts', search: { lens: 'lists' } }))
  })
})
