import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AccountDecisionCell } from './AccountDecisionCell'
import { getRecommendation } from './types'
import type { AccountRow } from './types'

/**
 * #4470 — « ÉCARTER POUR CET OBJECTIF » débordait de sa cellule sur la colonne Accessibilité :
 * le verdict était en `whitespace-nowrap`. Il retourne maintenant à la ligne DANS sa cellule.
 */
describe('AccountDecisionCell — un verdict long reste dans sa cellule', () => {
  const row = { id: 'a-1', status: 'completed', priority_score: 2 } as unknown as AccountRow

  it('le verdict retourne à la ligne et ne force pas la largeur de la cellule', () => {
    render(<AccountDecisionCell row={row} recommendation={getRecommendation(2, { hasObjective: true })} />)
    const verdict = screen.getByTestId('account-verdict')
    expect(verdict.className).not.toContain('whitespace-nowrap')
    expect(verdict.className).toContain('min-w-0')
    expect(verdict.className).toContain('max-w-full')
    expect(verdict.className).toContain('break-words')
  })
})
