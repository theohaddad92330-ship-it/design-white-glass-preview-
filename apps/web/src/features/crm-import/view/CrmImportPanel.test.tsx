import type { SyncOutcome, SyncRun } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-error'
import { CrmImportPanel } from './CrmImportPanel'

const runs = vi.fn()
const runImport = vi.fn()
const readStatus = vi.fn()
const firstImports = vi.fn()

vi.mock('../api', () => ({
  useCrmImportRuns: () => runs(),
  useCrmReadStatus: () => readStatus(),
  useCrmFirstImport: () => firstImports(),
  useRunCrmImport: () => ({ mutate: runImport, isPending: false }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

function outcome(over: Partial<SyncOutcome> = {}): SyncOutcome {
  return {
    provider: 'hubspot',
    entityType: 'contact',
    dryRun: true,
    created: 12,
    updated: 3,
    skipped: [],
    truncated: false,
    unavailable: null,
    ...over,
  }
}

function run(over: Partial<SyncRun> = {}): SyncRun {
  return {
    id: 'run-1',
    provider: 'hubspot',
    entityType: 'contact',
    dryRun: true,
    created: 12,
    updated: 3,
    skippedCount: 1,
    truncated: false,
    startedAt: '2026-08-17T09:00:00.000Z',
    finishedAt: '2026-08-17T09:01:00.000Z',
    startedByName: 'Louis Schlegel',
    error: null,
    ...over,
  }
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CrmImportPanel />
    </QueryClientProvider>,
  )
}

/** Rejoue le succès de la mutation pour que le composant reçoive son résultat. */
function resolveWith(result: SyncOutcome) {
  runImport.mockImplementation((_input: unknown, opts?: { onSuccess?: (o: SyncOutcome) => void }) => {
    opts?.onSuccess?.(result)
  })
}

describe('CrmImportPanel', () => {
  beforeEach(() => {
    runs.mockReset()
    runImport.mockReset()
    readStatus.mockReset()
    readStatus.mockReturnValue({ data: [] })
    firstImports.mockReset()
    firstImports.mockReturnValue({ data: [] })
    runs.mockReturnValue({ data: [], isError: false })
  })

  it('K.4 — la reprise vise le CRM branché (Odoo), pas HubSpot en dur', () => {
    readStatus.mockReturnValue({ data: [{ provider: 'odoo' }] })
    renderPanel()
    fireEvent.click(screen.getByText('Simuler l’import'))
    expect(runImport).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'odoo', dryRun: true }),
      expect.anything(),
    )
  })

  it('K.4 — plusieurs CRM branchés : on choisit lequel reprendre', () => {
    readStatus.mockReturnValue({ data: [{ provider: 'salesforce' }, { provider: 'pipedrive' }] })
    renderPanel()
    fireEvent.click(screen.getByText('Pipedrive'))
    fireEvent.click(screen.getByText('Simuler l’import'))
    expect(runImport).toHaveBeenCalledWith(expect.objectContaining({ provider: 'pipedrive' }), expect.anything())
  })

  it('n’offre PAS l’import réel avant d’avoir simulé', () => {
    // Un premier import massif raté fait renoncer une ESN à changer d'outil.
    renderPanel()
    expect(screen.getByText('Simuler l’import')).toBeInTheDocument()
    expect(screen.queryByText('Importer pour de bon')).not.toBeInTheDocument()
  })

  it('offre l’import réel APRÈS une simulation réussie', () => {
    resolveWith(outcome())
    renderPanel()
    fireEvent.click(screen.getByText('Simuler l’import'))
    expect(screen.getByText('Importer pour de bon')).toBeInTheDocument()
  })

  it('dit clairement qu’une simulation n’a RIEN écrit', () => {
    resolveWith(outcome())
    renderPanel()
    fireEvent.click(screen.getByText('Simuler l’import'))
    expect(screen.getByText('Simulation — rien n’a été écrit')).toBeInTheDocument()
  })

  it('NOMME la raison de chaque écart', () => {
    // « 412 lignes traitées » sans dire que 90 ont été ignorées laisse croire à
    // une reprise complète.
    resolveWith(outcome({ skipped: [{ ref: 'hs-9', reason: 'already_linked_elsewhere' }] }))
    renderPanel()
    fireEvent.click(screen.getByText('Simuler l’import'))
    expect(screen.getByText(/déjà celle d’une autre fiche/)).toBeInTheDocument()
  })

  it('signale la TRONCATURE', () => {
    resolveWith(outcome({ truncated: true }))
    renderPanel()
    fireEvent.click(screen.getByText('Simuler l’import'))
    expect(screen.getByText('Il reste des pages — relance pour la suite')).toBeInTheDocument()
  })

  it('montre l’erreur du fournisseur TELLE QUELLE, et retire l’import réel', () => {
    resolveWith(outcome({ unavailable: '401 invalid_grant' }))
    renderPanel()
    fireEvent.click(screen.getByText('Simuler l’import'))
    expect(screen.getByText(/401 invalid_grant/)).toBeInTheDocument()
    expect(screen.queryByText('Importer pour de bon')).not.toBeInTheDocument()
  })

  it('MARQUE les simulations dans l’historique', () => {
    // C'est la trace qu'on a regardé avant d'écrire.
    runs.mockReturnValue({ data: [run({ dryRun: true })], isError: false })
    renderPanel()
    expect(screen.getByText('Simulation')).toBeInTheDocument()
  })

  it('ne rend PAS un échec de lecture comme un historique vide', () => {
    runs.mockReturnValue({ data: undefined, isError: true })
    renderPanel()
    expect(screen.getByText(/n’a pas pu être chargé/)).toBeInTheDocument()
    expect(screen.queryByText('Aucun import pour l’instant.')).not.toBeInTheDocument()
  })

  // #2388.49 — l'écriture réelle suit un mapping affiché AVANT création, pas
  // seulement une simulation numérique : voir les COMPTES ne dit pas quels
  // CHAMPS seront touchés.
  it('affiche le mapping des champs AVANT le bouton d’import réel', () => {
    resolveWith(outcome())
    renderPanel()
    fireEvent.click(screen.getByText('Simuler l’import'))
    expect(screen.getByText('Champs qui seront écrits')).toBeInTheDocument()
  })

  it('n’affiche PAS le mapping tant qu’aucune simulation n’a réussi', () => {
    renderPanel()
    expect(screen.queryByText('Champs qui seront écrits')).not.toBeInTheDocument()
  })

  it('n’affiche PAS le mapping quand le fournisseur est indisponible', () => {
    resolveWith(outcome({ unavailable: '401 invalid_grant' }))
    renderPanel()
    fireEvent.click(screen.getByText('Simuler l’import'))
    expect(screen.queryByText('Champs qui seront écrits')).not.toBeInTheDocument()
  })

  // #2388.24 — la reprise couvre aussi les COMPTES, pas seulement les contacts.
  it('simule les COMPTES quand l’onglet Entreprises est choisi', () => {
    resolveWith(outcome({ entityType: 'account' }))
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Entreprises' }))
    fireEvent.click(screen.getByText('Simuler l’import'))
    expect(runImport).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'account' }), expect.anything())
  })

  it('simule les CONTACTS par défaut (onglet Contacts déjà sélectionné)', () => {
    resolveWith(outcome())
    renderPanel()
    fireEvent.click(screen.getByText('Simuler l’import'))
    expect(runImport).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'contact' }), expect.anything())
  })
})

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * L'HISTORIQUE : TROIS ÉTATS, JAMAIS UNE CLÉ FOURRE-TOUT
 * ─────────────────────────────────────────────────────────────────────────────
 * `GET /crm/import/runs` traverse le même CRM que le reste : il échoue par le
 * contrat de connecteur, avec `code`, `scopes` et une phrase déjà écrite. Le
 * panneau déstructurait `isError` SANS `error` — il ne pouvait donc rien en
 * lire, et rendait la même phrase pour trois situations qui n'appellent pas le
 * même geste. Sur une portée manquante, attendre ne sert à rien : il faut
 * reconnecter, et un jeton OAuth ne s'élargit pas tout seul.
 */
