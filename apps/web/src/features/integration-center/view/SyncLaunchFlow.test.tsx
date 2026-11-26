import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SyncLaunchFlow } from './SyncLaunchFlow'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

const startSync = vi.fn()
const syncRun = vi.fn()
const cancelSync = vi.fn()
vi.mock('../api', () => ({
  integrationCenterApi: {
    startSync: (...args: unknown[]) => startSync(...args),
    syncRun: (...args: unknown[]) => syncRun(...args),
    cancelSync: (...args: unknown[]) => cancelSync(...args),
  },
}))

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

describe('SyncLaunchFlow — déclenchement, attente, résumé (#3014)', () => {
  beforeEach(() => {
    startSync.mockReset()
    syncRun.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lance la synchro au clic, attend, puis rend le résumé', async () => {
    startSync.mockResolvedValue({
      id: 'run-1',
      provider: 'hubspot',
      status: 'running',
      started_at: '2026-09-25T10:00:00.000Z',
      finished_at: null,
      summary: null,
      error: null,
    })
    syncRun.mockResolvedValue({
      id: 'run-1',
      provider: 'hubspot',
      status: 'completed',
      started_at: '2026-09-25T10:00:00.000Z',
      finished_at: '2026-09-25T10:02:00.000Z',
      summary: [{ domain: 'contacts', count: 5, label: { fr: '5 contacts retrouvés', en: '5 contacts found' } }],
      error: null,
    })

    wrap(<SyncLaunchFlow provider="hubspot" name="HubSpot" onClose={() => {}} />)
    screen.getByRole('button', { name: 'Synchroniser' }).click()

    await waitFor(() => expect(screen.getByText(/5 contacts retrouvés/)).toBeInTheDocument())
    expect(startSync).toHaveBeenCalledWith('hubspot')
  })

  it('#2406.32 (épopée #2977) — invalide le cache « Aujourd’hui » à la fin du run, pour ne pas rester vide après une synchro réussie', async () => {
    startSync.mockResolvedValue({
      id: 'run-8',
      provider: 'hubspot',
      status: 'running',
      started_at: '2026-09-25T10:00:00.000Z',
      finished_at: null,
      summary: null,
      error: null,
    })
    syncRun.mockResolvedValue({
      id: 'run-8',
      provider: 'hubspot',
      status: 'completed',
      started_at: '2026-09-25T10:00:00.000Z',
      finished_at: '2026-09-25T10:02:00.000Z',
      summary: [{ domain: 'accounts', count: 3, label: { fr: '3 comptes retrouvés', en: '3 accounts found' } }],
      error: null,
    })

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    render(
      <QueryClientProvider client={client}>
        <SyncLaunchFlow provider="hubspot" name="HubSpot" onClose={() => {}} />
      </QueryClientProvider>,
    )
    screen.getByRole('button', { name: 'Synchroniser' }).click()

    await waitFor(() => expect(screen.getByText(/3 comptes retrouvés/)).toBeInTheDocument())
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['briefing'] })
  })

  it('rend une erreur claire (jamais un texte technique) quand le run échoue', async () => {
    startSync.mockResolvedValue({
      id: 'run-2',
      provider: 'notion',
      status: 'running',
      started_at: '2026-09-25T10:00:00.000Z',
      finished_at: null,
      summary: null,
      error: null,
    })
    syncRun.mockResolvedValue({
      id: 'run-2',
      provider: 'notion',
      status: 'failed',
      started_at: '2026-09-25T10:00:00.000Z',
      finished_at: '2026-09-25T10:01:00.000Z',
      summary: null,
      error: {
        fr: 'La synchronisation a échoué. Réessayez dans quelques minutes.',
        en: 'The sync failed. Try again in a few minutes.',
      },
    })

    wrap(<SyncLaunchFlow provider="notion" name="Notion" onClose={() => {}} />)
    screen.getByRole('button', { name: 'Synchroniser' }).click()

    await waitFor(() => expect(screen.getByText('La synchronisation a échoué')).toBeInTheDocument())
    expect(screen.queryByText(/ECONNRESET|Error:|undefined/)).not.toBeInTheDocument()
  })

  it('épopée #2980 — traverse les états intermédiaires nommés sans jamais s’arrêter avant un statut terminal', async () => {
    startSync.mockResolvedValue({
      id: 'run-3',
      provider: 'hubspot',
      status: 'pending',
      started_at: '2026-09-25T10:00:00.000Z',
      finished_at: null,
      summary: null,
      error: null,
    })
    syncRun
      .mockResolvedValueOnce({
        id: 'run-3',
        provider: 'hubspot',
        status: 'reading_sources',
        started_at: '2026-09-25T10:00:00.000Z',
        finished_at: null,
        summary: null,
        error: null,
      })
      .mockResolvedValueOnce({
        id: 'run-3',
        provider: 'hubspot',
        status: 'completed',
        started_at: '2026-09-25T10:00:00.000Z',
        finished_at: '2026-09-25T10:02:00.000Z',
        summary: [{ domain: 'contacts', count: 2, label: { fr: '2 contacts retrouvés', en: '2 contacts found' } }],
        error: null,
      })

    // #4591 — le sondage est espacé (plancher de 5 s) : le temps est piloté, pas attendu.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    wrap(<SyncLaunchFlow provider="hubspot" name="HubSpot" onClose={() => {}} />)
    screen.getByRole('button', { name: 'Synchroniser' }).click()

    // Le premier statut non terminal (`reading_sources`) ne doit JAMAIS être
    // pris pour une fin — seul `isSyncRunTerminal` décide, jamais `=== 'running'`.
    await vi.advanceTimersByTimeAsync(0)
    expect(screen.queryByText(/2 contacts retrouvés/)).not.toBeInTheDocument()
    // Le résumé n'arrive qu'après une CHAÎNE de promesses (timer → sondage → état →
    // phase). Un seul `advanceTimersByTimeAsync(5_100)` laissait le rendu dépendre de
    // l'ordre des microtâches : vert en local, rouge sur main le 27/10 (le composant
    // était encore sur son `animate-spin`). On avance le temps JUSQU'À ce que le
    // résumé soit là, borné — la garde ne perd rien : l'assertion ci-dessus prouve
    // qu'il n'est PAS là avant le premier sondage terminal.
    for (let tour = 0; tour < 10 && screen.queryByText(/2 contacts retrouvés/) === null; tour += 1) {
      await vi.advanceTimersByTimeAsync(1_000)
    }
    expect(screen.getByText(/2 contacts retrouvés/)).toBeInTheDocument()
  })

  it('#2110.39 — un run `partial` affiche quand même le résumé, avec sa propre bannière', async () => {
    startSync.mockResolvedValue({
      id: 'run-4',
      provider: 'hubspot',
      status: 'pending',
      started_at: '2026-09-25T10:00:00.000Z',
      finished_at: null,
      summary: null,
      error: null,
    })
    syncRun.mockResolvedValue({
      id: 'run-4',
      provider: 'hubspot',
      status: 'partial',
      started_at: '2026-09-25T10:00:00.000Z',
      finished_at: '2026-09-25T10:02:00.000Z',
      summary: [{ domain: 'accounts', count: 1, label: { fr: '1 compte mis à jour', en: '1 account updated' } }],
      error: null,
    })

    wrap(<SyncLaunchFlow provider="hubspot" name="HubSpot" onClose={() => {}} />)
    screen.getByRole('button', { name: 'Synchroniser' }).click()

    await waitFor(() => expect(screen.getByText('Résumé partiel — une source a échoué')).toBeInTheDocument())
  })

  it('#2110.39 — le bouton « Annuler » de la page de suivi appelle `cancelSync`', async () => {
    startSync.mockResolvedValue({
      id: 'run-5',
      provider: 'notion',
      status: 'pending',
      started_at: '2026-09-25T10:00:00.000Z',
      finished_at: null,
      summary: null,
      error: null,
    })
    cancelSync.mockResolvedValue(undefined)
    syncRun.mockResolvedValue({
      id: 'run-5',
      provider: 'notion',
      status: 'reading_sources',
      started_at: '2026-09-25T10:00:00.000Z',
      finished_at: null,
      summary: null,
      error: null,
    })

    wrap(<SyncLaunchFlow provider="notion" name="Notion" onClose={() => {}} />)
    screen.getByRole('button', { name: 'Synchroniser' }).click()

    await waitFor(() => screen.getByRole('button', { name: 'Annuler' }))
    screen.getByRole('button', { name: 'Annuler' }).click()
    await waitFor(() => expect(cancelSync).toHaveBeenCalledWith('notion', 'run-5'))
  })

  it('#2110.22 à .31 — nomme l’état COURANT du job, jamais le texte générique, et surligne l’étape dans la liste', async () => {
    startSync.mockResolvedValue({
      id: 'run-7',
      provider: 'hubspot',
      status: 'pending',
      started_at: '2026-09-25T10:00:00.000Z',
      finished_at: null,
      summary: null,
      error: null,
    })
    syncRun.mockResolvedValue({
      id: 'run-7',
      provider: 'hubspot',
      status: 'matching_accounts',
      started_at: '2026-09-25T10:00:00.000Z',
      finished_at: null,
      summary: null,
      error: null,
    })

    wrap(<SyncLaunchFlow provider="hubspot" name="HubSpot" onClose={() => {}} />)
    screen.getByRole('button', { name: 'Synchroniser' }).click()

    await waitFor(() => expect(screen.getByText('Rapprochement des entreprises…')).toBeInTheDocument())
    expect(screen.queryByText('Synchronisation en cours…')).not.toBeInTheDocument()
    // Les étapes ultérieures nommées restent visibles dans la liste, non atteintes.
    expect(screen.getByText('Détection des événements…')).toBeInTheDocument()
  })

  it('#2110.39 — un run `canceled` rend « Synchronisation annulée », jamais une erreur', async () => {
    startSync.mockResolvedValue({
      id: 'run-6',
      provider: 'notion',
      status: 'pending',
      started_at: '2026-09-25T10:00:00.000Z',
      finished_at: null,
      summary: null,
      error: null,
    })
    syncRun.mockResolvedValue({
      id: 'run-6',
      provider: 'notion',
      status: 'canceled',
      started_at: '2026-09-25T10:00:00.000Z',
      finished_at: '2026-09-25T10:00:30.000Z',
      summary: null,
      error: null,
    })

    wrap(<SyncLaunchFlow provider="notion" name="Notion" onClose={() => {}} />)
    screen.getByRole('button', { name: 'Synchroniser' }).click()

    await waitFor(() => expect(screen.getByText('Synchronisation annulée')).toBeInTheDocument())
  })
})

