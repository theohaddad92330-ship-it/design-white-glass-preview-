import { PAYMENT_BEHAVIOUR_MIN_INVOICES, accountMissionsSchema } from '@bellum/contracts'
import { AccountMissionsService } from './account-missions.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const ACCOUNT = 'a0000000-0000-4000-8000-000000000001'
const MISSION = 'd0000000-0000-4000-8000-00000000000a'
const TODAY = new Date('2026-09-01T09:00:00.000Z')

/**
 * « CE CLIENT PAIE MAL » — SUR LA LENTILLE FINANCE D'UN COMPTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER PROUVE
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. **La rédaction passe par la porte unique.** Sans `finance:read`, la CLÉ
 *     est présente et vaut `null` (D45) — jamais retirée, jamais `0` ;
 *  2. **et la requête ne PART pas** : on ne lit pas les factures d'un client
 *     pour les jeter juste après ;
 *  3. **une lecture EN ÉCHEC ne se rend pas comme « pas assez d'historique »** —
 *     « cassé » et « non mesurable » ne se confondent pas ;
 *  4. **la population est nommée** : les factures de CE compte, dans SON espace.
 */

type Invoice = { invoiced_at: string | null; due_on: string | null; paid_at: string | null; disputed_at: string | null }

const paid = (index: number): Invoice => ({
  invoiced_at: `2026-0${(index % 8) + 1}-01`,
  due_on: '2026-08-31',
  paid_at: '2026-08-15',
  disputed_at: null,
})

function makeService(fixture: { invoices?: Invoice[]; invoicesThrow?: boolean } = {}) {
  const queries: { sql: string; params: unknown[] }[] = []
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      if (sql.includes('FROM invoice_readiness ir')) {
        if (fixture.invoicesThrow) throw new Error('jointure illisible')
        return fixture.invoices ?? []
      }
      return []
    }),
  }
  const missions = {
    manager,
    find: jest.fn(async () => [
      {
        id: MISSION,
        account_id: ACCOUNT,
        label: 'Mission',
        status: 'active',
        started_on: '2026-01-05',
        ends_on: '2026-12-31',
        daily_rate: 600,
        role_title: 'Data engineer',
      },
    ]),
  }
  const accounts = { findOne: jest.fn(async () => ({ id: ACCOUNT })) }
  const terms = { find: jest.fn(async () => []) }
  const propagation = { digest: jest.fn(async () => ({ accounts: [], contacts: [], consultants: [] })) }
  const service = new AccountMissionsService(missions as never, terms as never, accounts as never, propagation as never)
  return { service, queries }
}

const read = (service: AccountMissionsService, canReadFinance = true) =>
  service.ofAccount(WORKSPACE, ACCOUNT, { canReadFinance, now: TODAY })

/** Assez de factures pour franchir le seuil, quel qu'il soit. */
const ENOUGH = Array.from({ length: PAYMENT_BEHAVIOUR_MIN_INVOICES }, (_, index) => paid(index))

describe('le comportement de paiement d’un client, sur la lentille Finance', () => {
  it('respecte le contrat partagé', async () => {
    const { service } = makeService({ invoices: ENOUGH })
    const parsed = accountMissionsSchema.safeParse(await read(service))
    expect(parsed.success).toBe(true)
  })

  it('sans `finance:read` : la clé est PRÉSENTE et vaut `null` — jamais 0, jamais retirée', async () => {
    const { service } = makeService({ invoices: ENOUGH })
    const response = await read(service, false)
    expect('paymentBehaviour' in response).toBe(true)
    expect(response.paymentBehaviour).toBeNull()
    expect(response.canReadFinance).toBe(false)
  })

  it('sans `finance:read` : la requête ne PART pas', async () => {
    // On ne lit pas les factures d'un client pour les jeter juste après — même
    // parti pris que le coût chargé, juste à côté.
    const { service, queries } = makeService({ invoices: ENOUGH })
    await read(service, false)
    expect(queries.some(entry => entry.sql.includes('FROM invoice_readiness ir'))).toBe(false)
  })

  it('lit les factures de CE compte, dans SON espace — jamais celles d’un autre', async () => {
    const { service, queries } = makeService({ invoices: ENOUGH })
    await read(service)
    const call = queries.find(entry => entry.sql.includes('FROM invoice_readiness ir'))
    expect(call).toBeDefined()
    expect(call?.params).toEqual([WORKSPACE, ACCOUNT])
    // La population est nommée dans le SQL : les factures ÉMISES.
    expect(call?.sql).toContain('ir.invoiced_at IS NOT NULL')
  })

  it('sous le seuil : « pas assez d’historique », et AUCUN décompte', async () => {
    const { service } = makeService({ invoices: [paid(0), paid(1)] })
    const behaviour = (await read(service)).paymentBehaviour
    expect(behaviour?.measurability.measurable).toBe(false)
    expect(behaviour?.measurability.missing).toBeGreaterThan(0)
    // ⚠️ Surtout pas 0 : « zéro retard » est une bonne nouvelle, et rien n'a
    // été mesuré.
    expect(behaviour?.lateCount).toBeNull()
    expect(behaviour?.disputedCount).toBeNull()
  })

  it('au-dessus du seuil : un DÉCOMPTE, son dénominateur et sa période', async () => {
    const late: Invoice = { invoiced_at: '2026-05-01', due_on: '2026-06-30', paid_at: null, disputed_at: null }
    const { service } = makeService({ invoices: [late, ...ENOUGH] })
    const behaviour = (await read(service)).paymentBehaviour
    expect(behaviour?.lateCount).toBe(1)
    expect(behaviour?.invoiceCount).toBe(PAYMENT_BEHAVIOUR_MIN_INVOICES + 1)
    expect(behaviour?.windowMonths).toBeGreaterThan(0)
  })

  it('une lecture EN ÉCHEC rend `null` — et pas « ce client n’a pas d’historique »', async () => {
    // Avec `canReadFinance: true`, un `null` ne peut venir que de la lecture :
    // c'est ainsi que l'écran distingue « cassé » de « pas ton périmètre ».
    const { service } = makeService({ invoicesThrow: true })
    const response = await read(service)
    expect(response.canReadFinance).toBe(true)
    expect(response.paymentBehaviour).toBeNull()
  })

  it('un compte SANS mission n’a pas de comportement de paiement — et aucune requête ne part', async () => {
    const manager = { query: jest.fn(async () => []) }
    const service = new AccountMissionsService(
      { manager, find: jest.fn(async () => []) } as never,
      { find: jest.fn(async () => []) } as never,
      { findOne: jest.fn(async () => ({ id: ACCOUNT })) } as never,
      { digest: jest.fn(async () => ({ accounts: [], contacts: [], consultants: [] })) } as never,
    )
    const response = await service.ofAccount(WORKSPACE, ACCOUNT, { canReadFinance: true, now: TODAY })
    expect(response.paymentBehaviour).toBeNull()
    expect(manager.query).not.toHaveBeenCalled()
  })

  it('ne rend AUCUN score et AUCUN rang — que des entiers et une mesurabilité', async () => {
    // Doctrine : aucune probabilité, et ce n'est pas un classement de clients.
    const { service } = makeService({ invoices: ENOUGH })
    const behaviour = (await read(service)).paymentBehaviour
    expect(Object.keys(behaviour ?? {}).sort()).toEqual(
      ['disputedCount', 'invoiceCount', 'lateCount', 'measurability', 'windowMonths', 'withoutDueDate'].sort(),
    )
  })
})
