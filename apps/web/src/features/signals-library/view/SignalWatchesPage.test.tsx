import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SessionUser, WatchesResponse } from '@bellum/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionContext } from '@/features/auth/session-context'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

/**
 * #4506 — « Mes veilles » au dessin de la maquette V22. Ce que ces tests doivent savoir dire NON :
 *  · l'ordre de la page (retour → en-tête → onglets → tableau) et les colonnes du tableau ;
 *  · au 4ᵉ compte suivi DISTINCT, la modale dit pourquoi, propose d'en retirer un et n'enregistre pas ;
 *  · la prochaine échéance est PRÉVUE (calculée côté serveur) et ABSENTE en pause : jamais une date inventée ;
 *  · un compte non suivi est NOMMÉ (« À suivre »), la veille ne relit que les comptes suivis ;
 *  · une veille d'un collègue se lit, elle ne se règle pas ;
 *  · « Supprimer » ARCHIVE (DELETE → l'API archive), et dit que les informations collectées restent.
 */

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('@/lib/api', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch,
}))

const { SignalWatchesContent } = await import('./SignalWatchesPage')

const A1 = '11111111-1111-4111-8111-111111111111'
const A2 = '22222222-2222-4222-8222-222222222222'
const W1 = '33333333-3333-4333-8333-333333333333'
const W2 = '44444444-4444-4444-8444-444444444444'
const W3 = '55555555-5555-4555-8555-555555555555'
const A3 = '66666666-6666-4666-8666-666666666666'
const A4 = '77777777-7777-4777-8777-777777777777'

const base = {
  natures: [],
  keywords: ['data'],
  cadence: '3_days' as const,
  starts_on: '2026-10-22',
  timezone: 'Europe/Paris',
  channel: 'in_app' as const,
  shared: false,
  created_at: '2026-10-20T08:00:00.000Z',
}

const WATCHES: WatchesResponse = {
  follow_max: 3, // #4267 — 3 par utilisateur
  followed_count: 2,
  items: [
    {
      ...base,
      id: W1,
      name: 'Transformation & Data',
      state: 'active',
      mine: true,
      accounts: [{ account_id: A1, company_name: 'Société Générale', followed: true }],
      next_run_on: '2026-10-22',
    },
    {
      ...base,
      id: W2,
      name: 'Actualités Orange',
      cadence: '5_days',
      state: 'paused',
      mine: true,
      accounts: [{ account_id: A2, company_name: 'Orange', followed: false }],
      next_run_on: null,
    },
    {
      ...base,
      id: W3,
      name: 'Veille de Camille',
      shared: true,
      state: 'active',
      mine: false,
      accounts: [{ account_id: A1, company_name: 'Société Générale', followed: true }],
      next_run_on: '2026-10-25',
    },
  ],
}

type Follow = { account_id: string; company_name: string }
const followItem = (account: Follow) => ({
  ...account,
  sector: null,
  followed_at: '2026-10-20T08:00:00.000Z',
  archived_at: null,
  archived_reason: null,
})

function mockApi(followed: Follow[] = [], accounts: Follow[] = []) {
  apiFetch.mockImplementation(async (args?: { path: string; method?: string }) => {
    const path = args?.path ?? ''
    if (path === '/signal-watches' && (args?.method ?? 'GET') === 'GET') return WATCHES
    if (path === '/account-follows') {
      return { max: 3, followed: followed.map(followItem), archived: [], suggestion: null, migration_notice: false }
    }
    if (path === '/watchlist/rules') return []
    if (path.startsWith('/accounts?')) {
      return {
        data: accounts.map(account => ({ id: account.account_id, company_name: account.company_name })),
        pagination: { hasNext: false, currentPage: 1, size: 50 },
      }
    }
    return {}
  })
}

function renderPage() {
  return renderWithRouter(
    <SessionContext.Provider value={{ user: { id: 'u-w' } as SessionUser, loading: false }}>
      <SignalWatchesContent />
    </SessionContext.Provider>,
    '/signals/watches',
  )
}

beforeEach(() => apiFetch.mockReset())

