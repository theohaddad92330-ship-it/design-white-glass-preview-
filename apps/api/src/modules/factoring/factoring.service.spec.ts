import { BadRequestException, NotFoundException } from '@nestjs/common'
import { FactoringService } from './factoring.service'

/**
 * LA CESSION — ce que le service refuse, et ce qu'il ne devine pas.
 *
 * Chaque test est écrit contre une façon PRÉCISE de produire un chiffre faux,
 * pas contre une ligne de code : céder un mois non facturé, céder à un contrat
 * clos, lire la colonne `state` plutôt que le fait, ou laisser un `null`
 * devenir `0` en passant par `Number()`.
 */

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const OTHER_WORKSPACE = 'w0000000-0000-4000-8000-000000000002'
const USER = 'u0000000-0000-4000-8000-000000000001'
const CONTRACT = 'c0000000-0000-4000-8000-000000000001'
const MISSION = 'm0000000-0000-4000-8000-000000000001'
const ASSIGNMENT = 'a0000000-0000-4000-8000-000000000001'
const SETTLEMENT = 's0000000-0000-4000-8000-000000000001'

type Row = Record<string, unknown>

function makeService(overrides: Record<string, unknown> = {}) {
  const contractRow: Row = {
    id: CONTRACT,
    workspace_id: WORKSPACE,
    factor_name: 'Le factor de l’ESN',
    contract_reference: 'AFF-2026-014',
    commission_rate_bps: 250,
    outstanding_limit_cents: '50000000',
    status: (overrides['contractStatus'] as string) ?? 'active',
    started_on: '2026-01-01',
    ended_on: null,
    created_at: new Date('2026-01-01T09:00:00.000Z'),
    updated_at: new Date('2026-01-01T09:00:00.000Z'),
  }
  const assignmentRow: Row = {
    id: ASSIGNMENT,
    workspace_id: WORKSPACE,
    contract_id: CONTRACT,
    mission_id: MISSION,
    period_month: '2026-06-01',
    status: (overrides['assignmentStatus'] as string) ?? 'prepared',
    assigned_amount_cents: '1000000',
    commission_rate_bps: null,
    assigned_on: null,
    settled_on: null,
    decision_reason: null,
  }
  const settlementRow: Row = {
    id: SETTLEMENT,
    workspace_id: WORKSPACE,
    contract_id: (overrides['settlementContractId'] as string) ?? CONTRACT,
    assignment_id: null,
    received_on: '2026-07-20',
    amount_cents: '975000',
    reference: 'AVIS-88',
    created_at: new Date('2026-07-20T09:00:00.000Z'),
  }

  // ⚠️ Une seule fausse implémentation de `query`, aiguillée sur le TEXTE de la
  // requête. Deux mocks distincts se seraient désynchronisés au premier
  // renommage, et c'est le mock qu'on aurait testé.
  // ⚠️ Les DEUX paramètres sont déclarés, y compris celui que l'aiguillage
  // n'utilise pas : le test qui vérifie le bornage par espace relit
  // `call[1]`, et une signature à un seul paramètre le rendrait inaccessible.
  const query = jest.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.includes('FROM receivable_assignments ra')) {
      return (overrides['joinedAssignments'] as Row[]) ?? []
    }
    if (sql.includes('FROM invoice_readiness r')) {
      return (overrides['receivables'] as Row[]) ?? []
    }
    return []
  })
  const manager = { query }

  const contracts = {
    manager,
    find: jest.fn(async () => (overrides['contractRows'] as Row[]) ?? [contractRow]),
    findOne: jest.fn(async () => (overrides['contractMissing'] === true ? null : contractRow)),
    create: jest.fn((row: Row) => ({ id: 'new-contract', ...row })),
    save: jest.fn(async (row: Row) => ({ ...contractRow, ...row })),
  }
  const assignments = {
    manager,
    findOne: jest.fn(async () => (overrides['assignmentMissing'] === true ? null : assignmentRow)),
    create: jest.fn((row: Row) => ({ id: 'new-assignment', ...row })),
    save: jest.fn(async (row: Row) => ({ id: ASSIGNMENT, ...row })),
  }
  const settlements = {
    manager,
    find: jest.fn(async () => (overrides['settlementRows'] as Row[]) ?? []),
    findOne: jest.fn(async () => (overrides['settlementMissing'] === true ? null : settlementRow)),
    create: jest.fn((row: Row) => ({ id: 'new-settlement', ...row })),
    save: jest.fn(async (row: Row) => ({ id: SETTLEMENT, ...row })),
  }

  const service = new FactoringService(contracts as never, assignments as never, settlements as never)
  return { service, contracts, assignments, settlements, query }
}

