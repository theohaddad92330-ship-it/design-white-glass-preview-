import 'reflect-metadata'
import type { Repository } from 'typeorm'
import type { LegalEntity } from '@bellum/contracts'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { MissionEntity } from '../../database/entities/mission.entity'
import type { InvoiceReadinessService } from '../delivery/invoice-readiness.service'
import type { LegalEntitiesService } from '../legal-entities/legal-entities.service'
import type { ToolRegistryService } from '../tool-registry/tool-registry.service'
import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { InvoiceConnectorWriteController } from './invoice-connector-write.controller'
import type { InvoiceConnectorWriteService } from './invoice-connector-write.service'

/**
 * #2565.10 — la ROUTE qui dépose un brouillon de facture dans l'outil de
 * gestion branché par l'espace.
 *
 * Deux choses que ce lot rend vraies, et que ce fichier tient :
 *  1. Déposer une facture — même en brouillon — est un acte FINANCIER : la
 *     route porte `finance:write` et elle seule, la permission des autres
 *     écritures de facturation (`invoice-readiness.controller.ts` : encaisser,
 *     annuler, ouvrir un litige). `records:write` seul n'y suffit plus.
 *  2. Le mois envoyé est celui que l'ÉCRAN a lu. Avant ce lot, le service
 *     relisait `invoice_readiness.state` — une colonne que RIEN n'écrit à
 *     `'ready'` (seulement `'invoiced'` et `'blocked'`, `invoice-readiness.
 *     service.ts`) : la porte refusait TOUT mois prêt, « Ce mois n'est pas
 *     prêt à facturer », pendant que l'écran affichait « Prêt ». Le contrôleur
 *     résout désormais le mois par le MÊME calcul que l'écran
 *     (`InvoiceReadinessService.list`), et le passe au service.
 */

const USER: CurrentUserPayload = { userId: 'u-1' } as CurrentUserPayload
const MISSION = '11111111-1111-4111-8111-111111111111'

function readyItem(over: Record<string, unknown> = {}) {
  return {
    missionId: MISSION,
    missionLabel: 'Renfort plateforme',
    accountName: 'ACME',
    periodMonth: '2026-08-01',
    state: 'ready',
    blockers: [],
    days: 18,
    dailyRateCents: 65_000,
    preparedAmountCents: 18 * 65_000,
    ...over,
  }
}

function makeController(items: unknown[], opts: { legalEntityId?: string | null; legalEntities?: LegalEntity[] } = {}) {
  const writes = {
    send: jest.fn(async () => ({
      id: 'w-1',
      mission_id: MISSION,
      period_month: '2026-08-01',
      state: 'failed',
      preview: [],
      invoice_reference: null,
      detail: 'x',
      created_at: new Date('2026-08-05T00:00:00.000Z'),
    })),
    latest: jest.fn(),
  } as unknown as InvoiceConnectorWriteService
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: 'ws-1' })),
  } as unknown as WorkspaceContextService
  const toolRegistry = { list: jest.fn(async () => []) } as unknown as ToolRegistryService
  const readiness = {
    list: jest.fn(async () => ({ items, summary: {}, month: '2026-08', canReadFinance: true })),
  } as unknown as InvoiceReadinessService
  // #2426.98 — la société PORTEUSE de la mission, et le registre des sociétés
  // de l'espace : par défaut, aucune (le cas mono-société ordinaire), donc
  // rien à bloquer et les sept tests existants ci-dessous restent inchangés.
  const missions = {
    findOne: jest.fn(async () => ({ legal_entity_id: opts.legalEntityId ?? null }) as MissionEntity),
  } as unknown as Repository<MissionEntity>
  const legalEntities = {
    list: jest.fn(async () => ({ items: opts.legalEntities ?? [] })),
  } as unknown as LegalEntitiesService
  const controller = new InvoiceConnectorWriteController(
    writes,
    workspaceContext,
    toolRegistry,
    readiness,
    missions,
    legalEntities,
  )
  return { controller, writes, readiness, missions, legalEntities }
}

