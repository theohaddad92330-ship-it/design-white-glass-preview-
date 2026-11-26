import type { QueryRunner } from 'typeorm'
import { RepurgeErroredAccounts1786020000000 } from '../1786020000000-RepurgeErroredAccounts'

/** Capture every SQL statement the migration issues (no live DB needed) —
 *  same harness as PurgeEmptyDuplicateAccounts / IntlAccountRegistryId specs. */
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
  await new RepurgeErroredAccounts1786020000000().up(runner)
  return queries.map(normalize)
}

/**
 * Politique de re-purge (Decathlon errored vides persistants), vérifiée clause
 * par clause sur le SQL émis. Dataset de référence des scénarios encodés :
 *
 *   ws-1 / decathlon (avec completed) :
 *       A completed (contacts+plan)    → SURVIVANT (jamais condamné, ancre l'historique)
 *       B..F error, 0 donnée           → SUPPRIMÉES, runs+feedback re-parentés sur A
 *   ws-2 / decathlon (100 % vide — le bug prod) :
 *       G..K (5×) error, 0 donnée      → TOUTES SUPPRIMÉES (aucun survivant gardé),
 *                                        runs orphelins supprimés, feedback CASCADE
 *   ws-3 / blablacar :
 *       L error, 0 donnée, SEULE ligne → SUPPRIMÉE (groupe de 1 : plus d'exigence de doublon)
 *   ws-3 / thales :
 *       M error AVEC 2 contacts        → GARDÉE (garde-fou : porte des données)
 *       N completed                    → GARDÉE (jamais candidate)
 *   ws-3 / airbus :
 *       O analyzing depuis 10 min      → GARDÉE (run vivant, < 24 h)
 *       P analyzing depuis 3 jours, 0 donnée → SUPPRIMÉE (run mort > 24 h)
 */