/** Une créance facturée, telle que la requête la rend. */
function receivable(patch: Row = {}): Row {
  return {
    mission_id: MISSION,
    period_month: '2026-06-01',
    paid_at: null,
    invoiced_amount_cents: '460000',
    due_on: '2026-07-31',
    mission_label: 'TMA plateforme',
    account_name: 'Cliente historique',
    ...patch,
  }
}

/** Une cession, telle que la requête jointe la rend. */
function joined(patch: Row = {}): Row {
  return {
    id: ASSIGNMENT,
    contract_id: CONTRACT,
    factor_name: 'Le factor de l’ESN',
    contract_rate_bps: 250,
    mission_id: MISSION,
    mission_label: 'TMA plateforme',
    account_name: 'Cliente historique',
    period_month: '2026-06-01',
    status: 'assigned',
    assigned_amount_cents: '1000000',
    own_rate_bps: null,
    assigned_on: '2026-07-02',
    settled_on: null,
    decision_reason: null,
    ...patch,
  }
}

describe('FactoringService.prepare — ce qu’il refuse de céder', () => {
  it('refuse un contrat d’un autre espace', async () => {
    const { service } = makeService({ contractMissing: true })
    await expect(
      service.prepare(WORKSPACE, { contractId: CONTRACT, missionId: MISSION, month: '2026-06' }),
    ).rejects.toThrow(NotFoundException)
  })

  it('refuse un contrat TERMINÉ — la ligne entrerait dans un encours que personne ne réglera', async () => {
    const { service } = makeService({ contractStatus: 'ended' })
    await expect(
      service.prepare(WORKSPACE, { contractId: CONTRACT, missionId: MISSION, month: '2026-06' }),
    ).rejects.toThrow(BadRequestException)
  })

  it('refuse un mois NON FACTURÉ — une cession porte sur une créance', async () => {
    // La requête ne rend rien : ce mois n'a pas de facture émise.
    const { service } = makeService({ receivables: [] })
    await expect(
      service.prepare(WORKSPACE, { contractId: CONTRACT, missionId: MISSION, month: '2026-06' }),
    ).rejects.toThrow(BadRequestException)
  })

  it('écarte une marque « facturé » ANNULÉE — la clause SQL le dit, et c’est vérifié', async () => {
    // Une facturation annulée ne redevient pas une créance. Le refus vit dans
    // la requête ; ce test lit la requête pour que le retirer se VOIE.
    const { service, query } = makeService({ receivables: [{ mission_id: MISSION }] })
    await service.prepare(WORKSPACE, { contractId: CONTRACT, missionId: MISSION, month: '2026-06' })
    const sql = String(query.mock.calls[0]?.[0] ?? '')
    expect(sql).toContain('invoice_cancelled_at IS NULL')
    expect(sql).toContain('r.workspace_id = $1')
  })

  // #2197.41 — une créance CÉDÉE À UN FACTOR l'est sur une facture PROUVÉE,
  // jamais sur une déclaration humaine sans preuve de connecteur : céder une
  // créance qui n'existe peut-être pas ferait porter le risque au factor, pas
  // à Bellum. La requête filtre donc `state = 'invoiced'`, jamais
  // `invoiced_at IS NOT NULL` — ce dernier reste vrai sur un mois DÉCLARÉ.
  it("#2197.41 — filtre sur `state = 'invoiced'` (PROUVÉ), jamais sur la seule présence d’`invoiced_at`", async () => {
    const { service, query } = makeService({ receivables: [{ mission_id: MISSION }] })
    await service.prepare(WORKSPACE, { contractId: CONTRACT, missionId: MISSION, month: '2026-06' })
    const sql = String(query.mock.calls[0]?.[0] ?? '')
    expect(sql).toContain("r.state = 'invoiced'")
    expect(sql).not.toContain('r.invoiced_at IS NOT NULL')
  })

  it('n’INVENTE aucun montant ni aucun taux quand ils ne sont pas saisis', async () => {
    const { service, assignments } = makeService({ receivables: [{ mission_id: MISSION }] })
    await service.prepare(WORKSPACE, { contractId: CONTRACT, missionId: MISSION, month: '2026-06' })
    // ⚠️ `null` et non `0` : un montant à zéro se lirait « rien à céder », et
    // un taux à zéro « affacturage gratuit ».
    expect(assignments.create).toHaveBeenCalledWith(
      expect.objectContaining({ assigned_amount_cents: null, commission_rate_bps: null, status: 'prepared' }),
    )
  })
})

