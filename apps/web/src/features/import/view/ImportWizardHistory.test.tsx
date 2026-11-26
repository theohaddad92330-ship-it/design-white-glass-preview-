import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { ImportSession } from '../api'

/**
 * #1452.3 — « Imports précédents » rendait quatre champs sur huit, et
 * DISPARAISSAIT entièrement quand il était vide.
 *
 * Les deux défauts sont le même : un écran qui se tait. Un bloc absent ne dit
 * pas « tu n'as pas encore importé », il ne dit rien — et le lecteur en conclut
 * que la fonction n'existe pas, ou qu'elle est cassée. La distinction qui compte
 * ici est celle que tout ce dépôt défend : « je n'ai pas pu regarder » n'est pas
 * « il n'y a rien ».
 *
 * #1451.3 — `IMPORT_STEPS` n'avait aucun consommateur : les sept étapes
 * existaient au contrat et l'écran n'en montrait aucune.
 */

vi.mock('@tanstack/react-router', async () => {
  const { forwardRef } = await import('react')
  return {
    // ⚠️ L'entête porte un lien vers les intégrations et le lien contextuel du
    // copilote : le faux recopie le `search` dans le `href` et transmet la ref,
    // comme le vrai `Link`.
    Link: forwardRef<
      HTMLAnchorElement,
      { children?: React.ReactNode; to: string; search?: Record<string, unknown>; className?: string }
    >(({ children, to, search, ...rest }, ref) => (
      <a
        {...rest}
        ref={ref}
        href={search ? `${to}?${new URLSearchParams(Object.entries(search).map(([k, v]) => [k, String(v)]))}` : to}
      >
        {children}
      </a>
    )),
  }
})

vi.mock('../api', () => ({
  useImportSources: () => ({ data: [], isLoading: false, isError: false }),
  useImportSessions: vi.fn(),
  importApi: {},
}))

const { useImportSessions } = await import('../api')
const { ImportWizard } = await import('./ImportWizard')

type SessionsQuery = ReturnType<typeof useImportSessions>
const query = (state: { data?: unknown; isLoading: boolean; isError: boolean }) =>
  ({ refetch: () => undefined, ...state }) as unknown as SessionsQuery

const session = (over: Partial<ImportSession> = {}): ImportSession => ({
  id: 's-1',
  source: 'contacts_only',
  object_type: 'contact',
  state: 'applied',
  created_at: '2026-09-01T09:30:00.000Z',
  created_count: 12,
  updated_count: 3,
  processed_rows: 15,
  total_rows: 15,
  failed_at_row: null,
  resume_outcome: null,
  error: null,
  ...over,
})

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ImportWizard />
    </QueryClientProvider>,
  )
}

describe('#1452.3 — l’historique d’import NOMME le vide', () => {
  it('dit qu’il n’y a pas encore d’import, au lieu de s’effacer', () => {
    vi.mocked(useImportSessions).mockReturnValue(query({ data: [], isLoading: false, isError: false }))
    wrap()
    expect(screen.getByTestId('import-history-empty')).toBeTruthy()
    // L'entête reste : c'est lui qui dit que l'historique EXISTE.
    expect(screen.getByText('Imports précédents')).toBeTruthy()
  })

  it('distingue « je n’ai pas pu regarder » de « il n’y en a pas »', () => {
    vi.mocked(useImportSessions).mockReturnValue(query({ data: undefined, isLoading: false, isError: true }))
    wrap()
    expect(screen.getByText(/je n’ai pas pu regarder/i)).toBeTruthy()
    expect(screen.queryByTestId('import-history-empty')).toBeNull()
  })

  it('distingue « en cours » de « rien »', () => {
    vi.mocked(useImportSessions).mockReturnValue(query({ data: undefined, isLoading: true, isError: false }))
    wrap()
    expect(screen.getByText(/récupère tes imports précédents/i)).toBeTruthy()
    expect(screen.queryByTestId('import-history-empty')).toBeNull()
  })
})

