import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type {
  Account,
  AccountMissions,
  LegalContract,
  LegalContractLifecycle,
  LegalContractNoGoReason,
} from '@bellum/contracts'

/**
 * #2422.4 (épopée #2869, LAU-FINAL-136) — LE BLOC CONTRATS de l'onglet
 * Missions d'un dossier de compte.
 *
 * Fichier séparé de `TabMissions.test.tsx` : ce bloc appelle une SECONDE
 * route (`GET /delivery/accounts/:id/contracts`), et `mockFetch` de ce
 * dépôt répond au premier argument seul (`mockResolvedValue`), jamais par
 * route — les deux suites auraient sinon dû partager un seul mock répondant
 * aux deux formes, ce qui aurait rendu l'une ou l'autre illisible.
 */
const mockFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => mockFetch(...args) }))
vi.mock('@tanstack/react-router', () => ({
  // #4424.6 — la création d'une mission propose « Préparer le RDV » : le hook de création lit la navigation.
  useNavigate: () => vi.fn(),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

const { TabMissions } = await import('./TabMissions')

const ACCOUNT = { id: 'acc-1' } as Account

const MISSIONS_EMPTY: AccountMissions = {
  accountId: 'acc-1',
  canReadFinance: true,
  source: { kind: 'missions', href: '/missions?accountId=acc-1', label: 'Les missions de ce compte' },
  editable: false,
  active: [],
  past: [],
  placedConsultants: [],
  buying: null,
  notRenewed: [],
  paymentBehaviour: null,
  historicalInvoicedRevenueCents: null,
}

type ContractRow = LegalContract & {
  lifecycle: LegalContractLifecycle
  noGo: { missionId: string; missionLabel: string | null; reason: LegalContractNoGoReason }[]
}

function contract(over: Partial<ContractRow> = {}): ContractRow {
  return {
    id: 'ct-1',
    workspaceId: 'w-1',
    accountId: 'acc-1',
    type: 'framework',
    label: 'Contrat-cadre 2026',
    counterpartyName: 'BlaBlaCar',
    legalEntityId: null,
    legalEntityName: null,
    ownerId: null,
    ownerName: null,
    startsOn: '2026-01-01',
    endsOn: '2026-12-31',
    scope: null,
    tariffNote: null,
    volumeNote: null,
    capAmountCents: null,
    paymentTermsDays: null,
    paymentTermsBasis: null,
    noticeDays: null,
    autoRenew: false,
    documents: [],
    source: 'direct',
    status: 'signed',
    confidential: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lifecycle: 'active',
    noGo: [],
    ...over,
  }
}

function draw(contracts: ContractRow[] | 'error') {
  mockFetch.mockImplementation((args: { path: string }) => {
    if (args.path.includes('/contracts')) {
      return contracts === 'error' ? Promise.reject(new Error('boom')) : Promise.resolve(contracts)
    }
    return Promise.resolve(MISSIONS_EMPTY)
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TabMissions account={ACCOUNT} />
    </QueryClientProvider>,
  )
}

describe('TabMissions — #2422.4 le bloc Contrats', () => {
  it('un compte sans contrat le DIT, jamais une ligne inventée', async () => {
    draw([])
    expect(await screen.findByText('Aucun contrat enregistré sur ce compte.')).toBeInTheDocument()
  })

  it('rend au moins un compte, son type, sa contrepartie et son cycle de vie DÉRIVÉ', async () => {
    draw([contract()])
    expect(await screen.findByText('Contrat-cadre 2026')).toBeInTheDocument()
    expect(screen.getByText(/Contrat-cadre · BlaBlaCar/)).toBeInTheDocument()
    expect(screen.getByText('Actif')).toBeInTheDocument()
  })

  it('nomme le propriétaire quand il est renseigné', async () => {
    draw([contract({ ownerName: 'Ada Lovelace' })])
    expect(await screen.findByText('Porté par Ada Lovelace')).toBeInTheDocument()
  })

  it('ne nomme AUCUN propriétaire quand il n’est pas renseigné — on n’affiche pas ce qu’on n’a pas', async () => {
    draw([contract({ ownerName: null })])
    await screen.findByText('Contrat-cadre 2026')
    expect(screen.queryByText(/Porté par/)).not.toBeInTheDocument()
  })

  it('un contrat `draft` avec des dates passées reste `draft` à l’écran — jamais lu actif', async () => {
    draw([contract({ status: 'draft', lifecycle: 'draft' })])
    expect(await screen.findByText('Brouillon')).toBeInTheDocument()
  })

  it('une lecture en échec le DIT, jamais un état vide muet', async () => {
    draw('error')
    expect(await screen.findByText('Les contrats n’ont pas pu être lus.')).toBeInTheDocument()
  })

  it('#2422.11 — signale le NO-GO, PAR MISSION nommée, jamais un compte agrégé', async () => {
    draw([
      contract({
        noGo: [{ missionId: 'm-1', missionLabel: 'Mission BlaBlaCar', reason: 'wrong_legal_entity' }],
      }),
    ])
    expect(
      await screen.findByText('Mission BlaBlaCar facture sous une autre société que celle nommée par ce contrat.'),
    ).toBeInTheDocument()
  })

  it('#2422.11 — ne signale RIEN quand aucun NO-GO n’est détecté', async () => {
    draw([contract()])
    await screen.findByText('Contrat-cadre 2026')
    expect(screen.queryByText(/facture sous une autre société/)).not.toBeInTheDocument()
  })

  it('#2422.10 — une pièce dit sa version, sa signature, son expiration et sa portée quand elle est restreinte', async () => {
    draw([
      contract({
        documents: [
          {
            label: 'Contrat-cadre signé',
            url: null,
            version: 1,
            signedAt: null,
            expiresOn: null,
            visibility: 'workspace',
          },
          {
            label: 'Grille tarifaire',
            url: null,
            version: 2,
            signedAt: '2026-03-01',
            expiresOn: '2026-12-31',
            visibility: 'finance',
          },
        ],
      }),
    ])
    expect(await screen.findByText('Contrat-cadre signé · v1')).toBeInTheDocument()
    expect(screen.getByText('non signée')).toBeInTheDocument()
    expect(screen.getByText('Grille tarifaire · v2')).toBeInTheDocument()
    expect(screen.getByText(/signée le/)).toBeInTheDocument()
    expect(screen.getByText(/expire le/)).toBeInTheDocument()
    expect(screen.getByText('réservée à la finance')).toBeInTheDocument()
    // Une pièce ouverte à l'équipe ne porte AUCUNE mention de portée : pas de mur de badges.
    expect(screen.queryByText('ouverte à l’équipe')).not.toBeInTheDocument()
  })

  it('#2422.10 — un contrat sans pièce n’affiche aucune ligne de pièce', async () => {
    draw([contract({ documents: [] })])
    await screen.findByText('Contrat-cadre 2026')
    expect(screen.queryByText(/ · v\d/)).not.toBeInTheDocument()
  })
})

describe('TabMissions — #2422.10 le dépôt d’une pièce', () => {
  it('déposer une pièce POSTE le libellé et la portée par défaut (équipe), sans numéro de version', async () => {
    draw([contract()])
    fireEvent.click(await screen.findByRole('button', { name: 'Déposer une pièce' }))
    fireEvent.change(screen.getByLabelText('Libellé de la pièce'), { target: { value: 'Avenant 1' } })
    mockFetch.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Déposer' }))
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    const call = mockFetch.mock.calls.find(c => c[0].method === 'POST')?.[0]
    expect(call.path).toBe('/delivery/accounts/acc-1/contracts/ct-1/documents')
    expect(call.body).toEqual({ label: 'Avenant 1', visibility: 'workspace' })
    expect(call.body).not.toHaveProperty('version')
  })

  it('un libellé vide ne se dépose pas', async () => {
    draw([contract()])
    fireEvent.click(await screen.findByRole('button', { name: 'Déposer une pièce' }))
    expect(screen.getByRole('button', { name: 'Déposer' })).toBeDisabled()
  })
})

/**
 * #2422.6 (épopée #2869, lot R24 07/10/2026) — « Demander une pièce » : le
 * lien signé à portée limitée, pour un contact externe sans compte BellumAI.
 */
describe('TabMissions — #2422.6 demander une pièce (lien signé)', () => {
  const MISSION_ROW = {
    missionId: 'm-1',
    label: 'Mission Paris',
    roleTitle: null,
    startedOn: null,
    endsOn: null,
    status: 'active',
    consultants: [],
    businessManagerName: null,
    clientManagerName: null,
    daysRemaining: null,
    renewal: 'unknown',
    soldDailyRateCents: null,
    marginPercent: null,
    nextAction: 'none',
  } as unknown as AccountMissions['active'][number]

  function drawWithMission(contracts: ContractRow[]) {
    mockFetch.mockImplementation((args: { path: string; method?: string }) => {
      if (args.path.includes('/upload-links')) {
        if (args.method === 'POST') return Promise.resolve({ link: { id: 'l-1' }, url: 'https://x/depot-piece/t' })
        return Promise.resolve({ links: [] })
      }
      if (args.path.includes('/contracts')) return Promise.resolve(contracts)
      return Promise.resolve({ ...MISSIONS_EMPTY, active: [MISSION_ROW] })
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
      <QueryClientProvider client={client}>
        <TabMissions account={ACCOUNT} />
      </QueryClientProvider>,
    )
  }

  it('le bouton est INERTE sans aucune mission sur le compte', async () => {
    draw([contract()])
    expect(await screen.findByRole('button', { name: 'Demander une pièce' })).toBeDisabled()
  })

  it('génère un lien pour la mission choisie — jamais pour un compte entier', async () => {
    drawWithMission([contract()])
    fireEvent.click(await screen.findByRole('button', { name: 'Demander une pièce' }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Mission concernée' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Mission Paris' }))
    mockFetch.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Générer le lien' }))
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    const call = mockFetch.mock.calls.find(c => c[0].method === 'POST')?.[0]
    expect(call.path).toBe('/delivery/accounts/acc-1/contracts/ct-1/upload-links')
    expect(call.body).toEqual({ missionId: 'm-1' })
  })
})
