import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { emptyAccountFactsExportCells } from '@bellum/contracts'
import { countTargetListItems, type TargetList, type TargetListItem } from '@bellum/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter, resetTestQueryClient } from '@/test-utils/renderWithRouter'

const { TargetListCard } = await import('./TargetListCard')
const { targetListsApi } = await import('../api')
// `@/lib/data-exit` et `@/lib/export-csv` sont mockés globalement dans
// `src/test/setup.ts` (`useDataExit` par défaut `{ allowed: true, grant: {} }`,
// `downloadCSV` un `vi.fn()`) — les tests de la règle SURCHARGENT `useDataExit`,
// jamais `apiFetch` (même patron que `PaymentsPage.test.tsx`).
const { useDataExit } = await import('@/lib/data-exit')
const { downloadCSV } = await import('@/lib/export-csv')
type DataExitGrant = Parameters<typeof downloadCSV>[2]

const STAMP = '2026-09-01T00:00:00.000Z'

const ITEMS: TargetListItem[] = [
  {
    id: 'i1',
    target_list_id: 'list-1',
    kind: 'account',
    ref_id: 'acc-1',
    label: 'Banque Alpha',
    sublabel: null,
    selection_reason: 'Périmètre bancaire cité dans le brief',
    priority: 'high',
    owner_user_id: null,
    work_status: 'to_review',
    provenance: 'discover',
    refreshed_at: null,
    removed_at: null,
    removal_reason: null,
    next_action: 'Appeler la DSI',
    notes: null,
    created_at: STAMP,
    updated_at: STAMP,
  },
]

const LIST: TargetList = {
  id: 'list-1',
  name: 'Banques régionales — T4',
  objective: 'Décrocher 3 rendez-vous DSI',
  type: 'accounts',
  owner_user_id: null,
  team: null,
  visibility: 'workspace',
  source: 'manual',
  source_query: null,
  status: 'in_progress',
  counts: countTargetListItems(ITEMS),
  next_action: null,
  sequence_id: null,
  prospecting_session_id: null,
  created_by: 'u1',
  created_at: STAMP,
  updated_at: STAMP,
  items: ITEMS,
}

describe('TargetListCard — #2157.46 exporter la cible', () => {
  beforeEach(() => {
    cleanup()
    resetTestQueryClient()
    vi.mocked(downloadCSV).mockClear()
    vi.mocked(useDataExit).mockReturnValue({ allowed: true, grant: {} as DataExitGrant })
    vi.spyOn(targetListsApi, 'accountFactsCells').mockResolvedValue({
      'acc-1': { ...emptyAccountFactsExportCells(), lastHiring: '2026-03-02 — Architecte cloud' },
    })
  })

  it('#4073.1 — le CSV porte les faits datés du compte ; un échec de lecture est DIT et rien ne part', async () => {
    renderWithRouter(<TargetListCard list={LIST} members={[]} />)
    fireEvent.click(await screen.findByRole('button', { name: /Exporter/ }))
    await waitFor(() => expect(downloadCSV).toHaveBeenCalledTimes(1))
    const [csv] = vi.mocked(downloadCSV).mock.calls[0] as [string, string, unknown]
    expect(csv).toContain('Dernier recrutement')
    expect(csv).toContain('2026-03-02 — Architecte cloud')
    expect(targetListsApi.accountFactsCells).toHaveBeenCalledWith(['acc-1'])

    vi.mocked(downloadCSV).mockClear()
    vi.mocked(targetListsApi.accountFactsCells).mockRejectedValueOnce(new Error('503'))
    fireEvent.click(screen.getByRole('button', { name: /Exporter/ }))
    await waitFor(() => expect(targetListsApi.accountFactsCells).toHaveBeenCalledTimes(2))
    expect(downloadCSV).not.toHaveBeenCalled()
  })

  it('la règle d’espace autorise la sortie : le bouton « Exporter » existe et télécharge un CSV', async () => {
    renderWithRouter(<TargetListCard list={LIST} members={[]} />)

    const button = await screen.findByRole('button', { name: 'Exporter la liste Banques régionales — T4' })
    fireEvent.click(button)

    await waitFor(() => expect(downloadCSV).toHaveBeenCalledTimes(1))
    const [csv, filename] = vi.mocked(downloadCSV).mock.calls[0] as [string, string, unknown]
    expect(filename).toMatch(/^cible-banques-regionales-t4-\d{4}-\d{2}-\d{2}\.csv$/)
    // Une seule cellule non vide par ligne visible sur cette fiche : la
    // priorité, la raison de sélection et l'action suivante voyagent bien.
    expect(csv).toContain('Banque Alpha')
    expect(csv).toContain('Haute')
    expect(csv).toContain('Appeler la DSI')
    expect(csv).toContain('Périmètre bancaire cité dans le brief')
  })

  it('sait dire NON : la règle d’espace refuse la sortie — aucun bouton « Exporter »', async () => {
    vi.mocked(useDataExit).mockReturnValue({ allowed: false, grant: null })
    renderWithRouter(<TargetListCard list={LIST} members={[]} />)

    // Le reste de la fiche reste lisible ; seul le geste de sortie disparaît.
    expect(await screen.findByText('Banques régionales — T4')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Exporter/ })).toBeNull()
  })

  it('un responsable qui a quitté l’espace reste NOMMÉ dans l’export, jamais « Personne »', async () => {
    const listWithOwner: TargetList = {
      ...LIST,
      items: [{ ...ITEMS[0], owner_user_id: 'ghost-user' }],
    }
    renderWithRouter(<TargetListCard list={listWithOwner} members={[]} />)

    fireEvent.click(await screen.findByRole('button', { name: /Exporter/ }))

    await waitFor(() => expect(downloadCSV).toHaveBeenCalledTimes(1))
    const [csv] = vi.mocked(downloadCSV).mock.calls[0] as [string, string, unknown]
    expect(csv).toContain('Membre inconnu')
  })
})

