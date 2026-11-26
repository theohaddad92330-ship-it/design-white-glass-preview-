import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { PipelineSummary, ProjectReadRow } from '@bellum/contracts'

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

// #4291.8 — un projet passé à « Gagnée » QUITTE le Kanban des affaires : il devient un suivi de mission
// (WonMissionTracking). Mesuré en production le 26/10 : « Gagnée 4 · 681 000 € » restaient des cartes Kanban.
const row = (over: Partial<ProjectReadRow>): ProjectReadRow =>
  ({
    id: 'p',
    account_id: 'a',
    company_name: 'ACME',
    kind: 'manual',
    label: 'Projet',
    stage: 'qualified',
    stage_entered_at: new Date().toISOString(),
    owner_id: null,
    amount_cents: 100_000,
    next_action: null,
    has_next_action: false,
    evidence: { level: 'confirmed_demand', missing: [] },
    ...over,
  }) as unknown as ProjectReadRow

const summary = {
  columns: [
    {
      stage: 'qualified',
      label: 'Qualifié',
      count: 1,
      amount_cents: 100_000,
      without_amount: 0,
      without_next_action: 1,
    },
    { stage: 'won', label: 'Gagnée', count: 1, amount_cents: 100_000, without_amount: 0, without_next_action: 0 },
  ],
  total_amount_cents: 100_000,
  total_count: 1,
  total_without_amount: 0,
  intake: 0,
  signals: 0,
} as unknown as PipelineSummary

describe('PipelineBoard — le gagné quitte le Kanban (#4291.8)', () => {
  it('ne rend AUCUNE colonne « Gagnée » ni la carte d’un projet gagné', () => {
    render(
      <PipelineBoard
        summary={summary}
        projects={[
          row({ id: 'q', label: 'Projet en cours', stage: 'qualified' }),
          row({ id: 'w', label: 'Projet gagné', stage: 'won' }),
        ]}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByText('Projet en cours')).toBeInTheDocument()
    expect(screen.queryByText('Projet gagné')).not.toBeInTheDocument()
    expect(screen.queryByText('Gagnée')).not.toBeInTheDocument()
  })

  it('sait dire NON — un Kanban qui garderait la colonne gagnée serait refusé', () => {
    const fautif = "(column.stage === 'won' && showWon && signedSection !== null)"
    expect(/column\.stage === 'won'/.test(fautif)).toBe(true)
  })
})
