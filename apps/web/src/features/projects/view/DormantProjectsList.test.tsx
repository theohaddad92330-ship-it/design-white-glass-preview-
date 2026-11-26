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

const { DormantProjectsList } = await import('./DormantProjectsList')

function row(over: Partial<ProjectReadinessRow> & { id: string; label: string }): ProjectReadinessRow {
  return {
    company_name: 'Cliente SA',
    stage: 'dormant',
    stage_entered_at: '2026-09-01T10:00:00.000Z',
    ...over,
  } as ProjectReadinessRow
}

// Théo C projects-pipeline.A1 — « En sommeil » est une SORTIE du pipe, filtrable : on retrouve une affaire dormante.
describe('DormantProjectsList — les affaires en sommeil', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('liste les affaires en sommeil avec leur compte et la date d’entrée en sommeil, et rien d’autre', () => {
    render(
      <DormantProjectsList
        projects={[
          row({ id: 'p1', label: 'Refonte du portail', company_name: 'BNP Paribas' }),
          row({ id: 'p2', label: 'Affaire en cours', stage: 'negotiation' }),
          row({ id: 'p3', label: 'Affaire perdue', stage: 'lost' }),
        ]}
      />,
    )
    expect(screen.getByText('Refonte du portail')).toBeInTheDocument()
    expect(screen.getByText(/BNP Paribas/)).toBeInTheDocument()
    expect(screen.getByText(/En sommeil depuis le/)).toBeInTheDocument()
    expect(screen.queryByText('Affaire en cours')).toBeNull()
    expect(screen.queryByText('Affaire perdue')).toBeNull()
  })

  it('chaque ligne ouvre la fiche de l’affaire', () => {
    render(<DormantProjectsList projects={[row({ id: 'p1', label: 'Refonte du portail' })]} />)
    expect(screen.getByRole('link', { name: 'Refonte du portail' }).getAttribute('href')).toBe('/projects/$id')
  })

  it('sans affaire en sommeil, dit pourquoi l’écran est vide — pas une page muette', () => {
    render(<DormantProjectsList projects={[row({ id: 'p3', label: 'Perdue', stage: 'lost' })]} />)
    expect(screen.getByText('Aucune affaire en sommeil.')).toBeInTheDocument()
  })
})