describe('TargetListCard — #2157.43 analyser les comptes de la cible', () => {
  beforeEach(() => {
    cleanup()
    resetTestQueryClient()
    vi.mocked(useDataExit).mockReturnValue({ allowed: true, grant: {} as DataExitGrant })
  })

  it('une cible avec un compte vivant nommé porte un lien « Analyser » vers le lot pré-rempli', async () => {
    renderWithRouter(<TargetListCard list={LIST} members={[]} />)

    const link = await screen.findByRole('link', { name: 'Analyser les comptes de la liste Banques régionales — T4' })
    const href = link.getAttribute('href') ?? ''
    expect(href.startsWith('/discover/lots')).toBe(true)
    expect(decodeURIComponent(href.replace(/\+/g, ' '))).toContain('Banque Alpha')
  })

  it('sait dire NON : aucun compte vivant nommé — aucun lien « Analyser »', async () => {
    const listWithoutAccounts: TargetList = {
      ...LIST,
      items: [{ ...ITEMS[0], kind: 'contact', removed_at: null }],
    }
    renderWithRouter(<TargetListCard list={listWithoutAccounts} members={[]} />)

    expect(await screen.findByText('Banques régionales — T4')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Analyser/ })).toBeNull()
  })

  it('un compte RETIRÉ de la cible ne compte pas pour le lien « Analyser »', async () => {
    const listWithRemovedAccount: TargetList = {
      ...LIST,
      items: [{ ...ITEMS[0], removed_at: STAMP, removal_reason: 'Hors périmètre' }],
    }
    renderWithRouter(<TargetListCard list={listWithRemovedAccount} members={[]} />)

    expect(await screen.findByText('Banques régionales — T4')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Analyser/ })).toBeNull()
  })
})

describe('TargetListCard — golden journey 9 (#2208.40) : une liste sans fiche n’a pas de progression', () => {
  beforeEach(() => {
    cleanup()
    resetTestQueryClient()
    vi.mocked(useDataExit).mockReturnValue({ allowed: true, grant: {} as DataExitGrant })
  })

  it('une liste vide ne dit pas « 0 sur 0 prêts à contacter » — elle dit qu’elle est vide', async () => {
    renderWithRouter(
      <TargetListCard
        list={{ ...LIST, items: [], type: null, counts: { measured: true, total: 0, ready_to_work: 0, to_review: 0 } }}
        members={[]}
      />,
    )

    expect(await screen.findByText(/Cette liste est vide/)).toBeInTheDocument()
    expect(screen.queryByText(/prêts à contacter/)).not.toBeInTheDocument()
  })

  it('sait dire NON : une liste qui a des fiches garde sa progression', async () => {
    renderWithRouter(<TargetListCard list={LIST} members={[]} />)

    expect(await screen.findByText('0 sur 1 prêts à contacter')).toBeInTheDocument()
  })
})
