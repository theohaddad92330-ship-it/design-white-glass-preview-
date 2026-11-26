import type { ReactElement } from 'react'
import type { BusinessUnitList, BusinessUnitView, EsnAnswers } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { SessionContext, type SessionContextValue } from '@/features/auth/session-context'

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

const { MyBusinessUnitsSection } = await import('./MyBusinessUnitsSection')

const ANSWERS = {
  company_locations: [],
  geo_zones: [],
  remote_and_travel_scope: [],
  zone_capability_status: [],
} as unknown as EsnAnswers

// #2847 — `QuestionField` (câblé par le nouveau bloc territoire) descend
// jusqu'à `useSession()` via `CrmVocabularyHint` : ce test rendait déjà sans
// `SessionContext`, ce que la section n'exigeait pas avant #2847.
const session: SessionContextValue = { user: null, loading: false }

function renderSection(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <SessionContext.Provider value={session}>{ui}</SessionContext.Provider>
    </QueryClientProvider>,
  )
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
  portfolioNote: null,
  // #2005.5 (DÉCISION Louis 17/09, lot CP2) — non renseignés par défaut dans
  // cette fixture : `null`, jamais `0` ni une chaîne vide.
  capacityAvailableConsultants: null,
  quarterObjective: null,
  status: 'active',
  memberCount: 3,
  viewerIsMember: false,
  viewerAccessRequestStatus: null,
  ...over,
})

function serve(list: BusinessUnitList) {
  apiFetch.mockImplementation((args: { path: string; method?: string }) => {
    if (args.path === '/business-units' && !args.method) return Promise.resolve(list)
    if (args.method === 'POST') return Promise.resolve({ joined: true, requested: true })
    return Promise.reject(new Error(`unexpected ${args.path}`))
  })
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  apiFetch.mockReset()
  toastSuccess.mockReset()
  toastError.mockReset()
})

/**
 * #2118.9 — le geste « rejoindre une BU ».
 *
 * La dimension existe (`business_units` + `business_unit_members`) et les BU
 * PORTÉES partent au moteur, mais aucun écran ne permettait à un membre d'en
 * porter une : `POST /business-units/:id/join` n'avait aucun appelant web.
 */
