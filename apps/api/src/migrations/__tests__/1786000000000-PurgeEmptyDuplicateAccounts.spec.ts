import type { QueryRunner } from 'typeorm'
import { PurgeEmptyDuplicateAccounts1786000000000 } from '../1786000000000-PurgeEmptyDuplicateAccounts'

/** Capture every SQL statement the migration issues (no live DB needed) —
 *  same harness as the IntlAccountRegistryId spec. */
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
  await new PurgeEmptyDuplicateAccounts1786000000000().up(runner)
  return queries.map(normalize)
}

/**
 * Politique de purge (bug prod « 7× Decathlon ») vérifiée clause par clause sur
 * le SQL émis. Chaque test correspond à un scénario du dataset de doublons :
 *
 *   ws-1 / decathlon :  A completed (contacts+plan)   → SURVIVANT (rang 1)
 *                       B error, 0 donnée              → SUPPRIMÉE
 *                       C error, 0 donnée              → SUPPRIMÉE
 *                       D error, 3 contacts            → GARDÉE (jamais purgée :
 *                                                        elle a des données)
 *   ws-1 / blablacar :  E error 0 donnée (récente)     → SURVIVANTE (rang 1 du
 *                                                        groupe sans completed)
 *                       F error 0 donnée (ancienne)    → SUPPRIMÉE
 *   ws-2 / decathlon :  G error 0 donnée, seule ligne  → GARDÉE (groupe < 2)
 */
