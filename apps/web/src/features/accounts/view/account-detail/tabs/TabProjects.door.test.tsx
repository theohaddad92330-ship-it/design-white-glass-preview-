import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Account, ProjectRow } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { TabProjects } from './TabProjects'

/**
 * La porte ouverte par une relation, sur l'écran où elle EXISTE vraiment.
 *
 * ⚠️ Ce test est né d'une recette, et il faut dire ce qu'elle a trouvé : le
 * badge livré au lot 8 vivait sur le pipe (`PipelineBoard`), qui filtre sur
 * `isPipelineStage()`. Or `openDoorFromMove` insère la porte à `stage:
 * 'detected'` ET `kind: 'signal'` — deux valeurs que le pipe écarte. Le badge
 * était donc INATTEIGNABLE pour une vraie porte, et son test passait au vert
 * parce qu'il fabriquait un projet à `stage: 'qualified'`.
 *
 * La porte est en revanche bel et bien LISTÉE dans l'onglet Projets d'un
 * dossier de compte (le tableau itère sur toutes les lignes, signaux compris) —
 * simplement rien ne l'y distinguait des cent quatre-vingt-dix autres signaux.
 * C'est exactement le défaut que le lot 8 voulait corriger, déplacé d'un écran.
 */

const mockFetch = vi.fn()
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockFetch(...args),
}))

const ACCOUNT = { id: 'acc-1' } as Account

const row = (over: Partial<ProjectRow> = {}): ProjectRow =>
  ({
    id: 'p-1',
    account_id: 'acc-1',
    company_name: 'ACME',
    sector: null,
    kind: 'signal',
    label: 'Signal quelconque',
    detail: null,
    offer: null,
    source: 'pain',
    confidence: 'high',
    urgency: null,
    stage: 'detected',
    stage_entered_at: new Date().toISOString(),
    owner_id: null,
    expected_close_on: null,
    closed_at: null,
    outcome: null,
    loss_reason: null,
    first_detected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    amount_cents: null,
    access_mode: null,
    ...over,
  }) as ProjectRow

async function renderWith(rows: ProjectRow[]) {
  mockFetch.mockResolvedValue(rows)
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  /**
   * ⚠️ Monté DANS un routeur depuis #1889 : la barre d'outils porte désormais un
   * `<Link>` vers l'écran d'import, et un `<Link>` hors `RouterProvider` fait
   * tomber tout le rendu (« useRouter must be used inside a RouterProvider »,
   * puis un arbre vide). Le `QueryClient` reste CELUI DU TEST, à l'intérieur :
   * celui de `renderWithRouter` est partagé entre fichiers, et un cache partagé
   * fait passer un test avec la réponse du précédent.
   */
  renderWithRouter(
    <QueryClientProvider client={client}>
      <TabProjects account={ACCOUNT} />
    </QueryClientProvider>,
  )
  await screen.findByText('Signal quelconque')
}

describe('TabProjects — la porte via une relation', () => {
  it('NOMME la porte, avec la forme EXACTE que la routine écrit (detected + signal)', async () => {
    await renderWith([
      row(),
      row({
        id: 'p-2',
        label: 'Marie Durand est passée chez ACME',
        access_mode: 'introduction_relation',
      }),
    ])

    // Le libellé DIT ce que c'est. Laisser croire à un besoin ferait préparer
    // un message qui parle de ce que le client n'a jamais demandé.
    expect(screen.getByText(/Porte via une relation/)).toBeInTheDocument()
    expect(screen.getByText(/pas encore une affaire/)).toBeInTheDocument()
  })

  it("ne marque QUE la porte — un signal ordinaire n'en porte pas la mention", async () => {
    await renderWith([row(), row({ id: 'p-3', label: 'Autre signal' })])
    expect(screen.queryByText(/Porte via une relation/)).not.toBeInTheDocument()
  })

  it("n'invente rien quand `access_mode` porte une AUTRE valeur", async () => {
    // Six autres modes d'accès existent au contrat. Un seul est une porte
    // ouverte par une relation ; les cinq indirects décrivent autre chose.
    await renderWith([row({ access_mode: 'rang2_soustraitance' })])
    expect(screen.queryByText(/Porte via une relation/)).not.toBeInTheDocument()
  })
})
