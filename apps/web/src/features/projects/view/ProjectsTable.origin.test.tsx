import { act, cleanup, render, screen } from '@testing-library/react'
import type { ProjectRow } from '@bellum/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { ProjectsTable } from './ProjectsTable'

/**
 * #4336.1 / #4336.2 — « Origine » : 2e colonne, source réelle en langage métier, jamais « inconnue », dit la même
 * chose partout (« Saisi à la main »), et la pastille tient dans sa cellule : en recette (vue Tableau), 31 pastilles
 * « Origine » débordaient et étaient coupées.
 */
function row(over: Partial<ProjectRow>): ProjectRow {
  return {
    id: 'p1',
    label: 'Socle data',
    kind: 'manual',
    stage: 'qualified',
    company_name: 'Cliente SA',
    amount_cents: 1_000_000,
    stage_entered_at: '2026-08-20T00:00:00.000Z',
    updated_at: '2026-08-20T00:00:00.000Z',
    first_detected_at: '2026-08-01T00:00:00.000Z',
    owner_id: null,
    source: null,
    has_mission: false,
    access_mode: null,
    ...over,
  } as unknown as ProjectRow
}

describe('ProjectsTable — colonne Origine', () => {
  beforeEach(async () => {
    cleanup()
    await act(async () => {
      await i18n.changeLanguage('fr')
    })
  })

  it('est la 2e colonne, juste après l’affaire', () => {
    render(<ProjectsTable projects={[row({ source: 'manual' })]} onSelect={() => {}} ownerName={() => null} />)
    const heads = screen.getAllByRole('columnheader').map(h => h.textContent)
    expect(heads[0]).toBe('Projet')
    expect(heads[1]).toBe('Origine')
  })

  it('une saisie manuelle se lit « Saisi à la main »', () => {
    render(<ProjectsTable projects={[row({ source: 'manual' })]} onSelect={() => {}} ownerName={() => null} />)
    expect(screen.getByText('Saisi à la main')).toBeInTheDocument()
  })

  it('une affaire créée dans Bellum, sans source stockée, dit « Saisi à la main »', () => {
    render(<ProjectsTable projects={[row({})]} onSelect={() => {}} ownerName={() => null} />)
    expect(screen.getByText('Saisi à la main')).toBeInTheDocument()
    expect(screen.queryByText('Saisie manuelle')).toBeNull()
  })

  it('source inconnue : cellule vide, jamais « inconnue » ni une origine inventée', () => {
    render(<ProjectsTable projects={[row({ kind: 'pain' })]} onSelect={() => {}} ownerName={() => null} />)
    expect(screen.queryByText('Saisi à la main')).toBeNull()
    expect(screen.getAllByRole('cell')[1]?.textContent).toBe('')
  })

  it('une origine longue est tronquée dans sa cellule, texte complet au survol', () => {
    const long = 'Domaine d’opportunité « Cybersécurité, IAM, GRC & sécurité » — relevé dans l’analyse'
    render(
      <ProjectsTable projects={[row({ kind: 'pain', source: long })]} onSelect={() => {}} ownerName={() => null} />,
    )
    const badge = screen.getByText(long)
    expect(badge).toHaveAttribute('title', long)
    expect(badge.className).toMatch(/truncate/)
    expect(badge.className).toMatch(/max-w-/)
  })
})
