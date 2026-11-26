import {
  addDays,
  addMonths,
  billingHealth,
  commitmentEndOf,
  COMMITMENT_ENDING_SOON_DAYS,
  daysBetween,
  INVOICE_GRACE_DAYS,
  windowsUntil,
  type BillingTermsForSchedule,
  type InvoiceForSchedule,
} from './manual-billing-schedule'

/**
 * The derivation behind the « engagement » column of the backoffice and the
 * daily sweep. Everything here is pure: `today` is passed in, never read from
 * the clock — a spec that reads the clock is green in Paris and red in a CI
 * running in UTC.
 *
 * The case the whole thing exists for is the last block: three months are over,
 * no invoice covers anything after them, and until now that client looked
 * exactly like one who is up to date.
 */

const TERMS: BillingTermsForSchedule = {
  period: 'monthly',
  startDate: '2026-09-01',
  commitmentMonths: 3,
}

const invoice = (over: Partial<InvoiceForSchedule> = {}): InvoiceForSchedule => ({
  reference: 'F-2026-006',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  paid: true,
  ...over,
})

describe('date arithmetic', () => {
  it('adds months and clamps to the end of the target month', () => {
    expect(addMonths('2026-09-01', 3)).toBe('2026-12-01')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29') // année bissextile
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15')
  })

  it('adds days across a month and a year boundary', () => {
    expect(addDays('2026-09-01', -1)).toBe('2026-08-31')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('counts whole days in both directions', () => {
    expect(daysBetween('2026-09-01', '2026-09-08')).toBe(7)
    expect(daysBetween('2026-09-08', '2026-09-01')).toBe(-7)
    // Le passage à l'heure d'hiver (25/10/2026) ne doit pas décaler d'un jour.
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
  })
})

describe('commitmentEndOf', () => {
  it('is the last day covered, not the first day after', () => {
    expect(commitmentEndOf(TERMS)).toBe('2026-11-30')
  })

  it('is null without a commitment — never a computed date, never zero', () => {
    expect(commitmentEndOf({ ...TERMS, commitmentMonths: null })).toBeNull()
    expect(commitmentEndOf({ ...TERMS, commitmentMonths: 0 })).toBeNull()
  })
})

describe('windowsUntil', () => {
  it('walks one window per month, never past today', () => {
    expect(windowsUntil(TERMS, '2026-11-15')).toEqual([
      { start: '2026-09-01', end: '2026-09-30' },
      { start: '2026-10-01', end: '2026-10-31' },
      { start: '2026-11-01', end: '2026-11-30' },
    ])
  })

  it('yields nothing before the contract starts', () => {
    expect(windowsUntil(TERMS, '2026-08-31')).toEqual([])
  })

  it('walks quarters and years by their own step', () => {
    expect(windowsUntil({ ...TERMS, period: 'quarterly' }, '2026-12-31')).toEqual([
      { start: '2026-09-01', end: '2026-11-30' },
      { start: '2026-12-01', end: '2027-02-28' },
    ])
    expect(windowsUntil({ ...TERMS, period: 'yearly' }, '2027-06-01')).toEqual([
      { start: '2026-09-01', end: '2027-08-31' },
    ])
  })

  it('yields exactly ONE window for a one-off deal, years later', () => {
    // Une affaire ponctuelle facturée une fois ne « saute » pas onze factures.
    expect(windowsUntil({ period: 'one_off', startDate: '2026-09-01', commitmentMonths: null }, '2028-01-01')).toEqual([
      { start: '2026-09-01', end: '2026-09-01' },
    ])
  })
})

describe('billingHealth — ce qui est à jour', () => {
  it('says nothing while the first period is inside its grace window', () => {
    const health = billingHealth(TERMS, [], addDays('2026-09-01', INVOICE_GRACE_DAYS - 1))
    expect(health.severity).toBe('ok')
    expect(health.windowsDue).toBe(0)
    expect(health.alerts).toEqual([])
  })

  it('reports an up-to-date client with its commitment end', () => {
    const health = billingHealth(TERMS, [invoice()], '2026-09-20')
    expect(health.severity).toBe('ok')
    expect(health.commitmentEnd).toBe('2026-11-30')
    expect(health.currentWindow).toEqual({ start: '2026-09-01', end: '2026-09-30' })
    expect(health.windowsDue).toBe(1)
    expect(health.windowsInvoiced).toBe(1)
  })

  it('leaves a client without commitment out of the commitment alerts', () => {
    const health = billingHealth({ ...TERMS, commitmentMonths: null }, [invoice()], '2027-06-01')
    expect(health.commitmentEnd).toBeNull()
    expect(health.alerts.map(a => a.kind)).not.toContain('commitment_ended_unrenewed')
    expect(health.alerts.map(a => a.kind)).not.toContain('commitment_ending_soon')
  })
})

describe('billingHealth — la facture qui manque', () => {
  it('calls out a started period the day the grace window closes', () => {
    const health = billingHealth(TERMS, [invoice()], addDays('2026-10-01', INVOICE_GRACE_DAYS))
    const missing = health.alerts.filter(a => a.kind === 'invoice_missing')
    expect(missing).toHaveLength(1)
    expect(missing[0]).toMatchObject({
      severity: 'warning',
      days: INVOICE_GRACE_DAYS,
      window: { start: '2026-10-01', end: '2026-10-31' },
    })
    expect(health.windowsMissing).toEqual([{ start: '2026-10-01', end: '2026-10-31' }])
  })

  it('hardens to danger once a whole cycle has been skipped', () => {
    // Octobre a 35 jours de retard ; novembre a 4 jours, donc il est encore
    // dans sa fenêtre de grâce et ne compte pas — un retard de novembre
    // annoncé le 5 novembre serait faux.
    const health = billingHealth(TERMS, [invoice()], '2026-11-05')
    expect(health.severity).toBe('danger')
    expect(health.alerts.filter(a => a.kind === 'invoice_missing')).toMatchObject([
      { severity: 'danger', days: 35, window: { start: '2026-10-01' } },
    ])
  })

  it('counts an invoice that spans several periods as covering them', () => {
    const quarterly = { ...TERMS, period: 'quarterly' as const, commitmentMonths: null }
    const health = billingHealth(
      quarterly,
      [invoice({ periodStart: '2026-09-01', periodEnd: '2026-11-30' })],
      '2026-11-20',
    )
    expect(health.windowsMissing).toEqual([])
    expect(health.severity).toBe('ok')
  })
})

describe('billingHealth — la facture émise mais pas encaissée', () => {
  it('stays silent inside the payment term', () => {
    const health = billingHealth(TERMS, [invoice({ paid: false })], '2026-09-20')
    expect(health.alerts.map(a => a.kind)).not.toContain('invoice_unpaid')
  })

  it('names the reference once the payment term has passed', () => {
    const health = billingHealth(TERMS, [invoice({ paid: false })], '2026-10-05')
    const unpaid = health.alerts.filter(a => a.kind === 'invoice_unpaid')
    expect(unpaid).toHaveLength(1)
    expect(unpaid[0]).toMatchObject({ severity: 'warning', reference: 'F-2026-006', days: 34 })
  })
})

describe("billingHealth — l'engagement qui s'achève", () => {
  const threeMonthsInvoiced = [
    invoice({ reference: 'F-2026-006', periodStart: '2026-09-01', periodEnd: '2026-09-30' }),
    invoice({ reference: 'F-2026-021', periodStart: '2026-10-01', periodEnd: '2026-10-31', paid: true }),
    invoice({ reference: 'F-2026-044', periodStart: '2026-11-01', periodEnd: '2026-11-30', paid: true }),
  ]

  it('warns before the end, so a renewal can still be invoiced', () => {
    const health = billingHealth(TERMS, threeMonthsInvoiced, addDays('2026-11-30', -COMMITMENT_ENDING_SOON_DAYS))
    const soon = health.alerts.filter(a => a.kind === 'commitment_ending_soon')
    expect(soon).toHaveLength(1)
    expect(soon[0]).toMatchObject({ severity: 'info', days: COMMITMENT_ENDING_SOON_DAYS })
    expect(health.severity).toBe('info')
  })

  it('LE CAS: trois mois payés rubis sur l’ongle, plus rien après — et personne ne le savait', () => {
    const health = billingHealth(TERMS, threeMonthsInvoiced, '2026-12-10')
    const ended = health.alerts.filter(a => a.kind === 'commitment_ended_unrenewed')
    expect(ended).toHaveLength(1)
    expect(ended[0]).toMatchObject({ severity: 'danger', days: 10 })
    expect(health.severity).toBe('danger')
  })

  it('goes quiet again as soon as one invoice covers a period after the end', () => {
    const renewed = [
      ...threeMonthsInvoiced,
      invoice({ reference: 'F-2026-070', periodStart: '2026-12-01', periodEnd: '2026-12-31', paid: true }),
    ]
    const health = billingHealth(TERMS, renewed, '2026-12-10')
    expect(health.alerts.map(a => a.kind)).not.toContain('commitment_ended_unrenewed')
    expect(health.severity).toBe('ok')
  })
})
