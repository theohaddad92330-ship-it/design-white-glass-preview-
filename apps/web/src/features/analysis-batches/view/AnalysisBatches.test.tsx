import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnalysisBatch, AnalysisBatchPreview, SurfaceContextContract } from '@bellum/contracts'
import { renderWithRouter, resetTestQueryClient } from '@/test-utils/renderWithRouter'

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('@/lib/api', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch,
}))
const { gate } = vi.hoisted(() => ({ gate: { known: true, canAnalyze: true, locked: false } }))
vi.mock('@/features/credits/hooks/useCreditGate', () => ({ useCreditGate: () => gate }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
// #2922 — la chip `SurfaceContextChip` a son propre hook réseau
// (`useSurfaceContextContract`) ; ce fichier teste le LANCEMENT du lot, pas ce
// contrat (couvert par `surface-context-contract.spec.ts` et
// `SurfaceContextChip.test.tsx`), donc il est court-circuité comme un contrat
// stable, deux modes tenus.
const contextChip = vi.hoisted(() => ({ contract: undefined as SurfaceContextContract | undefined }))
vi.mock('@/features/context-contract/api', () => ({
  useSurfaceContextContract: () => ({ data: contextChip.contract }),
}))

/** Le lot pour sa route, le devis `fresh` à 8 crédits pour `launch-plan`. */
function serve(current: AnalysisBatch) {
  apiFetch.mockImplementation(async (args: { path: string }) =>
    args.path.startsWith('/analysis/launch-plan') ? { scenario: 'fresh', credits: 8 } : current,
  )
}

const { NewAnalysisBatch } = await import('./NewAnalysisBatch')
const { AnalysisBatchDetail } = await import('./AnalysisBatchDetail')

type FetchArgs = { path: string; method?: string; body?: unknown }

const PREVIEW: AnalysisBatchPreview = {
  items: [
    { name: 'BPCE', siren: '493455042', resolution: 'resolved', candidates: [], scenario: 'fresh', credits: 8 },
    { name: 'Engie', siren: null, resolution: 'resolved', candidates: [], scenario: 'cache_hit', credits: 0 },
    { name: 'Total', siren: null, resolution: 'to_confirm', candidates: [], scenario: null, credits: null },
  ],
  duplicates: 0,
  counts: { resolved: 2, toConfirm: 1, alreadyAnalyzed: 1, fresh: 1 },
  totalCredits: 8,
  maxItems: 50,
  parallelRuns: 3,
  demo: false,
}

function batch(over: Partial<AnalysisBatch> = {}): AnalysisBatch {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    source: 'names',
    createdAt: '2026-09-23T08:00:00.000Z',
    canceledAt: null,
    status: 'running',
    counts: {
      resolved: 0,
      to_confirm: 1,
      queued: 0,
      running: 1,
      partial: 0,
      done: 1,
      failed: 1,
      canceled: 0,
      needs_resolution: 0,
    },
    total: 4,
    charged: 1,
    contextMode: null,
    items: [
      {
        id: 'i1',
        position: 0,
        name: 'BPCE',
        siren: '493455042',
        state: 'running',
        accountId: 'a1',
        candidates: [],
        failureCode: null,
        charged: true,
      },
      {
        id: 'i2',
        position: 1,
        name: 'Engie',
        siren: null,
        state: 'done',
        accountId: 'a2',
        candidates: [],
        failureCode: null,
        charged: false,
      },
      {
        id: 'i3',
        position: 2,
        name: 'Panne',
        siren: '111111111',
        state: 'failed',
        accountId: null,
        candidates: [],
        failureCode: 'insufficient_credits',
        charged: false,
      },
      {
        id: '00000000-0000-4000-8000-0000000000a4',
        position: 3,
        name: 'Total',
        siren: null,
        state: 'to_confirm',
        accountId: null,
        candidates: [{ name: 'TotalEnergies SE', siren: '542051180', city: 'Courbevoie' }],
        failureCode: null,
        charged: false,
      },
    ],
    ...over,
  }
}

beforeEach(() => {
  resetTestQueryClient()
  apiFetch.mockReset()
  gate.canAnalyze = true
  contextChip.contract = undefined
})

describe('NewAnalysisBatch — #2293.3 / .4 : préview avant tout lancement', () => {
  it('prévisualise sans lancer, ne dit AUCUN coût et la durée NON annoncée, puis lance au seul clic', async () => {
    apiFetch.mockImplementation(async (args: FetchArgs) => {
      if (args.path === '/analysis-batches/preview') return PREVIEW
      if (args.path === '/analysis-batches' && args.method === 'POST') return batch()
      return []
    })
    renderWithRouter(<NewAnalysisBatch />, '/discover/lots')
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'BPCE\nEngie\nTotal' } })
    fireEvent.click(screen.getByRole('button', { name: /prévisualiser/i }))

    const region = await screen.findByRole('region', { name: /avant de lancer/i })
    expect(region).not.toHaveTextContent(/cr[ée]dit/i)
    expect(within(region).getByText(/aucune durée n'est mesurée/i)).toBeInTheDocument()
    expect(within(region).getByText(/déjà analysées/i)).toBeInTheDocument()
    // On n'affiche pas ce qu'on n'a pas : aucun doublon, aucune ligne « doublons ».
    expect(within(region).queryByText(/doublons/i)).toBeNull()
    expect(
      apiFetch.mock.calls.some(
        ([args]) => (args as FetchArgs).path === '/analysis-batches' && (args as FetchArgs).method === 'POST',
      ),
    ).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: /lancer le lot/i }))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/analysis-batches',
          method: 'POST',
          body: {
            source: 'names',
            items: [{ name: 'BPCE', siren: '493455042' }, { name: 'Engie' }, { name: 'Total' }],
          },
        }),
      ),
    )
  })

  // #2157.43 (épopée #2962) — « Analyser les comptes » depuis une cible
  // pré-remplit la saisie, mais RIEN ne se lance sans le clic de l'utilisateur
  // sur « Prévisualiser » puis « Lancer » (mêmes gestes que la saisie manuelle).
  it('pré-remplit la saisie avec les noms reçus, sans rien lancer avant le clic', async () => {
    apiFetch.mockImplementation(async (args: FetchArgs) => {
      if (args.path === '/analysis-batches/preview') return PREVIEW
      if (args.path === '/analysis-batches' && args.method === 'POST') return batch()
      return []
    })
    renderWithRouter(<NewAnalysisBatch initialNames={['BPCE', 'Engie']} />, '/discover/lots')

    expect(await screen.findByRole('textbox')).toHaveValue('BPCE\nEngie')
    // #2809 — le sélecteur « depuis une liste cible » lit les listes cibles de
    // l'espace au montage (`useTargetLists`), tout comme le lot récent
    // (`useAnalysisBatches`) : deux LECTURES d'orientation, jamais un
    // lancement. Seul un POST sur `/analysis-batches` compte comme « lancé ».
    expect(
      apiFetch.mock.calls.some(
        ([args]) => (args as FetchArgs).path === '/analysis-batches' && (args as FetchArgs).method === 'POST',
      ),
    ).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: /prévisualiser/i }))
    await screen.findByRole('region', { name: /avant de lancer/i })
    expect(
      apiFetch.mock.calls.some(
        ([args]) => (args as FetchArgs).path === '/analysis-batches' && (args as FetchArgs).method === 'POST',
      ),
    ).toBe(false)
  })

  it('solde épuisé : le lancement est refusé par le frein doux, sans chiffre', async () => {
    gate.canAnalyze = false
    apiFetch.mockImplementation(async (args: FetchArgs) => (args.path === '/analysis-batches/preview' ? PREVIEW : []))
    renderWithRouter(<NewAnalysisBatch />, '/discover/lots')
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'BPCE' } })
    fireEvent.click(screen.getByRole('button', { name: /prévisualiser/i }))
    expect(await screen.findByText(/beaucoup utilisé/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /lancer le lot/i })).toBeDisabled()
  })

  // #2922 — le lot lance chaque entreprise par le MÊME chemin qu'Analyser
  // (`AnalysisService.start`) : c'était le seul écran de lancement d'analyse
  // sans chip « Contexte ». La garde `surface-context-chip-placement.test.ts`
  // tient la liste des écrans hôtes ; ce test tient le CÂBLAGE écran → lot.
  it('pose la chip « Contexte » (surface `analysis_batch`) et transmet le mode choisi au lancement', async () => {
    contextChip.contract = {
      surface: 'analysis_batch',
      mode: 'my_activity',
      modes_available: ['my_activity', 'one_off_mission', 'neutral'],
      layers: [{ id: 'crm', state: 'not_connected', action: 'connect_crm' }],
    }
    apiFetch.mockImplementation(async (args: FetchArgs) => {
      if (args.path === '/analysis-batches/preview') return PREVIEW
      if (args.path === '/analysis-batches' && args.method === 'POST') return batch()
      return []
    })
    const { container } = renderWithRouter(<NewAnalysisBatch />, '/discover/lots')
    expect(await screen.findByText('Mon activité')).toBeInTheDocument()
    expect(container.querySelector('[data-surface-context="analysis_batch"]')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Contexte de travail : Mon activité' }))
    fireEvent.click((await screen.findAllByRole('radio'))[1])

    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'BPCE\nEngie\nTotal' } })
    fireEvent.click(screen.getByRole('button', { name: /prévisualiser/i }))
    await screen.findByRole('region', { name: /avant de lancer/i })
    fireEvent.click(screen.getByRole('button', { name: /lancer le lot/i }))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/analysis-batches',
          method: 'POST',
          body: expect.objectContaining({ context_mode: 'one_off_mission' }),
        }),
      ),
    )
  })
})

