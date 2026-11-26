import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, screen, within } from '@testing-library/react'
import type { Account, ProjectRow } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { TabProjects } from './TabProjects'

/**
 * #1889 — « pouvoir filtrer, chercher […], ajouter de la profondeur dans cette
 * page ».
 *
 * Le retour est un SYMPTÔME : le besoin est de retrouver une ligne quand un
 * compte en porte vingt et une, et de voir ce qui appelle un geste. Ce que ce
 * test garde, c'est le bout de chaîne que la fonction pure ne peut pas prouver
 * — la barre d'outils est-elle BRANCHÉE sur la liste, et l'entête dit-il la
 * vérité quand la liste est resserrée.
 */
const mockFetch = vi.fn()
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockFetch(...args),
}))

const ACCOUNT = { id: 'acc-filters' } as Account

const row = (over: Partial<ProjectRow> = {}): ProjectRow =>
  ({
    id: 'p-1',
    account_id: 'acc-filters',
    company_name: 'Thales',
    sector: null,
    logo_url: null,
    website: null,
    kind: 'program',
    label: 'Refonte du référentiel',
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
  return screen.findByLabelText('Chercher un projet de ce compte')
}

const search = (input: HTMLElement, value: string) => fireEvent.change(input, { target: { value } })

// #2124 (lot M1-9) — le résumé compact des objets liés au compte affiche
// désormais AUSSI le libellé de chaque projet, au-dessus du tableau détaillé.
// Les assertions qui portent sur le TABLEAU (celui que la recherche resserre)
// se scopent donc à lui : deux occurrences légitimes du même libellé ne sont
// pas une régression.
const table = () => within(screen.getByRole('table'))

describe('TabProjects — chercher et resserrer (#1889)', () => {
  it('la recherche RESSERRE vraiment la liste — la barre est branchée', async () => {
    const input = await mount([
      row({ id: 'p-1', label: 'Refonte du référentiel' }),
      row({ id: 'p-2', label: 'Migration du socle' }),
    ])
    expect(table().getByText('Migration du socle')).toBeInTheDocument()

    search(input, 'refonte')

    expect(table().getByText('Refonte du référentiel')).toBeInTheDocument()
    expect(table().queryByText('Migration du socle')).not.toBeInTheDocument()
  })

  it('ANNONCE que la liste est resserrée, avec son dénominateur', async () => {
    // Sans cette phrase, l'entête compte deux projets au-dessus d'un tableau
    // qui n'en montre qu'un — deux chiffres qui se contredisent.
    const input = await mount([
      row({ id: 'p-1', label: 'Refonte du référentiel' }),
      row({ id: 'p-2', label: 'Migration du socle' }),
    ])
    expect(screen.queryByText(/sur 2 affichés/)).not.toBeInTheDocument()

    search(input, 'refonte')

    expect(screen.getByText('1 sur 2 affichés')).toBeInTheDocument()
  })

  it('un filtre sans résultat DIT que c’est le filtre — et rend le geste qui l’enlève', async () => {
    const input = await mount([row({ id: 'p-1', label: 'Refonte du référentiel' })])

    search(input, 'zzzz')

    expect(screen.getByText(/Aucun projet de ce compte sur ces critères/)).toBeInTheDocument()
    // La porte est un geste, pas une route : la matière est là, derrière le filtre.
    const clear = screen.getByRole('button', { name: /filtre/i })
    fireEvent.click(clear)
    expect(table().getByText('Refonte du référentiel')).toBeInTheDocument()
  })

  it('« Signaux » ne garde que les signaux, et la pastille porte son compte', async () => {
    await mount([
      row({ id: 'p-1', label: 'Un programme', kind: 'program' }),
      row({ id: 'p-2', label: 'Un signal', kind: 'signal', stage: 'detected' }),
    ])

    fireEvent.click(screen.getByRole('button', { name: /Signaux/ }))

    // Le filtre resserre le TABLEAU. Le résumé compact au-dessus, lui, ne
    // dépend pas de ce filtre local — c'est le programme qui continue d'y
    // apparaître (#2124) pendant que le tableau ne montre plus que le signal.
    expect(table().getByText('Un signal')).toBeInTheDocument()
    expect(table().queryByText('Un programme')).not.toBeInTheDocument()
  })

  it('montre la PROCHAINE ACTION — et se tait quand l’API ne l’a pas dite', async () => {
    await mount([
      row({ id: 'p-1', label: 'Avec tâche', next_action: { title: 'Rappeler Marie', due_on: '2026-09-20' } }),
      row({ id: 'p-2', label: 'Sans tâche', next_action: null }),
      row({ id: 'p-3', label: 'API muette', next_action: undefined }),
    ])

    expect(screen.getByText('Rappeler Marie')).toBeInTheDocument()
    expect(screen.getByText('Aucune tâche ouverte')).toBeInTheDocument()
    // ⚠️ Une seule ligne dit « aucune tâche » : la troisième se TAIT. Écrire la
    // même phrase sur une réponse d'API muette serait une affirmation.
    expect(screen.getAllByText('Aucune tâche ouverte')).toHaveLength(1)
  })
})
