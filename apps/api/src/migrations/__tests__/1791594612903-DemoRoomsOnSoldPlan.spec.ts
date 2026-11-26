import type { QueryRunner } from 'typeorm'
import { DemoRoomsOnSoldPlan1791594612903 } from '../1791594612903-DemoRoomsOnSoldPlan'

function createRunner(): { runner: QueryRunner; queries: string[] } {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql)
      return []
    }),
  } as unknown as QueryRunner
  return { runner, queries }
}

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

async function runUp(): Promise<string[]> {
  const { runner, queries } = createRunner()
  await new DemoRoomsOnSoldPlan1791594612903().up(runner)
  return queries.map(normalize)
}

/**
 * Un `UPDATE subscriptions` est le genre d'ordre dont on découvre le `WHERE`
 * trop large chez un client qui paye. Chaque garde est donc vérifiée
 * séparément — et le dépôt a déjà cassé la démo une fois par une jointure trop
 * gourmande.
 */
describe('DemoRoomsOnSoldPlan1791594612903', () => {
  it('émet bien du SQL (sinon le garde ne garde rien)', async () => {
    expect((await runUp()).length).toBeGreaterThanOrEqual(1)
  })

  it('pose le palier VENDU sur les salles, sans fenêtre d’essai', async () => {
    const sql = (await runUp())[0]!
    expect(sql).toContain("plan = 'growth'")
    expect(sql).toContain('trial_end = NULL')
  })

  it('lit le quota dans le catalogue vivant plutôt qu’en dur', async () => {
    // Un repricing fait au back-office doit atteindre les démos aussi.
    const sql = (await runUp())[0]!
    expect(sql).toContain("SELECT accounts_limit FROM plan_definitions WHERE key = 'growth'")
  })

  it('ne vise QUE les propriétaires d’un espace de démonstration', async () => {
    const sql = (await runUp())[0]!
    expect(sql).toContain('user_id IN (SELECT owner_user_id FROM workspaces WHERE is_demo = true)')
  })

  it('épargne quelqu’un qui possède AUSSI un espace réel', async () => {
    const sql = (await runUp())[0]!
    expect(sql).toContain('user_id NOT IN (SELECT owner_user_id FROM workspaces WHERE is_demo = false)')
  })

  it('n’approche jamais une ligne rattachée à Stripe', async () => {
    const sql = (await runUp())[0]!
    expect(sql).toContain('stripe_subscription_id IS NULL')
    expect(sql).toContain('stripe_customer_id IS NULL')
  })

  it('ne part QUE d’un palier gratuit — une salle déjà alignée n’est pas retouchée', async () => {
    const sql = (await runUp())[0]!
    expect(sql).toContain("plan IN ('trial', 'decouverte')")
  })

  it('n’est pas un UPDATE sans WHERE', async () => {
    const sql = (await runUp())[0]!
    expect(sql).toContain('WHERE')
    expect(sql.indexOf('WHERE')).toBeGreaterThan(sql.indexOf('SET'))
  })
})
