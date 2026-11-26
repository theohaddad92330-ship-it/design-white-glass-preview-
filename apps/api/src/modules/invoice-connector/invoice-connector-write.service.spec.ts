import { ConflictException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import type { InvoiceConnectorWriteRequestEntity } from '../../database/entities/invoice-connector-write-request.entity'
import type { MissionCommercialTermsEntity } from '../../database/entities/mission-commercial-terms.entity'
import type { InvoiceConnectorPort, InvoiceConnectorWriteOutcome } from './invoice-connector.port'
import { InvoiceConnectorWriteService } from './invoice-connector-write.service'

/**
 * #2565 — CRÉER la facture PRÉPARÉE dans l'outil de gestion branché par le
 * client, APRÈS validation, SEULEMENT sur preuve du connecteur.
 *
 * Les deux tests que le lot exige explicitement :
 *  - #2565.3 — « facturé » ne s'écrit JAMAIS sans une réponse `ok: true` du
 *    connecteur (un `failed` du port n'écrit jamais `invoiced`) ;
 *  - #2565.4 — un `unknown` ne se rejoue JAMAIS automatiquement, alors qu'un
 *    `failed` (rien n'est parti) reste rejouable — le cas voisin légitime que
 *    ce test prend soin de NE PAS attraper.
 * Et #2565.2 — la feuille de temps se vérifie AVANT la création, pas après.
 */

const WS = 'ws-1'
const USER = 'u-1'
const MISSION = 'mission-1'
const MONTH = '2026-09-01'

/** #2565.10 — le mois TEL QUE L'ÉCRAN LE LIT (`InvoiceReadinessService.list`),
 *  que le contrôleur passe au service. Il remplace la ligne `invoice_readiness`
 *  que le service relisait avant — une colonne que rien n'écrit à `'ready'`. */
type Month = NonNullable<Parameters<InvoiceConnectorWriteService['send']>[0]['month']>

function readyRow(overrides: Partial<Month> = {}): Month {
  return {
    state: 'ready',
    blockers: [],
    days: 10,
    dailyRateCents: 50_000,
    preparedAmountCents: 500000,
    missionLabel: 'Renfort plateforme',
    accountName: 'ACME',
    ...overrides,
  }
}

function makeService(options: {
  readiness?: Month | null
  existingRequests?: Partial<InvoiceConnectorWriteRequestEntity>[]
  outcomes?: ReadonlyArray<InvoiceConnectorWriteOutcome | Error>
  /** #2418.3 — `null` (défaut) = aucune condition commerciale saisie pour la
   *  mission, comme `findOne` le rend réellement sur une ligne absente. */
  commercialTerms?: Partial<MissionCommercialTermsEntity> | null
}) {
  const stored: Partial<InvoiceConnectorWriteRequestEntity>[] = [...(options.existingRequests ?? [])]
  let seq = stored.length

  const requestsRepo = {
    find: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      stored
        .filter(row => Object.entries(where).every(([key, value]) => (row as never)[key] === value))
        .sort((a, b) => (b.created_at as Date).getTime() - (a.created_at as Date).getTime()),
    ),
    create: jest.fn((value: Partial<InvoiceConnectorWriteRequestEntity>) => ({
      invoice_reference: null,
      detail: null,
      ...value,
    })),
    save: jest.fn(async (value: Partial<InvoiceConnectorWriteRequestEntity>) => {
      seq += 1
      const saved = { id: `icwr-${seq}`, created_at: new Date(), ...value }
      stored.push(saved)
      return saved
    }),
    update: jest.fn(async (criteria: { id: string }, patch: Partial<InvoiceConnectorWriteRequestEntity>) => {
      const row = stored.find(r => r.id === criteria.id)
      if (row) Object.assign(row, patch)
      return { affected: row ? 1 : 0 }
    }),
  } as unknown as Repository<InvoiceConnectorWriteRequestEntity>

  const outcomes = [...(options.outcomes ?? [])]
  const fallback: InvoiceConnectorWriteOutcome = {
    ok: false,
    outcome: 'failed',
    detail: 'aucun résultat de test configuré',
  }
  const connector: InvoiceConnectorPort = {
    createInvoice: jest.fn(async (): Promise<InvoiceConnectorWriteOutcome> => {
      const next = outcomes.shift()
      if (next instanceof Error) throw next
      return next ?? fallback
    }),
  }

  const commercialTermsRepo = {
    findOne: jest.fn(async () => options.commercialTerms ?? null),
  } as unknown as Repository<MissionCommercialTermsEntity>

  const real = new InvoiceConnectorWriteService(requestsRepo, commercialTermsRepo, connector)
  // #2565.10 — le mois arrive du CONTRÔLEUR ; chaque test garde sa forme
  // d'appel, et le harnais y joint le mois qu'il a configuré (`readiness`).
  const service = {
    send: (input: Omit<Parameters<InvoiceConnectorWriteService['send']>[0], 'month'>) =>
      real.send({ ...input, month: options.readiness ?? null }),
  }
  return { service, stored, connector }
}

