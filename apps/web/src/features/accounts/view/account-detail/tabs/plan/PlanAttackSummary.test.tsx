import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PlanAttackSummary } from './PlanAttackSummary'
import type { AttackAngle, PlanViewData } from './planViewData'

/**
 * recette 10/09 — mesuré sur un compte marqué Terminé : le bloc « Plan
 * d'attaque » de la colonne latérale annonçait « Plan à préciser — Ajoute une
 * action ou relance l'analyse », sur la MÊME page qui rend trois angles
 * d'attaque complets, cinq questions de découverte et une trame de
 * rendez-vous en quatre temps (`AttackAnglesSection` / `MeetingPrepCard`,
 * juste à côté sur `TabPlan`).
 *
 * Cause : `hasContent` ne regardait que trois champs anciens (`strategy`,
 * `immediateAction`, `justification`) — jamais `angles`, `meetingPrep`,
 * `recommendedMovement` ni `nextActions`, que `PlanViewData` porte pourtant
 * et que le reste de l'onglet affiche déjà. Le calcul (`buildPlanViewData`)
 * était juste ; c'est ce résumé qui posait une question plus étroite que ce
 * que la page savait.
 */
function planData(overrides: Partial<PlanViewData> = {}): PlanViewData {
  return {
    ifNoResponse: null,
    meetingPrep: null,
    strategy: '',
    justification: '',
    immediateAction: '',
    planWeeks: [],
    userActions: [],
    angles: [],
    discardedAxes: [],
    recommendedMovement: null,
    recommendedRoute: null,
    followedSignal: null,
    nextActions: [],
    nextActionsByHorizon: [],
    reverseProspects: [],
    salesContext: null,
    ...overrides,
  }
}

const angle: AttackAngle = {
  title: 'Angle 1',
  description: 'Une lecture longue du contexte pour ouvrir la conversation.',
  entryPoint: 'DSI',
  offer: 'Offre A',
  estimatedDealSize: '150 k€',
  recommended: true,
  proof: null,
  proofState: 'absent',
}

describe('PlanAttackSummary — recette 10/09, un plan riche ne se dit plus vide', () => {
  it('dit « Plan à préciser » quand VRAIMENT rien n’existe', () => {
    render(<PlanAttackSummary data={planData()} />)
    expect(screen.getByText('Plan à préciser')).toBeInTheDocument()
  })

  it('ne dit plus « Plan à préciser » quand des angles complets existent', () => {
    render(<PlanAttackSummary data={planData({ angles: [angle] })} />)
    expect(screen.queryByText('Plan à préciser')).not.toBeInTheDocument()
  })

  it('ne dit plus « Plan à préciser » quand la trame de rendez-vous existe', () => {
    render(
      <PlanAttackSummary
        data={planData({
          meetingPrep: { powerQuestions: ['Quel budget ?'], script: [{ key: 'opening', text: 'Bonjour' }] },
        })}
      />,
    )
    expect(screen.queryByText('Plan à préciser')).not.toBeInTheDocument()
  })

  it('ne dit plus « Plan à préciser » quand un mouvement recommandé existe', () => {
    render(
      <PlanAttackSummary
        data={planData({
          recommendedMovement: { movement: 'Rang 2', sequence: 'Après le RDV', rationale: 'Le rang 1 est verrouillé' },
        })}
      />,
    )
    expect(screen.queryByText('Plan à préciser')).not.toBeInTheDocument()
  })

  it('ne dit plus « Plan à préciser » quand des actions suivantes existent', () => {
    render(
      <PlanAttackSummary
        data={planData({
          nextActions: [{ id: 'a1', chantier: 'Prospection', label: 'Appeler le DSI', why: 'Chaud', horizon: '7j' }],
        })}
      />,
    )
    expect(screen.queryByText('Plan à préciser')).not.toBeInTheDocument()
  })
})

/**
 * #3717.7 (reste de #3717, épopée #3777) — « Résumé du plan » et « Prochaines
 * actions » ne réaffichent pas la même phrase : mesuré (`planListOverlap.ts`),
 * puis retiré (aperçu + lien vers la ligne réelle), jamais supposé.
 */
describe('PlanAttackSummary — #3717.7, « Première action » ne répète pas « Prochaines actions »', () => {
  it('répétition mot pour mot → aperçu + lien, jamais la phrase une deuxième fois', () => {
    render(
      <PlanAttackSummary
        data={planData({
          immediateAction: 'Rappeler le DSI',
          nextActions: [{ id: 'a1', chantier: 'contacts', label: 'Rappeler le DSI', why: '', horizon: '' }],
        })}
      />,
    )
    expect(screen.queryByText('Rappeler le DSI')).not.toBeInTheDocument()
    expect(screen.getByText('Déjà en tête de « Prochaines actions »')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voir dans « Prochaines actions »' })).toHaveAttribute(
      'href',
      '#plan-next-moves',
    )
  })

  it('pas de répétition → « Première action » garde sa phrase, inchangée', () => {
    render(
      <PlanAttackSummary
        data={planData({
          immediateAction: 'Cadrer le périmètre',
          nextActions: [{ id: 'a1', chantier: 'contacts', label: 'Rappeler le DSI', why: '', horizon: '' }],
        })}
      />,
    )
    expect(screen.getByText('Cadrer le périmètre')).toBeInTheDocument()
    expect(screen.queryByText('Déjà en tête de « Prochaines actions »')).not.toBeInTheDocument()
  })
})

describe('#4980.1 — « Pourquoi ? » est un bouton, la justification n’est pas un paragraphe visible', () => {
  const JUSTIFICATION = 'Parce que le DSI vient d’arriver et que la migration est annoncée.'

  it('SAIT DIRE NON — la justification n’est pas lue tant qu’on n’a pas cliqué', () => {
    render(<PlanAttackSummary data={planData({ strategy: 'Prendre pied', justification: JUSTIFICATION })} />)
    expect(screen.queryByText(JUSTIFICATION)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Pourquoi \?/ })).toBeInTheDocument()
  })

  it('le bouton « Pourquoi ? » ouvre la justification complète', () => {
    render(<PlanAttackSummary data={planData({ strategy: 'Prendre pied', justification: JUSTIFICATION })} />)
    fireEvent.click(screen.getByRole('button', { name: /Pourquoi \?/ }))
    expect(screen.getByText(JUSTIFICATION)).toBeInTheDocument()
  })
})
