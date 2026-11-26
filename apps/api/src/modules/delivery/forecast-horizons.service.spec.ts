import { FinanceController } from './finance.controller'
import { ForecastHorizonsService } from './forecast-horizons.service'

describe('GET /delivery/finance/forecast/horizons (#2425.2)', () => {
  function controller() {
    const compute = jest.fn(async () => ({}))
    const workspaceContext = { resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: 'ws', role: 'owner' })) }
    const instance = new FinanceController(
      {} as never,
      {} as never,
      {} as never,
      workspaceContext as never,
      {
        compute,
      } as never,
    )
    return { instance, compute }
  }

  it('lit l’horizon demandé parmi les quatre', async () => {
    const { instance, compute } = controller()
    await instance.forecastHorizons({ userId: 'u' } as never, 'semester')
    expect(compute).toHaveBeenCalledWith('ws', 'semester')
  })

  it('un horizon inconnu retombe sur le mois, jamais sur une fenêtre inventée', async () => {
    const { instance, compute } = controller()
    await instance.forecastHorizons({ userId: 'u' } as never, 'decade')
    expect(compute).toHaveBeenCalledWith('ws', 'month')
  })
})

describe('GET /delivery/finance/po-overview (#2783)', () => {
  it('délègue au service, scopé au périmètre de l’appelant', async () => {
    const poConsumptionOverview = jest.fn(async () => ({
      ok: 1,
      approaching: 0,
      overrun: 0,
      unmeasured: 0,
      amendments: { accepted: 0, simulated: 0 },
    }))
    const workspaceContext = { resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: 'ws', role: 'owner' })) }
    const instance = new FinanceController(
      {} as never,
      {} as never,
      {} as never,
      workspaceContext as never,
      { poConsumptionOverview } as never,
    )
    const result = await instance.poOverview({ userId: 'u' } as never)
    expect(poConsumptionOverview).toHaveBeenCalledWith('ws')
    expect(result.ok).toBe(1)
  })
})

/**
 * #2425 — le prévisionnel par horizon, lu depuis les données DÉJÀ persistées.
 *
 * Le service normalise quatre lectures (missions, pipe, factures, préparation
 * du mois) en lignes, puis délègue tout le calcul au module pur du contrat
 * (`computeHorizonForecast`). Ces tests prouvent la NORMALISATION : quel statut
 * va dans quelle composante, quel jour borne quel montant.
 */

// Mercredi 23/09/2026 : horizon « semaine » = 23 → 30 (5 jours ouvrés).
const NOW = new Date('2026-09-23T10:00:00Z')

type Rows = {
  missions?: unknown[]
  pipeline?: unknown[]
  invoices?: unknown[]
  needs?: unknown[]
  amendments?: unknown[]
}

function build(rows: Rows, prepared: unknown[] = []) {
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('FROM invoice_readiness')) return rows.invoices ?? []
    if (sql.includes('FROM opportunities')) return rows.pipeline ?? []
    if (sql.includes('FROM project_needs')) return rows.needs ?? [{ open: '0' }]
    if (sql.includes('FROM mission_amendments')) return rows.amendments ?? []
    if (sql.includes('FROM missions')) return rows.missions ?? []
    throw new Error(`requête inattendue : ${sql.slice(0, 60)}`)
  })
  const scores = {
    capacity: jest.fn(async () => ({
      periodMonth: '2026-09-01',
      capacityDays: 44,
      committedDays: 30,
      availableDays: 14,
      unmeasured: 0,
      bench: { rate: null, onBench: 1, measurability: { measurable: false, observed: 2, required: 5, missing: 3 } },
    })),
  }
  const readiness = {
    list: jest.fn(async () => ({ items: prepared, summary: {}, month: '2026-08', canReadFinance: true })),
  }
  const service = new ForecastHorizonsService({ manager: { query } } as never, scores as never, readiness as never)
  return { service, query, scores, readiness }
}

function mission(overrides: Record<string, unknown>) {
  return {
    id: 'm1',
    status: 'active',
    renewal_status: null,
    daily_rate: '500',
    started_on: '2026-01-01',
    ends_on: '2026-12-31',
    currency: null,
    ...overrides,
  }
}

