import { describe, expect, it } from 'vitest'
import { PIPELINE_STAGES } from './project.js'
import { DEAL_STAGE_SLA_BOUNDS, DEAL_STAGE_SLA_DEFAULTS, dealStageAging, effectiveStageSla } from './deal-stage-sla.js'

/**
 * LE SLA D'ÉTAPE DU PIPE — PDF 3 §3.5, ticket `BEL-CRM-203` PR5.
 *
 * « Chaque étape porte une durée cible, réglable par espace. »
 *   qualifying 7 j · qualified 14 j · proposing 7 j · negotiating 21 j
 * « Le SLA n'est pas une contrainte, c'est un révélateur. Il dit où le pipe
 * coince, pas qui est en retard. »
 */
describe('DEAL_STAGE_SLA_DEFAULTS — les quatre seuils de la source', () => {
  it('porte 7 / 14 / 7 / 21 sur les quatre étapes encore en jeu', () => {
    expect(DEAL_STAGE_SLA_DEFAULTS.qualified).toBe(7)
    expect(DEAL_STAGE_SLA_DEFAULTS.confirmed).toBe(14)
    expect(DEAL_STAGE_SLA_DEFAULTS.profiles_submitted).toBe(7)
    expect(DEAL_STAGE_SLA_DEFAULTS.negotiation).toBe(21)
  })

  it('une affaire GAGNÉE n’a pas de durée cible — elle ne vieillit plus', () => {
    expect(DEAL_STAGE_SLA_DEFAULTS.won).toBeNull()
  })

  it('couvre les cinq étapes du pipe, sans en inventer une sixième', () => {
    expect(Object.keys(DEAL_STAGE_SLA_DEFAULTS).sort()).toEqual([...PIPELINE_STAGES].sort())
  })
})

describe('effectiveStageSla — un réglage d’espace, un défaut nommé', () => {
  it('sans réglage, le défaut de la source', () => {
    expect(effectiveStageSla('negotiation', {})).toEqual({ days: 21, isDefault: true })
  })

  it('un réglage d’espace l’emporte, et le DIT', () => {
    expect(effectiveStageSla('negotiation', { negotiation: 30 })).toEqual({ days: 30, isDefault: false })
  })

  it('un réglage hors bornes est IGNORÉ — on retombe sur le défaut, jamais sur zéro', () => {
    for (const absurd of [0, -3, DEAL_STAGE_SLA_BOUNDS.max + 1, Number.NaN]) {
      expect(effectiveStageSla('qualified', { qualified: absurd })).toEqual({ days: 7, isDefault: true })
    }
  })

  it('une étape sans durée cible reste sans durée cible, même réglée', () => {
    // `won` n'a pas de séjour à surveiller : lui régler un SLA n'a pas de sens,
    // et l'accepter ferait apparaître « en retard » sur une affaire signée.
    expect(effectiveStageSla('won', { won: 10 })).toEqual({ days: null, isDefault: true })
  })
})

describe('dealStageAging — « non mesuré » n’est jamais « 0 jour »', () => {
  const NOW = new Date('2026-09-01T12:00:00.000Z')

  it('compte les jours depuis l’entrée dans l’étape', () => {
    const aging = dealStageAging({
      stage: 'negotiation',
      stageEnteredAt: '2026-08-20T12:00:00.000Z',
      now: NOW,
      overrides: {},
    })
    expect(aging.days).toBe(12)
    expect(aging.slaDays).toBe(21)
    expect(aging.overdue).toBe(false)
  })

  it('au-delà de la durée cible, l’étape est signalée', () => {
    const aging = dealStageAging({
      stage: 'qualified',
      stageEnteredAt: '2026-08-20T12:00:00.000Z',
      now: NOW,
      overrides: {},
    })
    expect(aging.days).toBe(12)
    expect(aging.overdue).toBe(true)
  })

  /**
   * ⚠️ LE PIÈGE. Un deal sans date d'entrée n'est pas « à 0 jour » : il est NON
   * MESURÉ. Un zéro se lirait « il vient d'arriver », c'est-à-dire exactement
   * l'inverse de ce qu'on sait — on ne sait rien.
   */
  it('sans date d’entrée, tout est `null` — jamais zéro, jamais « à l’heure »', () => {
    for (const missing of [null, undefined, '', 'pas-une-date']) {
      const aging = dealStageAging({ stage: 'negotiation', stageEnteredAt: missing, now: NOW, overrides: {} })
      expect(aging.days).toBeNull()
      expect(aging.overdue).toBeNull()
      // La durée cible, elle, reste connue : elle ne dépend pas du deal.
      expect(aging.slaDays).toBe(21)
    }
  })

  it('une date d’entrée dans le FUTUR est non mesurée, pas négative', () => {
    const aging = dealStageAging({
      stage: 'negotiation',
      stageEnteredAt: '2026-12-01T00:00:00.000Z',
      now: NOW,
      overrides: {},
    })
    expect(aging.days).toBeNull()
    expect(aging.overdue).toBeNull()
  })

  it('une étape sans durée cible ne peut pas être « en retard »', () => {
    const aging = dealStageAging({
      stage: 'won',
      stageEnteredAt: '2020-01-01T00:00:00.000Z',
      now: NOW,
      overrides: {},
    })
    expect(aging.days).toBe(2435)
    expect(aging.slaDays).toBeNull()
    expect(aging.overdue).toBeNull()
  })

  it('le réglage de l’espace commande le verdict', () => {
    const late = dealStageAging({
      stage: 'qualified',
      stageEnteredAt: '2026-08-20T12:00:00.000Z',
      now: NOW,
      overrides: {},
    })
    const relaxed = dealStageAging({
      stage: 'qualified',
      stageEnteredAt: '2026-08-20T12:00:00.000Z',
      now: NOW,
      overrides: { qualified: 30 },
    })
    expect(late.overdue).toBe(true)
    expect(relaxed.overdue).toBe(false)
    expect(relaxed.slaDays).toBe(30)
  })
})