describe('#1452.3 — l’historique rend les champs que l’entité porte', () => {
  it('dit QUAND, et sur combien de lignes', () => {
    vi.mocked(useImportSessions).mockReturnValue(query({ data: [session()], isLoading: false, isError: false }))
    wrap()
    const meta = screen.getByTestId('import-history-meta').textContent ?? ''
    expect(meta).toMatch(/2026/)
    expect(meta).toMatch(/15/)
  })

  it('n’écrit jamais « 0 » sur un nombre de lignes non enregistré', () => {
    vi.mocked(useImportSessions).mockReturnValue(
      query({ data: [session({ processed_rows: null, total_rows: null })], isLoading: false, isError: false }),
    )
    wrap()
    const meta = screen.getByTestId('import-history-meta').textContent ?? ''
    expect(meta).not.toMatch(/0 ligne/)
    expect(meta).toMatch(/2026/)
  })

  it('laisse « où il s’est arrêté » parler seul sur un import interrompu', () => {
    // Loi 4 : rien n'apparaît deux fois sous la même forme avec le même contenu.
    vi.mocked(useImportSessions).mockReturnValue(
      query({
        data: [session({ state: 'partial', processed_rows: 4000, total_rows: 17000, resume_outcome: 'failed' })],
        isLoading: false,
        isError: false,
      }),
    )
    wrap()
    expect(screen.getByTestId('import-stopped-line')).toBeTruthy()
    expect(screen.getByTestId('import-history-meta').textContent ?? '').not.toMatch(/4000/)
  })
})

describe('#1451.3 — les sept étapes du contrat sont à l’écran', () => {
  it('les nomme toutes, et dit où on en est', () => {
    vi.mocked(useImportSessions).mockReturnValue(query({ data: [], isLoading: false, isError: false }))
    wrap()
    for (const label of ['Choisir la source', 'Déposer', 'Reconnaître', 'Normaliser', 'Dédoublonner', 'Simuler']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
    expect(screen.getByText('0 étape(s) faite(s) sur 7')).toBeTruthy()
  })

  it('Théo B c4 — quatre temps numérotés (Source · Colonnes · Vérification · Résultat) portent les sept étapes', () => {
    vi.mocked(useImportSessions).mockReturnValue(query({ data: [], isLoading: false, isError: false }))
    const { container } = wrap()
    const phases = [...container.querySelectorAll('[data-phase]')]
    expect(phases.map(phase => phase.getAttribute('data-phase'))).toEqual(['source', 'columns', 'check', 'result'])
    expect(phases[0]).toHaveTextContent('Source')
    expect(phases[0]?.getAttribute('data-status')).toBe('current')
    expect(phases[2]).toHaveTextContent('Vérification')
    expect(phases[2]).toHaveTextContent('Normaliser')
    expect(phases[2]).toHaveTextContent('Simuler')
    expect(phases[3]?.getAttribute('data-status')).toBe('todo')
  })

  it('marque la première étape comme celle en cours', () => {
    vi.mocked(useImportSessions).mockReturnValue(query({ data: [], isLoading: false, isError: false }))
    wrap()
    expect(screen.getByText('Choisir la source').getAttribute('aria-current')).toBe('step')
  })
})

describe('#3666.3 / #3666.6 — l’historique dit l’état de l’import et son palier', () => {
  const show = (over: Partial<ImportSession>) => {
    vi.mocked(useImportSessions).mockReturnValue(query({ data: [session(over)], isLoading: false, isError: false }))
    wrap()
  }

  it('fichier reçu ≠ import terminé : un brouillon dit que rien n’est écrit', () => {
    show({ state: 'draft', created_count: 0, updated_count: 0 })
    expect(screen.getByText('En attente')).toBeTruthy()
    expect(screen.getByTestId('import-stage').textContent).toMatch(/rien n’est encore écrit/)
  })

  it('un import appliqué est « Terminée » et dit que les lignes sont écrites', () => {
    show({ state: 'applied' })
    expect(screen.getByText('Terminée')).toBeTruthy()
    expect(screen.getByTestId('import-stage').textContent).toMatch(/Lignes écrites/)
  })

  it('#3666.6 — écrit = exploitable par Laura : le troisième palier n’apparaît que quand des lignes sont écrites', () => {
    show({ state: 'applied' })
    expect(screen.getByTestId('import-readable').textContent).toMatch(/Laura/)
  })

  it('#3666.6 — un brouillon, un échec : aucun palier « exploitable par Laura »', () => {
    show({ state: 'draft', created_count: 0, updated_count: 0 })
    expect(screen.queryByTestId('import-readable')).toBeNull()
  })

  it('un import arrêté en route est « Partielle » ; un échec n’affirme aucune écriture', () => {
    show({ state: 'partial', resume_outcome: 'failed' })
    expect(screen.getByText('Partielle')).toBeTruthy()
  })

  it('un import échoué est « Interrompue » et ne prétend aucun palier', () => {
    show({ state: 'failed' })
    expect(screen.getByText('Interrompue')).toBeTruthy()
    expect(screen.queryByTestId('import-stage')).toBeNull()
  })
})
