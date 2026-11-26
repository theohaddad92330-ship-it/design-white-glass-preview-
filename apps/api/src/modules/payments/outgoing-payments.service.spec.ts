import { BadRequestException, NotFoundException } from '@nestjs/common'
import { OutgoingPaymentsService } from './outgoing-payments.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const MISSION = 'm0000000-0000-4000-8000-000000000001'
const CONSULTANT = 'c0000000-0000-4000-8000-000000000001'
const PAYMENT = 'p0000000-0000-4000-8000-000000000001'
const INVOICE = 'i0000000-0000-4000-8000-000000000001'
const NOW = new Date('2026-08-20T12:00:00.000Z')

/** Une ligne SQL brute, telle que les trois requêtes du service la rendent. */
function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    mission_id: MISSION,
    mission_label: 'Renfort exploitation',
    account_id: 'a0000000-0000-4000-8000-000000000001',
    account_name: 'NOVA LOGISTIQUE',
    period_month: '2026-07-01',
    consultant_id: CONSULTANT,
    consultant_name: 'Salomé Dufour',
    consultant_title: 'Data Engineer',
    ts_validated: '2026-07-14T09:00:00.000Z',
    ts_days: '18',
    op_id: PAYMENT,
    op_status: 'valide',
    op_amount: '1497300',
    op_settled: null,
    op_scheduled: '2026-07-15',
    op_paid: null,
    op_reminders: 0,
    op_last_reminder: null,
    op_validated_at: '2026-07-10T09:00:00.000Z',
    op_rejected_at: null,
    op_rejection_reason: null,
    si_id: INVOICE,
    si_reference: 'F-2026-0714',
    si_amount: '1497300',
    ...over,
  }
}

/**
 * ⚠️ Les faux déclarent LEURS ARGUMENTS, et ce n'est pas de la décoration :
 * `jest.fn(async () => rows)` type ses appels comme n'en prenant aucun, si bien
 * que `query.mock.calls[0]?.[1]` ne compile pas — et un test qui ne lit pas les
 * arguments qu'on lui passe est un test qui vérifie le mock, pas le code.
 * `pnpm --filter @bellum/api check-types:tests` est le seul contrôle qui le
 * voit : `check-types` ne couvre pas les `.spec.ts`.
 */
function makeService(rows: unknown[] = [row()]) {
  const query = jest.fn(async (_sql: string, _params?: unknown[]) => rows)
  const payments = {
    manager: { query },
    create: jest.fn((entity: Record<string, unknown>) => ({ id: PAYMENT, ...entity })),
    save: jest.fn(async (entity: Record<string, unknown>) => entity),
    update: jest.fn(async (_where: Record<string, unknown>, _patch: Record<string, unknown>) => ({ affected: 1 })),
  }
  const service = new OutgoingPaymentsService(payments as never)
  return { service, payments, query }
}

