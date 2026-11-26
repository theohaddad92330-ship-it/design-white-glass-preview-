import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BuyingSignals } from './BuyingSignals'

/**
 * #4286.11 — recette prod du 25/10 : THALES, 0 « Demandeur probable ». Le dossier « qui demande ce profil ? »
 * (`recent_signals[].requester`, posé par la collecte) arrivait jusqu'aux cartes de Découvrir/Veille/Bibliothèque
 * mais jamais à la fiche compte : `BuyingSignals` ne l'appelait pas. Étayé → « Demandeur probable » ; non étayé →
 * « à identifier » avec sa méthode ; absent → aucune ligne (on n'affiche pas ce qu'on n'a pas).
 */
const today = new Date().toISOString().slice(0, 10)

describe('BuyingSignals — demandeur d’une offre (#4286.11)', () => {
  it('une offre dont le texte nomme un rattachement dit « Demandeur probable »', () => {
    render(
      <BuyingSignals
        signals={[
          {
            signal: 'Ingénieur DevOps',
            type: 'job',
            date: today,
            requester: {
              status: 'etaye',
              author: { kind: 'rh' },
              possibleManager: {
                function: 'Responsable plateforme',
                entity: null,
                evidence: 'rattaché au responsable',
              },
              team: null,
              scope: { city: 'Toulouse' },
              method: [],
            },
          },
        ]}
      />,
    )
    expect(screen.getByTestId('need-requester').textContent).toMatch(/Demandeur probable : Responsable plateforme/)
  })

  it('une offre muette dit « à identifier » et déplie sa méthode', () => {
    render(
      <BuyingSignals
        signals={[
          {
            signal: 'Ingénieur DevOps',
            type: 'job',
            date: today,
            requester: {
              status: 'a_identifier',
              author: { kind: 'rh' },
              possibleManager: null,
              team: null,
              scope: { city: 'Toulouse' },
              method: ['ask_team'],
            },
          },
        ]}
      />,
    )
    expect(screen.getByTestId('need-requester-method')).toBeTruthy()
  })

  it('une offre sans dossier demandeur ne porte aucune ligne', () => {
    render(<BuyingSignals signals={[{ signal: 'Ingénieur DevOps', type: 'job', date: today }]} />)
    expect(screen.queryByTestId('need-requester')).toBeNull()
    expect(screen.queryByTestId('need-requester-method')).toBeNull()
  })
})
