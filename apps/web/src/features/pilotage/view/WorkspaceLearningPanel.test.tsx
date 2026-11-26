import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectLearningRow } from '@bellum/contracts'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u-1' } }) }))

/** L'arbre de routes que CE navigateur connaît — voir `quality/lib/destinations`. */
let routesByPath: Record<string, unknown> = { '/projects/needs': true }

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string } & Record<string, unknown>) => (
    <a href={to} {...(rest as Record<string, string>)}>
      {children}
    </a>
  ),
  useRouter: () => ({ routesByPath }),
}))

import { WorkspaceLearningPanel } from './WorkspaceLearningPanel'

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const row = (over: Partial<ProjectLearningRow> = {}): ProjectLearningRow => ({
  sector: 'Banque',
  offer: 'Cloud',
  kind: 'pain',
  converted: 0,
  transformed: 0,
  obsolete: 0,
  ...over,
})

/**
 * Boucle d'apprentissage (§6). L'écran ne doit jamais faire passer un silence
 * pour une leçon : sans mouvement, il le DIT.
 */
describe('WorkspaceLearningPanel', () => {
  it('dit « rien encore » quand aucun besoin n’a été déplacé', async () => {
    apiFetch.mockResolvedValueOnce({ rows: [] })
    render(<WorkspaceLearningPanel />, { wrapper })
    await waitFor(() => expect(screen.getByText(/rien encore/i)).toBeInTheDocument())
  })

  it('affiche les comptages réels, secteur et offre', async () => {
    apiFetch.mockResolvedValueOnce({ rows: [row({ converted: 3, obsolete: 1 })] })
    render(<WorkspaceLearningPanel />, { wrapper })
    await waitFor(() => expect(screen.getByText('Banque · Cloud')).toBeInTheDocument())
    expect(screen.getByText('3 convertis')).toBeInTheDocument()
    expect(screen.getByText('1 déclaré obsolète')).toBeInTheDocument()
  })

  it('n’affiche pas une issue à zéro', async () => {
    apiFetch.mockResolvedValueOnce({ rows: [row({ converted: 2 })] })
    render(<WorkspaceLearningPanel />, { wrapper })
    const converted = await screen.findByText('2 convertis')
    // ⚠️ La garde visait tout le document jusqu'au 04/09/2026. Elle rougissait
    // depuis que la phrase qui NOMME la population (#1436) cite les trois
    // issues — « convertis, transformés en action ou déclarés obsolètes » —
    // c'est-à-dire sur une copie parfaitement juste. Le sujet est la LIGNE du
    // motif, et c'est elle qu'on lit.
    const ligne = converted.closest('div')
    expect(ligne).not.toBeNull()
    expect(ligne?.textContent).toContain('2 convertis')
    expect(ligne?.textContent).not.toContain('obsolète')
  })

  it('ignore une cellule sans aucun mouvement', async () => {
    apiFetch.mockResolvedValueOnce({ rows: [row()] })
    render(<WorkspaceLearningPanel />, { wrapper })
    await waitFor(() => expect(screen.getByText(/rien encore/i)).toBeInTheDocument())
  })
})

/**
 * Les comptages MÈNENT aux besoins qu'ils comptent.
 *
 * « 3 convertis · 1 déclaré obsolète » décrivait des objets réels — des besoins
 * qu'un humain a déplacés — et n'offrait aucun chemin vers eux. Les trois
 * comptages sortent tous de la même requête (`projects.service.ts`, `FROM
 * opportunities o`), donc de la même population : les besoins.
 */
describe('WorkspaceLearningPanel — chaque comptage mène aux besoins', () => {
  beforeEach(() => {
    routesByPath = { '/projects/needs': true }
  })

  it('chaque issue comptée ouvre la liste des besoins', async () => {
    apiFetch.mockResolvedValueOnce({ rows: [row({ converted: 3, transformed: 2, obsolete: 1 })] })
    render(<WorkspaceLearningPanel />, { wrapper })

    await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(3))
    expect(screen.getAllByRole('link').map(link => link.getAttribute('href'))).toEqual([
      '/projects/needs',
      '/projects/needs',
      '/projects/needs',
    ])
  })

  it('le lien porte un nom qui contient son libellé visible', async () => {
    apiFetch.mockResolvedValueOnce({ rows: [row({ converted: 3 })] })
    render(<WorkspaceLearningPanel />, { wrapper })

    const converted = await screen.findByRole('link', { name: /3 convertis/ })
    expect(converted.getAttribute('aria-label')).toContain('ouvrir la liste')
  })

  it('une issue à zéro n’a rien à ouvrir', async () => {
    apiFetch.mockResolvedValueOnce({ rows: [row({ converted: 2 })] })
    render(<WorkspaceLearningPanel />, { wrapper })

    await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(1))
  })

  it('ne rend AUCUN lien mort quand ce navigateur ignore la destination', async () => {
    routesByPath = { '/accounts': true }
    apiFetch.mockResolvedValueOnce({ rows: [row({ converted: 3 })] })
    render(<WorkspaceLearningPanel />, { wrapper })

    // L'information reste, le lien disparaît.
    await waitFor(() => expect(screen.getByText('3 convertis')).toBeInTheDocument())
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })
})