describe('la LISTE — ce que l’écran des paiements lit', () => {
  it('rend un état QUALIFIÉ, jamais un tableau nu', async () => {
    // « Une erreur se remarque, une liste vide se croit » : sans le mois, les
    // totaux et le droit financier, un écran vide se lirait « rien à payer »
    // aussi bien que « mauvais mois » ou « pas ton périmètre ».
    const { service } = makeService()
    const page = await service.list(WORKSPACE, {}, { canReadFinance: true }, NOW)
    expect(page).toMatchObject({ month: '2026-07', canReadFinance: true })
    expect(page.summary.overdue.count).toBe(1)
  })

  it('prend le mois PRÉCÉDENT par défaut — le 5 du mois, la question est celle d’avant', async () => {
    const { service, query } = makeService()
    await service.list(WORKSPACE, {}, { canReadFinance: true }, new Date('2026-01-05T12:00:00.000Z'))
    // Le passage d'année : décembre 2025, pas décembre 2026.
    expect(query.mock.calls[0]?.[1]).toEqual([WORKSPACE, '2025-12-01', null])
  })

  it('DÉDUIT un paiement `non_genere` d’un relevé validé qu’aucune ligne ne couvre', async () => {
    // Le cœur du modèle : rien n'est semé. Une ligne par mois et par consultant
    // créée « au cas où » ferait mesurer notre propre semis au compteur
    // « paiement non généré ».
    const { service } = makeService([row({ op_id: null, op_status: null, op_amount: null, op_scheduled: null })])
    const page = await service.list(WORKSPACE, {}, { canReadFinance: true }, NOW)
    expect(page.items[0]).toMatchObject({ id: null, status: 'non_genere' })
    expect(page.summary.toValidate.count).toBe(1)
  })

  it('prend le montant de la FACTURE entrante quand le paiement n’en porte pas encore', async () => {
    const { service } = makeService([row({ op_id: null, op_status: null, op_amount: null })])
    const page = await service.list(WORKSPACE, {}, { canReadFinance: true }, NOW)
    expect(page.items[0]?.payableAmountCents).toBe(1_497_300)
  })

  it('rend `null` — jamais 0 — sans facture entrante', async () => {
    // « Rien à payer » et « on n'a pas encore le document » ne se réparent pas
    // de la même façon.
    const { service } = makeService([row({ op_amount: null, si_id: null, si_reference: null, si_amount: null })])
    const page = await service.list(WORKSPACE, {}, { canReadFinance: true }, NOW)
    expect(page.items[0]?.payableAmountCents).toBeNull()
    expect(page.items[0]?.supplierInvoiceId).toBeNull()
  })

  it('rend `null` jours — jamais 0 — quand aucun relevé n’existe', async () => {
    const { service } = makeService([row({ ts_days: null, ts_validated: null })])
    const page = await service.list(WORKSPACE, {}, { canReadFinance: true }, NOW)
    expect(page.items[0]?.timesheetDays).toBeNull()
    expect(page.items[0]?.timesheetValidatedAt).toBeNull()
  })

  it('VIDE les montants sans `finance:read`, et ne les met jamais à zéro', async () => {
    const { service } = makeService()
    const page = await service.list(WORKSPACE, {}, { canReadFinance: false }, NOW)
    expect(page.items[0]?.payableAmountCents).toBeNull()
    expect(page.summary.overdue.totalAmountCents).toBeNull()
    // Le NOMBRE reste : compter n'est pas une donnée financière, et c'est ce
    // qui permet à un gestionnaire d'aller chercher ce qui bloque.
    expect(page.summary.overdue.count).toBe(1)
    expect(page.canReadFinance).toBe(false)
  })

  it('calcule le RÉSUMÉ sur tout le mois, jamais sur la liste filtrée', async () => {
    // Le calculer après le filtre afficherait « 0 en retard » à quelqu'un qui
    // vient de cliquer « à valider ».
    const { service } = makeService([row(), row({ op_id: null, op_status: null })])
    const page = await service.list(WORKSPACE, { status: 'valide' }, { canReadFinance: true }, NOW)
    expect(page.items).toHaveLength(1)
    expect(page.summary.overdue.count + page.summary.toValidate.count).toBe(2)
  })

  it('filtre par recherche libre sur le consultant, le client ou la mission', async () => {
    const { service } = makeService([row(), row({ consultant_name: 'Hakim Barreau', op_id: null, op_status: null })])
    const page = await service.list(WORKSPACE, { search: 'salomé' }, { canReadFinance: true }, NOW)
    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.consultantName).toBe('Salomé Dufour')
  })

  it('ne fait tomber AUCUNE ligne sur un nom absent — une recherche n’est pas un tri', async () => {
    const { service } = makeService([row({ consultant_name: null, account_name: null, mission_label: null })])
    const page = await service.list(WORKSPACE, { search: 'salomé' }, { canReadFinance: true }, NOW)
    expect(page.items).toHaveLength(0)
  })
})