describe('InvoiceConnectorWriteController — la permission (#2565.10)', () => {
  it('déposer un brouillon de facture exige `finance:write`, et lui seul', () => {
    const permission = Reflect.getMetadata(
      REQUIRE_PERMISSION_KEY,
      InvoiceConnectorWriteController.prototype.send,
    ) as unknown
    expect(permission).toEqual(['finance:write'])
  })

  it('lire l’état d’une écriture reste `finance:read`', () => {
    const permission = Reflect.getMetadata(
      REQUIRE_PERMISSION_KEY,
      InvoiceConnectorWriteController.prototype.latest,
    ) as unknown
    expect(permission).toEqual(['finance:read'])
  })
})

describe('InvoiceConnectorWriteController — le mois envoyé est celui que l’écran lit (#2565.10)', () => {
  it('résout le mois par le calcul de l’écran, resserré sur CETTE mission, et le passe au service', async () => {
    const item = readyItem()
    const { controller, writes, readiness } = makeController([item])

    await controller.send(USER, { missionId: MISSION, periodMonth: '2026-08-01' })

    // Le MÊME appel que l'écran de facturation de la fiche mission, droit
    // financier compris : le montant écrit est le montant prévisualisé.
    expect(readiness.list).toHaveBeenCalledWith(
      'ws-1',
      { month: '2026-08', missionId: MISSION, blockedOnly: false },
      { canReadFinance: true },
    )
    expect(writes.send).toHaveBeenCalledWith(expect.objectContaining({ month: item }))
  })

  it('une mission absente du mois arrive au service comme `null` — jamais un mois deviné', async () => {
    const { controller, writes } = makeController([])

    await controller.send(USER, { missionId: MISSION, periodMonth: '2026-08-01' })

    expect(writes.send).toHaveBeenCalledWith(expect.objectContaining({ month: null }))
  })
})

/**
 * #2426.98 — une société ARCHIVÉE ne peut plus porter de facture NEUVE.
 *
 * `billingEntityOf` (`packages/contracts/src/schemas/legal-entity.ts`) était
 * juste et testée depuis le 31/08/2026 sans AUCUN appelant de production — la
 * dette est écrite noir sur blanc dans ce fichier. Cette route est le premier
 * appelant : elle résout la société rattachée à la mission et refuse d'écrire
 * si elle est archivée, AVANT que le connecteur ne soit sollicité.
 */
describe('InvoiceConnectorWriteController — une société archivée bloque une facture neuve (#2426.98)', () => {
  const ARCHIVED_ENTITY: LegalEntity = {
    id: 'le-1',
    workspace_id: 'ws-1',
    name: 'Ancienne Régie SARL',
    registration_number: null,
    country: 'FR',
    vat_number: null,
    address: null,
    currency: null,
    archived: true,
    created_at: '2020-01-01T00:00:00.000Z',
  }

  it('refuse la demande sans jamais appeler le service d’écriture', async () => {
    const { controller, writes } = makeController([readyItem()], {
      legalEntityId: 'le-1',
      legalEntities: [ARCHIVED_ENTITY],
    })

    await expect(controller.send(USER, { missionId: MISSION, periodMonth: '2026-08-01' })).rejects.toThrow(/archivée/i)
    expect(writes.send).not.toHaveBeenCalled()
  })

  it('nomme la société refusée, pas seulement « archivée »', async () => {
    const { controller } = makeController([readyItem()], {
      legalEntityId: 'le-1',
      legalEntities: [ARCHIVED_ENTITY],
    })

    await expect(controller.send(USER, { missionId: MISSION, periodMonth: '2026-08-01' })).rejects.toThrow(
      /Ancienne Régie SARL/,
    )
  })

  it('une société ACTIVE ne bloque rien', async () => {
    const { controller, writes } = makeController([readyItem()], {
      legalEntityId: 'le-1',
      legalEntities: [{ ...ARCHIVED_ENTITY, archived: false }],
    })

    await controller.send(USER, { missionId: MISSION, periodMonth: '2026-08-01' })

    expect(writes.send).toHaveBeenCalled()
  })

  it('aucune société rattachée (cas mono-société ordinaire) ne bloque rien', async () => {
    const { controller, writes } = makeController([readyItem()], {
      legalEntityId: null,
      legalEntities: [ARCHIVED_ENTITY],
    })

    await controller.send(USER, { missionId: MISSION, periodMonth: '2026-08-01' })

    expect(writes.send).toHaveBeenCalled()
  })
})
