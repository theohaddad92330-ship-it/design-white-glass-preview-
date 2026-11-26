import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { screen } from '@testing-library/react'
import type { Account, ProjectRow } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { TabProjects } from './TabProjects'

/**
 * #1889 — LA COLONNE « CONFIANCE », TROUVÉE EN RECETTE LE 11/09/2026.
 *
 * Sur le dossier THALES en production, un projet repris d'un fichier affichait
 * « provenance.confidence.null » : la clé de traduction elle-même, au milieu
 * d'un tableau que le commercial lit. Un projet importé n'a pas de confiance —
 * `confidence` est `string | null` au contrat — et `${null}` dans un gabarit
 * devient la chaîne « null », qu'i18next ne connaît pas et rend telle quelle.
 *
 * La colonne `kind` voisine tenait déjà la règle (« traduire ce qui est dans
 * l'échelle, rendre tel quel ce qui n'y est pas »). Une règle écrite pour un cas
 * et pas pour son jumeau : c'est le défaut, et ces trois tests sont ses trois
 * états — dans l'échelle, hors échelle, absent.
 */
const mockFetch = vi.fn()
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockFetch(...args),
}))

const ACCOUNT = { id: 'acc-confidence' } as Account

const row = (over: Partial<ProjectRow> = {}): ProjectRow =>
  ({
    id: 'p-1',
    account_id: 'acc-confidence',
    company_name: 'Thales',
    sector: null,
    logo_url: null,
    website: null,
    kind: 'program',
    label: 'Reprise du socle data',
    detail: null,
    offer: null,
    source: null,
    confidence: 'high',
    urgency: null,
    stage: 'qualified',
    stage_entered_at: new Date().toISOString(),
    next_action: null,
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
  mockFetch.mockReset()
  mockFetch.mockResolvedValue(rows)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  renderWithRouter(
    <QueryClientProvider client={client}>
      <TabProjects account={ACCOUNT} />
    </QueryClientProvider>,
  )
  await screen.findByLabelText('Chercher un projet de ce compte')
}

describe('TabProjects — la colonne Confiance (#1889)', () => {
  it('n’écrit JAMAIS la clé de traduction quand la confiance est absente', async () => {
    await mount([row({ confidence: null })])

    expect(screen.queryByText(/provenance\.confidence/)).not.toBeInTheDocument()
    expect(screen.queryByText('null')).not.toBeInTheDocument()
  })

  it('traduit une confiance de l’échelle', async () => {
    await mount([row({ confidence: 'high' })])

    expect(screen.getByText('Confiance élevée')).toBeInTheDocument()
  })

  it('rend TELLE QUELLE une confiance stockée hors échelle — jamais une clé', async () => {
    // Le témoin du cas voisin : une valeur écrite plus tard (import CRM, RAG…)
    // reste lisible plutôt que d'être avalée par une clé introuvable.
    await mount([row({ confidence: 'à confirmer' })])

    expect(screen.getByText('à confirmer')).toBeInTheDocument()
    expect(screen.queryByText(/provenance\.confidence/)).not.toBeInTheDocument()
  })
})