describe('PRÉPARER un paiement', () => {
  it('refuse une mission hors de l’espace', async () => {
    const { service } = makeService([])
    await expect(
      service.generate(WORKSPACE, USER, { missionId: MISSION, consultantId: CONSULTANT, month: '2026-07' }),
    ).rejects.toThrow(NotFoundException)
  })

  it('REFUSE tant que le relevé n’est pas validé par le client', async () => {
    // La seule condition qui protège l'ESN d'un décaissement sur des jours que
    // le client n'a jamais signés. Un contrôle qui n'existe que dans un
    // formulaire est un contrôle qu'un appel direct contourne.
    const { service } = makeService([row({ op_id: null, op_status: null, ts_validated: null })])
    await expect(
      service.generate(WORKSPACE, USER, { missionId: MISSION, consultantId: CONSULTANT, month: '2026-07' }),
    ).rejects.toThrow(BadRequestException)
  })

  it('refuse un second paiement sur le même consultant et le même mois', async () => {
    const { service } = makeService([row()])
    await expect(
      service.generate(WORKSPACE, USER, { missionId: MISSION, consultantId: CONSULTANT, month: '2026-07' }),
    ).rejects.toThrow(BadRequestException)
  })

  it('crée en `a_valider`, source `human`, montant repris de la FACTURE', async () => {
    const { service, payments } = makeService([row({ op_id: null, op_status: null, op_amount: null })])
    await service.generate(WORKSPACE, USER, { missionId: MISSION, consultantId: CONSULTANT, month: '2026-07' })
    expect(payments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'a_valider',
        source: 'human',
        entered_by: USER,
        period_month: '2026-07-01',
        supplier_invoice_id: INVOICE,
        amount_cents: 1_497_300,
        settled_amount_cents: null,
      }),
    )
  })

  it('pose `null` — jamais 0 — quand aucune facture ne justifie encore le paiement', async () => {
    const { service, payments } = makeService([
      row({ op_id: null, op_status: null, op_amount: null, si_id: null, si_amount: null, si_reference: null }),
    ])
    await service.generate(WORKSPACE, USER, { missionId: MISSION, consultantId: CONSULTANT, month: '2026-07' })
    expect(payments.create).toHaveBeenCalledWith(expect.objectContaining({ amount_cents: null }))
  })

  it('n’écrit AUCUN champ bancaire — Bellum ne stocke aucun IBAN', async () => {
    const { service, payments } = makeService([row({ op_id: null, op_status: null, op_amount: null })])
    await service.generate(WORKSPACE, USER, { missionId: MISSION, consultantId: CONSULTANT, month: '2026-07' })
    const written = Object.keys(payments.create.mock.calls[0]?.[0] ?? {})
    expect(written.filter(key => /iban|bic|rib|bank|swift/i.test(key))).toEqual([])
  })
})

describe('VALIDER un paiement', () => {
  it('refuse un paiement introuvable dans cet espace', async () => {
    const { service } = makeService([])
    await expect(service.validate(WORKSPACE, USER, PAYMENT, {})).rejects.toThrow(NotFoundException)
  })

  it('refuse tant que le relevé n’est pas validé — re-vérifié ICI, pas seulement à l’écran', async () => {
    // Une facture peut avoir été supprimée, ou un relevé remis en cause, entre
    // le rendu de l'écran et le clic.
    const { service } = makeService([row({ op_status: 'a_valider', ts_validated: null })])
    await expect(service.validate(WORKSPACE, USER, PAYMENT, {})).rejects.toThrow(BadRequestException)
  })

  it('refuse sans facture entrante — on ne paie pas sur parole', async () => {
    const { service } = makeService([row({ op_status: 'a_valider', si_id: null, si_reference: null })])
    await expect(service.validate(WORKSPACE, USER, PAYMENT, {})).rejects.toThrow(BadRequestException)
  })

  it('refuse de re-valider un paiement déjà constaté payé', async () => {
    const { service } = makeService([row({ op_status: 'paye', op_paid: '2026-07-16' })])
    await expect(service.validate(WORKSPACE, USER, PAYMENT, {})).rejects.toThrow(BadRequestException)
  })

  it('pose l’état, l’horodatage et son AUTEUR', async () => {
    const { service, payments } = makeService([row({ op_status: 'a_valider' })])
    await service.validate(WORKSPACE, USER, PAYMENT, {})
    expect(payments.update).toHaveBeenCalledWith(
      { id: PAYMENT, workspace_id: WORKSPACE },
      expect.objectContaining({ status: 'valide', validated_by: USER }),
    )
  })

  it('n’ÉCRASE pas une date prévue déjà saisie avec un `null`', async () => {
    // Le geste ajoute une date quand elle manquait, il n'en retire jamais une.
    const { service, payments } = makeService([row({ op_status: 'a_valider' })])
    await service.validate(WORKSPACE, USER, PAYMENT, {})
    expect(payments.update.mock.calls[0]?.[1]).not.toHaveProperty('scheduled_on')
  })
})