describe('ForecastHorizonsService (#2425)', () => {
  it('#2425.3 — une mission en cours tombe au CARNET, chiffrée sur ses jours ouvrés dans l’horizon', async () => {
    const { service } = build({ missions: [mission({})] })
    const result = await service.compute('ws', 'week', NOW)
    const backlog = result.components.find(entry => entry.component === 'backlog')
    // 5 jours ouvrés × 500 € = 2 500 € — et la devise absente est NOMMÉE.
    expect(backlog?.amounts).toEqual([{ currency: 'EUR', amountCents: 250_000 }])
    expect(backlog?.assumedCurrency).toBe(1)
  })

  it('une mission sans date de fin n’est pas prolongée d’office : COMPTÉE sans montant', async () => {
    const { service } = build({ missions: [mission({ ends_on: null })] })
    const result = await service.compute('ws', 'week', NOW)
    const backlog = result.components.find(entry => entry.component === 'backlog')
    expect(backlog?.amounts).toBeNull()
    expect(backlog?.withoutAmount).toBe(1)
  })

  it('un renouvellement DÉCLARÉ prolonge la mission après sa fin, en composante « renouvellement »', async () => {
    const { service } = build({
      missions: [mission({ ends_on: '2026-09-24', renewal_status: 'renouvele', currency: 'EUR' })],
    })
    const result = await service.compute('ws', 'week', NOW)
    const of = (id: string) => result.components.find(entry => entry.component === id)?.amounts
    // Carnet : 23 et 24 → 2 jours. Renouvellement : 25, 28, 29 → 3 jours.
    expect(of('backlog')).toEqual([{ currency: 'EUR', amountCents: 100_000 }])
    expect(of('renewal')).toEqual([{ currency: 'EUR', amountCents: 150_000 }])
    // Pas de décision « sécuriser » : le renouvellement est déclaré.
    expect(result.decisions.map(entry => entry.decision)).not.toContain('secureRenewal')
  })

  it('#2425.9 — une mission qui finit dans l’horizon SANS suite déclarée propose « sécuriser le renouvellement »', async () => {
    const { service } = build({ missions: [mission({ ends_on: '2026-09-24', renewal_status: 'discussion_en_cours' })] })
    const result = await service.compute('ws', 'week', NOW)
    expect(result.decisions.map(entry => entry.decision)).toContain('secureRenewal')
  })

  it('une fin CONFIRMÉE n’est pas un renouvellement à sécuriser', async () => {
    const { service } = build({ missions: [mission({ ends_on: '2026-09-24', renewal_status: 'fin_confirmee' })] })
    const result = await service.compute('ws', 'week', NOW)
    expect(result.decisions.map(entry => entry.decision)).not.toContain('secureRenewal')
  })

  it('une mission déclarée « bloquée » sort du scénario bas', async () => {
    const { service } = build({ missions: [mission({ renewal_status: 'bloque', currency: 'EUR' })] })
    const result = await service.compute('ws', 'week', NOW)
    const downside = result.scenarios.find(entry => entry.scenario === 'downside')
    expect(downside?.amounts).toBeNull()
    expect(downside?.excluded).toBe(1)
  })

  it('une mission passée « à risque » sort aussi du scénario bas — un statut DÉCLARÉ, pas une chance', async () => {
    const { service } = build({ missions: [mission({ status: 'at_risk', currency: 'EUR' })] })
    const result = await service.compute('ws', 'week', NOW)
    expect(result.scenarios.find(entry => entry.scenario === 'downside')?.excluded).toBe(1)
    expect(result.scenarios.find(entry => entry.scenario === 'committed')?.amounts).toEqual([
      { currency: 'EUR', amountCents: 250_000 },
    ])
  })

  it('#2425.12 — lit les statuts EN COURS du contrat ; jamais `renewed` (un statut de fin), jamais `paused`', async () => {
    const { service, query } = build({})
    await service.compute('ws', 'week', NOW)
    const missionsSql = String(
      query.mock.calls.find(([sql]) => String(sql).includes('m.renewal_status, m.daily_rate'))?.[0],
    )
    expect(missionsSql).toContain("'at_risk'")
    expect(missionsSql).toContain("'renewal_pending'")
    expect(missionsSql).not.toContain("'renewed'")
    expect(missionsSql).not.toContain("'paused'")
  })

  it('#2425.12 — une opportunité devenue mission ne se compte pas deux fois', async () => {
    const { service } = build({
      missions: [mission({ id: 'm1', currency: 'EUR' })],
      pipeline: [
        { id: 'o1', estimated_amount: '40000', currency: 'EUR', expected_close_on: '2026-09-25', mission_id: 'm1' },
      ],
    })
    const result = await service.compute('ws', 'week', NOW)
    const upside = result.scenarios.find(entry => entry.scenario === 'upside')
    expect(upside?.amounts).toEqual([{ currency: 'EUR', amountCents: 250_000 }])
    expect(upside?.deduplicated).toBe(1)
  })

  it('une opportunité non DATÉE n’est pas chiffrée dans l’horizon, et appelle « compléter le pipe »', async () => {
    const { service } = build({
      pipeline: [{ id: 'o1', estimated_amount: '40000', currency: 'EUR', expected_close_on: null, mission_id: null }],
    })
    const result = await service.compute('ws', 'week', NOW)
    expect(result.components.find(entry => entry.component === 'pipeline')?.withoutAmount).toBe(1)
    expect(result.decisions.map(entry => entry.decision)).toContain('completePipeline')
  })

  it('#2425.6 — factures : échue → retard, à échoir dans l’horizon → cash prévu, contestée → litige', async () => {
    const invoice = {
      mission_id: 'm1',
      period_month: '2026-08-01',
      invoiced_amount_cents: '100000',
      paid_amount_cents: null,
      disputed_at: null,
      dispute_resolved_at: null,
      currency: 'EUR',
    }
    const { service } = build({
      invoices: [
        { ...invoice, period_month: '2026-06-01', due_on: '2026-09-01' },
        { ...invoice, period_month: '2026-07-01', due_on: '2026-09-28', paid_amount_cents: '40000' },
        { ...invoice, period_month: '2026-05-01', due_on: '2026-07-01', disputed_at: '2026-07-10' },
        { ...invoice, period_month: '2026-08-01', due_on: '2026-11-01' },
      ],
    })
    const result = await service.compute('ws', 'week', NOW)
    const of = (id: string) => result.components.find(entry => entry.component === id)?.amounts
    expect(of('overdue')).toEqual([{ currency: 'EUR', amountCents: 100_000 }])
    // Le reste dû se NOMME : 1 000 − 400 = 600 €.
    expect(of('receivable')).toEqual([{ currency: 'EUR', amountCents: 60_000 }])
    expect(of('disputed')).toEqual([{ currency: 'EUR', amountCents: 100_000 }])
    // L'échéance hors horizon n'entre nulle part.
    expect(result.money.cash.amounts).toEqual([{ currency: 'EUR', amountCents: 60_000 }])
  })

  it('#2425.6 — la facture PRÉVUE vient de la préparation du mois (prêt ou bloqué), jamais d’un mois déjà facturé', async () => {
    const { service, readiness } = build({}, [
      { missionId: 'm1', periodMonth: '2026-08-01', state: 'ready', preparedAmountCents: 300_000 },
      { missionId: 'm2', periodMonth: '2026-08-01', state: 'blocked', preparedAmountCents: 100_000 },
      { missionId: 'm3', periodMonth: '2026-08-01', state: 'invoiced', preparedAmountCents: 999_999 },
    ])
    const result = await service.compute('ws', 'month', NOW)
    expect(readiness.list).toHaveBeenCalledWith(
      'ws',
      expect.objectContaining({ month: '2026-08' }),
      { canReadFinance: true },
      NOW,
    )
    expect(result.money.invoicing.amounts).toEqual([{ currency: 'EUR', amountCents: 400_000 }])
  })

  it('#2425.7 — la capacité : réservée, disponible, trous et besoins ouverts', async () => {
    const { service, query } = build({ needs: [{ open: '3' }] })
    const result = await service.compute('ws', 'month', NOW)
    expect(result.capacity).toEqual({ reservedDays: 30, availableDays: 14, bench: 1, uncoveredNeeds: 3 })
    // « Ouvert » = le prédicat PARTAGÉ (`needStillOpenSql`), jamais `status = 'open'` —
    // une valeur héritée que plus aucun besoin récent ne porte (la démo : `to_match`).
    const needsSql = String(query.mock.calls.find(([sql]) => String(sql).includes('FROM project_needs'))?.[0])
    expect(needsSql).toContain("'to_match'")
    expect(needsSql).not.toContain("n.status = 'open'")
  })

  it('#2783 — sans avenant dans l’horizon, la ligne « dont avenants » est à zéro', async () => {
    const { service } = build({})
    const result = await service.compute('ws', 'month', NOW)
    expect(result.amendments).toEqual({ total: 0, accepted: 0, simulated: 0 })
  })

  it('#2783 — accepté/actif compte comme DÉCIDÉ, proposé compte comme SIMULÉ — jamais fondus', async () => {
    const { service } = build({
      amendments: [{ status: 'accepted' }, { status: 'active' }, { status: 'proposed' }, { status: 'proposed' }],
    })
    const result = await service.compute('ws', 'month', NOW)
    expect(result.amendments).toEqual({ total: 4, accepted: 2, simulated: 2 })
  })

  it('#2783 — rejeté/annulé ne compte jamais — ils ne se sont jamais produits', async () => {
    const { service, query } = build({ amendments: [{ status: 'rejected' }, { status: 'cancelled' }] })
    const result = await service.compute('ws', 'month', NOW)
    // La requête elle-même les exclut déjà — un rejeté renvoyé par erreur ne
    // doit pas non plus se compter côté service (double filet).
    const amendmentsSql = String(query.mock.calls.find(([sql]) => String(sql).includes('FROM mission_amendments'))?.[0])
    expect(amendmentsSql).toContain("'proposed', 'accepted', 'active'")
    expect(result.amendments).toEqual({ total: 0, accepted: 0, simulated: 0 })
  })
})