describe('NewAnalysisBatch — #2809 (#2293.3) : le sélecteur de source « liste cible »', () => {
  function targetList(over: Record<string, unknown> = {}) {
    return {
      id: 'list-1',
      name: 'Cibles Q4',
      objective: null,
      type: 'accounts',
      owner_user_id: null,
      team: null,
      visibility: 'workspace',
      source: 'import',
      source_query: null,
      status: 'draft',
      counts: { measured: true, total: 1, ready_to_work: 0, to_review: 1 },
      next_action: null,
      sequence_id: null,
      prospecting_session_id: null,
      created_by: 'u1',
      created_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-01T00:00:00.000Z',
      items: [
        {
          id: 'item-1',
          target_list_id: 'list-1',
          kind: 'account',
          ref_id: 'a1',
          label: 'Bouygues Construction',
          sublabel: null,
          selection_reason: null,
          priority: null,
          owner_user_id: null,
          work_status: 'to_review',
          provenance: 'manual',
          refreshed_at: null,
          removed_at: null,
          removal_reason: null,
          next_action: null,
          notes: null,
          created_at: '2026-09-01T00:00:00.000Z',
          updated_at: '2026-09-01T00:00:00.000Z',
        },
      ],
      ...over,
    }
  }

  it('reprend une liste cible IMPORTÉE : la préview part avec source `import`, jamais `names`', async () => {
    apiFetch.mockImplementation(async (args: FetchArgs) => {
      if (args.path === '/target-lists') return { lists: [targetList()] }
      if (args.path === '/analysis-batches/preview') return PREVIEW
      return []
    })
    renderWithRouter(<NewAnalysisBatch />, '/discover/lots')
    fireEvent.click(await screen.findByRole('button', { name: /depuis une liste cible/i }))
    // Refonte Théo (PR12) — une cible se choisit sur sa ligne (nom + taille), plus dans un menu.
    const option = await screen.findByRole('radio', { name: /cibles q4/i })
    expect(within(option.closest('label') as HTMLElement).getByText('1 entreprise(s)')).toBeInTheDocument()
    fireEvent.click(option)
    fireEvent.click(screen.getByRole('button', { name: /prévisualiser/i }))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/analysis-batches/preview',
          method: 'POST',
          body: { source: 'import', items: [{ name: 'Bouygues Construction' }] },
        }),
      ),
    )
  })

  it('aucune liste cible avec au moins un compte : le sélecteur le dit, jamais une préview vide qui prétend avoir des données', async () => {
    apiFetch.mockImplementation(async (args: FetchArgs) => {
      if (args.path === '/target-lists') return { lists: [] }
      return []
    })
    renderWithRouter(<NewAnalysisBatch />, '/discover/lots')
    fireEvent.click(await screen.findByRole('button', { name: /depuis une liste cible/i }))
    expect(await screen.findByText(/aucune liste cible/i)).toBeInTheDocument()
    expect(screen.queryByRole('radio')).toBeNull()
  })
})