describe('CONSTATER un paiement', () => {
  it('pose une date même quand l’appelant n’en donne pas — « payé » sans date ne mesure rien', async () => {
    const { service, payments } = makeService([row()])
    await service.settle(WORKSPACE, PAYMENT, {}, NOW)
    expect(payments.update).toHaveBeenCalledWith(
      { id: PAYMENT, workspace_id: WORKSPACE },
      expect.objectContaining({ status: 'paye', paid_on: '2026-08-20' }),
    )
  })

  it('n’écrit PAS le montant sorti quand personne ne l’a saisi — il ne se déduit pas du dû', async () => {
    // Un paiement partiel arrive, et recopier le dû ferait disparaître
    // exactement l'écart qu'on veut voir.
    const { service, payments } = makeService([row()])
    await service.settle(WORKSPACE, PAYMENT, {}, NOW)
    expect(payments.update.mock.calls[0]?.[1]).not.toHaveProperty('settled_amount_cents')
  })

  it('écrit le montant sorti quand il est saisi', async () => {
    const { service, payments } = makeService([row()])
    await service.settle(WORKSPACE, PAYMENT, { settledAmountCents: 1_000_00 }, NOW)
    expect(payments.update.mock.calls[0]?.[1]).toMatchObject({ settled_amount_cents: 1_000_00 })
  })

  it('refuse de constater un paiement REFUSÉ sans le rouvrir', async () => {
    const { service } = makeService([row({ op_status: 'rejete', op_rejection_reason: 'Doublon' })])
    await expect(service.settle(WORKSPACE, PAYMENT, {}, NOW)).rejects.toThrow(BadRequestException)
  })
})

describe('REFUSER un paiement', () => {
  it('écrit le motif et son horodatage', async () => {
    const { service, payments } = makeService([row({ op_status: 'a_valider' })])
    await service.reject(WORKSPACE, PAYMENT, { reason: 'Facture en double' })
    expect(payments.update).toHaveBeenCalledWith(
      { id: PAYMENT, workspace_id: WORKSPACE },
      expect.objectContaining({ status: 'rejete', rejection_reason: 'Facture en double' }),
    )
  })

  it('n’EFFACE ni le montant, ni la facture, ni la date — on archive, on ne supprime pas', async () => {
    const { service, payments } = makeService([row({ op_status: 'a_valider' })])
    await service.reject(WORKSPACE, PAYMENT, { reason: 'Facture en double' })
    const patch = payments.update.mock.calls[0]?.[1] ?? {}
    expect(patch).not.toHaveProperty('amount_cents')
    expect(patch).not.toHaveProperty('supplier_invoice_id')
    expect(patch).not.toHaveProperty('scheduled_on')
  })

  it('refuse de refuser un paiement déjà sorti — le refuser après coup ne le ferait pas revenir', async () => {
    const { service } = makeService([row({ op_status: 'paye', op_paid: '2026-07-16' })])
    await expect(service.reject(WORKSPACE, PAYMENT, { reason: 'trop tard' })).rejects.toThrow(BadRequestException)
  })
})

describe('la relance EN MASSE — elle consigne, elle n’envoie rien', () => {
  it('compte les lignes RÉELLEMENT touchées, pas la longueur du couple de TypeORM', async () => {
    // ⚠️ Sur un `UPDATE … RETURNING`, TypeORM rend `[lignes, nombre]` :
    // `rows.length` vaudrait 2 quel que soit le nombre de lignes touchées —
    // « 2 relances consignées » sur un lot de trente.
    const { service } = makeService([[{ id: PAYMENT }, { id: 'p2' }, { id: 'p3' }], 3])
    const result = await service.remind(WORKSPACE, [PAYMENT, 'p2', 'p3'])
    expect(result).toEqual({ reminded: 3, skipped: 0 })
  })

  it('DIT ce qui a été écarté — « 12 relancés » quand trois sont passés à côté est un mensonge', async () => {
    const { service } = makeService([[{ id: PAYMENT }], 1])
    expect(await service.remind(WORKSPACE, [PAYMENT, 'p2', 'p3'])).toEqual({ reminded: 1, skipped: 2 })
  })

  it('écarte en SQL les paiements payés ou refusés, pas après coup en mémoire', async () => {
    // Filtrer après une lecture laisserait passer un paiement constaté payé
    // entre les deux requêtes.
    const { service, query } = makeService([[], 0])
    await service.remind(WORKSPACE, [PAYMENT])
    expect(String(query.mock.calls[0]?.[0])).toContain("status NOT IN ('paye', 'rejete')")
  })

  it('borne l’écriture à l’ESPACE — un identifiant deviné n’atteint pas un autre espace', async () => {
    const { service, query } = makeService([[], 0])
    await service.remind(WORKSPACE, [PAYMENT])
    expect(String(query.mock.calls[0]?.[0])).toContain('workspace_id = $1')
    expect(query.mock.calls[0]?.[1]).toEqual([WORKSPACE, [PAYMENT]])
  })
})
