import type { RoutineDefinition } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RoutineCardAttributes } from './RoutineCardAttributes'

const definition: Pick<RoutineDefinition, 'roles' | 'steps' | 'preparedActions' | 'budget'> = {
  roles: ['commercial', 'delivery'],
  steps: ['read', 'check_condition', 'prepare', 'notify', 'await_validation'],
  preparedActions: ['notification', 'message_draft'],
  budget: 'model_call',
}

/**
 * #2843.24 (#2399.3) — la fiche d'une automatisation porte son RISQUE (0-4), ses
 * rôles, son déroulé et ce qu'elle laisse derrière elle — mais JAMAIS son coût :
 * le budget reste au back-office (c132).
 */
describe('RoutineCardAttributes — les attributs de la fiche (#2843.24)', () => {
  it('nomme le risque sur 4 et ce qu’il veut dire', () => {
    render(<RoutineCardAttributes definition={definition} />)
    expect(screen.getByText('Risque : 3 sur 4 — elle prépare un message, c’est toi qui l’envoies')).toBeTruthy()
  })

  it('nomme les rôles, le déroulé dans l’ordre et ce qu’elle laisse', () => {
    render(<RoutineCardAttributes definition={definition} />)
    expect(screen.getByText('Pour : Commercial et Delivery')).toBeTruthy()
    expect(
      screen.getByText('Déroulé : lit → vérifie sa condition → prépare → te prévient → attend ta validation'),
    ).toBeTruthy()
    expect(screen.getByText('Laisse : une notification et un brouillon de message')).toBeTruthy()
  })

  it('ne montre aucun coût ni crédit, même pour une routine qui appelle un modèle', () => {
    const { container } = render(<RoutineCardAttributes definition={definition} />)
    expect(container.textContent).not.toMatch(/coût|crédit|budget|model/i)
  })
})
