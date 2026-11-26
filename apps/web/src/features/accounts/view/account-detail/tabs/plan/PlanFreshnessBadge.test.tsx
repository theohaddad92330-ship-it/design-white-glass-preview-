import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PlanFreshnessBadge } from './PlanFreshnessBadge'

/**
 * #3420.2 (recette démo 05/10) — « pas d'âge de plan (seul le hero) » : un plan FRAIS n'affichait
 * rien, donc l'âge du plan n'était lisible que quand il vieillissait. Il se dit toujours.
 */
describe('PlanFreshnessBadge — l’âge du plan se dit aussi quand il est frais (#3420.2)', () => {
  it('un plan frais montre sa date de génération, sans badge d’alerte', () => {
    const { container } = render(<PlanFreshnessBadge freshness="frais" generatedAt="2026-10-05T07:00:00.000Z" />)
    expect(container.textContent?.trim()).not.toBe('')
    expect(screen.queryByText('Plan vieillissant')).toBeNull()
    expect(screen.queryByText('Plan périmé')).toBeNull()
  })

  it('NON — un plan frais sans date de génération ne dit rien (jamais « aujourd’hui » inventé)', () => {
    const { container } = render(<PlanFreshnessBadge freshness="frais" generatedAt={null} />)
    expect(container.textContent?.trim()).toBe('')
  })

  it('un plan périmé garde son badge', () => {
    render(<PlanFreshnessBadge freshness="perime" generatedAt="2026-06-01T07:00:00.000Z" />)
    expect(screen.getByText('Plan périmé')).toBeTruthy()
  })
})
