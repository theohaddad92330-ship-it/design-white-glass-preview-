import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PlanRecap } from './PlanRecap'

/**
 * #1950.3 / #1950.9 / #1950.25 — la ligne récapitulative d'un plan de Laura.
 *
 * Décision du 12/09/2026 : formaliser les cartes INDÉPENDANTES que Laura
 * propose déjà. Aucun nouvel état, aucune exécution enchaînée : la ligne dit
 * combien d'étapes, ce qu'elles coûtent au total tel que chaque carte l'annonce,
 * et que rien ne part sans un clic.
 *
 * ⚠️ « Non annoncé » n'est jamais « 0 » : une carte sans coût annoncé ne
 * s'additionne pas en zéro, elle se compte à part.
 */

describe('PlanRecap', () => {
  it('une seule carte n’est pas un plan — rien ne s’affiche', () => {
    const { container } = render(<PlanRecap actions={[{ cost_credits: 1 }]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('dit le nombre d’étapes et que rien ne part sans clic — sans aucun coût (#4463)', () => {
    render(<PlanRecap actions={[{ cost_credits: 0 }, { cost_credits: 1 }, { cost_credits: 0 }]} />)
    const note = screen.getByRole('note')
    expect(note).toHaveTextContent('Plan en 3 étapes')
    expect(note).toHaveTextContent('rien ne s’exécute sans ton clic')
    expect(note).not.toHaveTextContent(/crédit|annoncé/i)
  })

  // Quelle que soit la valeur portée par les cartes (mesurée, nulle, absente), la ligne ne chiffre rien :
  // ni « 0 crédit », ni « aucun crédit », ni « coût non annoncé ».
  it.each([
    ['toutes gratuites', [{ cost_credits: 0 }, { cost_credits: 0 }]],
    ['une étape sans coût', [{ cost_credits: 2 }, {}]],
    ['aucun coût du tout', [{}, {}]],
  ])('%s : aucun crédit, aucun coût, aucun chiffre de coût', (_label, actions) => {
    render(<PlanRecap actions={actions} />)
    const note = screen.getByRole('note')
    expect(note).toHaveTextContent('Plan en 2 étapes')
    expect(note).not.toHaveTextContent(/crédit|coût|annoncé/i)
    expect(note.textContent).not.toMatch(/\b0\b/)
  })
})