describe('PurgeEmptyDuplicateAccounts1786000000000', () => {
  it('matérialise le set des doublons dans une table temporaire AVANT tout write (cohérence re-parent + delete)', async () => {
    const flat = await runUp()
    const create = flat.find(q => q.includes('CREATE TEMP TABLE'))
    expect(create).toBeDefined()
    expect(create).toContain('_purge_dup_accounts')
    // La temp table porte (doomed_id, survivor_id) pour re-parenter puis supprimer.
    expect(create).toContain('doomed_id')
    expect(create).toContain('survivor_id')
    // Et elle est nettoyée en fin de migration.
    expect(flat[flat.length - 1]).toBe('DROP TABLE IF EXISTS _purge_dup_accounts')
  })

  it('groupe par (workspace — fallback user pour les lignes legacy) + company_name normalisé lower/trim', async () => {
    const flat = await runUp()
    const create = flat.find(q => q.includes('CREATE TEMP TABLE'))!
    expect(create).toContain("COALESCE('ws:' || a.workspace_id::text, 'u:' || a.user_id::text)")
    expect(create).toContain('LOWER(TRIM(a.company_name))')
    // Les lignes deleted sont invisibles pour l'UI : ni candidates, ni comptées.
    expect(create).toContain("a.status <> 'deleted'")
  })

  it("choisit le survivant : completed d'abord, puis la ligne AVEC données, puis la plus récente", async () => {
    const flat = await runUp()
    const create = flat.find(q => q.includes('CREATE TEMP TABLE'))!
    // Ranking dans la window : completed > has_data > updated_at desc.
    expect(create).toContain("(status = 'completed') DESC")
    expect(create).toContain('has_data DESC')
    expect(create).toContain('updated_at DESC')
    // Le survivant est le rang 1 de son groupe ; on ne supprime QUE rn > 1.
    expect(create).toContain('rn = 1')
    expect(create).toContain('d.rn > 1')
    // Et uniquement s'il y a effectivement doublon (≥ 2 lignes visibles).
    expect(create).toContain('group_size >= 2')
  })

  it('ne condamne QUE les coquilles vides : errored / analyzing stale, zéro contact, zéro angle, zéro plan, zéro run completed', async () => {
    const flat = await runUp()
    const create = flat.find(q => q.includes('CREATE TEMP TABLE'))!
    // Statuts purgés : error, ou analyzing bloqué depuis > 24h (une vraie analyse
    // dure 3-6 min — 24h = mort). completed/archived/canceled ne sont JAMAIS purgés.
    expect(create).toContain("d.status = 'error'")
    expect(create).toContain("d.status = 'analyzing' AND d.updated_at < now() - interval '24 hours'")
    // Coquille vide = aucune donnée rattachée, vérifié via has_data qui agrège
    // les quatre EXISTS (contacts, attack_angles, action_plans, runs completed).
    expect(create).toContain('SELECT 1 FROM contacts c WHERE c.account_id = a.id')
    expect(create).toContain('SELECT 1 FROM attack_angles ang WHERE ang.account_id = a.id')
    expect(create).toContain('SELECT 1 FROM action_plans ap WHERE ap.account_id = a.id')
    expect(create).toContain("SELECT 1 FROM analysis_runs r WHERE r.account_id = a.id AND r.status = 'completed'")
    // Une ligne avec la moindre donnée n'est JAMAIS supprimée.
    expect(create).toContain('NOT d.has_data')
  })

  it("re-parente l'historique analysis_runs des coquilles vers le survivant AVANT le delete (pas de FK → orphelins sinon)", async () => {
    const flat = await runUp()
    const reparent = flat.find(q => q.includes('UPDATE analysis_runs'))
    expect(reparent).toBeDefined()
    expect(reparent).toContain('SET account_id = p.survivor_id')
    // Les runs encore « analyzing » d'une coquille morte sont clos en error —
    // l'historique du survivant reste véridique (rien ne tourne plus).
    expect(reparent).toContain("WHEN r.status = 'analyzing' THEN 'error'")
    // Ordre : re-parent avant delete.
    const reparentAt = flat.findIndex(q => q.includes('UPDATE analysis_runs'))
    const deleteAt = flat.findIndex(q => q.includes('DELETE FROM accounts'))
    expect(reparentAt).toBeGreaterThanOrEqual(0)
    expect(deleteAt).toBeGreaterThan(reparentAt)
  })

  it('re-parente la mémoire feedback (#506) vers le survivant AVANT le delete (FK CASCADE la détruirait)', async () => {
    const flat = await runUp()
    const reparent = flat.find(q => q.includes('UPDATE account_feedback'))
    expect(reparent).toBeDefined()
    expect(reparent).toContain('SET account_id = p.survivor_id')
    const reparentAt = flat.findIndex(q => q.includes('UPDATE account_feedback'))
    const deleteAt = flat.findIndex(q => q.includes('DELETE FROM accounts'))
    expect(deleteAt).toBeGreaterThan(reparentAt)
  })

  it('le DELETE ne touche QUE les ids condamnés matérialisés (jamais un survivant, jamais une ligne avec données)', async () => {
    const flat = await runUp()
    const del = flat.find(q => q.includes('DELETE FROM accounts'))
    expect(del).toBeDefined()
    // Le delete est borné au set matérialisé — la politique (coquille vide,
    // rn > 1, groupe ≥ 2) a déjà été appliquée à la construction du set.
    expect(del).toContain('USING _purge_dup_accounts p')
    expect(del).toContain('WHERE a.id = p.doomed_id')
    // Un seul DELETE dans toute la migration.
    expect(flat.filter(q => q.includes('DELETE FROM')).length).toBe(1)
  })

  it('est idempotente : re-jouée sur une base déjà purgée, le set des condamnées est simplement vide', async () => {
    const flat = await runUp()
    // Aucun état persistant hors temp table : le set est recalculé depuis les
    // données à chaque run ; sans doublon, doomed = ∅ → updates/delete no-op.
    expect(flat.some(q => q.includes('CREATE TEMP TABLE'))).toBe(true)
    expect(flat.some(q => q.includes('CREATE TABLE ') && !q.includes('TEMP'))).toBe(false)
    // Rien d'autre que la temp table n'est créé (pas d'index, pas de colonne).
    expect(flat.some(q => q.includes('ALTER TABLE'))).toBe(false)
  })

  it('down() est un no-op documenté (les lignes supprimées ne sont pas restaurables)', async () => {
    const { runner, queries } = createRunner()
    await new PurgeEmptyDuplicateAccounts1786000000000().down(runner)
    expect(queries).toEqual([])
  })
})
