import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Account } from '@bellum/contracts'

/**
 * L'onglet Projets d'un compte, quand il n'y a rien.
 *
 * Elle annonçait : « Ils apparaissent dès qu'une analyse détecte un chantier, ou
 * dès que tu en crées un. » **Corrigé le temps que rien ne créait un projet à
 * la main** : aucun `POST /projects` au contrôleur, seul chemin d'écriture
 * d'`opportunities` = la matérialisation d'une analyse (plus l'import CRM et le
 * seed de démo). La phrase avait été corrigée pour ne plus promettre un geste
 * absent, et l'écran cessait d'être un cul-de-sac en renvoyant vers le pipe.
 *
 * ⚠️ #2124.11/#2124.13 (23/09/2026) — LA PORTE EXISTE DÉSORMAIS. #2195.33 a posé
 * `POST /projects` (`projects.controller.ts:350`) et son formulaire
 * (`CreateProjectDialog`, ouvert par `/projects?create=1`). Ce fichier ne teste
 * plus l'ABSENCE du geste : il continue de vérifier que la phrase ne ment plus
 * (elle dit maintenant la vérité inverse — « ou dès que tu en ouvres un
 * toi-même » — jamais l'ancien « crées un ») et que la porte vers le pipe reste
 * un repli sensé. Les deux boutons de création sont couverts par
 * `TabProjects.createDoor.test.tsx`.
 */

const mockFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => mockFetch(...args) }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    search,
    children,
    ...rest
  }: {
    to: string
    search?: Record<string, unknown>
    children: React.ReactNode
  }) => {
    const href = search ? `${to}?${new URLSearchParams(search as Record<string, string>).toString()}` : to
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    )
  },
}))

const { TabProjects } = await import('./TabProjects')

const ACCOUNT = { id: 'acc-1' } as Account

async function drawEmpty() {
  mockFetch.mockResolvedValue([])
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <TabProjects account={ACCOUNT} />
    </QueryClientProvider>,
  )
  await screen.findByText('Aucun projet sur ce compte.')
}

describe('TabProjects — l’état vide ne promet plus un geste qui n’existe pas', () => {
  it('ne recopie plus l’ancienne phrase « ou dès que tu en crées un »', async () => {
    // #2124.11/#2124.13 — la promesse EST vraie désormais (deux boutons créent
    // vraiment un projet, testés dans TabProjects.createDoor.test.tsx), mais la
    // phrase ne doit jamais retomber sur l'ancien libellé qui l'avait rendue
    // fausse une première fois — c'est LUI, précisément, que ce test surveille.
    await drawEmpty()
    expect(screen.queryByText(/crées un/)).not.toBeInTheDocument()
  })

  it('offre un chemin vers le pipe plutôt qu’un cul-de-sac', async () => {
    await drawEmpty()
    const door = screen.getByRole('link', { name: 'Ouvrir le pipe' })
    // Cible PROUVÉE par son fichier de route : `apps/web/src/routes/projects/index.tsx`.
    expect(door).toHaveAttribute('href', '/projects')
  })

  it('n’affiche aucune porte quand le compte a des projets — il n’y a rien à débloquer', async () => {
    mockFetch.mockResolvedValue([
      {
        id: 'p-1',
        account_id: 'acc-1',
        company_name: 'ACME',
        kind: 'pain',
        label: 'Migration data lake',
        source: 'pain',
        confidence: 'high',
        stage: 'qualified',
        stage_entered_at: new Date().toISOString(),
        expected_close_on: null,
        amount_cents: null,
        access_mode: null,
      },
    ])
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <TabProjects account={ACCOUNT} />
      </QueryClientProvider>,
    )
    // #2124 (lot M1-9) — le résumé compact affiche désormais aussi cette ligne
    // (« Opportunités actives ») : DEUX occurrences légitimes, le résumé et le
    // tableau détaillé, jamais une seule.
    await screen.findAllByText('Migration data lake')
    expect(screen.queryByRole('link', { name: 'Ouvrir le pipe' })).not.toBeInTheDocument()
  })
})
