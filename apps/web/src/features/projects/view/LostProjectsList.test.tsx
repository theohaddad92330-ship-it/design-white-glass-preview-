import type { ProjectReadinessRow } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({ to, children }: { to?: string; children: ReactNode }) => <a href={to ?? '#'}>{children}</a>,
  }
})

const { LostProjectsList } = await import('./LostProjectsList')

function row(over: Partial<ProjectReadinessRow> & { id: string; label: string }): ProjectReadinessRow {
  return {
    company_name: 'Cliente SA',
    stage: 'lost',
    closed_at: '2026-09-01T10:00:00.000Z',
    ...over,
  } as ProjectReadinessRow
}

// #3295.r42 — recette prod R42 : aucune affaire PERDUE atteignable depuis le pipe, aucun écran REX trouvé.
describe('LostProjectsList — #3295.r42, les affaires perdues du pipe', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('liste les affaires perdues avec leur compte et leur motif, et ouvre le REX', () => {
    render(
      <LostProjectsList
        projects={[
          row({ id: 'p1', label: 'Refonte du portail', company_name: 'BNP Paribas', loss_reason: 'Hors panel' }),
          row({ id: 'p2', label: 'Migration du poste de travail', company_name: 'ENGIE' }),
          row({ id: 'p3', label: 'Affaire en cours', stage: 'negotiation' }),
        ]}
      />,
    )
    expect(screen.getByText('Refonte du portail')).toBeInTheDocument()
    expect(screen.getByText(/BNP Paribas/)).toBeInTheDocument()
    expect(screen.getByText(/Hors panel/)).toBeInTheDocument()
    expect(screen.getByText('Migration du poste de travail')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /retours d’expérience/i })).toHaveAttribute('href', '/pilotage/rex')
  })

  it('SAIT DIRE NON : une affaire non perdue n’est pas listée ; sans perdue, un seul texte, pas de liste', () => {
    render(<LostProjectsList projects={[row({ id: 'p3', label: 'Affaire en cours', stage: 'negotiation' })]} />)
    expect(screen.queryByText('Affaire en cours')).toBeNull()
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.getByText('Aucune affaire perdue.')).toBeInTheDocument()
  })
})