describe('la vérification préalable — AVANT, pas après', () => {
  it('refuse de créer la moindre demande tant que le mois n’est pas PRÊT', async () => {
    const { service, stored, connector } = makeService({
      readiness: readyRow({ state: 'blocked', blockers: ['missing_timesheet'] }),
    })
    await expect(
      service.send({ workspaceId: WS, userId: USER, missionId: MISSION, periodMonth: MONTH, provider: 'odoo' }),
    ).rejects.toThrow(ConflictException)
    expect(stored).toHaveLength(0)
    expect(connector.createInvoice).not.toHaveBeenCalled()
  })

  it('refuse sans outil de gestion connecté — rien n’est créé non plus', async () => {
    const { service, stored, connector } = makeService({ readiness: readyRow() })
    await expect(
      service.send({ workspaceId: WS, userId: USER, missionId: MISSION, periodMonth: MONTH, provider: null }),
    ).rejects.toThrow(ConflictException)
    expect(stored).toHaveLength(0)
    expect(connector.createInvoice).not.toHaveBeenCalled()
  })
})

describe('#2565.3 — « facturé » ne s’écrit QUE sur preuve du connecteur', () => {
  it('un refus du connecteur (ok: false) n’écrit JAMAIS `invoiced`', async () => {
    const { service, stored } = makeService({
      readiness: readyRow(),
      outcomes: [{ ok: false, outcome: 'failed', detail: 'refusé par le connecteur' }],
    })
    const result = await service.send({
      workspaceId: WS,
      userId: USER,
      missionId: MISSION,
      periodMonth: MONTH,
      provider: 'odoo',
    })
    expect(result.state).toBe('failed')
    expect(result.invoice_reference).toBeNull()
    expect(stored.some(r => r.state === 'invoiced')).toBe(false)
  })

  it('une réponse `ok: true` avec référence — et SEULEMENT elle — écrit `invoiced`', async () => {
    const { service } = makeService({
      readiness: readyRow(),
      outcomes: [{ ok: true, reference: 'FAC-2026-0912' }],
    })
    const result = await service.send({
      workspaceId: WS,
      userId: USER,
      missionId: MISSION,
      periodMonth: MONTH,
      provider: 'odoo',
    })
    expect(result.state).toBe('invoiced')
    expect(result.invoice_reference).toBe('FAC-2026-0912')
  })
})

describe('#2565.4 — un `unknown` ne se rejoue JAMAIS automatiquement', () => {
  it('un timeout EN VOL classe `unknown`, et une SECONDE tentative est refusée sans appeler le connecteur', async () => {
    const inFlight = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })
    const { service, connector } = makeService({ readiness: readyRow(), outcomes: [inFlight] })

    const first = await service.send({
      workspaceId: WS,
      userId: USER,
      missionId: MISSION,
      periodMonth: MONTH,
      provider: 'odoo',
    })
    expect(first.state).toBe('unknown')
    expect(connector.createInvoice).toHaveBeenCalledTimes(1)

    // Un second connecteur qui RÉUSSIRAIT — la preuve qu'il n'est jamais appelé.
    ;(connector.createInvoice as jest.Mock).mockResolvedValueOnce({ ok: true, reference: 'NE-DOIT-JAMAIS-PARTIR' })

    await expect(
      service.send({ workspaceId: WS, userId: USER, missionId: MISSION, periodMonth: MONTH, provider: 'odoo' }),
    ).rejects.toThrow(ConflictException)
    // Toujours UNE seule fois : le second appel n'a jamais atteint le connecteur.
    expect(connector.createInvoice).toHaveBeenCalledTimes(1)
  })

  it('LE CAS VOISIN LÉGITIME : un échec réseau JAMAIS PARTI (`failed`) reste rejouable', async () => {
    const neverLeft = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
    const { service, connector } = makeService({ readiness: readyRow(), outcomes: [neverLeft] })

    const first = await service.send({
      workspaceId: WS,
      userId: USER,
      missionId: MISSION,
      periodMonth: MONTH,
      provider: 'odoo',
    })
    expect(first.state).toBe('failed')

    // Une NOUVELLE tentative doit être acceptée — rien n'était parti.
    ;(connector.createInvoice as jest.Mock).mockResolvedValueOnce({ ok: true, reference: 'FAC-REJOUÉE' })
    const second = await service.send({
      workspaceId: WS,
      userId: USER,
      missionId: MISSION,
      periodMonth: MONTH,
      provider: 'odoo',
    })
    expect(second.state).toBe('invoiced')
    expect(connector.createInvoice).toHaveBeenCalledTimes(2)
  })
})

