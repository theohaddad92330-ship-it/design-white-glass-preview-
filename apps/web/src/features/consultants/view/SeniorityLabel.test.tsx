import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SeniorityLabel } from './SeniorityLabel'

/** #4016 L4.3 — la séniorité déduite des années se badge « estimé » ; une séniorité saisie, jamais. */
describe('SeniorityLabel', () => {
  it('une séniorité saisie s’affiche telle quelle, sans badge, même si les années disent autre chose', () => {
    render(<SeniorityLabel seniority="junior" yearsExperience={20} />)
    expect(screen.getByText('Junior')).toBeInTheDocument()
    expect(screen.queryByText('estimé')).not.toBeInTheDocument()
  })

  it('inconnue + années : la tranche, badgée « estimé », avec sa base', () => {
    render(<SeniorityLabel seniority="inconnu" yearsExperience={6} />)
    expect(screen.getByText(/Confirmé/)).toBeInTheDocument()
    const badge = screen.getByText('estimé')
    expect(badge.closest('[aria-label]')?.getAttribute('aria-label')).toMatch(/6 ans/)
  })

  it('inconnue sans années : rien d’estimé, aucun badge', () => {
    render(<SeniorityLabel seniority="inconnu" yearsExperience={null} />)
    expect(screen.queryByText('estimé')).not.toBeInTheDocument()
  })
})
