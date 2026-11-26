import { buildBillingCalendar, type BillingCalendarInput } from './manual-billing-calendar'

/**
 * La vue CALENDRIER de la facturation sur facture (#1653).
 *
 * ⚠️ CE QUE CE FICHIER PROUVE EN PREMIER — la prémisse de l'issue était fausse.
 * #1653 demandait « le plafond de 20 périodes du module est respecté » et
 * « contrat mensuel de 2019 → 20 périodes maximum, pas 80 ». Le module dit
 * `MAX_PERIODS = 240` (`manual-billing-schedule.ts:71`), et son commentaire
 * nomme lui-même le cas des « 80+ periods ». Tronquer à 20 casserait tout
 * contrat de plus d'un an et demi — la régression que l'issue s'interdit
 * elle-même (« RIEN sur la logique »). Le test corrigé est donc l'INVERSE de
 * celui qui était demandé : la dérivation rend TOUTES les périodes, et c'est
 * l'AFFICHAGE qui est borné à douze mois.
 *
 * Tout est pur : `today` est un paramètre. Un test qui lit l'horloge passe à
 * Paris et échoue dans une CI qui tourne en UTC.
 */

const client = (over: Partial<BillingCalendarInput> = {}): BillingCalendarInput => ({
  workspaceId: 'ws-1',
  workspaceName: 'Skaizen',
  amountCents: 19_900,
  currency: 'EUR',
  terms: { period: 'monthly', startDate: '2026-01-01', commitmentMonths: null },
  invoices: [],
  ...over,
})

const invoice = (start: string, end: string, over: { reference?: string; paid?: boolean } = {}) => ({
  reference: over.reference ?? `F-${start}`,
  periodStart: start,
  periodEnd: end,
  paid: over.paid ?? true,
  amountCents: 19_900,
  currency: 'EUR',
})

/** Les factures mensuelles PAYÉES de 2026, du mois `from` au mois `to` inclus. */
const paidMonths = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => {
    const mois = from + i
    const cle = String(mois).padStart(2, '0')
    const dernier = new Date(Date.UTC(2026, mois, 0)).getUTCDate()
    return invoice(`2026-${cle}-01`, `2026-${cle}-${dernier}`)
  })

describe('buildBillingCalendar — la grille', () => {
  it('LIT quelque chose — douze mois, dans l’ordre, le dernier étant le mois d’ancrage', () => {
    const calendar = buildBillingCalendar([client()], '2026-09-07')
    expect(calendar.months).toHaveLength(12)
    expect(calendar.months[0]).toBe('2025-10')
    expect(calendar.months[11]).toBe('2026-09')
    expect(calendar.anchorMonth).toBe('2026-09')
    expect(calendar.currentMonth).toBe('2026-09')
    expect(calendar.rows).toHaveLength(1)
  })

  it('chaque ligne pave EXACTEMENT les douze colonnes — sinon la grille se décale', () => {
    const rows = buildBillingCalendar(
      [
        client(),
        client({
          workspaceId: 'ws-2',
          terms: { period: 'quarterly', startDate: '2025-12-01', commitmentMonths: null },
        }),
        client({ workspaceId: 'ws-3', terms: { period: 'yearly', startDate: '2024-03-01', commitmentMonths: null } }),
        client({ workspaceId: 'ws-4', terms: { period: 'one_off', startDate: '2026-02-10', commitmentMonths: null } }),
      ],
      '2026-09-07',
    ).rows
    expect(rows).toHaveLength(4)
    for (const row of rows) {
      expect(row.cells.reduce((somme, cellule) => somme + cellule.months, 0)).toBe(12)
    }
  })

  it('ne marche JAMAIS dans le futur — un mois d’ancrage à venir est ramené au mois courant', () => {
    const calendar = buildBillingCalendar([client()], '2026-09-07', '2027-04')
    expect(calendar.anchorMonth).toBe('2026-09')
    expect(calendar.months[11]).toBe('2026-09')
  })

  it('sait remonter le temps — un mois d’ancrage passé décale la fenêtre, sans rien inventer', () => {
    const calendar = buildBillingCalendar([client()], '2026-09-07', '2026-03')
    expect(calendar.months[0]).toBe('2025-04')
    expect(calendar.months[11]).toBe('2026-03')
    // Le contrat démarre en 2026-01 : les mois d'avant n'ont aucune période.
    const row = calendar.rows[0]!
    expect(row.cells[0]).toMatchObject({ month: '2025-04', state: 'no_period' })
  })

  it('sait dire NON à un mois d’ancrage illisible — on retombe sur le mois courant', () => {
    expect(buildBillingCalendar([client()], '2026-09-07', 'septembre').anchorMonth).toBe('2026-09')
    expect(buildBillingCalendar([client()], '2026-09-07', '2026-13').anchorMonth).toBe('2026-09')
  })
})