describe('#2118.9 — MyBusinessUnitsSection', () => {
  it('nomme les périmètres que je porte, et propose de rejoindre les autres', async () => {
    serve({
      viewerAccess: 'workspace',
      businessUnits: [
        unit({ id: 'bu-banque', name: 'BU Banque & Assurance', kind: 'business_unit', viewerIsMember: true }),
        unit(),
      ],
    })
    renderSection(<MyBusinessUnitsSection answers={ANSWERS} />)

    expect(await screen.findByText('BU Banque & Assurance')).toBeInTheDocument()
    expect(screen.getByText('Tu en fais partie')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rejoindre Agence Lyon' })).toBeInTheDocument()
    // Un périmètre déjà porté ne se « rejoint » pas une seconde fois.
    expect(screen.queryByRole('button', { name: 'Rejoindre BU Banque & Assurance' })).toBeNull()
  })

  it('« Rejoindre » appelle la route pour SOI — sans identifiant de personne dans le corps', async () => {
    serve({ viewerAccess: 'workspace', businessUnits: [unit()] })
    renderSection(<MyBusinessUnitsSection answers={ANSWERS} />)

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Rejoindre Agence Lyon' }))

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith({ path: '/business-units/bu-lyon/join', method: 'POST' }))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Tu as rejoint Agence Lyon.'))
  })

  it('SAIT DIRE NON — un membre cloisonné ne voit pas « Rejoindre », il demande l’accès', async () => {
    serve({ viewerAccess: 'business_unit', businessUnits: [unit()] })
    renderSection(<MyBusinessUnitsSection answers={ANSWERS} />)

    const request = await screen.findByRole('button', { name: 'Demander l’accès à Agence Lyon' })
    expect(screen.queryByRole('button', { name: 'Rejoindre Agence Lyon' })).toBeNull()
    expect(screen.getByText(/Ton accès est limité à tes périmètres/)).toBeInTheDocument()

    await userEvent.setup().click(request)
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith({
        path: '/business-units/bu-lyon/access-request',
        method: 'POST',
        body: {},
      }),
    )
  })

  it('une demande en attente se DIT, sans second bouton', async () => {
    serve({ viewerAccess: 'business_unit', businessUnits: [unit({ viewerAccessRequestStatus: 'pending' })] })
    renderSection(<MyBusinessUnitsSection answers={ANSWERS} />)

    expect(await screen.findByText('Demande envoyée')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Agence Lyon/ })).toBeNull()
  })

  it('témoin — un périmètre ARCHIVÉ que je ne porte pas n’est pas proposé', async () => {
    serve({
      viewerAccess: 'workspace',
      businessUnits: [unit({ id: 'bu-old', name: 'Agence fermée', status: 'archived' }), unit()],
    })
    renderSection(<MyBusinessUnitsSection answers={ANSWERS} />)

    expect(await screen.findByText('Agence Lyon')).toBeInTheDocument()
    expect(screen.queryByText('Agence fermée')).toBeNull()
  })

  it('dit qu’aucun périmètre n’existe — jamais une liste blanche', async () => {
    serve({ viewerAccess: 'workspace', businessUnits: [] })
    renderSection(<MyBusinessUnitsSection answers={ANSWERS} />)

    expect(await screen.findByText('Ton espace n’a encore défini aucun périmètre.')).toBeInTheDocument()
  })

  it('dit qu’il n’a pas pu lire — jamais « aucun périmètre » sur un échec', async () => {
    apiFetch.mockRejectedValue(new Error('down'))
    renderSection(<MyBusinessUnitsSection answers={ANSWERS} />)

    expect(await screen.findByText(/Impossible de lire les périmètres/)).toBeInTheDocument()
    expect(screen.queryByText('Ton espace n’a encore défini aucun périmètre.')).toBeNull()
  })
})

/**
 * #2847 — recette 27/09 (réel) — NON PROUVÉ : « Mes périmètres » ne montrait
 * rien du modèle de territoire à 7 axes, lui-même invisible ailleurs dans le
 * produit. Les 7 axes doivent être NOMMÉS ici, et les trois qui ont déjà une
 * colonne (`company_locations`, `geo_zones`, `remote_and_travel_scope`,
 * `zone_capability_status`) doivent être ÉDITABLES.
 */
describe('#2847 — le modèle de territoire à 7 axes, dans « Mes périmètres »', () => {
  beforeEach(() => serve({ viewerAccess: 'workspace', businessUnits: [] }))

  it('nomme les 7 axes, y compris les 4 qui n’ont encore aucune colonne', async () => {
    renderSection(<MyBusinessUnitsSection answers={ANSWERS} />)

    for (const title of [
      'Agences, régions et pays',
      'Remote accepté et déplacements',
      'Secteurs locaux',
      'Comptes réservés et comptes groupe accessibles',
      'Règles territoriales',
      'Périmètre exclusif ou partagé',
      'Ce que tu peux couvrir',
    ]) {
      expect(await screen.findByText(title)).toBeInTheDocument()
    }
    // #2847 — « non renseigné » nommé pour les 4 axes SANS colonne — jamais silencieux, jamais 0.
    expect(screen.getAllByText(/^Non renseigné —/)).toHaveLength(4)
  })

  it('rend ÉDITABLE l’axe déjà posé comme colonne — un choix existant se voit sélectionné', async () => {
    renderSection(
      <MyBusinessUnitsSection answers={{ ...ANSWERS, remote_and_travel_scope: ['Remote accepté sans restriction'] }} />,
    )

    const option = await screen.findByRole('button', { name: /Remote accepté sans restriction/ })
    expect(option).toHaveAttribute('aria-pressed', 'true')
  })
})
