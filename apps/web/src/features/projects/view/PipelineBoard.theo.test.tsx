import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { PipelineSummary, ProjectReadRow } from '@bellum/contracts'

// ⚠️ #1394 — l'entête de colonne porte maintenant un `Link` vers la liste
// filtrée (`?stage=`), donc ce fichier a besoin d'un routeur. Le faux recopie
// le `search` DANS le `href` : un faux qui jetterait le paramètre laisserait
// passer exactement le défaut du 28/08 — un lien juste, une recherche perdue.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    search,
    params,
    'aria-label': ariaLabel,
  }: {
    children: React.ReactNode
    'aria-label'?: string
    to?: string
    search?: Record<string, unknown>
    params?: Record<string, string>
  }) => {
    const query = new URLSearchParams(
      Object.entries(search ?? {})
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        .map(([key, value]) => [key, value]),
    ).toString()
    const path = (to ?? '#').replace(/\$(\w+)/g, (_, key: string) => params?.[key] ?? key)
    return (
      <a href={query ? `${path}?${query}` : path} aria-label={ariaLabel}>
        {children}
      </a>
    )
  },
}))

// #2170.53 — même patron que `MatchCard.test.tsx` (#2176.48) : `AskLaura`
// résout un GAGNANT de course entre ses instances vivantes (une seule amorce
// à la fois, `laura-intro-store.ts`) — un simulacre de router ne peut pas
// reproduire cette course, et la vraie question n'est pas là : c'est CE QUE
// la carte lui déclare qui l'est.
const askLauraProps: { question: string; label: string; accountId?: string }[] = []
vi.mock('@/components/primitives/AskLaura', () => ({
  AskLaura: (props: { question: string; label: string; accountId?: string }) => {
    askLauraProps.push({ question: props.question, label: props.label, accountId: props.accountId })
    return <span data-testid="ask-laura">{props.label}</span>
  },
}))

const { PipelineBoard } = await import('./PipelineBoard')

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  proto.scrollIntoView ??= () => {}
})

const project = (over: Partial<ProjectReadRow> = {}): ProjectReadRow =>
  ({
    id: 'p-1',
    account_id: 'a-1',
    company_name: 'ACME',
    sector: null,
    kind: 'pain',
    label: 'Migration data lake',
    detail: null,
    offer: null,
    source: 'pain',
    confidence: 'high',
    urgency: null,
    stage: 'qualified',
    stage_entered_at: new Date().toISOString(),
    owner_id: null,
    expected_close_on: null,
    closed_at: null,
    outcome: null,
    loss_reason: null,
    first_detected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    amount_cents: 4500000,
    ...over,
  }) as ProjectReadRow

const summary: PipelineSummary = {
  columns: [
    {
      stage: 'qualified',
      label: 'Qualifié',
      count: 1,
      amount_cents: 4500000,
      without_amount: 0,
      without_next_action: 0,
    },
    {
      stage: 'confirmed',
      label: 'Besoin exprimé',
      count: 0,
      amount_cents: 0,
      without_amount: 0,
      without_next_action: 0,
    },
  ],
  total_amount_cents: 4500000,
  total_count: 1,
  total_without_amount: 0,
  intake: 0,
  signals: 0,
} as PipelineSummary

// Théo C projects-pipeline.N2 / N3 — la carte dit le nombre de postes (estimation) et mène aux profils suivis.
describe('PipelineBoard — carte de Théo', () => {
  it('N3 — « Estimation HT · N poste(s) » sous le montant', () => {
    render(<PipelineBoard summary={summary} projects={[project({ needs_headcount: 2 })]} onSelect={() => {}} />)
    expect(screen.getByText('Estimation HT · 2 postes')).toBeInTheDocument()
  })

  it('N3 — au singulier pour un poste', () => {
    render(<PipelineBoard summary={summary} projects={[project({ needs_headcount: 1 })]} onSelect={() => {}} />)
    expect(screen.getByText('Estimation HT · 1 poste')).toBeInTheDocument()
  })

  it('N3 — sans besoin rattaché, aucune ligne : jamais « 0 poste »', () => {
    render(<PipelineBoard summary={summary} projects={[project({ needs_headcount: null })]} onSelect={() => {}} />)
    expect(screen.queryByText(/poste/)).not.toBeInTheDocument()
  })

  it('N3 — sans montant saisi, on dit les postes sans les appeler une estimation HT', () => {
    render(
      <PipelineBoard
        summary={summary}
        projects={[project({ needs_headcount: 2, amount_cents: null })]}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByText('2 postes')).toBeInTheDocument()
    expect(screen.queryByText(/Estimation HT/)).not.toBeInTheDocument()
  })

  it('N2 — « N profil suivi · Voir » : un lien vers l’affaire, nommé', () => {
    render(<PipelineBoard summary={summary} projects={[project({ positioned_count: 1 })]} onSelect={() => {}} />)
    const link = screen.getByRole('link', { name: /Voir les profils suivis/ })
    // #2170.19 — « Voir » ouvre l'onglet Profils de la fiche (comportement gardé, libellé de Théo inchangé).
    expect(link.getAttribute('href')).toBe('/projects/p-1?onglet=profils')
  })

  it('N2 — sans profil suivi, pas de lien', () => {
    render(<PipelineBoard summary={summary} projects={[project()]} onSelect={() => {}} />)
    expect(screen.queryByRole('link', { name: /Voir les profils suivis/ })).not.toBeInTheDocument()
  })
})
