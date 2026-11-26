import type { ReactElement } from 'react'
import type { BusinessUnitList, BusinessUnitView } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

const apiFetch = vi.fn()
const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
    info: vi.fn(),
  },
}))

let mockRole: string | null = 'owner'
vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => ({
    team: mockRole ? { workspace: { role: mockRole }, members: [] } : undefined,
    isLoading: false,
    isError: false,
  }),
}))

vi.mock('@/features/mobile/useIsMobile', () => ({ useIsMobile: () => false }))

const { BusinessUnitAdminView } = await import('./BusinessUnitAdminView')

function renderView(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

const unit = (over: Partial<BusinessUnitView> = {}): BusinessUnitView => ({
  id: 'bu-lyon',
  name: 'Agence Lyon',
  kind: 'agency',
  territory: 'Auvergne-Rhône-Alpes',
  specialties: ['Data'],
  consultantCount: 42,
  teamSize: 4,
  leadUserId: null,
  portfolioNote: 'Grands comptes industriels',
  capacityAvailableConsultants: 5,
  quarterObjective: 'Signer deux nouveaux comptes industriels',
  status: 'active',
  memberCount: 3,
  viewerIsMember: true,
  viewerAccessRequestStatus: null,
  ...over,
})

function serve(list: BusinessUnitList) {
  apiFetch.mockImplementation((args: { path: string; method?: string }) => {
    if (args.path === '/business-units' && !args.method) return Promise.resolve(list)
    return Promise.reject(new Error(`unexpected ${args.path}`))
  })
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  apiFetch.mockReset()
  toastSuccess.mockReset()
  toastError.mockReset()
  mockRole = 'owner'
})

/**
 * #2005.5 — LA FICHE D'UNE BU, ENFIN SAISISSABLE.
 *
 * `apps/web/src/features/business-units/api.ts` n'exposait que `list` / `join`
 * / `requestAccess` : aucun écran n'appelait `PATCH /business-units/:id`, y
 * compris pour les champs PRÉEXISTANTS `consultantCount` / `teamSize` /
 * `portfolioNote`. La migration, l'entité, le service et la route existent —
 * il manquait la saisie.
 */