describe('buildBillingCalendar — LA PRÉMISSE CORRIGÉE (240, pas 20)', () => {
  it('un contrat mensuel de 2019 rend TOUTES ses périodes — 93, ni 20 ni 80 tronqué', () => {
    const row = buildBillingCalendar(
      [client({ terms: { period: 'monthly', startDate: '2019-01-01', commitmentMonths: null } })],
      '2026-09-07',
    ).rows[0]!

    // 2019-01 → 2026-09 inclus = 7 ans × 12 + 9 mois = 93 périodes.
    expect(row.periodsTotal).toBe(93)
    expect(row.periodsTotal).toBeGreaterThan(20)
    expect(row.derivationCapped).toBe(false)
  })

  it('… et l’AFFICHAGE, lui, en montre douze — le reste défile ou se remonte', () => {
    const calendar = buildBillingCalendar(
      [client({ terms: { period: 'monthly', startDate: '2019-01-01', commitmentMonths: null } })],
      '2026-09-07',
    )
    expect(calendar.months).toHaveLength(12)
    const row = calendar.rows[0]!
    // Douze cellules mensuelles visibles, pour 93 périodes dérivées.
    expect(row.cells).toHaveLength(12)
    expect(row.cells.every(cellule => cellule.state !== 'no_period')).toBe(true)
    // Et la fenêtre précédente est atteignable : la borne est réelle, pas devinée.
    expect(calendar.earliestPeriodMonth).toBe('2019-01')
  })

  it('le plafond du module est 240, et il est ANNONCÉ quand il mord', () => {
    const row = buildBillingCalendar(
      [client({ terms: { period: 'monthly', startDate: '1990-01-01', commitmentMonths: null } })],
      '2026-09-07',
    ).rows[0]!
    expect(row.periodsTotal).toBe(240)
    // Vingt ans de mensuel : la marche s'arrête en 2009 et la grille de 2026
    // n'a donc aucune période. Elle le DIT plutôt que de peindre douze tirets
    // qui voudraient dire « rien à facturer ».
    expect(row.derivationCapped).toBe(true)
  })
})

describe('buildBillingCalendar — ce que dit une cellule', () => {
  const today = '2026-09-20'

  it('✓ émise et payée', () => {
    const row = buildBillingCalendar([client({ invoices: paidMonths(1, 9) })], today).rows[0]!
    const septembre = row.cells.find(cellule => cellule.month === '2026-09')!
    expect(septembre).toMatchObject({ state: 'paid', reference: 'F-2026-09-01', months: 1 })
    expect(septembre.window).toEqual({ start: '2026-09-01', end: '2026-09-30' })
    expect(septembre.invoiceAmountCents).toBe(19_900)
  })

  it('○ émise, en attente — une facture non encaissée DANS son délai n’est pas en retard', () => {
    const invoices = [...paidMonths(1, 8), invoice('2026-09-01', '2026-09-30', { paid: false })]
    const row = buildBillingCalendar([client({ invoices })], today).rows[0]!
    expect(row.cells.find(cellule => cellule.month === '2026-09')).toMatchObject({ state: 'issued', lateDays: null })
  })

  it('✗ en retard — la même facture, une fois le délai de paiement passé', () => {
    const invoices = [...paidMonths(1, 8), invoice('2026-09-01', '2026-09-30', { paid: false })]
    const row = buildBillingCalendar([client({ invoices })], '2026-10-05').rows[0]!
    expect(row.cells.find(cellule => cellule.month === '2026-09')).toMatchObject({ state: 'late', lateDays: 34 })
  })

  it('⚠ à émettre — une période commencée, encore dans sa fenêtre de grâce', () => {
    // 3 septembre : la période de septembre a 2 jours, la grâce en vaut 7.
    const row = buildBillingCalendar([client({ invoices: paidMonths(1, 8) })], '2026-09-03').rows[0]!
    expect(row.cells.find(cellule => cellule.month === '2026-09')).toMatchObject({ state: 'to_issue', lateDays: null })
  })

  it('✗ en retard — la même période, une fois la fenêtre de grâce fermée', () => {
    const row = buildBillingCalendar([client({ invoices: paidMonths(1, 8) })], '2026-09-08').rows[0]!
    expect(row.cells.find(cellule => cellule.month === '2026-09')).toMatchObject({ state: 'late', lateDays: 7 })
  })

  it('— pas de période n’est PAS « rien à facturer » : avant le début du contrat', () => {
    const row = buildBillingCalendar([client()], today).rows[0]!
    const avant = row.cells.filter(cellule => cellule.month < '2026-01')
    expect(avant.length).toBeGreaterThan(0)
    expect(avant.every(cellule => cellule.state === 'no_period' && cellule.window === null)).toBe(true)
    // Et la ligne dit d'où part le contrat, pour que « — » se lise.
    expect(row.startDate).toBe('2026-01-01')
  })

  it('une période à venir n’existe pas dans la grille — octobre n’est pas en retard en septembre', () => {
    const row = buildBillingCalendar([client({ invoices: paidMonths(1, 9) })], today).rows[0]!
    expect(row.cells.map(cellule => cellule.month)).not.toContain('2026-10')
    expect(row.cells.some(cellule => cellule.state === 'late')).toBe(false)
  })
})

