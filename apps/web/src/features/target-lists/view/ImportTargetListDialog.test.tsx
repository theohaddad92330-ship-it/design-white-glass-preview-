import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fr from '@/i18n/locales/fr/targets.json'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { installVoiceMediaFakes, removeVoiceMediaFakes } from '@/features/chat/voice/voice-media-test-fakes'

// #2156.55 — « Importer une liste » : coller des noms crée la liste, puis
// n'ajoute que les fiches RETROUVÉES dans l'espace (`ref_id` réel exigé) —
// le reste est annoncé comme non trouvé, jamais inventé.

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('@/lib/api', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch,
}))

const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('sonner', () => ({ toast }))

const { tracked } = vi.hoisted(() => ({
  tracked: { onSuccess: vi.fn(), onError: vi.fn(), calls: [] as [string, string][] },
}))
vi.mock('@/lib/product-tracker', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  trackedMutation: (action: string, screen: string) => {
    tracked.calls.push([action, screen])
    return { onSuccess: tracked.onSuccess, onError: tracked.onError }
  },
}))

const { ImportTargetListDialog } = await import('./ImportTargetListDialog')

type FetchArgs = { path: string; method?: string; body?: unknown }

const STAMP = '2026-09-23T00:00:00.000Z'

function fakeList(name: string) {
  return {
    id: 'list-1',
    name,
    objective: null,
    type: null,
    owner_user_id: null,
    team: null,
    visibility: 'workspace',
    source: 'import',
    source_query: null,
    status: 'draft',
    counts: { measured: true, total: 0, ready_to_work: 0, to_review: 0 },
    next_action: 'Ajouter les premiers comptes ou contacts',
    sequence_id: null,
    prospecting_session_id: null,
    created_by: 'u1',
    created_at: STAMP,
    updated_at: STAMP,
    items: [],
  }
}

function fakeItem() {
  return {
    id: 'item-1',
    target_list_id: 'list-1',
    kind: 'account',
    ref_id: 'acc-1',
    label: 'Renault',
    sublabel: null,
    selection_reason: null,
    priority: null,
    owner_user_id: null,
    work_status: 'to_review',
    provenance: 'import',
    refreshed_at: null,
    removed_at: null,
    removal_reason: null,
    next_action: null,
    notes: null,
    created_at: STAMP,
    updated_at: STAMP,
  }
}

beforeEach(() => {
  apiFetch.mockReset()
  toast.success.mockReset()
  toast.error.mockReset()
})

