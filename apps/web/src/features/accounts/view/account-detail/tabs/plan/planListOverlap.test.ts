import { describe, expect, it } from 'vitest'
import { measurePlanListOverlap } from './planListOverlap'
import type { NextAction } from './planViewData'
import type { PlanWeek } from '../../helpers/plan'

function nextAction(over: Partial<NextAction> = {}): NextAction {
  return { id: 'na-1', chantier: 'contacts', label: 'Rappeler le DSI', why: '', horizon: '', ...over }
}

function week(items: Array<{ text: string }>): PlanWeek {
  return { week: 1, title: 'Semaine 1', items } as PlanWeek
}

describe('measurePlanListOverlap — #3717.7, mesurer AVANT de retirer', () => {
  it('ni le résumé ni les prochaines actions ne recoupent le tableau : zéro partout', () => {
    const overlap = measurePlanListOverlap({
      immediateAction: 'Cadrer le périmètre',
      nextActions: [nextAction({ label: 'Rappeler le DSI' })],
      planWeeks: [week([{ text: 'Préparer le rendez-vous' }])],
    })
    expect(overlap).toEqual({
      immediateActionEchoesFirstNextAction: false,
      nextActionsEchoedInBoard: 0,
      nextActionsTotal: 1,
    })
  })

  it('« Première action » du résumé répète le PREMIER « Prochaines actions » mot pour mot', () => {
    const overlap = measurePlanListOverlap({
      immediateAction: 'Rappeler le DSI',
      nextActions: [nextAction({ label: 'Rappeler le DSI' }), nextAction({ id: 'na-2', label: 'Envoyer le devis' })],
      planWeeks: [],
    })
    expect(overlap.immediateActionEchoesFirstNextAction).toBe(true)
  })

  it('la casse et les espaces de bord ne cassent pas le rapprochement', () => {
    const overlap = measurePlanListOverlap({
      immediateAction: '  Rappeler le DSI  ',
      nextActions: [nextAction({ label: 'RAPPELER LE DSI' })],
      planWeeks: [],
    })
    expect(overlap.immediateActionEchoesFirstNextAction).toBe(true)
  })

  it('un texte vide ne « recoupe » jamais rien — une absence n’est pas un doublon', () => {
    const overlap = measurePlanListOverlap({
      immediateAction: '',
      nextActions: [nextAction({ label: '' })],
      planWeeks: [],
    })
    expect(overlap.immediateActionEchoesFirstNextAction).toBe(false)
  })

  it('compte combien des « prochaines actions » sont DÉJÀ une ligne du tableau (texte exact)', () => {
    const overlap = measurePlanListOverlap({
      immediateAction: '',
      nextActions: [
        nextAction({ label: 'Rappeler le DSI' }),
        nextAction({ id: 'na-2', label: 'Envoyer le devis' }),
        nextAction({ id: 'na-3', label: 'Organiser un atelier' }),
      ],
      planWeeks: [week([{ text: 'Rappeler le DSI' }, { text: 'Envoyer le devis' }])],
    })
    expect(overlap.nextActionsEchoedInBoard).toBe(2)
    expect(overlap.nextActionsTotal).toBe(3)
  })
})
