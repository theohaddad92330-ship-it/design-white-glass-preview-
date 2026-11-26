import type { QueryRunner } from 'typeorm'
import { PLAN_CATALOG_DEFAULTS } from '../../modules/credits/plan-catalog.defaults'
import { DiscoveryPlan1787943271504 } from '../1787943271504-DiscoveryPlan'

function createRunner(): { runner: QueryRunner; calls: Array<{ sql: string; params?: unknown[] }> } {
  const calls: Array<{ sql: string; params?: unknown[] }> = []
  const runner = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params })
      return []
    }),
  } as unknown as QueryRunner
  return { runner, calls }
}

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

describe('DiscoveryPlan1787943271504', () => {
  it('seeds the découverte plan avec le volume COURANT des défauts, gratuit, non checkout-able', async () => {
    const { runner, calls } = createRunner()
    await new DiscoveryPlan1787943271504().up(runner)

    const insert = calls.find(c => c.sql.includes('INSERT INTO plan_definitions'))
    expect(insert).toBeDefined()
    // [key, label, price_cents, accounts_limit, enrichment_credits, seats, self_serve, sort_order]
    // La migration lit `PLAN_CATALOG_DEFAULTS` à l'exécution : elle ne rejoue donc
    // pas l'histoire, elle sème la valeur du jour. On l'assume et on l'énonce —
    // figer un nombre ici prétendrait à une immuabilité que le code n'a pas.
    expect(insert?.params).toEqual([
      'decouverte',
      'Découverte',
      0,
      PLAN_CATALOG_DEFAULTS.decouverte.accounts_limit,
      0,
      1,
      false,
      0,
    ])
  })

  it("n'écrase jamais un quota déjà ajusté par un opérateur (ON CONFLICT DO NOTHING)", async () => {
    const { runner, calls } = createRunner()
    await new DiscoveryPlan1787943271504().up(runner)

    const insert = calls.map(c => normalize(c.sql)).find(q => q.includes('INSERT INTO plan_definitions'))
    expect(insert).toContain('ON CONFLICT (key) DO NOTHING')
  })

  it('fait démarrer un nouveau compte en découverte, avec la fenêtre de 7 jours', async () => {
    const { runner, calls } = createRunner()
    await new DiscoveryPlan1787943271504().up(runner)

    const trigger = calls.map(c => normalize(c.sql)).find(q => q.includes('handle_new_user_credits'))
    expect(trigger).toBeDefined()
    expect(trigger).toContain(
      `VALUES (NEW.id, 'decouverte', ${PLAN_CATALOG_DEFAULTS.decouverte.accounts_limit}, 0, now() + interval '7 days')`,
    )
    // L'essai complet n'est plus accordé automatiquement.
    expect(trigger).not.toContain("'trial'")
  })

  it('ne touche AUCUNE ligne subscriptions existante (personne ne se réveille bridé)', async () => {
    const { runner, calls } = createRunner()
    await new DiscoveryPlan1787943271504().up(runner)

    const touchesSubscriptions = calls
      .map(c => normalize(c.sql))
      .filter(q => /\b(UPDATE|DELETE FROM)\s+subscriptions\b/i.test(q))
    expect(touchesSubscriptions).toEqual([])
  })
})