describe('buildBillingCalendar — une cellule par PÉRIODE, pas par mois', () => {
  it('un trimestriel occupe trois colonnes d’un coup', () => {
    const row = buildBillingCalendar(
      [
        client({
          terms: { period: 'quarterly', startDate: '2026-03-01', commitmentMonths: null },
          invoices: [invoice('2026-03-01', '2026-05-31'), invoice('2026-06-01', '2026-08-31')],
        }),
      ],
      '2026-09-20',
    ).rows[0]!

    expect(row.cells.find(cellule => cellule.month === '2026-03')).toMatchObject({ months: 3, state: 'paid' })
    expect(row.cells.find(cellule => cellule.month === '2026-06')).toMatchObject({ months: 3, state: 'paid' })
    // La période en cours n'occupe que les mois DÉJÀ commencés — septembre.
    expect(row.cells.find(cellule => cellule.month === '2026-09')).toMatchObject({ months: 1 })
    expect(row.cells.reduce((somme, cellule) => somme + cellule.months, 0)).toBe(12)
  })

  it('une période commencée AVANT la fenêtre est rognée à gauche, jamais dupliquée', () => {
    const row = buildBillingCalendar(
      [
        client({
          terms: { period: 'yearly', startDate: '2025-06-01', commitmentMonths: null },
          invoices: [invoice('2025-06-01', '2026-05-31')],
        }),
      ],
      '2026-09-20',
    ).rows[0]!
    // Fenêtre 2025-10 → 2026-09. La période annuelle 2025-06 → 2026-05 n'occupe
    // que huit colonnes (2025-10 → 2026-05).
    expect(row.cells[0]).toMatchObject({ month: '2025-10', months: 8, state: 'paid' })
    expect(row.cells.reduce((somme, cellule) => somme + cellule.months, 0)).toBe(12)
  })

  it('un contrat ponctuel ne réclame qu’UNE période, des années plus tard', () => {
    const row = buildBillingCalendar(
      [client({ terms: { period: 'one_off', startDate: '2026-02-10', commitmentMonths: null } })],
      '2026-09-20',
    ).rows[0]!
    expect(row.periodsTotal).toBe(1)
    expect(row.cells.filter(cellule => cellule.state !== 'no_period')).toHaveLength(1)
    expect(row.derivationCapped).toBe(false)
  })
})

describe('buildBillingCalendar — ce qu’il ne dit jamais', () => {
  it('l’engagement absent reste null — jamais « 0 mois », jamais une date calculée', () => {
    const row = buildBillingCalendar([client()], '2026-09-20').rows[0]!
    expect(row.commitmentEnd).toBeNull()
  })

  it('l’engagement saisi porte sa fin, telle que le module la dérive — pas un second calcul', () => {
    const row = buildBillingCalendar(
      [client({ terms: { period: 'monthly', startDate: '2026-01-01', commitmentMonths: 3 } })],
      '2026-09-20',
    ).rows[0]!
    expect(row.commitmentEnd).toBe('2026-03-31')
  })

  it('aucune ligne, aucune borne inventée — le mois le plus ancien est null', () => {
    const calendar = buildBillingCalendar([], '2026-09-20')
    expect(calendar.rows).toEqual([])
    expect(calendar.earliestPeriodMonth).toBeNull()
  })
})