/**
 * Refonte Théo (PR12) — la STRUCTURE de l'écran, lue dans l'ordre du document :
 * « Ta liste » puis « Avant de lancer » (colonne de droite), puis « Lots récents »
 * en tableau commun. Chaque état vide est NOMMÉ, jamais un tableau muet.
 */
describe('NewAnalysisBatch — refonte Théo : sections, colonnes, états vides', () => {
  const RECENT: AnalysisBatch[] = [batch({ id: 'b-1', source: 'target_list', status: 'finished', total: 12 })]

  it('ordonne Ta liste › Avant de lancer › Lots récents, et nomme le devis vide avant toute préview', async () => {
    apiFetch.mockImplementation(async (args: FetchArgs) => (args.path === '/analysis-batches' ? RECENT : []))
    renderWithRouter(<NewAnalysisBatch />, '/discover/lots')
    const headings = (await screen.findAllByRole('heading', { level: 2 })).map(h => h.textContent)
    expect(headings).toEqual(['Ta liste', 'Avant de lancer', 'Lots récents'])
    expect(screen.getByRole('complementary', { name: 'Avant de lancer' })).toHaveTextContent(
      /rien n'est lancé pour l'instant/i,
    )
    expect(screen.getByText(/un nom ou un siren par ligne · 50 entreprises au plus/i)).toBeInTheDocument()
  })

  it('les lots récents : colonnes Lot · Entreprises · Statut · Ouvrir, origine EN MOTS et lien vers le détail', async () => {
    apiFetch.mockImplementation(async (args: FetchArgs) => (args.path === '/analysis-batches' ? RECENT : []))
    renderWithRouter(<NewAnalysisBatch />, '/discover/lots')
    const recent = await screen.findByRole('region', { name: 'Lots récents' })
    const headers = (await within(recent).findAllByRole('columnheader')).map(h => h.textContent)
    expect(headers).toEqual(['Lot', 'Entreprises', 'Statut', 'Ouvrir'])
    expect(within(recent).getByText('Depuis une cible')).toBeInTheDocument()
    expect(within(recent).getByText('Terminé')).toBeInTheDocument()
    expect(within(recent).getByText('1 lot(s)')).toBeInTheDocument()
    expect(within(recent).getByRole('link', { name: /ouvrir le lot « depuis une cible »/i })).toHaveAttribute(
      'href',
      '/discover/lots/b-1',
    )
  })

  it('aucun lot : une carte qui dit quoi faire, jamais un tableau vide ni un « 0 »', async () => {
    apiFetch.mockImplementation(async () => [])
    renderWithRouter(<NewAnalysisBatch />, '/discover/lots')
    const recent = await screen.findByRole('region', { name: 'Lots récents' })
    expect(await within(recent).findByText('Ton premier lot apparaîtra ici')).toBeInTheDocument()
    expect(within(recent).queryByRole('table')).toBeNull()
    expect(within(recent).queryByText(/\b0\b/)).toBeNull()
  })

  it('la saisie compte ce qui est collé contre la limite du lot', async () => {
    apiFetch.mockImplementation(async () => [])
    renderWithRouter(<NewAnalysisBatch />, '/discover/lots')
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'BPCE\nEngie' } })
    expect(screen.getByText('2 / 50 entreprises · un nom ou un SIREN par ligne')).toBeInTheDocument()
  })
})

