import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Account } from '@bellum/contracts'

/**
 * #2124.11/#2124.13 — « Créer une opportunité » / « Créer un besoin confirmé »
 * OUVRENT VRAIMENT le formulaire de création.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI DEUX LIENS, JAMAIS DEUX FORMULAIRES
 * ─────────────────────────────────────────────────────────────────────────────
 * #2195.33 a posé `POST /projects` et SON formulaire, `CreateProjectDialog`,
 * ouvert par `/projects?create=1&account_id=…` (doctrine c75 : un formulaire
 * générique, pas un dédié par bouton). Ce dossier NAVIGUE vers ce même
 * formulaire — il n'écrit rien lui-même, le clic sur « Créer l'affaire » dans
 * le formulaire reste la décision humaine, comme pour le lien jumeau du
 * dossier de mission (#2711.1, `MissionDossierPage.tsx`).
 *
 * La seule différence entre les deux boutons est `create_stage` : absent pour
 * « Créer une opportunité » (le serveur pose `PIPELINE_STAGES[0]`), posé à
 * `confirmed` pour « Créer un besoin confirmé » — un paramètre DISTINCT de
 * `?stage=`, qui reste le filtre de la barre du cockpit (`routes/projects/index.tsx`).
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

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <TabProjects account={ACCOUNT} />
    </QueryClientProvider>,
  )
}

describe('TabProjects — les deux portes de création', () => {
  it('compte vide : « Créer une opportunité » ouvre le formulaire, compte pré-rempli, sans étape imposée', async () => {
    mockFetch.mockResolvedValue([])
    renderTab()
    await screen.findByText('Aucun projet sur ce compte.')
    const door = screen.getByRole('link', { name: 'Créer une opportunité' })
    expect(door).toHaveAttribute('href', '/projects?create=1&account_id=acc-1')
  })

  it('compte vide : « Créer un besoin confirmé » ouvre le même formulaire à l’étape `confirmed`', async () => {
    mockFetch.mockResolvedValue([])
    renderTab()
    await screen.findByText('Aucun projet sur ce compte.')
    const door = screen.getByRole('link', { name: 'Créer un besoin confirmé' })
    expect(door).toHaveAttribute('href', '/projects?create=1&account_id=acc-1&create_stage=confirmed')
  })

  it('compte avec des projets : les deux portes restent atteignables — un compte suivi peut toujours en ouvrir un second', async () => {
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
    renderTab()
    await screen.findAllByText('Migration data lake')
    expect(screen.getByRole('link', { name: 'Créer une opportunité' })).toHaveAttribute(
      'href',
      '/projects?create=1&account_id=acc-1',
    )
    expect(screen.getByRole('link', { name: 'Créer un besoin confirmé' })).toHaveAttribute(
      'href',
      '/projects?create=1&account_id=acc-1&create_stage=confirmed',
    )
  })
})
