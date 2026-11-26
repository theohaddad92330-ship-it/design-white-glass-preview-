import { DEFAULT_STAGE_LABELS } from '@bellum/contracts'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { Account, ProjectRow } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { TabProjects } from './TabProjects'

/**
 * #2124.1/.2/.3/.5/.9/.10/.12 (lot M1-9) — le résumé compact « Opportunités
 * actives / Besoins confirmés / Projets plausibles » dans la section
 * Opportunités, et son action « Qualifier ce projet plausible » qui réutilise
 * l'écriture EXISTANTE (`PATCH /projects/:id/stage`, déjà utilisée par le
 * Kanban) — pas de nouvelle route.
 *
 * ⚠️ Le libellé d'un projet apparaît maintenant à DEUX endroits légitimes —
 * le résumé compact et le tableau détaillé, deux FORMES différentes du même
 * projet. Les assertions se scopent donc au bucket (`data-testid`) plutôt que
 * de chercher le texte sur toute la page.
 */
const mockFetch = vi.fn((args: { path: string; method?: string; body?: unknown }) => {
  if (args.path.startsWith('/projects?')) return Promise.resolve(ROWS)
  if (args.path === '/workspaces/members') return Promise.resolve([])
  if (/\/projects\/.+\/stage$/.test(args.path)) return Promise.resolve({ project: {}, effects: [] })
  return Promise.resolve(null)
})
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: [{ path: string; method?: string; body?: unknown }]) => mockFetch(...args),
}))

const ACCOUNT = { id: 'acc-1', company_name: 'ACME' } as Account

let ROWS: ProjectRow[] = []

const row = (over: Partial<ProjectRow> = {}): ProjectRow =>
  ({
    id: 'p-1',
    account_id: 'acc-1',
    company_name: 'ACME',
    sector: null,
    logo_url: null,
    website: null,
    kind: 'program',
    label: 'Refonte SI',
    detail: null,
    offer: null,
    source: null,
    confidence: null,
    urgency: null,
    stage: 'qualified',
    stage_entered_at: new Date().toISOString(),
    owner_id: null,
    expected_close_on: null,
    closed_at: null,
    outcome: null,
    access_mode: null,
    loss_reason: null,
    first_detected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    amount_cents: null,
    ...over,
  }) as ProjectRow

async function mount(rows: ProjectRow[]) {
  mockFetch.mockClear()
  ROWS = rows
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  renderWithRouter(
    <QueryClientProvider client={client}>
      <TabProjects account={ACCOUNT} />
    </QueryClientProvider>,
  )
  // Attend un repère STABLE et non ambigu avant d'interroger les buckets.
  await screen.findByTestId('linked-objects-summary-active')
}