describe('ImportTargetListDialog — #2156.55', () => {
  it('crée la liste, ajoute les noms retrouvés, ferme le dialogue et annonce le reste comme non trouvé', async () => {
    apiFetch.mockImplementation(async (args?: FetchArgs) => {
      const { path = '', method } = args ?? {}
      if (path === '/target-lists' && method === 'POST') {
        const body = args?.body as { name: string }
        return fakeList(body.name)
      }
      if (path.startsWith('/target-lists/candidates')) {
        return path.includes('Renault')
          ? { candidates: [{ kind: 'account', id: 'acc-1', label: 'Renault', sublabel: null }] }
          : { candidates: [] }
      }
      if (path === '/target-lists/list-1/items') return fakeItem()
      return {}
    })

    const onOpenChange = vi.fn()
    renderWithRouter(<ImportTargetListDialog open onOpenChange={onOpenChange} />)

    fireEvent.change(await screen.findByLabelText('Nom de la liste'), { target: { value: 'Banques régionales' } })
    fireEvent.change(screen.getByLabelText('Noms à retrouver, un par ligne'), {
      target: { value: 'Renault\nFictacme' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Importer' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))

    const createCall = apiFetch.mock.calls.find(([a]) => (a as FetchArgs).path === '/target-lists')?.[0] as FetchArgs
    expect((createCall.body as { source: string }).source).toBe('import')
    const addItemCall = apiFetch.mock.calls.find(
      ([a]) => (a as FetchArgs).path === '/target-lists/list-1/items',
    )?.[0] as FetchArgs
    expect((addItemCall.body as { ref_id: string }).ref_id).toBe('acc-1')
    expect(toast.success).toHaveBeenCalled()
  })

  it('#2154.30 — l’import mesure action_started puis action_completed sur `/mes-cibles`, et rien sur un échec', async () => {
    tracked.calls.length = 0
    tracked.onSuccess.mockClear()
    tracked.onError.mockClear()
    apiFetch.mockImplementation(async (args?: FetchArgs) => {
      const { path = '', method } = args ?? {}
      if (path === '/target-lists' && method === 'POST') return fakeList('Banques')
      if (path.startsWith('/target-lists/candidates')) return { candidates: [] }
      return {}
    })
    const onOpenChange = vi.fn()
    renderWithRouter(<ImportTargetListDialog open onOpenChange={onOpenChange} />)
    fireEvent.change(await screen.findByLabelText('Nom de la liste'), { target: { value: 'Banques' } })
    fireEvent.change(screen.getByLabelText('Noms à retrouver, un par ligne'), { target: { value: 'Renault' } })
    fireEvent.click(screen.getByRole('button', { name: 'Importer' }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(tracked.calls).toEqual([['target_list_imported', '/signals']])
    expect(tracked.onSuccess).toHaveBeenCalledTimes(1)
    expect(tracked.onError).not.toHaveBeenCalled()
  })

  it('#2154.30 — un import en échec mesure action_abandoned, jamais action_completed', async () => {
    tracked.calls.length = 0
    tracked.onSuccess.mockClear()
    tracked.onError.mockClear()
    apiFetch.mockRejectedValue(new Error('boom'))
    renderWithRouter(<ImportTargetListDialog open onOpenChange={vi.fn()} />)
    fireEvent.change(await screen.findByLabelText('Nom de la liste'), { target: { value: 'Banques' } })
    fireEvent.change(screen.getByLabelText('Noms à retrouver, un par ligne'), { target: { value: 'Renault' } })
    fireEvent.click(screen.getByRole('button', { name: 'Importer' }))
    await waitFor(() => expect(tracked.onError).toHaveBeenCalledTimes(1))
    expect(tracked.onSuccess).not.toHaveBeenCalled()
  })

  it('sans nom collé, le bouton Importer reste désactivé', async () => {
    renderWithRouter(<ImportTargetListDialog open onOpenChange={vi.fn()} />)
    fireEvent.change(await screen.findByLabelText('Nom de la liste'), { target: { value: 'Banques régionales' } })
    expect(screen.getByRole('button', { name: 'Importer' })).toBeDisabled()
  })

  // #2167.9 — le contrat de page exige un coût ÉVENTUEL nommé sur chaque
  // surface. `useImportTargetList` ne fait que retrouver des `ref_id` déjà
  // dans l'espace (jamais de collecte ni d'enrichissement) : le coût réel est
  // ZÉRO, et le dialogue le dit plutôt que de laisser la question ouverte.
  it('annonce que l’import ne coûte aucun crédit, quel que soit le volume (#2167.9)', async () => {
    renderWithRouter(<ImportTargetListDialog open onOpenChange={vi.fn()} />)
    expect(await screen.findByText(fr.import.costHint)).toBeInTheDocument()
  })
})

const NOT_WIRED = { accent: 'not_wired', noise: 'not_wired', mixedLanguage: 'not_wired' } as const

describe('ImportTargetListDialog — #2434.55 — dicter la liste, un lot PROPOSÉ', () => {
  beforeEach(() => {
    installVoiceMediaFakes()
    apiFetch.mockImplementation(async (args?: FetchArgs) => {
      const { path = '' } = args ?? {}
      if (path === '/ia/chat/voice/status') return { available: true, refinements: NOT_WIRED }
      if (path === '/ia/chat/voice/transcribe')
        return {
          text: 'Renault',
          voiceObjectId: '11111111-1111-4111-8111-111111111111',
          uncertainSegments: [],
        }
      return {}
    })
  })

  afterEach(() => {
    removeVoiceMediaFakes()
  })

  it('capacité disponible : le micro apparaît, sans qu’aucun nom ne soit encore écrit', async () => {
    renderWithRouter(<ImportTargetListDialog open onOpenChange={vi.fn()} />)
    expect(await screen.findByRole('button', { name: 'Dicter un nom' })).toBeInTheDocument()
    expect(apiFetch.mock.calls.some(([a]) => (a as FetchArgs).path === '/target-lists/list-1/items')).toBe(false)
  })

  it('un nom dicté s’ajoute comme une LIGNE dans la zone de texte, encore modifiable — rien n’est importé tout seul', async () => {
    renderWithRouter(<ImportTargetListDialog open onOpenChange={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Dicter un nom' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Terminer' }))
    await waitFor(() => expect(screen.getByLabelText('Noms à retrouver, un par ligne')).toHaveValue('Renault'))
    // Le test qui dit NON — la dictée seule n'importe rien : « Importer » n'a pas été cliqué.
    expect(apiFetch.mock.calls.some(([a]) => (a as FetchArgs).path === '/target-lists')).toBe(false)
  })

  it('dicter un second nom AJOUTE une ligne, ne remplace pas la première', async () => {
    renderWithRouter(<ImportTargetListDialog open onOpenChange={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Dicter un nom' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Terminer' }))
    await waitFor(() => expect(screen.getByLabelText('Noms à retrouver, un par ligne')).toHaveValue('Renault'))
    fireEvent.click(await screen.findByRole('button', { name: 'Dicter un nom' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Terminer' }))
    await waitFor(() => expect(screen.getByLabelText('Noms à retrouver, un par ligne')).toHaveValue('Renault\nRenault'))
  })

  it('sans capacité vocale (navigateur incapable) : aucun bouton micro, le collage reste possible', async () => {
    removeVoiceMediaFakes()
    renderWithRouter(<ImportTargetListDialog open onOpenChange={vi.fn()} />)
    await screen.findByLabelText('Noms à retrouver, un par ligne')
    expect(screen.queryByRole('button', { name: 'Dicter un nom' })).not.toBeInTheDocument()
  })
})