describe('AnalysisBatchDetail — #2293.5 / .6 : un parent, ses sous-jobs', () => {
  it('dit le statut agrégé, les états à compte non nul, les débits RÉELS et la raison d’un échec', async () => {
    apiFetch.mockResolvedValue(batch())
    renderWithRouter(<AnalysisBatchDetail batchId="00000000-0000-4000-8000-000000000001" />, '/discover/lots')
    for (const chip of ['1 à confirmer', '1 en cours', '1 terminée', '1 échouée'])
      expect(await screen.findByText(chip)).toBeInTheDocument()
    expect(screen.getAllByText('En cours').length).toBeGreaterThan(0)
    expect(screen.getByText(/1 analyse\(s\) lancée\(s\)/)).toBeInTheDocument()
    expect(screen.getByText('Échouée')).toBeInTheDocument()
    expect(screen.getByText('Action en pause pour ton espace')).toBeInTheDocument()
    // Aucun sous-job annulé : l'état n'apparaît pas dans le résumé.
    expect(screen.queryByText(/annulée/i)).toBeNull()
  })

  it('confirmer une entité ambiguë lance CE sous-job avec le SIREN choisi, sans coût affiché', async () => {
    serve(batch())
    renderWithRouter(<AnalysisBatchDetail batchId="00000000-0000-4000-8000-000000000001" />, '/discover/lots')
    const choose = await screen.findByRole('button', { name: /choisir totalenergies se/i })
    await waitFor(() => expect(choose).toBeEnabled())
    fireEvent.click(choose)
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/analysis-batches/00000000-0000-4000-8000-000000000001/items/00000000-0000-4000-8000-0000000000a4/confirm',
          method: 'POST',
          body: { siren: '542051180' },
        }),
      ),
    )
  })

  it('annuler demande une confirmation DANS la page avant d’arrêter quoi que ce soit', async () => {
    apiFetch.mockResolvedValue(batch())
    renderWithRouter(<AnalysisBatchDetail batchId="00000000-0000-4000-8000-000000000001" />, '/discover/lots')
    fireEvent.click(await screen.findByRole('button', { name: /^annuler le lot$/i }))
    expect(apiFetch.mock.calls.some(([args]) => (args as FetchArgs).path.endsWith('/cancel'))).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /confirmer l'annulation/i }))
    await waitFor(() =>
      expect(apiFetch.mock.calls.some(([args]) => (args as FetchArgs).path.endsWith('/cancel'))).toBe(true),
    )
  })

  it('relancer les échecs ne montre aucun coût (#4463)', async () => {
    serve(batch())
    renderWithRouter(<AnalysisBatchDetail batchId="00000000-0000-4000-8000-000000000001" />, '/discover/lots')
    const retry = await screen.findByRole('button', { name: /relancer les échecs/i })
    expect(retry).not.toHaveTextContent(/cr[ée]dit/i)
    expect(document.body).not.toHaveTextContent(/8 cr[ée]dit/i)
  })

  it('#2283.32 — une identité restée ambiguë après coup dit pourquoi, et se laisse exclure du lot', async () => {
    const withNeedsResolution = batch({
      counts: {
        resolved: 0,
        to_confirm: 0,
        queued: 0,
        running: 0,
        partial: 0,
        done: 0,
        failed: 0,
        canceled: 0,
        needs_resolution: 1,
      },
      status: 'needs_confirmation',
      items: [
        {
          id: 'i5',
          position: 0,
          name: 'Silex',
          siren: '709802094',
          state: 'needs_resolution',
          accountId: 'a5',
          candidates: [{ name: 'Silex Group SA', siren: '900000037', city: 'Bordeaux' }],
          failureCode: null,
          charged: true,
        },
      ],
    })
    apiFetch.mockResolvedValue(withNeedsResolution)
    renderWithRouter(<AnalysisBatchDetail batchId="00000000-0000-4000-8000-000000000001" />, '/discover/lots')
    expect(await screen.findByText('Identité ambiguë')).toBeInTheDocument()
    expect(screen.getByText(/plusieurs entités légales/i)).toBeInTheDocument()
    expect(screen.getByText(/Silex Group SA \(Bordeaux\)/)).toBeInTheDocument()
    // Le dossier reste ouvrable : « demander une résolution » n'est pas perdu.
    expect(screen.getByRole('link', { name: /ouvrir le dossier/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /exclure du lot/i }))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/analysis-batches/00000000-0000-4000-8000-000000000001/items/i5/exclude',
          method: 'POST',
        }),
      ),
    )
  })

  it('#2283.32 — un nom à confirmer se laisse aussi exclure, sans lancement', async () => {
    serve(batch())
    renderWithRouter(<AnalysisBatchDetail batchId="00000000-0000-4000-8000-000000000001" />, '/discover/lots')
    await screen.findByRole('button', { name: /choisir totalenergies se/i })
    const excludeButtons = screen.getAllByRole('button', { name: /exclure du lot/i })
    expect(excludeButtons).toHaveLength(1)
    fireEvent.click(excludeButtons[0] as HTMLElement)
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/analysis-batches/00000000-0000-4000-8000-000000000001/items/00000000-0000-4000-8000-0000000000a4/exclude',
          method: 'POST',
        }),
      ),
    )
  })

  it('reprendre les échecs n’est proposé que s’il y en a', async () => {
    apiFetch.mockResolvedValue(
      batch({
        counts: {
          resolved: 0,
          to_confirm: 0,
          queued: 0,
          running: 0,
          partial: 0,
          done: 1,
          failed: 0,
          canceled: 0,
          needs_resolution: 0,
        },
        status: 'finished',
      }),
    )
    renderWithRouter(<AnalysisBatchDetail batchId="00000000-0000-4000-8000-000000000001" />, '/discover/lots')
    expect(await screen.findByText('Terminé')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /relancer les échecs/i })).toBeNull()
  })
})