describe('Mes veilles — la page', () => {
  it('se lit dans l’ordre : retour → en-tête → onglets → tableau', async () => {
    mockApi()
    renderPage()
    await screen.findAllByTestId('watch-row')
    const order = [
      screen.getByRole('link', { name: 'Revenir à la bibliothèque' }),
      screen.getByTestId('watches-header'),
      screen.getByRole('tablist', { name: 'Ce que tu suis' }),
      screen.getByRole('table'),
    ]
    for (let index = 1; index < order.length; index += 1) {
      expect(order[index - 1]!.compareDocumentPosition(order[index]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    const header = screen.getByTestId('watches-header')
    expect(within(header).getByText('Veilles par compte')).toBeInTheDocument()
    expect(within(header).getByRole('heading', { level: 1, name: 'Les sujets que tu suis.' })).toBeInTheDocument()
    expect(
      within(header).getByText('Choisis tes comptes et la cadence. Les nouveaux signaux rejoindront la bibliothèque.'),
    ).toBeInTheDocument()
    expect(within(header).getByRole('button', { name: 'Configurer une veille' })).toBeInTheDocument()
  })

  it('le tableau a ses colonnes : Veille · Cadence · Prochaine échéance prévue · État', async () => {
    mockApi()
    renderPage()
    await screen.findAllByTestId('watch-row')
    const headers = screen.getAllByRole('columnheader').map(cell => cell.textContent)
    expect(headers.slice(0, 4)).toEqual(['Veille', 'Cadence', 'Prochaine échéance prévue', 'État'])
  })

  it('liste les veilles avec leur cadence, leur fuseau et leur échéance', async () => {
    mockApi()
    renderPage()
    const rows = await screen.findAllByTestId('watch-row')
    expect(rows).toHaveLength(3)
    expect(within(rows[0]!).getByText('Transformation & Data')).toBeInTheDocument()
    expect(within(rows[0]!).getByText('Tous les 3 jours')).toBeInTheDocument()
    expect(within(rows[0]!).getByText('Europe/Paris')).toBeInTheDocument()
    expect(within(rows[0]!).getByText('Active')).toBeInTheDocument()
  })

  it('en pause : aucune échéance inventée, état « En pause »', async () => {
    mockApi()
    renderPage()
    const rows = await screen.findAllByTestId('watch-row')
    expect(within(rows[1]!).getByText('En pause')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('Suspendue')).toBeInTheDocument()
    expect(within(rows[1]!).queryByText(/2026/)).not.toBeInTheDocument()
  })

  it('« À connecter » : un compte de la veille n’est plus suivi, et c’est nommé', async () => {
    mockApi()
    renderPage()
    const rows = await screen.findAllByTestId('watch-row')
    // La veille en pause dit « En pause » ; la règle « À connecter » se lit sur une veille active.
    expect(within(rows[1]!).getByText('Suis à nouveau Orange pour que cette veille le relise.')).toBeInTheDocument()
    expect(within(rows[0]!).queryByText(/Suis à nouveau/)).not.toBeInTheDocument()
  })

  it('la veille d’un collègue est en lecture seule : ni Régler, ni Pause, ni Supprimer', async () => {
    mockApi()
    renderPage()
    const rows = await screen.findAllByTestId('watch-row')
    expect(within(rows[2]!).queryByRole('button', { name: 'Régler' })).not.toBeInTheDocument()
    expect(within(rows[2]!).queryByRole('button', { name: /^Supprimer la veille/ })).not.toBeInTheDocument()
    expect(within(rows[2]!).getByText('Partagée')).toBeInTheDocument()
  })

  it('« Mettre en pause » écrit l’état de la veille', async () => {
    mockApi()
    renderPage()
    const rows = await screen.findAllByTestId('watch-row')
    fireEvent.click(within(rows[0]!).getByRole('button', { name: 'Mettre en pause' }))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith({
        path: `/signal-watches/${W1}/state`,
        method: 'PATCH',
        body: { state: 'paused' },
      }),
    )
  })

  it('« Supprimer » ARCHIVE la veille après la modale, qui dit que les signaux restent', async () => {
    mockApi()
    const user = userEvent.setup()
    renderPage()
    const rows = await screen.findAllByTestId('watch-row')
    await user.click(within(rows[0]!).getByRole('button', { name: 'Supprimer la veille Transformation & Data' }))
    const dialog = await screen.findByRole('dialog', { name: 'Supprimer cette veille ?' })
    expect(
      within(dialog).getByText('La cadence s’arrête. Les signaux déjà collectés restent dans la bibliothèque.'),
    ).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith({ path: `/signal-watches/${W1}`, method: 'DELETE' }))
  })

  it('dit que supprimer conserve l’existant, et mène aux préférences de notification', async () => {
    mockApi()
    renderPage()
    await screen.findAllByTestId('watch-row')
    expect(screen.getByText(/Supprimer une veille conserve les informations déjà collectées\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Préférences de notification' })).toHaveAttribute(
      'href',
      '/settings/notifications',
    )
  })

  it('l’onglet « Comptes suivis » montre n / 3 et propose « Ne plus suivre »', async () => {
    mockApi([{ account_id: A1, company_name: 'Société Générale' }])
    const user = userEvent.setup()
    renderPage()
    await screen.findAllByTestId('watch-row')
    await user.click(screen.getByRole('tab', { name: 'Comptes suivis' }))
    expect(screen.getByText('/ 3 comptes suivis')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ne plus suivre Société Générale' }))
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith({ path: `/accounts/${A1}/follow`, method: 'DELETE' }))
  })
})

describe('Configurer une veille — la modale et le plafond de 3 comptes suivis', () => {
  const FOLLOWED: Follow[] = [
    { account_id: A1, company_name: 'Société Générale' },
    { account_id: A2, company_name: 'Orange' },
    { account_id: A3, company_name: 'EDF' },
  ]

  it('porte Nom · Comptes suivis · Types d’actualités · Sujets · cadence, et Annuler / Enregistrer la veille', async () => {
    mockApi([], [{ account_id: A1, company_name: 'Société Générale' }])
    const user = userEvent.setup()
    renderPage()
    await screen.findAllByTestId('watch-row')
    await user.click(screen.getByRole('button', { name: 'Configurer une veille' }))
    const dialog = await screen.findByRole('dialog', { name: 'Configurer une veille' })
    expect(within(dialog).getByLabelText('Nom de la veille')).toBeInTheDocument()
    expect(within(dialog).getByRole('group', { name: 'Comptes suivis' })).toBeInTheDocument()
    expect(within(dialog).getByRole('group', { name: /Types d’actualités/ })).toHaveTextContent('aucun choix = tous')
    expect(within(dialog).getByLabelText(/^Sujets ou mots-clés · facultatif/)).toBeInTheDocument()
    expect(await within(dialog).findByText('Société Générale')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Annuler' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Enregistrer la veille' })).toBeInTheDocument()
  })

  it('une veille sur DEUX comptes s’enregistre en une veille multi-comptes', async () => {
    mockApi(
      [],
      [
        { account_id: A1, company_name: 'Société Générale' },
        { account_id: A2, company_name: 'Orange' },
      ],
    )
    const user = userEvent.setup()
    renderPage()
    await screen.findAllByTestId('watch-row')
    await user.click(screen.getByRole('button', { name: 'Configurer une veille' }))
    const dialog = await screen.findByRole('dialog', { name: 'Configurer une veille' })
    await user.type(within(dialog).getByLabelText('Nom de la veille'), 'Banque & télécom')
    const sg = (await within(dialog).findByText('Société Générale')).closest('label')!
    await user.click(within(sg).getByRole('checkbox'))
    await user.click(within(within(dialog).getByText('Orange').closest('label')!).getByRole('checkbox'))
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer la veille' }))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/signal-watches',
          method: 'POST',
          body: expect.objectContaining({ name: 'Banque & télécom', account_ids: [A1, A2], natures: [] }),
        }),
      ),
    )
  })

  it('au 4ᵉ compte DISTINCT, la modale dit pourquoi, propose d’en retirer un et n’enregistre pas', async () => {
    mockApi(FOLLOWED, [...FOLLOWED, { account_id: A4, company_name: 'Keolis' }])
    const user = userEvent.setup()
    renderPage()
    await screen.findAllByTestId('watch-row')
    await user.click(screen.getByRole('button', { name: 'Configurer une veille' }))
    const dialog = await screen.findByRole('dialog', { name: 'Configurer une veille' })
    await user.type(within(dialog).getByLabelText('Nom de la veille'), 'Transport')
    expect(within(dialog).queryByTestId('follow-cap')).not.toBeInTheDocument()
    await user.click(within((await within(dialog).findByText('Keolis')).closest('label')!).getByRole('checkbox'))

    const cap = within(dialog).getByTestId('follow-cap')
    expect(cap).toHaveTextContent('3 comptes suivis au maximum, toutes veilles confondues.')
    expect(within(dialog).getByRole('button', { name: 'Enregistrer la veille' })).toBeDisabled()
    await user.click(within(cap).getByRole('button', { name: 'Ne plus suivre EDF' }))
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith({ path: `/accounts/${A3}/follow`, method: 'DELETE' }))
    expect(apiFetch).not.toHaveBeenCalledWith(expect.objectContaining({ path: '/signal-watches', method: 'POST' }))
  })

  it('cocher un compte DÉJÀ suivi ne compte pas deux fois : 3 suivis + l’un d’eux s’enregistre', async () => {
    mockApi(FOLLOWED, FOLLOWED)
    const user = userEvent.setup()
    renderPage()
    await screen.findAllByTestId('watch-row')
    await user.click(screen.getByRole('button', { name: 'Configurer une veille' }))
    const dialog = await screen.findByRole('dialog', { name: 'Configurer une veille' })
    await user.type(within(dialog).getByLabelText('Nom de la veille'), 'EDF')
    await user.click(within((await within(dialog).findByText('EDF')).closest('label')!).getByRole('checkbox'))
    expect(within(dialog).queryByTestId('follow-cap')).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Enregistrer la veille' })).toBeEnabled()
  })
})