describe('#2005.5 — BusinessUnitAdminView (Théo D settings-espace : un tableau, « Modifier » ouvre la fiche)', () => {
  it('montre le périmètre, ses faits et son statut dans un tableau', async () => {
    serve({ viewerAccess: 'workspace', businessUnits: [unit()] })
    renderView(<BusinessUnitAdminView />)

    expect(await screen.findByText('Agence Lyon')).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual([
      'Périmètre',
      'Zone / responsable',
      'Statut',
      'Actions',
    ])
    expect(screen.getByText('Auvergne-Rhône-Alpes')).toBeInTheDocument()
    expect(screen.getByText('Actif')).toBeInTheDocument()
    expect(screen.getByText('Signer deux nouveaux comptes industriels')).toBeInTheDocument()
  })

  it('« Modifier » ouvre la fiche, avec les cinq champs pré-remplis', async () => {
    serve({ viewerAccess: 'workspace', businessUnits: [unit()] })
    renderView(<BusinessUnitAdminView />)

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Modifier la fiche — Agence Lyon' }))
    expect(await screen.findByDisplayValue('5')).toBeInTheDocument() // capacité
    expect(screen.getByDisplayValue('Signer deux nouveaux comptes industriels')).toBeInTheDocument()
    expect(screen.getByDisplayValue('42')).toBeInTheDocument() // consultants
    expect(screen.getByDisplayValue('4')).toBeInTheDocument() // taille d'équipe
    expect(screen.getByDisplayValue('Grands comptes industriels')).toBeInTheDocument()
  })

  it('une valeur absente ne fait AUCUNE ligne : jamais « 0 »', async () => {
    serve({
      viewerAccess: 'workspace',
      businessUnits: [
        unit({
          id: 'bu-new',
          name: 'Équipe Nouvelles activités',
          memberCount: 0,
          consultantCount: null,
          teamSize: null,
          portfolioNote: null,
          capacityAvailableConsultants: null,
          quarterObjective: null,
        }),
      ],
    })
    renderView(<BusinessUnitAdminView />)

    expect(await screen.findByText('Équipe Nouvelles activités')).toBeInTheDocument()
    expect(screen.queryByText(/\b0 /)).toBeNull()
    expect(screen.queryByText(/consultant/)).toBeNull()
  })

  it('ENREGISTRER la fiche appelle PATCH /business-units/:id', async () => {
    apiFetch.mockImplementation((args: { path: string; method?: string; body?: unknown }) => {
      if (args.path === '/business-units' && !args.method)
        return Promise.resolve({ viewerAccess: 'workspace', businessUnits: [unit()] })
      if (args.path === '/business-units/bu-lyon' && args.method === 'PATCH')
        return Promise.resolve(unit({ capacityAvailableConsultants: 7 }))
      return Promise.reject(new Error(`unexpected ${args.path}`))
    })
    renderView(<BusinessUnitAdminView />)

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Modifier la fiche — Agence Lyon' }))
    const capacityInput = await screen.findByLabelText(/Consultants disponibles — Agence Lyon/)
    await user.clear(capacityInput)
    await user.type(capacityInput, '7')
    await user.click(screen.getByRole('button', { name: 'Enregistrer — Agence Lyon' }))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith({
        path: '/business-units/bu-lyon',
        method: 'PATCH',
        body: {
          name: 'Agence Lyon',
          territory: 'Auvergne-Rhône-Alpes',
          leadUserId: null,
          capacityAvailableConsultants: 7,
          quarterObjective: 'Signer deux nouveaux comptes industriels',
          consultantCount: 42,
          teamSize: 4,
          portfolioNote: 'Grands comptes industriels',
        },
      }),
    )
  })

  it('ARCHIVER envoie le statut seul, RÉACTIVER le rend — on archive, on ne supprime pas', async () => {
    apiFetch.mockImplementation((args: { path: string; method?: string; body?: unknown }) => {
      if (args.path === '/business-units' && !args.method)
        return Promise.resolve({
          viewerAccess: 'workspace',
          businessUnits: [unit(), unit({ id: 'bu-grenoble', name: 'Agence Grenoble', status: 'archived' })],
        })
      if (args.method === 'PATCH') return Promise.resolve(unit())
      return Promise.reject(new Error(`unexpected ${args.path}`))
    })
    renderView(<BusinessUnitAdminView />)

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Archiver — Agence Lyon' }))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith({
        path: '/business-units/bu-lyon',
        method: 'PATCH',
        body: { status: 'archived' },
      }),
    )
    expect(screen.getByText('Archivé')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Réactiver — Agence Grenoble' }))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith({
        path: '/business-units/bu-grenoble',
        method: 'PATCH',
        body: { status: 'active' },
      }),
    )
  })

  it('« Ajouter un périmètre » ouvre sa fenêtre et crée par POST /business-units', async () => {
    apiFetch.mockImplementation((args: { path: string; method?: string; body?: unknown }) => {
      if (args.path === '/business-units' && !args.method)
        return Promise.resolve({ viewerAccess: 'workspace', businessUnits: [unit()] })
      if (args.path === '/business-units' && args.method === 'POST') return Promise.resolve(unit({ name: 'Pôle Data' }))
      return Promise.reject(new Error(`unexpected ${args.path}`))
    })
    renderView(<BusinessUnitAdminView />)

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Ajouter un périmètre' }))
    await user.type(await screen.findByLabelText('Nom — nouveau périmètre'), 'Pôle Data')
    await user.click(screen.getByRole('button', { name: 'Enregistrer — nouveau périmètre' }))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/business-units',
          method: 'POST',
          body: expect.objectContaining({ name: 'Pôle Data' }),
        }),
      ),
    )
  })

  it('SAIT DIRE NON — sans `team:manage`, le tableau se lit, aucun geste n’est proposé', async () => {
    mockRole = 'sales'
    serve({ viewerAccess: 'workspace', businessUnits: [unit()] })
    renderView(<BusinessUnitAdminView />)

    expect(await screen.findByText('Agence Lyon')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Modifier/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Archiver/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ajouter un périmètre' })).toBeNull()
    expect(screen.getByText(/5 consultants disponibles/)).toBeInTheDocument()
  })
})
