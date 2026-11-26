import { ExpensePoliciesService } from './expense-policies.service'

/**
 * LE BARÈME DE FRAIS — le réglage (31/08/2026).
 *
 * Ce que ces tests protègent, dans l'ordre :
 *
 *  1. **Enregistrer n'efface pas l'histoire.** Une révision est un jeu de
 *     plafonds à UNE date ; le service ne remplace que les entrées portant
 *     cette date-là. Sans cela, relever un plafond en septembre effacerait
 *     celui de mars et rejugerait des notes déjà décidées — exactement ce que
 *     la date d'effet existe pour empêcher.
 *  2. **« Non plafonnée » est une valeur**, pas un champ oublié. Elle traverse
 *     à `null` et rend la catégorie NON VÉRIFIÉE ; un `?? 0` l'interdirait.
 *  3. **La politique par DÉFAUT se retrouve.** `account_id IS NOT DISTINCT
 *     FROM` et non `=` : `NULL = NULL` est faux en SQL, et le service créerait
 *     une seconde politique par défaut à chaque enregistrement — que l'index
 *     unique partiel refuserait, en 500.
 *  4. **Une liste tronquée le DIT.** Une liste de clients coupée en silence
 *     fait conclure qu'un client n'existe pas.
 */

type Row = Record<string, unknown>

class FakeDb {
  readonly executed: { sql: string; params: unknown[] }[] = []
  constructor(private readonly answers: { match: RegExp; rows: Row[] }[]) {}

  query = async (sql: string, params: unknown[] = []): Promise<unknown> => {
    this.executed.push({ sql, params })
    for (const answer of this.answers) if (answer.match.test(sql)) return answer.rows
    return []
  }

  transaction = async <T>(work: (manager: { query: FakeDb['query'] }) => Promise<T>): Promise<T> =>
    work({
      query: this.query,
    })

  sqlMatching(pattern: RegExp): { sql: string; params: unknown[] }[] {
    return this.executed.filter(entry => pattern.test(entry.sql))
  }
}

function serviceWith(db: FakeDb): ExpensePoliciesService {
  return new ExpensePoliciesService({ manager: db } as unknown as ConstructorParameters<
    typeof ExpensePoliciesService
  >[0])
}

const SAVE = {
  accountId: null,
  label: 'Barème interne',
  reimbursementBasis: 'actual' as const,
  effectiveFrom: '2026-09-01',
  caps: [
    { category: 'meal' as const, capCents: 2800, vatRecoverable: true },
    { category: 'supplies' as const, capCents: null, vatRecoverable: true },
  ],
  mileageRates: [{ fiscalHorsepower: 5, centsPerKm: 65 }],
}

