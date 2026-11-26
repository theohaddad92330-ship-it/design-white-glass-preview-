import { NotFoundException } from '@nestjs/common'
import { AccountCrmFusionService } from './account-crm-fusion.service'

const WS = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'

const CANDIDATES = [
  {
    id: 'crm',
    company_name: 'VEEPEE',
    siren: null,
    status: 'analyzing',
    commercial_status: 'inbox',
    has_runs: false,
    crm_side: true,
    updated_at: null,
  },
  {
    id: 'ana',
    company_name: 'Veepee SAS',
    siren: null,
    status: 'completed',
    commercial_status: 'inbox',
    has_runs: true,
    crm_side: false,
    updated_at: null,
  },
]

/** #4783 — comme le driver `pg` via TypeORM : un `UPDATE … RETURNING` rend `[lignes, nombre]`, jamais les lignes. */
const updated = <T>(rows: T[]) => [rows, rows.length]

function harness(opts: { undone?: unknown[]; archived?: boolean; restored?: boolean } = {}) {
  const calls: { sql: string; params: unknown[] }[] = []
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params })
    if (sql.includes('FROM accounts a') && sql.includes('crm_side')) return CANDIDATES
    if (sql.includes('FROM duplicate_pairs')) return []
    if (sql.includes('FROM account_crm_fusions') && sql.includes('undone_at IS NOT NULL')) return []
    if (sql.startsWith('UPDATE accounts a') && sql.includes("status = 'archived'"))
      return updated(opts.archived === false ? [] : [{ id: 'crm' }])
    if (sql.includes('UPDATE contacts t')) return updated([{ id: 'c1' }, { id: 'c2' }])
    if (sql.includes('UPDATE crm_deals t')) return updated([{ id: 'd1' }])
    if (sql.includes('INSERT INTO account_crm_fusions')) return [{ id: 'f1' }]
    if (sql.includes('UPDATE account_crm_fusions')) return updated(opts.undone ?? [])
    if (sql.includes('status = a.merged_previous_status'))
      return updated(opts.restored === false ? [] : [{ id: 'crm' }])
    return []
  })
  const manager = { query, transaction: jest.fn(async (cb: (m: unknown) => unknown) => cb({ query })) }
  const accounts = { manager }
  const service = new AccountCrmFusionService(accounts as never)
  const writes = () => calls.filter(c => /^\s*(UPDATE|INSERT|DELETE)/.test(c.sql))
  return { service, calls, writes, manager }
}

describe('#4603 — AccountCrmFusionService (rattrapage ciblé, réversible)', () => {
  it('la SIMULATION compte et nomme les paires sans RIEN écrire', async () => {
    const { service, writes } = harness()
    const report = await service.sweep(WS, USER, { dryRun: true, limit: 25 })
    expect(report).toEqual({
      dryRun: true,
      found: 1,
      merged: 0,
      ambiguous: 0,
      humanDecided: 0,
      deferred: 0,
      pairs: [
        {
          keptId: 'ana',
          keptName: 'Veepee SAS',
          absorbedId: 'crm',
          absorbedName: 'VEEPEE',
          basis: 'name',
          key: 'veepee',
        },
      ],
    })
    expect(writes()).toEqual([])
  })

  it('lit les candidats DANS l’espace de l’appelant, jamais tout le parc', async () => {
    const { service, calls } = harness()
    await service.sweep(WS, USER, { dryRun: true, limit: 25 })
    const read = calls.find(c => c.sql.includes('crm_side'))!
    expect(read.sql).toContain('a.workspace_id = $1')
    expect(read.params).toEqual([WS])
  })

  it('la FUSION archive la fiche CRM (jamais supprimée), déplace l’union, et journalise les deux ids et la clé', async () => {
    const { service, writes, manager } = harness()
    const report = await service.sweep(WS, USER, { dryRun: false, limit: 25 })
    expect(report.merged).toBe(1)
    expect(manager.transaction).toHaveBeenCalledTimes(1)
    const sqls = writes().map(w => w.sql)
    expect(sqls.some(sql => /\bDELETE\b/.test(sql))).toBe(false)
    const archive = writes().find(w => w.sql.includes("status = 'archived'"))!
    expect(archive.sql).toContain('merged_previous_status = COALESCE(a.merged_previous_status, a.status)')
    expect(archive.params).toEqual([WS, 'ana', 'crm'])
    const journal = writes().find(w => w.sql.includes('INSERT INTO account_crm_fusions'))!
    expect(journal.params).toEqual([
      WS,
      'ana',
      'crm',
      'name',
      'veepee',
      JSON.stringify({ contacts: ['c1', 'c2'], crm_deals: ['d1'] }),
    ])
  })

  it('une fiche déjà rattachée ailleurs entre-temps : rien ne bouge, rien n’est journalisé', async () => {
    const { service, writes } = harness({ archived: false })
    const report = await service.sweep(WS, USER, { dryRun: false, limit: 25 })
    expect(report.merged).toBe(0)
    expect(writes().some(w => w.sql.includes('INSERT INTO account_crm_fusions'))).toBe(false)
    expect(writes().some(w => w.sql.includes('UPDATE contacts t'))).toBe(false)
  })

  it('ANNULER rend chaque ligne journalisée à la fiche d’origine et lui rend son statut d’avant', async () => {
    const { service, writes } = harness({
      undone: [{ kept_id: 'ana', absorbed_id: 'crm', moved: { contacts: ['c1', 'c2'], crm_deals: ['d1'] } }],
    })
    expect(await service.undo(WS, USER, 'f1')).toEqual({ restored: true })
    const back = writes().find(w => w.sql.includes('UPDATE contacts t'))!
    expect(back.params).toEqual([WS, 'ana', 'crm', ['c1', 'c2']])
    const restore = writes().find(w => w.sql.includes('status = a.merged_previous_status'))!
    expect(restore.params).toEqual([WS, 'crm', 'ana'])
    // Une famille sans ligne journalisée n'est pas rejouée.
    expect(writes().some(w => w.sql.includes('UPDATE notes t'))).toBe(false)
  })

  it('ANNULER ne dit pas « restaurée » quand aucune fiche n’a été rendue (le compte rendu est vrai)', async () => {
    const { service } = harness({
      restored: false,
      undone: [{ kept_id: 'ana', absorbed_id: 'crm', moved: { contacts: ['c1'] } }],
    })
    expect(await service.undo(WS, USER, 'f1')).toEqual({ restored: false })
  })

  it('annuler une fusion inconnue (ou d’un autre espace) : introuvable', async () => {
    const { service } = harness({ undone: [] })
    await expect(service.undo(WS, USER, 'nope')).rejects.toBeInstanceOf(NotFoundException)
  })
})