describe('FactoringService — le cycle de vie d’une cession', () => {
  it('refuse de transmettre une cession qui n’est pas préparée', async () => {
    const { service } = makeService({ assignmentStatus: 'assigned' })
    await expect(service.markAssigned(WORKSPACE, ASSIGNMENT, {})).rejects.toThrow(BadRequestException)
  })

  it('refuse de REPRENDRE une cession jamais transmise — c’est un refus, pas une reprise', async () => {
    const { service } = makeService({ assignmentStatus: 'prepared' })
    await expect(
      service.close(WORKSPACE, ASSIGNMENT, { status: 'recalled', reason: 'Le client n’a jamais payé' }),
    ).rejects.toThrow(BadRequestException)
  })

  it('garde la cession et son MOTIF sur un refus — on archive, on ne supprime pas', async () => {
    const { service, assignments } = makeService({ assignmentStatus: 'assigned' })
    await service.close(WORKSPACE, ASSIGNMENT, { status: 'rejected', reason: 'Encours client saturé' })
    expect(assignments.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rejected', decision_reason: 'Encours client saturé' }),
    )
  })

  it('refuse une cession d’un autre espace', async () => {
    const { service } = makeService({ assignmentMissing: true })
    await expect(service.markSettled(OTHER_WORKSPACE, ASSIGNMENT)).rejects.toThrow(NotFoundException)
  })
})

describe('FactoringService.recordSettlement — le règlement du factor', () => {
  it('accepte un règlement SANS cession — c’est la file de réconciliation', async () => {
    const { service, settlements } = makeService()
    await service.recordSettlement(WORKSPACE, USER, {
      contractId: CONTRACT,
      receivedOn: '2026-07-20',
      amountCents: 975_000,
    })
    expect(settlements.create).toHaveBeenCalledWith(
      expect.objectContaining({ assignment_id: null, recorded_by: USER, amount_cents: 975_000 }),
    )
  })

  it('accepte un montant NÉGATIF — une créance reprise fait repartir de l’argent', async () => {
    const { service, settlements } = makeService()
    await service.recordSettlement(WORKSPACE, USER, {
      contractId: CONTRACT,
      receivedOn: '2026-09-02',
      amountCents: -975_000,
    })
    expect(settlements.create).toHaveBeenCalledWith(expect.objectContaining({ amount_cents: -975_000 }))
  })

  it('refuse de rapprocher un règlement d’une cession d’un AUTRE contrat', async () => {
    const { service } = makeService({ settlementContractId: 'c0000000-0000-4000-8000-000000000009' })
    await expect(service.reconcileSettlement(WORKSPACE, SETTLEMENT, ASSIGNMENT)).rejects.toThrow(BadRequestException)
  })

  it('rapprocher ne marque PAS la cession réglée — le verdict est dérivé', async () => {
    const { service, assignments } = makeService()
    await service.reconcileSettlement(WORKSPACE, SETTLEMENT, ASSIGNMENT)
    // Un règlement partiel rapproché doit se lire « il manque 15 000 € », pas
    // « c'est réglé ». Poser le statut ici ferait mentir la ligne au moment
    // précis où l'écart apparaît.
    expect(assignments.save).not.toHaveBeenCalled()
  })
})