describe('RepurgeErroredAccounts1786020000000', () => {
  it('matérialise le set condamné (doomed_id, survivor_id nullable) dans une temp table AVANT tout write, puis la nettoie', async () => {
    const flat = await runUp()
    const create = flat.find(q => q.includes('CREATE TEMP TABLE'))
    expect(create).toBeDefined()
    expect(create).toContain('_repurge_errored_accounts')
    expect(create).toContain('doomed_id')
    expect(create).toContain('survivor_id')
    // Nettoyée en fin de migration (dernier statement).
    expect(flat[flat.length - 1]).toBe('DROP TABLE IF EXISTS _repurge_errored_accounts')
  })

  it('groupe par (workspace — fallback user legacy) + company_name normalisé lower/trim, deleted exclu', async () => {
    const create = (await runUp()).find(q => q.includes('CREATE TEMP TABLE'))!
    expect(create).toContain("COALESCE('ws:' || a.workspace_id::text, 'u:' || a.user_id::text)")
    expect(create).toContain('LOWER(TRIM(a.company_name))')
    expect(create).toContain("a.status <> 'deleted'")
  })

  it('condamne toute coquille VIDE errored/canceled/analyzing-stale — SANS exigence de doublon (élargit #1786000000000)', async () => {
    const create = (await runUp()).find(q => q.includes('CREATE TEMP TABLE'))!
    // Les 3 statuts purgeables.
    expect(create).toContain("s.status = 'error'")
    expect(create).toContain("s.status = 'canceled'")
    expect(create).toContain("s.status = 'analyzing' AND s.updated_at < now() - interval '24 hours'")
    // Coquille vide = les 4 EXISTS agrégés dans has_data, tous requis faux (NOT has_data).
    expect(create).toContain('SELECT 1 FROM contacts c WHERE c.account_id = a.id')
    expect(create).toContain('SELECT 1 FROM attack_angles ang WHERE ang.account_id = a.id')
    expect(create).toContain('SELECT 1 FROM action_plans ap WHERE ap.account_id = a.id')
    expect(create).toContain("SELECT 1 FROM analysis_runs r WHERE r.account_id = a.id AND r.status = 'completed'")
    expect(create).toContain('NOT s.has_data')
    // ÉLARGISSEMENT : plus de group_size >= 2 ni de rn > 1 — un compte errored
    // vide SEUL est condamné. On garde la trace explicite de l'absence.
    expect(create).not.toContain('group_size')
    expect(create).not.toContain('rn > 1')
  })

  it("garde-fou absolu : une ligne AVEC la moindre donnée n'est jamais condamnée (has_data faux requis)", async () => {
    const create = (await runUp()).find(q => q.includes('CREATE TEMP TABLE'))!
    // is_doomed exige NOT has_data — completed/archived jamais dans les statuts purgés.
    expect(create).toContain('NOT s.has_data')
    expect(create).not.toContain("status = 'completed' AND") // completed n'est jamais un critère de suppression
  })

  it('choisit le survivant parmi les NON-condamnées uniquement (completed > données > récence), jamais une coquille condamnée', async () => {
    const create = (await runUp()).find(q => q.includes('CREATE TEMP TABLE'))!
    // Le survivant est tiré du set NON-condamné.
    expect(create).toContain('WHERE NOT f.is_doomed')
    expect(create).toContain("(f.status = 'completed') DESC")
    expect(create).toContain('f.has_data DESC')
    expect(create).toContain('f.updated_at DESC')
    // Un seul survivant par groupe.
    expect(create).toContain('DISTINCT ON (f.scope_key, f.company_key)')
    // Les condamnées sont sélectionnées par le flag, LEFT JOIN au survivant (nullable).
    expect(create).toContain('WHERE f.is_doomed')
    expect(create).toContain('LEFT JOIN survivors v')
  })

  it('groupe 100 % vide (5 Decathlon) : aucun survivant → runs orphelins SUPPRIMÉS (pas de FK)', async () => {
    const flat = await runUp()
    const del = flat.find(q => q.includes('DELETE FROM analysis_runs'))
    expect(del).toBeDefined()
    expect(del).toContain('p.survivor_id IS NULL')
    // Avant la suppression du compte.
    const runDelAt = flat.findIndex(q => q.includes('DELETE FROM analysis_runs'))
    const acctDelAt = flat.findIndex(q => q.includes('DELETE FROM accounts'))
    expect(runDelAt).toBeGreaterThanOrEqual(0)
    expect(acctDelAt).toBeGreaterThan(runDelAt)
  })

  it('survivant présent : historique runs RE-PARENTÉ (analyzing→error) AVANT le delete', async () => {
    const flat = await runUp()
    const reparent = flat.find(q => q.includes('UPDATE analysis_runs'))
    expect(reparent).toBeDefined()
    expect(reparent).toContain('SET account_id = p.survivor_id')
    expect(reparent).toContain('p.survivor_id IS NOT NULL')
    expect(reparent).toContain("WHEN r.status = 'analyzing' THEN 'error'")
    const reparentAt = flat.findIndex(q => q.includes('UPDATE analysis_runs'))
    const deleteAt = flat.findIndex(q => q.includes('DELETE FROM accounts'))
    expect(deleteAt).toBeGreaterThan(reparentAt)
  })

  it('mémoire feedback #506 re-parentée sur le survivant AVANT le delete (sinon CASCADE la détruit)', async () => {
    const flat = await runUp()
    const reparent = flat.find(q => q.includes('UPDATE account_feedback'))
    expect(reparent).toBeDefined()
    expect(reparent).toContain('SET account_id = p.survivor_id')
    expect(reparent).toContain('p.survivor_id IS NOT NULL')
    const reparentAt = flat.findIndex(q => q.includes('UPDATE account_feedback'))
    const deleteAt = flat.findIndex(q => q.includes('DELETE FROM accounts'))
    expect(deleteAt).toBeGreaterThan(reparentAt)
  })

  it('le DELETE des comptes ne touche QUE les ids condamnés matérialisés', async () => {
    const flat = await runUp()
    const del = flat.find(q => q.includes('DELETE FROM accounts'))
    expect(del).toBeDefined()
    expect(del).toContain('USING _repurge_errored_accounts p')
    expect(del).toContain('WHERE a.id = p.doomed_id')
    // Exactement deux DELETE : runs orphelins + comptes (aucun autre).
    expect(flat.filter(q => q.includes('DELETE FROM')).length).toBe(2)
  })

  it('est idempotente : aucun état persistant hors temp table, recalcul depuis les données', async () => {
    const flat = await runUp()
    expect(flat.some(q => q.includes('CREATE TEMP TABLE'))).toBe(true)
    expect(flat.some(q => q.includes('CREATE TABLE ') && !q.includes('TEMP'))).toBe(false)
    expect(flat.some(q => q.includes('ALTER TABLE'))).toBe(false)
  })

  it('down() est un no-op documenté (lignes supprimées non restaurables)', async () => {
    const { runner, queries } = createRunner()
    await new RepurgeErroredAccounts1786020000000().down(runner)
    expect(queries).toEqual([])
  })
})