describe('TabProjects — résumé des objets liés (#2124)', () => {
  // #3918 (R20) — Société Générale (compte archivé) : aucune affaire gagnée/perdue/en sommeil lisible,
  // seulement « Opportunités actives (0) ». Les affaires closes se lisent, avec issue et date.
  it('#3918 — les affaires closes sont lisibles avec leur issue et leur date', async () => {
    await mount([
      row({ id: 'p-lost', label: 'Refonte data perdue', stage: 'lost', closed_at: '2026-03-04T10:00:00Z' }),
      row({ id: 'p-won', label: 'TMA signée', stage: 'won', closed_at: '2026-01-15T10:00:00Z' }),
      row({ id: 'p-sleep', label: 'Cloud en sommeil', stage: 'dormant', stage_entered_at: '2026-02-01T10:00:00Z' }),
    ])
    const past = within(screen.getByTestId('linked-objects-summary-past'))
    expect(past.getByText(/Affaires passées \(3\)/)).toBeInTheDocument()
    expect(past.getByText('Refonte data perdue')).toBeInTheDocument()
    expect(past.getByText(/Perdu/)).toBeInTheDocument()
    // Le libellé vient du catalogue (« Gagnée » depuis Théo C, c141) — jamais la clé brute `won`.
    expect(past.getByText(new RegExp(DEFAULT_STAGE_LABELS.won.fr))).toBeInTheDocument()
    expect(past.getByText(/En sommeil/)).toBeInTheDocument()
    expect(past.getAllByText(/2026/).length).toBe(3)
  })

  it('#3918 — aucune affaire passée : pas de section, jamais « (0) »', async () => {
    await mount([row({ id: 'p-q', label: 'Qualifié', stage: 'qualified' })])
    expect(screen.queryByTestId('linked-objects-summary-past')).not.toBeInTheDocument()
  })

  /**
   * #2115.23 — LE SEAU « BESOINS CONFIRMÉS » N'EST PLUS ICI.
   *
   * Il a rejoint sa propre sous-partie de la section Opportunités (`TabNeeds`),
   * qui la promettait, et il en a été RETIRÉ ici : rien n'apparaît deux fois
   * sous la même forme avec le même contenu. Ce test vérifie donc DEUX choses —
   * que les deux seaux restants classent juste, et que l'étape `confirmed` ne
   * ressort dans AUCUN des deux (elle n'a pas été reversée dans « actives » au
   * passage, ce qui aurait gonflé le seau d'à côté en silence).
   */
  it('classe les projets en deux buckets par étape, et jamais dans deux à la fois', async () => {
    await mount([
      row({ id: 'p-detected', label: 'Détecté', stage: 'detected' }),
      row({ id: 'p-confirmed', label: 'Confirmé', stage: 'confirmed' }),
      row({ id: 'p-qualified', label: 'Qualifié', stage: 'qualified' }),
      // Un signal n'entre dans AUCUN bucket : ce n'est pas un projet.
      row({ id: 'p-signal', label: 'Signal seul', kind: 'signal', stage: 'detected' }),
    ])

    const plausible = within(screen.getByTestId('linked-objects-summary-plausible'))
    const active = within(screen.getByTestId('linked-objects-summary-active'))

    expect(plausible.getByText(/Projets plausibles \(1\)/)).toBeInTheDocument()
    expect(plausible.getByText('Détecté')).toBeInTheDocument()
    expect(active.getByText(/Opportunités actives \(1\)/)).toBeInTheDocument()
    expect(active.getByText('Qualifié')).toBeInTheDocument()

    // #2115.23 — le seau des besoins confirmés a déménagé : il n'est plus rendu
    // ici, et son contenu n'a été reversé dans aucun des deux autres.
    expect(screen.queryByTestId('linked-objects-summary-confirmed')).not.toBeInTheDocument()
    expect(plausible.queryByText('Confirmé')).not.toBeInTheDocument()
    expect(active.queryByText('Confirmé')).not.toBeInTheDocument()

    // Le signal n'apparaît dans AUCUN des deux buckets.
    expect(plausible.queryByText('Signal seul')).not.toBeInTheDocument()
    expect(active.queryByText('Signal seul')).not.toBeInTheDocument()
  })

  it('« Ouvrir dans le Pipe » ouvre le dossier DU PROJET de la ligne, sur CHAQUE ligne (#2124.10, #3683.1)', async () => {
    await mount([row({ id: 'p-1', label: 'Refonte SI', stage: 'qualified' })])
    const link = screen.getByRole('link', { name: /Ouvrir dans le Pipe/ })
    // #3683.6 — l'objet s'ouvre ET le retour ramène à ce compte, onglet Signaux et besoins.
    expect(link).toHaveAttribute('href', '/projects/p-1?from=account&fromId=acc-1&fromTab=veille')
  })

  // #2150.39/.54 — même porte que « Besoin > Contacts client » (TabNeeds),
  // sur CHAQUE ligne : un projet actif ou plausible mène AUSSI à l'annuaire
  // canonique filtré sur le compte, jamais une copie locale de ses contacts.
  it('« Contacts client » ouvre l’annuaire filtré sur le compte, sur CHAQUE ligne (#2150.54)', async () => {
    await mount([row({ id: 'p-1', label: 'Refonte SI', stage: 'qualified' })])
    const link = screen.getByRole('link', { name: 'Contacts client' })
    expect(link).toHaveAttribute('href', '/contacts?company=ACME')
  })

  // ⚠️ LE TEST QUI SAIT DIRE NON — un projet sans porteur ne montre ni « 0 »
  // ni un identifiant brut.
  it('sans porteur attribué, la ligne ne montre ni identifiant ni zéro (#2124.5)', async () => {
    await mount([row({ id: 'p-1', label: 'Refonte SI', owner_id: null })])
    expect(screen.queryByText(/^0$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^[0-9a-f-]{36}$/)).not.toBeInTheDocument()
  })

  it('« Qualifier ce projet plausible » ÉCRIT via le chemin EXISTANT (PATCH /projects/:id/stage) (#2124.12)', async () => {
    await mount([row({ id: 'p-plausible', label: 'Piste détectée', stage: 'potential' })])

    fireEvent.click(screen.getByRole('button', { name: /Qualifier ce projet plausible/ }))

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/projects/p-plausible/stage',
          method: 'PATCH',
          body: expect.objectContaining({ stage: 'qualified' }),
        }),
      ),
    )
  })
})
