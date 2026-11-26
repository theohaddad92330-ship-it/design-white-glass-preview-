import type { Contact } from '@bellum/contracts'
import { computeContactScoreBreakdown } from '@bellum/contracts'
import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { ContactRoleBlock } from './ContactRoleBlock'
import { SCORE_BREAKDOWN_ID } from './ContactScoreBreakdown'

// #4585 (décision Louis 26/10) — « Rôle & périmètre » est UN bloc pleine largeur : rôle, périmètre ET priorité par
// axes. Avant, une carte et un pli portaient le même titre (GA-26) et les valeurs étaient coupées en colonne étroite.
// Pas de périmètre de compte ni d'angle : au moins un axe n'est pas évaluable.
const BREAKDOWN = computeContactScoreBreakdown({ title: 'DSI', role: 'technical', source: 'apollo' })
const UNEVALUATED = BREAKDOWN.find(c => !c.evaluated)

const contact = {
  id: 'c1',
  account_id: 'a1',
  full_name: 'Cecile Martin',
  title: 'Directrice des systèmes d’information',
  scope: 'France & Benelux',
  budget_authority: 'Prescripteur',
  decision_role: 'decision_maker',
  contact_score_breakdown: BREAKDOWN,
} as unknown as Contact

describe('ContactRoleBlock — #4585', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('un seul titre « Rôle & périmètre » (GA-26), plus de pli replié du même nom', () => {
    render(<ContactRoleBlock contact={contact} />)
    expect(screen.getAllByRole('heading', { name: 'Rôle & périmètre' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /Rôle & périmètre/ })).toBeNull()
  })

  it('porte le périmètre ET le détail par axes, dépliés (rien à ouvrir)', () => {
    render(<ContactRoleBlock contact={contact} />)
    expect(screen.getByText('France & Benelux')).toBeInTheDocument()
    expect(screen.getByText('Prescripteur')).toBeInTheDocument()
    expect(document.getElementById(SCORE_BREAKDOWN_ID)).not.toBeNull()
  })

  it('un axe non évaluable reste NOMMÉ, jamais converti en 0 (GA-18 / GA-19)', () => {
    render(<ContactRoleBlock contact={contact} />)
    expect(UNEVALUATED).toBeDefined()
    const axis = screen.getByTestId(`score-criterion-${UNEVALUATED?.key}`)
    expect(within(axis).getByText(/non évaluable/i)).toBeInTheDocument()
    expect(axis.textContent).not.toMatch(/\b0\b/)
  })
})