const SERVER_BODY = {
  code: 'scope_missing',
  provider: 'hubspot',
  capability: 'crm',
  scopes: ['crm.objects.contacts.read', 'crm.objects.companies.read', 'crm.objects.deals.read'],
  message:
    "Je n'ai pas le droit de regarder ton CRM. Reconnecte cet outil : un accès déjà donné ne s'élargit pas tout seul.",
}

const failingRuns = (error: unknown) => ({ data: undefined, isError: true, error })

describe('CrmImportPanel — l’historique distingue les trois états', () => {
  beforeEach(() => {
    runs.mockReset()
    runImport.mockReset()
    runs.mockReturnValue({ data: [], isError: false, error: null })
  })

  it('portée manquante : AFFICHE la phrase du serveur, et ouvre un chemin', () => {
    runs.mockReturnValue(failingRuns(new ApiError(SERVER_BODY.message, 503, 'scope_missing')))
    const { container } = renderPanel()

    expect(container.textContent).toContain("Je n'ai pas le droit de regarder ton CRM")
    expect(container.textContent).not.toContain('n’a pas pu être chargé')
    expect(screen.getByRole('link')).toHaveAttribute('href', '/integrations')
  })

  it('aucun CRM connecté : un AUTRE message, et le même chemin', () => {
    runs.mockReturnValue(failingRuns(new ApiError('Aucun CRM connecté à cet espace.', 412)))
    const { container } = renderPanel()

    expect(container.textContent).toContain('Aucun CRM n’est connecté')
    expect(container.textContent).not.toContain("Je n'ai pas le droit")
    expect(screen.getByRole('link')).toHaveAttribute('href', '/integrations')
  })

  it('vraie panne : distincte des deux autres, et SANS chemin', () => {
    runs.mockReturnValue(failingRuns(new ApiError('boom', 500)))
    const { container } = renderPanel()

    expect(container.textContent).toContain('n’a pas pu être chargé')
    expect(container.textContent).not.toContain('Aucun CRM n’est connecté')
    // Intégrations ne répare pas une panne : pas de bouton qui ne répare rien.
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })

  it('un corps sans `message` ne laisse pas l’écran muet', () => {
    runs.mockReturnValue(failingRuns(new ApiError('', 503, 'scope_missing')))
    const { container } = renderPanel()
    expect(container.textContent).toContain('Reconnecte-le')
  })

  it('le corps 503 porte « hubspot », le DOM ne le porte jamais', () => {
    runs.mockReturnValue(failingRuns(new ApiError(SERVER_BODY.message, 503, 'scope_missing')))
    const { container } = renderPanel()
    expect(container.textContent ?? '').not.toMatch(/hubspot/i)
    expect(container.textContent).toMatch(/ton CRM/i)
  })

  describe('SYNC-B — la reprise automatique', () => {
    const base = {
      provider: 'pipedrive' as const,
      startedAt: '2026-10-19T08:00:00.000Z',
      finishedAt: null,
      message: null,
      reconnectNeeded: false,
    }

    it('montre la progression PAR OBJET, un chiffre non mesuré n’étant jamais « 0 »', () => {
      readStatus.mockReturnValue({ data: [{ provider: 'pipedrive' }] })
      firstImports.mockReturnValue({
        data: [
          {
            ...base,
            state: 'running',
            objects: [
              { object: 'contacts', status: 'running', count: 1240, conflicts: 0, truncated: false, error: null },
              { object: 'deals', status: 'pending', count: null, conflicts: null, truncated: false, error: null },
            ],
          },
        ],
      })
      const { container } = renderPanel()
      expect(container.textContent).toMatch(/1.240 contacts/)
      expect(container.textContent).toContain('Affaires · en attente')
      expect(container.textContent).not.toMatch(/\b0 affaires/)
    })

    it('fin : résumé chiffré, erreur NOMMÉE par objet, écarts comptés — et la simulation reste là', () => {
      readStatus.mockReturnValue({ data: [{ provider: 'pipedrive' }] })
      firstImports.mockReturnValue({
        data: [
          {
            ...base,
            state: 'done',
            finishedAt: '2026-10-19T08:03:00.000Z',
            objects: [
              { object: 'accounts', status: 'done', count: 312, conflicts: 2, truncated: false, error: null },
              {
                object: 'activities',
                status: 'failed',
                count: null,
                conflicts: null,
                truncated: false,
                error: 'lecture refusée',
              },
            ],
          },
        ],
      })
      const { container } = renderPanel()
      expect(container.textContent).toContain('terminée')
      expect(container.textContent).toMatch(/312 entreprises/)
      expect(container.textContent).toContain('Activités : lecture refusée')
      expect(container.textContent).toMatch(/2 fiches modifiées des deux côtés/)
      expect(screen.getByText('Simuler l’import')).toBeTruthy()
    })

    it('jeton refusé : « Reconnecte … » avec un chemin vers Intégrations, pas un échec muet', () => {
      readStatus.mockReturnValue({ data: [{ provider: 'pipedrive' }] })
      firstImports.mockReturnValue({
        data: [{ ...base, state: 'failed', reconnectNeeded: true, message: 'x', objects: [] }],
      })
      const { container } = renderPanel()
      expect(container.textContent).toContain('Reconnecte Pipedrive')
      expect(screen.getAllByRole('link').length).toBeGreaterThan(0)
    })
  })
})