describe('les états intermédiaires bloquent aussi une double tentative', () => {
  it('refuse une nouvelle demande tant qu’une facture est déjà `invoiced`', async () => {
    const { service, connector } = makeService({
      readiness: readyRow(),
      existingRequests: [
        {
          workspace_id: WS,
          mission_id: MISSION,
          period_month: MONTH,
          state: 'invoiced',
          invoice_reference: 'FAC-DÉJÀ-LÀ',
          created_at: new Date('2026-09-10'),
        },
      ],
    })
    await expect(
      service.send({ workspaceId: WS, userId: USER, missionId: MISSION, periodMonth: MONTH, provider: 'odoo' }),
    ).rejects.toThrow(ConflictException)
    expect(connector.createInvoice).not.toHaveBeenCalled()
  })
})

describe('#2565.10 — le connecteur reçoit ce que l’écran a PRÉVISUALISÉ', () => {
  it('passe l’espace et les faits du mois (compte, jours, TJM, montant HT) — rien d’autre, rien de deviné', async () => {
    const { service, connector, stored } = makeService({
      readiness: readyRow({ days: 18, dailyRateCents: 65_000, preparedAmountCents: 1_170_000 }),
      outcomes: [{ ok: true, reference: '42' }],
    })
    await service.send({ workspaceId: WS, userId: USER, missionId: MISSION, periodMonth: MONTH, provider: 'odoo' })

    expect(connector.createInvoice).toHaveBeenCalledWith({
      provider: 'odoo',
      workspaceId: WS,
      payload: {
        missionId: MISSION,
        periodMonth: MONTH,
        preparedAmountCents: 1_170_000,
        missionLabel: 'Renfort plateforme',
        accountName: 'ACME',
        days: 18,
        dailyRateCents: 65_000,
      },
    })
    // La prévisualisation FIGÉE nomme enfin la mission et le compte.
    const preview = stored[0]?.preview ?? []
    expect(preview).toEqual(
      expect.arrayContaining([
        { field: 'Mission', value: 'Renfort plateforme' },
        { field: 'Compte', value: 'ACME' },
      ]),
    )
  })

  it('un mois ABSENT de l’écran (mission hors période) est refusé comme non prêt — rien ne part', async () => {
    const { service, stored, connector } = makeService({ readiness: null })
    await expect(
      service.send({ workspaceId: WS, userId: USER, missionId: MISSION, periodMonth: MONTH, provider: 'odoo' }),
    ).rejects.toThrow(ConflictException)
    expect(stored).toHaveLength(0)
    expect(connector.createInvoice).not.toHaveBeenCalled()
  })
})

describe('#2418.3 — la prévisualisation FIGÉE porte les champs utiles à PRÉPARER', () => {
  it('bon de commande, chargé d’affaires (readiness) et devise, conditions de règlement (conditions commerciales)', async () => {
    const { service, stored } = makeService({
      readiness: readyRow({ poNumber: 'PO-2026-042', ownerName: 'Camille Dupuis' }),
      commercialTerms: { currency: 'EUR', payment_terms_days: 60, payment_terms_basis: 'invoice_date' },
      outcomes: [{ ok: true, reference: '42' }],
    })
    await service.send({ workspaceId: WS, userId: USER, missionId: MISSION, periodMonth: MONTH, provider: 'odoo' })

    const preview = stored[0]?.preview ?? []
    expect(preview).toEqual(
      expect.arrayContaining([
        { field: 'Ligne', value: '10 j × 500.00 €' },
        { field: 'Bon de commande', value: 'PO-2026-042' },
        { field: 'Devise', value: 'EUR' },
        { field: 'Conditions de règlement', value: '60 jours (date de facture)' },
        { field: 'Chargé d’affaires', value: 'Camille Dupuis' },
      ]),
    )
  })

  it('aucune condition commerciale saisie pour la mission : « non renseigné », jamais deviné', async () => {
    const { service, stored } = makeService({
      readiness: readyRow(),
      commercialTerms: null,
      outcomes: [{ ok: true, reference: '42' }],
    })
    await service.send({ workspaceId: WS, userId: USER, missionId: MISSION, periodMonth: MONTH, provider: 'odoo' })

    const preview = stored[0]?.preview ?? []
    expect(preview).toEqual(
      expect.arrayContaining([
        { field: 'Bon de commande', value: 'non renseigné' },
        { field: 'Devise', value: 'non renseigné' },
        { field: 'Conditions de règlement', value: 'non renseigné' },
        { field: 'Chargé d’affaires', value: 'non renseigné' },
      ]),
    )
  })
})
