import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { screen } from '@testing-library/react'
import type { Account, ProjectReadRow } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { TabProjects } from './TabProjects'

/**
 * #2119.2 — LE NIVEAU DE PREUVE ARRIVE ET S'AFFICHE.
 *
 * Le défaut mesuré au cadrage est le symétrique du défaut n°1 du dépôt :
 * `ProjectsService.withEvidence` calcule le niveau des quatre barreaux, l'API le
 * RENVOIE sur chaque ligne de `GET /projects?account_id=…` — et le web typait sa
 * réponse `ProjectRow[]`, ce qui effaçait le champ à la frontière. Zéro
 * occurrence de `EvidenceLevel` dans `apps/web/src`.
 *
 * Ces tests tiennent les trois états, qui ne se rendent PAS pareil, et le
 * troisième est celui qui fait dire NON : « non mesuré » n'est jamais le plus
 * bas des quatre niveaux.
 */
const mockFetch = vi.fn()
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockFetch(...args),
}))

const ACCOUNT = { id: 'acc-evidence' } as Account

const row = (over: Partial<ProjectReadRow> = {}): ProjectReadRow =>
  ({
    id: 'p-1',
    account_id: 'acc-evidence',
    company_name: 'Thales',
    sector: null,
    logo_url: null,
    website: null,
    kind: 'program',
    label: 'Reprise du socle data',
    detail: null,
    offer: null,
    source: null,
    confidence: null,
    urgency: null,
    stage: 'qualified',
    stage_entered_at: new Date().toISOString(),
    next_action: null,
    owner_id: null,
    expected_close_on: null,
    closed_at: null,
    outcome: null,
    loss_reason: null,
    first_detected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    estimated_amount: null,
    ...over,
  }) as ProjectReadRow

function render(rows: ProjectReadRow[]) {
  mockFetch.mockResolvedValue(rows)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderWithRouter(
    <QueryClientProvider client={client}>
      <TabProjects account={ACCOUNT} />
    </QueryClientProvider>,
  )
}

describe('TabProjects — le niveau de preuve est LU (#2119.2)', () => {
  it('affiche le niveau NOMMÉ que l’API attache à la ligne', async () => {
    render([
      row({
        evidence: {
          level: 'confirmed_demand',
          requirement: { fr: 'Une demande que quelqu’un a explicitement formulée.', en: 'A demand somebody voiced.' },
          missing: [],
        },
      }),
    ])

    expect(await screen.findByText('Besoin exprimé')).toBeInTheDocument()
  })

  it('un niveau `null` se dit « non mesuré », JAMAIS le plus bas des quatre', async () => {
    render([row({ evidence: { level: null, requirement: null, missing: ['no_dated_fact'] } })])

    expect(await screen.findByText('Niveau non mesuré')).toBeInTheDocument()
    // Le test qui sait dire NON : rendre `null` comme « Signal actuel » ferait
    // passer un fait daté et sourcé pour acquis alors qu'il n'y en a aucun.
    expect(screen.queryByText('Signal actuel')).not.toBeInTheDocument()
  })

  it('reste MUET quand l’API n’a pas dit (réponse antérieure au champ)', async () => {
    render([row()])

    // Le libellé paraît DEUX fois (le bandeau de résumé et le tableau) : on
    // attend la ligne, on n'en exige pas l'unicité — ce n'est pas le sujet.
    expect((await screen.findAllByText('Reprise du socle data')).length).toBeGreaterThan(0)
    expect(screen.queryByText('Niveau non mesuré')).not.toBeInTheDocument()
    expect(screen.queryByText('Besoin exprimé')).not.toBeInTheDocument()
  })
})
