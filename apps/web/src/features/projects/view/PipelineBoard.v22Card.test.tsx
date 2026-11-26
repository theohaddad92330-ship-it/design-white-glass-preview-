import { render, screen, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { PipelineSummary, ProjectRow } from '@bellum/contracts'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to?: string }) => <a href={to ?? '#'}>{children}</a>,
}))

const { PipelineBoard } = await import('./PipelineBoard')

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  proto.scrollIntoView ??= () => {}
})

/**
 * #4499 (arbitrage Louis 24/10, lot ARBITRAGES) — « Aligner sur la maquette » :
 *  (a) la carte d'affaire est ALLÉGÉE comme la maquette V22 (`.bo11-deal`) : le compte, le sujet, le montant, la
 *      ligne d'estimation, puis le pied (prochaine action, date, porteur). Plus de badge de preuve, d'objectif, de
 *      besoin principal en lien, d'origine, ni d'alerte de stagnation SUR LA CARTE (ils vivent dans le détail) ;
 *  (b) aucune mention « sans montant » sur une carte ; la ligne de synthèse dit « N affaires sans montant, hors total » ;
 *  (c) la synthèse du Pipe est rendue par `KeyFigureRow` (garde F2-FIX #4332).
 */
const OLD = new Date(Date.now() - 40 * 86_400_000).toISOString()

const project = (over: Partial<ProjectRow> = {}): ProjectRow =>
  ({
    id: 'p-1',
    account_id: 'a-1',
    company_name: 'ACME',
    sector: null,
    kind: 'pain',
    label: 'Migration data lake',
    detail: null,
    offer: null,
    source: 'boamp',
    confidence: 'high',
    urgency: null,
    stage: 'qualified',
    stage_entered_at: OLD,
    owner_id: null,
    expected_close_on: null,
    closed_at: null,
    outcome: null,
    loss_reason: null,
    first_detected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    amount_cents: 4_500_000,
    access_mode: null,
    objective: 'Réduire les coûts cloud',
    primary_need_id: 'n-1',
    primary_need_title: 'Architecte data senior',
    evidence: {
      level: 'confirmed_demand',
      requirement: { fr: 'Une demande formulée', en: 'A stated demand' },
      missing: [],
    },
    next_action: { title: 'Qualifier le recours à un externe', due_on: '2026-10-22' },
    ...over,
  }) as ProjectRow

const summary = (without: number): PipelineSummary =>
  ({
    columns: [
      {
        stage: 'qualified',
        label: 'Qualifié',
        count: 2,
        amount_cents: 4_500_000,
        without_amount: without,
        without_next_action: 0,
      },
    ],
    total_amount_cents: 4_500_000,
    total_count: 2,
    total_without_amount: without,
    intake: 0,
    signals: 0,
  }) as PipelineSummary

function draw(projects: ProjectRow[], without = 0) {
  return render(<PipelineBoard summary={summary(without)} projects={projects} onSelect={() => {}} />)
}

describe('#4499 — la carte d’affaire allégée (maquette V22)', () => {
  it('garde le compte, le sujet, le montant, l’estimation et le pied (prochaine action, porteur)', () => {
    draw([project()])
    const card = screen.getByTestId('pipeline-card')
    expect(within(card).getByText('ACME')).toBeInTheDocument()
    expect(within(card).getByText('Migration data lake')).toBeInTheDocument()
    expect(within(card).getByText(/45\s?000/)).toBeInTheDocument()
    expect(within(card).getByText('Qualifier le recours à un externe')).toBeInTheDocument()
  })

  it('NON : ni badge de preuve, ni objectif, ni besoin principal, ni origine, ni alerte de stagnation', () => {
    draw([project()])
    const card = screen.getByTestId('pipeline-card')
    expect(within(card).queryByText('Besoin exprimé')).toBeNull() // le badge de preuve
    expect(within(card).queryByText(/Réduire les coûts cloud/)).toBeNull() // l'objectif
    expect(within(card).queryByText('Architecte data senior')).toBeNull() // le besoin principal (texte ET lien)
    expect(within(card).queryByRole('link', { name: /Architecte data senior/ })).toBeNull()
    expect(within(card).queryByText(/Origine/)).toBeNull() // l'origine
    expect(within(card).queryByText(/sans mouvement/)).toBeNull() // la stagnation
    expect(within(card).queryByText(/Relancer|Préparer une relance|relance/i)).toBeNull() // son geste
  })

  it('NON : une affaire sans montant ne porte aucune mention « sans montant » sur sa carte', () => {
    draw([project({ amount_cents: null }), project({ id: 'p-2' })], 1)
    for (const card of screen.getAllByTestId('pipeline-card')) {
      expect(within(card).queryByText(/sans montant/i)).toBeNull()
    }
  })
})

describe('#4499 — la synthèse du Pipe', () => {
  it('dit « N affaires sans montant, hors total » (un total nomme ce qu’il exclut)', () => {
    draw([project(), project({ id: 'p-2', amount_cents: null })], 1)
    const summaryNode = screen.getByTestId('pipeline-summary')
    expect(within(summaryNode).getByText('1 affaire sans montant, hors total')).toBeInTheDocument()
    expect(within(summaryNode).queryByText(/projets? sans montant saisi/)).toBeNull()
  })

  it('est rendue par KeyFigureRow (garde F2-FIX #4332 rebranchée, pas assouplie) : le total garde son libellé', () => {
    draw([project()])
    const row = screen.getByTestId('pipeline-summary')
    expect(row.querySelector('[aria-label^="pipe ouvert HT"]')).not.toBeNull()
    expect(within(row).getByText('pipe ouvert HT')).toBeInTheDocument()
    expect(within(row).getByText(/estimation non pondérée/)).toBeInTheDocument()
  })
})
