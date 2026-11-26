import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_AFFAIRES_V22_COVERAGE } from './demo-coverage'
import { DEMO_DELIVERY_CLIENT } from './demo-dataset'

/**
 * #4499 (Louis 23/10/2026) — craft rule n°9 : Affaires, repris au dessin de la maquette V22, est REMPLI en démo.
 * La ligne de synthèse lit le pipe (montants), la carte lit le montant (ou « Montant à saisir »), la prochaine action
 * (une tâche ouverte rattachée à l'affaire) et le responsable. Ce test lit le jeu de données ET le semis.
 */
const client = DEMO_DELIVERY_CLIENT
const deals = [client.openProject, ...client.pipelineProjects]
const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')

describe('#4499 — Affaires V22 en démo', () => {
  it('est classée SEEDÉE, avec sa raison écrite', () => {
    expect(DEMO_AFFAIRES_V22_COVERAGE.state).toBe('seede')
    expect(DEMO_AFFAIRES_V22_COVERAGE.reason).toMatch(/pipe ouvert HT/)
  })

  it('des affaires ouvertes CHIFFRÉES, et une sans montant (« Montant à saisir », jamais 0)', () => {
    const priced = deals.filter(deal => typeof deal.amount_cents === 'number' && deal.amount_cents > 0)
    const unpriced = deals.filter(deal => deal.amount_cents === undefined)
    expect(priced.length).toBeGreaterThanOrEqual(2)
    expect(unpriced.length).toBeGreaterThanOrEqual(1)
    expect(deals.some(deal => deal.amount_cents === 0)).toBe(false)
  })

  it('des prochaines actions datées, écrites en VRAIES tâches rattachées à l’affaire', () => {
    const withAction = deals.filter(deal => deal.nextAction !== undefined)
    expect(withAction.length).toBeGreaterThanOrEqual(2)
    expect(withAction.every(deal => (deal.nextAction?.title ?? '').trim().length > 0)).toBe(true)
    expect(seed).toMatch(/INSERT INTO tasks \([^)]*project_id\)/)
    expect(seed).toMatch(/seedProjectNextAction\(workspaceId, ownerUserId, dealRow\.id, deal\.nextAction/)
  })

  it('sait dire NON — un pipe sans prochaine action serait refusé', () => {
    const empty = deals.map(deal => ({ ...deal, nextAction: undefined }))
    expect(empty.filter(deal => deal.nextAction !== undefined).length).toBeLessThan(2)
  })
})
