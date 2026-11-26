import type { QueryRunner } from 'typeorm'
import { PlanFeaturesGridRepair1788259845112 } from '../../migrations/1788259845112-PlanFeaturesGridRepair'
import { PLAN_CATALOG_DEFAULTS, PLAN_KEYS } from './plan-catalog.defaults'

/**
 * La production a reçu le seed « tout ouvert » de la toute première version du
 * gating : les trois paliers portaient les mêmes cinq fonctions, donc les cartes
 * annonçaient toutes la même chose et « Tout Team, plus : » ne listait rien.
 *
 * Ce que ce test protège : la réparation remet la grille du code, et elle ne
 * touche QUE les lignes portant exactement cette signature — une grille posée à
 * la main dans le backoffice doit survivre.
 */
describe('réparation de la grille de features', () => {
  async function run(): Promise<{ sql: string; params?: unknown[] }[]> {
    const calls: { sql: string; params?: unknown[] }[] = []
    const queryRunner = {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params })
        return []
      }),
    } as unknown as QueryRunner
    await new PlanFeaturesGridRepair1788259845112().up(queryRunner)
    return calls
  }

  it('réécrit chaque palier avec la grille du code', async () => {
    const seeded = Object.fromEntries((await run()).map(call => [call.params![1], call.params![0]]))
    expect(seeded).toEqual(
      Object.fromEntries(PLAN_KEYS.map(key => [key, JSON.stringify(PLAN_CATALOG_DEFAULTS[key].features)])),
    )
  })

  it("ne cible QUE la signature du seed d'origine (une grille d'opérateur survit)", async () => {
    for (const call of await run()) {
      // Comparaison d'ENSEMBLE : l'ordre stocké en base n'est pas garanti, et
      // une comparaison ordonnée raterait les lignes à réparer.
      expect(call.sql).toContain('array_agg(value ORDER BY value)')
      expect(call.params![2]).toEqual(['chat_ai', 'crm_sync', 'exports', 'mcp_assistant', 'public_api'])
    }
  })

  it('la grille réparée redonne bien une marche entre les paliers', () => {
    // Le symptôme visible du bug : aucun delta entre les paliers. S'il revenait,
    // c'est ici que ça doit casser, pas sur un écran en production.
    const starter = new Set(PLAN_CATALOG_DEFAULTS.starter.features)
    const team = PLAN_CATALOG_DEFAULTS.team.features.filter(key => !starter.has(key))
    const growth = PLAN_CATALOG_DEFAULTS.growth.features.filter(key => !starter.has(key))
    expect(team.length).toBeGreaterThan(0)
    expect(growth.length).toBeGreaterThan(0)
    // #4381 (Louis 20/10) — Entreprise (`team`) porte TOUT : plus aucune fonction de Growth ne lui manque.
    const teamSet = new Set(PLAN_CATALOG_DEFAULTS.team.features)
    expect(PLAN_CATALOG_DEFAULTS.growth.features.filter(key => !teamSet.has(key))).toEqual([])
  })
})
