import type { QueryRunner } from 'typeorm'
import { NoFreeTrial1791593847216 } from '../1791593847216-NoFreeTrial'

/** Capture le SQL émis, sans base vivante (même harnais que les autres specs
 *  de migration de ce dossier). */
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
  await new NoFreeTrial1791593847216().up(runner)
  return queries.map(normalize)
}

/**
 * L'étape 3 est IRRÉVERSIBLE sans sauvegarde : elle ferme des fenêtres d'essai
 * encore ouvertes en production. Ses clauses sont donc vérifiées une par une —
 * c'est le genre d'`UPDATE` dont on ne découvre le `WHERE` manquant qu'après.
 */
describe('NoFreeTrial1791593847216', () => {
  it('émet bien du SQL (sinon le garde ne garde rien)', async () => {
    expect((await runUp()).length).toBeGreaterThanOrEqual(3)
  })

  it('met les deux paliers gratuits du catalogue à zéro crédit, et hors self-service', async () => {
    const sql = (await runUp()).find(q => q.includes('UPDATE plan_definitions'))
    expect(sql).toBeDefined()
    expect(sql).toContain('accounts_limit = 0')
    expect(sql).toContain('enrichment_credits = 0')
    expect(sql).toContain('self_serve = false')
    expect(sql).toContain("key IN ('trial', 'decouverte')")
  })

  it('ne touche AUCUN palier vendu — un UPDATE sans WHERE mettrait Growth à zéro', async () => {
    const sql = (await runUp()).find(q => q.includes('UPDATE plan_definitions'))!
    for (const sold of ['growth', 'team', 'starter', 'beta']) expect(sql).not.toContain(`'${sold}'`)
  })

  it('réécrit le trigger de signup pour qu’il pose une ligne à ZÉRO crédit', async () => {
    const sql = (await runUp()).find(q => q.includes('handle_new_user_credits'))
    expect(sql).toBeDefined()
    expect(sql).toContain('CREATE OR REPLACE FUNCTION')
    // La ligne est POSÉE (la facturation a besoin d'un sujet) mais n'ouvre rien.
    expect(sql).toContain("VALUES (NEW.id, 'decouverte', 0, 0, now())")
    // Et surtout : plus de fenêtre à faire courir.
    expect(sql).not.toContain("interval '7 days'")
  })

  it('ferme les fenêtres encore ouvertes — et SEULEMENT sur les paliers gratuits', async () => {
    const sql = (await runUp()).find(q => q.includes('UPDATE subscriptions'))
    expect(sql).toBeDefined()
    expect(sql).toContain('SET trial_end = now()')
    expect(sql).toContain("plan IN ('trial', 'decouverte')")
    // Le garde qui compte : sans lui, l'UPDATE fermerait la fenêtre de tout le
    // monde, y compris des abonnements payants qui n'en ont pas.
    expect(sql).toContain('(trial_end IS NULL OR trial_end > now())')
  })

  it('n’écrase pas la date d’une fenêtre DÉJÀ fermée — elle raconte quand', async () => {
    const sql = (await runUp()).find(q => q.includes('UPDATE subscriptions'))!
    // `trial_end > now()` exclut le passé : une ligne expirée en juillet garde
    // sa date de juillet.
    expect(sql).toContain('trial_end > now()')
  })

  it('ne remet à zéro NI le quota NI l’usage des lignes vivantes', async () => {
    const sql = (await runUp()).find(q => q.includes('UPDATE subscriptions'))!
    // `accounts_used` raconte ce qui a été réellement consommé ; un plafond
    // descendu sous l'usage afficherait « 8 / 0 ».
    expect(sql).not.toContain('accounts_used')
    expect(sql).not.toContain('accounts_limit')
  })
})