describe('FactoringService.view — les chiffres de l’écran', () => {
  it('résout le taux du CONTRAT quand la cession n’en porte pas, et chiffre la commission', async () => {
    const { service } = makeService({ joinedAssignments: [joined()] })
    const view = await service.view(WORKSPACE, { canReadFinance: true })
    expect(view.assignments[0]?.commissionRateBps).toBe(250)
    expect(view.assignments[0]?.commissionAmountCents).toBe(25_000)
  })

  it('laisse un taux DÉROGATOIRE de la cession l’emporter sur celui du contrat', async () => {
    const { service } = makeService({ joinedAssignments: [joined({ own_rate_bps: 180 })] })
    const view = await service.view(WORKSPACE, { canReadFinance: true })
    expect(view.assignments[0]?.commissionRateBps).toBe(180)
  })

  it('rend `null` — jamais 0 — sur un montant cédé absent', async () => {
    // `Number(null)` vaut 0 : c'est la frontière `pg` qui produit le zéro
    // menteur, et c'est là que la garde doit être.
    const { service } = makeService({ joinedAssignments: [joined({ assigned_amount_cents: null })] })
    const view = await service.view(WORKSPACE, { canReadFinance: true })
    expect(view.assignments[0]?.assignedAmountCents).toBeNull()
    expect(view.assignments[0]?.commissionAmountCents).toBeNull()
    expect(view.assignments[0]?.reconciliation.state).toBe('unmeasurable')
  })

  it('rapproche les règlements par cession, et laisse les autres dans la file', async () => {
    const { service } = makeService({
      joinedAssignments: [joined()],
      settlementRows: [
        {
          id: SETTLEMENT,
          contract_id: CONTRACT,
          assignment_id: ASSIGNMENT,
          received_on: '2026-07-20',
          amount_cents: '975000',
          reference: 'AVIS-88',
        },
        {
          id: 's0000000-0000-4000-8000-000000000002',
          contract_id: CONTRACT,
          assignment_id: null,
          received_on: '2026-07-25',
          amount_cents: '12000',
          reference: null,
        },
      ],
    })
    const view = await service.view(WORKSPACE, { canReadFinance: true })
    expect(view.assignments[0]?.reconciliation.state).toBe('matched')
    expect(view.unreconciledSettlements).toHaveLength(1)
    expect(view.summary.unreconciled.amountCents).toBe(12_000)
  })

  it('remonte une créance facturée SANS cession, avec son compte et son échéance', async () => {
    const { service } = makeService({ receivables: [receivable()] })
    const view = await service.view(WORKSPACE, { canReadFinance: true })
    expect(view.missing).toEqual([
      {
        missionId: MISSION,
        missionLabel: 'TMA plateforme',
        accountName: 'Cliente historique',
        periodMonth: '2026-06-01',
        invoicedAmountCents: 460_000,
        dueOn: '2026-07-31',
      },
    ])
    expect(view.summary.missing.amountCents).toBe(460_000)
  })

  it('retire de « cession manquante » une créance DÉJÀ cédée', async () => {
    const { service } = makeService({ receivables: [receivable()], joinedAssignments: [joined()] })
    const view = await service.view(WORKSPACE, { canReadFinance: true })
    expect(view.missing).toEqual([])
  })

  it('retire de « cession manquante » une créance déjà ENCAISSÉE par le client', async () => {
    const { service } = makeService({ receivables: [receivable({ paid_at: '2026-07-02T09:00:00.000Z' })] })
    const view = await service.view(WORKSPACE, { canReadFinance: true })
    expect(view.missing).toEqual([])
  })

  it('borne CHAQUE lecture à l’espace — deux espaces ne partagent aucune ligne', async () => {
    const { service, contracts, settlements, query } = makeService()
    await service.view(WORKSPACE, { canReadFinance: true })
    expect(contracts.find).toHaveBeenCalledWith(expect.objectContaining({ where: { workspace_id: WORKSPACE } }))
    expect(settlements.find).toHaveBeenCalledWith(expect.objectContaining({ where: { workspace_id: WORKSPACE } }))
    for (const call of query.mock.calls) {
      expect(String(call[0])).toContain('workspace_id = $1')
      expect(call[1]).toEqual([WORKSPACE])
    }
  })

  // #2197.41 — même garde que `prepare` : la liste des créances FACTURÉES de
  // l'écran (`invoicedReceivables`) ne doit lire que le PROUVÉ.
  it("#2197.41 — les créances listées le sont sur `state = 'invoiced'`, jamais sur `invoiced_at` seul", async () => {
    const { service, query } = makeService({ receivables: [receivable()] })
    await service.view(WORKSPACE, { canReadFinance: true })
    const receivablesQuery = query.mock.calls.map(call => String(call[0])).find(sql => sql.includes('r.due_on'))
    expect(receivablesQuery).toBeDefined()
    expect(receivablesQuery).toContain("r.state = 'invoiced'")
    expect(receivablesQuery).not.toContain('r.invoiced_at IS NOT NULL')
  })
})