/**
 * #2783 — LE VOLUME DE BONS DE COMMANDE, à l'échelle de l'ESPACE, croisé aux
 * avenants qui touchent les mêmes missions.
 */
describe('ForecastHorizonsService.poConsumptionOverview (#2783)', () => {
  type PoRows = { mission_id: string; po_volume_days: number | string | null; consumed_days: string | null }

  function buildPo(poRows: PoRows[], amendments: { status: string }[] = []) {
    const query = jest.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('FROM mission_commercial_terms')) return poRows
      if (sql.includes('FROM mission_amendments')) return amendments
      throw new Error(`requête inattendue : ${sql.slice(0, 60)}`)
    })
    const service = new ForecastHorizonsService({ manager: { query } } as never, {} as never, {} as never)
    return { service, query }
  }

  it('sans aucune mission suivie par PO, les quatre compteurs sont à zéro', async () => {
    const { service } = buildPo([])
    const result = await service.poConsumptionOverview('ws')
    expect(result).toEqual({
      ok: 0,
      approaching: 0,
      overrun: 0,
      unmeasured: 0,
      amendments: { accepted: 0, simulated: 0 },
    })
  })

  it('classe chaque mission dans le MÊME état que `poConsumptionAlert` (fiche mission), jamais un second calcul', async () => {
    const { service } = buildPo([
      // 10/50 jours = 20 % : ok.
      { mission_id: 'm1', po_volume_days: 50, consumed_days: '10' },
      // 47/50 jours = 94 % : à surveiller (seuil 90 %).
      { mission_id: 'm2', po_volume_days: 50, consumed_days: '47' },
      // 60/50 jours : dépassé.
      { mission_id: 'm3', po_volume_days: 50, consumed_days: '60' },
      // Volume connu, aucun relevé compté encore : non mesuré.
      { mission_id: 'm4', po_volume_days: 50, consumed_days: null },
    ])
    const result = await service.poConsumptionOverview('ws')
    expect(result.ok).toBe(1)
    expect(result.approaching).toBe(1)
    expect(result.overrun).toBe(1)
    expect(result.unmeasured).toBe(1)
  })

  it('les avenants comptés sont ceux qui touchent LES MÊMES missions, jamais tous ceux de l’espace', async () => {
    const { service, query } = buildPo(
      [{ mission_id: 'm1', po_volume_days: 50, consumed_days: '10' }],
      [{ status: 'accepted' }, { status: 'proposed' }],
    )
    const result = await service.poConsumptionOverview('ws')
    expect(result.amendments).toEqual({ accepted: 1, simulated: 1 })

    const amendmentsCall = query.mock.calls.find(([sql]) => String(sql).includes('FROM mission_amendments'))
    expect(amendmentsCall?.[1]).toEqual(['ws', ['m1']])
  })

  it('aucune mission suivie par PO — la requête sur `mission_amendments` n’est même pas tentée', async () => {
    const { service, query } = buildPo([])
    await service.poConsumptionOverview('ws')
    expect(query.mock.calls.some(([sql]) => String(sql).includes('FROM mission_amendments'))).toBe(false)
  })
})
