import { describe, expect, it } from 'vitest'
import { pipelineSummary } from './project.js'

/**
 * #1325 (3/9.1) — « Chaque header de colonne doit afficher : nombre de projets,
 * valeur totale, éventuellement nombre sans prochaine action. »
 *
 * Les deux premiers y étaient déjà (mesuré à l'écran le 02/09 : « Qualifié · 6 ·
 * 643 000 € »). Le troisième manquait, et c'est celui qui rend la colonne
 * ACTIONNABLE : « 3 projets · 129 k€ · 1 sans prochaine action » dit où
 * regarder.
 *
 * ⚠️ `has_next_action` est OPTIONNEL et TRIVALENT. `undefined` = on ne l'a pas
 * demandé au serveur ; ce n'est pas « pas de prochaine action ». Compter un
 * projet dont on ignore l'état comme « sans action » afficherait une alerte
 * fausse — c'est « non mesuré n'est pas mesuré à zéro », appliqué à un compteur.
 */
describe('pipelineSummary — le nombre sans prochaine action (#1325)', () => {
  it('compte les projets d’une colonne qui n’ont aucune prochaine action', () => {
    const summary = pipelineSummary([
      { stage: 'qualified', amount_cents: 1000, has_next_action: true },
      { stage: 'qualified', amount_cents: 2000, has_next_action: false },
      { stage: 'qualified', amount_cents: 3000, has_next_action: false },
    ])

    const qualified = summary.columns.find(column => column.stage === 'qualified')
    expect(qualified?.count).toBe(3)
    expect(qualified?.without_next_action).toBe(2)
  })

  it('ne compte PAS un projet dont on n’a pas demandé l’état', () => {
    const summary = pipelineSummary([
      { stage: 'qualified', amount_cents: 1000 },
      { stage: 'qualified', amount_cents: 2000 },
    ])

    // `undefined` n'est pas `false` : ignorer la distinction afficherait
    // « 2 sans prochaine action » sur un écran qui n'en sait rien.
    expect(summary.columns.find(column => column.stage === 'qualified')?.without_next_action).toBe(0)
  })

  // #4291.8 — une affaire SIGNÉE n'a plus de relance commerciale due : son suivi est la planification.
  it('#4291.8 — une affaire signée n’est jamais « sans prochaine action »', () => {
    const summary = pipelineSummary([{ stage: 'won', amount_cents: 1000, has_next_action: false }])
    const won = summary.columns.find(column => column.stage === 'won')
    expect(won?.count).toBe(1)
    expect(won?.without_next_action).toBe(0)
  })

  it('reste à zéro quand tout est couvert — un compteur nul est une bonne nouvelle VRAIE', () => {
    const summary = pipelineSummary([{ stage: 'negotiation', amount_cents: 1, has_next_action: true }])

    expect(summary.columns.find(column => column.stage === 'negotiation')?.without_next_action).toBe(0)
  })
})