describe('AnalysisBatchDetail — refonte Théo : la question en tête, le tableau numéroté', () => {
  it('pose la question du lot, son origine en mots, et les colonnes # · Entreprise · État · Ce qu’il faut faire · Action', async () => {
    serve(batch())
    renderWithRouter(<AnalysisBatchDetail batchId="00000000-0000-4000-8000-000000000001" />, '/discover/lots/x')
    expect(
      await screen.findByRole('heading', { level: 2, name: '1 entreprise(s) attendent ton choix' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/^Lot « Liste collée » · 4 entreprise\(s\) ·/)).toBeInTheDocument()
    const headers = screen.getAllByRole('columnheader').map(h => h.textContent)
    expect(headers).toEqual(['#', 'Entreprise', 'État', 'Ce qu’il faut faire', 'Action'])
    expect(screen.getByRole('link', { name: /retour aux lots/i })).toHaveAttribute('href', '/discover/lots')
  })

  it('un lot terminé sans échec le dit en mots, sans proposer d’annulation', async () => {
    serve(
      batch({
        status: 'finished',
        counts: {
          resolved: 0,
          to_confirm: 0,
          queued: 0,
          running: 0,
          partial: 0,
          done: 1,
          failed: 0,
          canceled: 0,
          needs_resolution: 0,
        },
        items: [],
      }),
    )
    renderWithRouter(<AnalysisBatchDetail batchId="00000000-0000-4000-8000-000000000001" />, '/discover/lots/x')
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Toutes les analyses du lot sont terminées' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^annuler le lot$/i })).toBeNull()
  })
})
