import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account, PersonalAccessPath } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import accessEn from '@/i18n/locales/en/access.json'
import accessFr from '@/i18n/locales/fr/access.json'
import { TabAccess } from './TabAccess'

/**
 * #3403 — LA CARTE DES VOIES D'ACCÈS PERSONNELLES.
 *
 * Trois propriétés tenues ici :
 *  1. une voie sans instance ne rend AUCUNE ligne — la carte entière disparaît
 *     quand `personalPaths` est vide (doctrine « on n'affiche pas ce qu'on n'a
 *     pas ») ;
 *  2. #3403.14 — une relation NON vérifiée ne se lit jamais comme un accès
 *     garanti : le badge nomme la certitude, jamais un succès par défaut ;
 *  3. #3403.16 — le risque nommé s'affiche quand il existe, jamais inventé
 *     quand rien ne le justifie.
 */

const apiFetchMock = vi.mocked(apiFetch)

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return { ...actual, useNavigate: () => vi.fn() }
})

const ACCOUNT = {
  id: 'acc-pp-1',
  status: 'completed',
  created_at: '2026-08-01T09:00:00.000Z',
  last_analyzed_at: '2026-08-20T09:00:00.000Z',
} as Account

type Landscape = Record<string, unknown>

function landscape(personalPaths: PersonalAccessPath[]): Landscape {
  return {
    lock: { state: 'inconnu', fact: null },
    modes: [],
    cost: null,
    facts: [],
    entities: [],
    avoidGroupEntry: false,
    warning: null,
    community: null,
    question: null,
    barrier: null,
    addressability: null,
    accessLevel: 'inconnu',
    accessLevelFact: null,
    personalPaths,
  }
}

function mockLandscape(personalPaths: PersonalAccessPath[]) {
  apiFetchMock.mockImplementation(async ({ path }: { path: string }) => {
    if (path.endsWith('/market-context')) return null
    return landscape(personalPaths)
  })
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <TabAccess account={ACCOUNT} />
    </QueryClientProvider>,
  )
}

const VERIFIED_PATH: PersonalAccessPath = {
  id: 'link-1',
  voie: 'ancien_collegue',
  subject: 'Jean Dupont',
  proof: 'Marie D.',
  observedAt: '2026-09-25T00:00:00.000Z',
  freshness: 'fresh',
  certainty: 'verified_access',
  risk: null,
  sourceKind: 'workspace_declared_link',
}

const PROBABLE_PATH: PersonalAccessPath = {
  id: 'partner-1',
  voie: 'esn_referencee',
  subject: 'Sopra Steria',
  proof: null,
  observedAt: '2026-08-01T00:00:00.000Z',
  freshness: 'fresh',
  certainty: 'historic_observation',
  risk: 'undeclared_detection',
  sourceKind: 'partner_registry_observed',
}