describe('FactoringService.view — la vue « nombres seulement » (31/08/2026)', () => {
  it('VIDE le montant cédé et la commission d’une cession sans `finance:read`, jamais à 0', async () => {
    const { service } = makeService({ joinedAssignments: [joined()] })
    const view = await service.view(WORKSPACE, { canReadFinance: false })
    expect(view.assignments[0]?.assignedAmountCents).toBeNull()
    expect(view.assignments[0]?.commissionAmountCents).toBeNull()
    expect(view.canReadFinance).toBe(false)
  })

  it('VIDE le réglé et l’écart de la réconciliation sans `finance:read`', async () => {
    const { service } = makeService({
      joinedAssignments: [joined()],
      settlementRows: [
        {
          id: SETTLEMENT,
          contract_id: CONTRACT,
          assignment_id: ASSIGNMENT,
          received_on: '2026-07-20',
          amount_cents: '975000',
          reference: 'AVIS-88',
        },
      ],
    })
    const withRight = await service.view(WORKSPACE, { canReadFinance: true })
    expect(withRight.assignments[0]?.reconciliation.state).toBe('matched')
    expect(withRight.assignments[0]?.reconciliation.settledCents).toBe(975_000)

    const view = await service.view(WORKSPACE, { canReadFinance: false })
    // ⚠️ L'ÉTAT du verdict reste lisible — « compte juste » n'est pas un
    // montant — seuls les TROIS chiffres qui le fondent se vident.
    expect(view.assignments[0]?.reconciliation.state).toBe('matched')
    expect(view.assignments[0]?.reconciliation.settledCents).toBeNull()
    expect(view.assignments[0]?.reconciliation.varianceCents).toBeNull()
    expect(view.assignments[0]?.reconciliation.expectedNetCents).toBeNull()
  })

  it('ne laisse PAS fuir le net attendu par la réconciliation — le montant cédé se reconstruirait au centime près', async () => {
    // ⚠️ Régression trouvée en écrivant CE test, pas demandée au départ :
    // `assignedAmountCents` sort `null`, mais `reconcileAssignment` calcule
    // `expectedNetCents` sur le montant RÉEL avant toute rédaction. Sans ce
    // test, un lecteur sans `finance:read` aurait lu le montant cédé par une
    // porte dérobée sur toute cession `awaiting` (aucun règlement encore).
    const { service } = makeService({ joinedAssignments: [joined()] })
    const view = await service.view(WORKSPACE, { canReadFinance: false })
    expect(view.assignments[0]?.reconciliation.state).toBe('awaiting')
    expect(view.assignments[0]?.reconciliation.expectedNetCents).toBeNull()
    expect(view.assignments[0]?.assignedAmountCents).toBeNull()
  })

  it('VIDE le montant facturé d’une créance « manquante » sans `finance:read` — même champ que les encaissements', async () => {
    // `invoicedAmountCents` est déjà dans `REDACTED_FINANCE_FIELDS` (D45,
    // 29/08/2026) : c'est le même nom que sur `/missions/encaissements`. Sans
    // cette rédaction, la créance se serait vidée d'un côté et pas de l'autre.
    const { service } = makeService({ receivables: [receivable()] })
    const withRight = await service.view(WORKSPACE, { canReadFinance: true })
    expect(withRight.missing[0]?.invoicedAmountCents).toBe(460_000)

    const view = await service.view(WORKSPACE, { canReadFinance: false })
    expect(view.missing[0]?.invoicedAmountCents).toBeNull()
    // La mission, le client et l'échéance restent lisibles — ce ne sont pas
    // des montants.
    expect(view.missing[0]?.missionLabel).toBe('TMA plateforme')
    expect(view.missing[0]?.dueOn).toBe('2026-07-31')
  })

  it('retire l’écart TOTAL de l’entête sans `finance:read`', async () => {
    const { service } = makeService({
      joinedAssignments: [joined()],
      settlementRows: [
        {
          id: SETTLEMENT,
          contract_id: CONTRACT,
          assignment_id: ASSIGNMENT,
          received_on: '2026-07-20',
          amount_cents: '850000',
          reference: 'AVIS-88',
        },
      ],
    })
    const view = await service.view(WORKSPACE, { canReadFinance: false })
    expect(view.summary.varianceCents).toBeNull()
  })

  it('LAISSE les quatre totaux AGRÉGÉS de l’entête sans `finance:read` — le compteur n’est pas un montant PAR cession', async () => {
    // ⚠️ Décision du lot : `outstanding`/`awaiting`/`missing`/`unreconciled`
    // portent le champ générique `amountCents`, un nom que
    // `supplier-invoice.ts` et `expense-report.ts` portent aussi — l'inscrire
    // à `REDACTED_FINANCE_FIELDS` viderait des montants que personne n'a
    // demandé de vider. L'exposition VOULUE : l'encours AGRÉGÉ se lit, le
    // détail PAR cession se rédige.
    const { service } = makeService({ joinedAssignments: [joined()], receivables: [receivable()] })
    const withRight = await service.view(WORKSPACE, { canReadFinance: true })
    const view = await service.view(WORKSPACE, { canReadFinance: false })
    expect(view.summary.outstanding.amountCents).toBe(withRight.summary.outstanding.amountCents)
    expect(view.summary.missing.amountCents).toBe(withRight.summary.missing.amountCents)
  })

  it('ne touche à RIEN avec le droit — les montants restent chiffrés', async () => {
    const { service } = makeService({ joinedAssignments: [joined()] })
    const view = await service.view(WORKSPACE, { canReadFinance: true })
    expect(view.assignments[0]?.assignedAmountCents).toBe(1_000_000)
    expect(view.assignments[0]?.commissionAmountCents).toBe(25_000)
    expect(view.canReadFinance).toBe(true)
  })
})