// #4591 — un sondage qui martèle l'API se fait limiter (429) ; un run qui n'avance pas doit le DIRE.
describe('SyncLaunchFlow — sondage espacé et attente nommée (#4591)', () => {
  const pending = (startedAt: string) => ({
    id: 'run-9',
    provider: 'pipedrive',
    status: 'pending',
    started_at: startedAt,
    finished_at: null,
    summary: null,
    error: null,
  })

  beforeEach(() => {
    startSync.mockReset()
    syncRun.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function launch(startedAt: string) {
    startSync.mockResolvedValue(pending(startedAt))
    wrap(<SyncLaunchFlow provider="pipedrive" name="Pipedrive" onClose={() => {}} />)
    // Le clic et les microtâches passent DANS `act` : sinon React rend sur une vraie macrotâche et le premier
    // sondage part (ou non) selon la charge de la machine — un test qui change de victime d'un run à l'autre.
    await act(async () => {
      screen.getByRole('button', { name: 'Synchroniser' }).click()
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(0)
    })
  }

  it('ne sonde pas plus d’une fois toutes les 5 s, et ne relance pas de sondage à chaque réponse', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.setSystemTime(new Date('2026-10-26T10:00:30.000Z'))
    syncRun.mockImplementation(async () => pending('2026-10-26T10:00:00.000Z'))
    await launch('2026-10-26T10:00:00.000Z')
    expect(syncRun).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(4_900)
    expect(syncRun).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(200)
    expect(syncRun).toHaveBeenCalledTimes(2)
    // recul : le sondage suivant n'a pas lieu 5 s plus tard mais 10 s plus tard
    await vi.advanceTimersByTimeAsync(5_000)
    expect(syncRun).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(5_100)
    expect(syncRun).toHaveBeenCalledTimes(3)
  })

  it('un sondage en échec (429…) ne fige pas l’écran : l’état indisponible est DIT et le sondage reprend', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.setSystemTime(new Date('2026-10-26T10:00:30.000Z'))
    syncRun.mockRejectedValueOnce(new Error('429')).mockResolvedValue({
      ...pending('2026-10-26T10:00:00.000Z'),
      status: 'completed',
      finished_at: '2026-10-26T10:00:40.000Z',
      summary: [{ domain: 'contacts', count: 1, label: { fr: '1 contact retrouvé', en: '1 contact found' } }],
    })
    await launch('2026-10-26T10:00:00.000Z')
    expect(screen.getByText(/état de la synchronisation indisponible/i)).toBeInTheDocument()
    await vi.advanceTimersByTimeAsync(5_100)
    expect(syncRun).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(0)
    expect(screen.getByText(/1 contact retrouvé/)).toBeInTheDocument()
  })

  it('un run « en attente » depuis plus de 3 min le dit, sans jamais afficher un état terminal', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.setSystemTime(new Date('2026-10-26T10:03:20.000Z'))
    syncRun.mockImplementation(async () => pending('2026-10-26T10:00:00.000Z'))
    await launch('2026-10-26T10:00:00.000Z')
    expect(screen.getByText(/en attente depuis 3 min/i)).toBeInTheDocument()
    expect(screen.queryByText(/terminé/i)).not.toBeInTheDocument()
  })

  it('sous la minute : pas de durée affichée', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.setSystemTime(new Date('2026-10-26T10:00:20.000Z'))
    syncRun.mockImplementation(async () => pending('2026-10-26T10:00:00.000Z'))
    await launch('2026-10-26T10:00:00.000Z')
    expect(screen.queryByText(/depuis/i)).not.toBeInTheDocument()
  })
})