describe('les voies d’accès personnelles de l’onglet Accès', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
  })
  afterEach(cleanup)

  // #3777 (décision 13/10) — même composant, même prédicat que la liste Contacts.
  it('#3777 — le contact décideur porte la pastille « Décideur » ; un autre rôle ou un rôle inconnu, rien', async () => {
    mockLandscape([
      { ...VERIFIED_PATH, id: 'l-1', subject: 'Jean Dupont', decisionRole: 'economic' },
      { ...VERIFIED_PATH, id: 'l-2', subject: 'Paul Martin', decisionRole: 'technical' },
      { ...VERIFIED_PATH, id: 'l-3', subject: 'Sans Rôle', decisionRole: null },
      { ...PROBABLE_PATH },
    ])
    mount()

    await screen.findByText('Voies d’accès personnelles')
    expect(screen.getAllByText('Décideur')).toHaveLength(1)
  })

  it('aucune voie ⇒ la carte ne se rend PAS du tout', async () => {
    mockLandscape([])
    mount()

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled())
    expect(screen.queryByText('Voies d’accès personnelles')).not.toBeInTheDocument()
  })

  it('un accès vérifié affiche le libellé de la voie, le sujet et le badge « Accès vérifié »', async () => {
    mockLandscape([VERIFIED_PATH])
    mount()

    expect(await screen.findByText('Voies d’accès personnelles')).toBeInTheDocument()
    expect(screen.getByText('Ancien collègue')).toBeInTheDocument()
    expect(screen.getByText('Jean Dupont')).toBeInTheDocument()
    expect(screen.getByText('Accès vérifié')).toBeInTheDocument()
    expect(screen.getByText('Preuve : Marie D.')).toBeInTheDocument()
  })

  it('#3403.14 — une observation historique ne s’affiche jamais comme un accès garanti', async () => {
    mockLandscape([PROBABLE_PATH])
    mount()

    await screen.findByText('Voies d’accès personnelles')
    expect(screen.getByText('Historique observé')).toBeInTheDocument()
    expect(screen.queryByText('Accès vérifié')).not.toBeInTheDocument()
  })

  it('#3403.16 — le risque nommé s’affiche quand il existe', async () => {
    mockLandscape([PROBABLE_PATH])
    mount()

    await screen.findByText('Voies d’accès personnelles')
    expect(screen.getByText('Détecté automatiquement, jamais déclaré par quelqu’un de l’équipe.')).toBeInTheDocument()
  })

  it('un accès vérifié et frais ne porte AUCUNE mention de risque', async () => {
    mockLandscape([VERIFIED_PATH])
    mount()

    await screen.findByText('Voies d’accès personnelles')
    expect(screen.queryByText(/Non confirmé/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Détecté automatiquement/)).not.toBeInTheDocument()
    expect(screen.queryByText(/À revérifier/)).not.toBeInTheDocument()
  })

  it('#3403.12 — la source est nommée, la demande acceptable une fois par voie, l’action suit la certitude', async () => {
    mockLandscape([VERIFIED_PATH, PROBABLE_PATH])
    mount()

    await screen.findByText('Voies d’accès personnelles')
    expect(screen.getByText(/Déclaré par ton équipe · depuis le/)).toBeInTheDocument()
    expect(screen.getByText(/Source actuelle · depuis le/)).toBeInTheDocument()
    expect(screen.getByText(/Demande acceptable : un échange informel/)).toBeInTheDocument()
    expect(screen.getByText('Action : t’appuyer sur cette voie dès maintenant.')).toBeInTheDocument()
    expect(screen.getByText('Action : revérifier qu’elle tient encore, sinon ne pas l’utiliser.')).toBeInTheDocument()
  })

  it('a les mêmes clés en français et en anglais, pour les onze voies et les trois certitudes', () => {
    expect(Object.keys(accessEn.personalPaths.voie).sort()).toEqual(Object.keys(accessFr.personalPaths.voie).sort())
    expect(Object.keys(accessFr.personalPaths.voie)).toHaveLength(11)
    expect(Object.keys(accessEn.personalPaths.certainty).sort()).toEqual(
      Object.keys(accessFr.personalPaths.certainty).sort(),
    )
    for (const group of ['source', 'ask', 'action'] as const) {
      expect(Object.keys(accessEn.personalPaths[group]).sort()).toEqual(
        Object.keys(accessFr.personalPaths[group]).sort(),
      )
    }
    expect(Object.keys(accessFr.personalPaths.ask)).toHaveLength(11)
    expect(Object.keys(accessEn.personalPaths.risk).sort()).toEqual(Object.keys(accessFr.personalPaths.risk).sort())
  })

  it('#3403.12 — la chaleur déclarée se lit sur la ligne ; non déclarée, aucune ligne', async () => {
    mockLandscape([{ ...VERIFIED_PATH, warmth: 'close' }, PROBABLE_PATH])
    mount()

    await screen.findByText('Voies d’accès personnelles')
    expect(screen.getByText('Chaleur du lien : proche')).toBeInTheDocument()
    expect(screen.getAllByText(/Chaleur du lien/)).toHaveLength(1)
  })
})