describe('ExpensePoliciesService.save', () => {
  it('retrouve la politique par DÉFAUT sans en créer une seconde', async () => {
    const db = new FakeDb([{ match: /SELECT id FROM expense_policies/, rows: [{ id: 'p1' }] }])
    expect(await serviceWith(db).save('w1', SAVE)).toEqual({ id: 'p1' })

    // `NULL = NULL` est faux en SQL : avec `=`, la politique par défaut ne se
    // retrouverait jamais et l'index unique partiel rejetterait la seconde.
    expect(db.executed[0]?.sql).toContain('account_id IS NOT DISTINCT FROM')
    expect(db.sqlMatching(/INSERT INTO expense_policies/)).toHaveLength(0)
    expect(db.sqlMatching(/UPDATE expense_policies/)).toHaveLength(1)
  })

  it('crée la politique quand elle n’existe pas encore', async () => {
    const db = new FakeDb([
      { match: /SELECT id FROM expense_policies/, rows: [] },
      { match: /INSERT INTO expense_policies/, rows: [{ id: 'p9' }] },
    ])
    expect(await serviceWith(db).save('w1', SAVE)).toEqual({ id: 'p9' })
  })

  it('n’efface QUE la révision de cette date — l’histoire reste', async () => {
    const db = new FakeDb([{ match: /SELECT id FROM expense_policies/, rows: [{ id: 'p1' }] }])
    await serviceWith(db).save('w1', SAVE)

    const [deletedCaps] = db.sqlMatching(/DELETE FROM expense_policy_caps/)
    expect(deletedCaps?.sql).toContain('effective_from = $3::date')
    expect(deletedCaps?.params[2]).toBe('2026-09-01')
    const [deletedRates] = db.sqlMatching(/DELETE FROM expense_mileage_rates/)
    expect(deletedRates?.params[2]).toBe('2026-09-01')
    // Un effacement non daté serait la faute : il emporterait les révisions
    // sous lesquelles des notes ont déjà été jugées.
    expect(
      db.sqlMatching(/DELETE FROM expense_policy_caps\s+WHERE policy_id = \$1 AND workspace_id = \$2\s*$/),
    ).toEqual([])
  })

  it('écrit « non plafonnée » comme `null`, jamais comme 0', async () => {
    const db = new FakeDb([{ match: /SELECT id FROM expense_policies/, rows: [{ id: 'p1' }] }])
    await serviceWith(db).save('w1', SAVE)

    const caps = db.sqlMatching(/INSERT INTO expense_policy_caps/)
    expect(caps).toHaveLength(2)
    // « Plafond zéro » interdirait la catégorie ; « non plafonnée » la laisse
    // NON VÉRIFIÉE. Deux faits distincts, et un `?? 0` les confondrait.
    expect(caps[1]?.params[3]).toBeNull()
    expect(caps[0]?.params[3]).toBe(2800)
  })

  it('date le tarif kilométrique de la révision, jamais d’aujourd’hui', async () => {
    const db = new FakeDb([{ match: /SELECT id FROM expense_policies/, rows: [{ id: 'p1' }] }])
    await serviceWith(db).save('w1', SAVE)

    const [rate] = db.sqlMatching(/INSERT INTO expense_mileage_rates/)
    expect(rate?.params).toEqual(['p1', 'w1', 5, 65, '2026-09-01'])
  })
})

describe('ExpensePoliciesService.board', () => {
  const board = (accounts: Row[]) =>
    new FakeDb([
      {
        match: /FROM expense_policies p/,
        rows: [{ id: 'p1', account_id: null, label: 'Interne', reimbursement_basis: 'actual', account_name: null }],
      },
      {
        match: /FROM expense_policy_caps/,
        rows: [
          { policy_id: 'p1', category: 'meal', cap_cents: '2500', vat_recoverable: true, effective_from: null },
          { policy_id: 'p1', category: 'meal', cap_cents: '2800', vat_recoverable: true, effective_from: '2026-09-01' },
          { policy_id: 'autre', category: 'hotel', cap_cents: '15000', vat_recoverable: false, effective_from: null },
        ],
      },
      {
        match: /FROM expense_mileage_rates/,
        rows: [{ policy_id: 'p1', fiscal_horsepower: 5, cents_per_km: '60', effective_from: '2026-01-01' }],
      },
      { match: /FROM accounts/, rows: accounts },
    ])

  it('rend TOUTES les révisions, pas seulement celle en vigueur', async () => {
    // Un écran qui ne connaîtrait que la dernière effacerait les autres au
    // premier enregistrement, sans que personne le voie.
    const result = await serviceWith(board([])).board('w1')
    expect(result.policies).toHaveLength(1)
    expect(result.policies[0]?.caps).toHaveLength(2)
    expect(result.policies[0]?.caps[0]?.effectiveFrom).toBeNull()
    expect(result.policies[0]?.caps[1]?.effectiveFrom).toBe('2026-09-01')
    expect(result.policies[0]?.mileageRates[0]?.centsPerKm).toBe(60)
  })

  it('ne mélange pas les plafonds de deux politiques', async () => {
    const result = await serviceWith(board([])).board('w1')
    expect(result.policies[0]?.caps.every(cap => cap.category === 'meal')).toBe(true)
  })

  it('DIT que la liste de clients est tronquée plutôt que de la couper en silence', async () => {
    const many = Array.from({ length: 201 }, (_, index) => ({ id: `a${index}`, company_name: `Client ${index}` }))
    const result = await serviceWith(board(many)).board('w1')
    expect(result.accounts).toHaveLength(200)
    expect(result.accountsTruncated).toBe(true)

    const few = await serviceWith(board([{ id: 'a1', company_name: 'DINUM' }])).board('w1')
    expect(few.accountsTruncated).toBe(false)
    expect(few.accounts).toEqual([{ id: 'a1', name: 'DINUM' }])
  })
})
