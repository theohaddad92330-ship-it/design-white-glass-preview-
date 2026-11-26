import { ConflictException, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { CreateMissionRequest } from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import { MissionEntity } from '../../database/entities/mission.entity'
import { DEMO_ODOO_SALES } from '../demo/demo-dataset'
import type { OdooSaleOrder } from '../odoo/odoo.client'
import { odooClientForConnection } from '../odoo/odoo-connection'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'
import {
  classifyOdooSales,
  previewFingerprint,
  type OdooReprisePreviewItem,
  type OdooSaleRow,
} from './odoo-sales-reprise'

/** Au-delà, la section deviendrait un export : les 100 ventes confirmées les plus récentes. */
const SALES_LIMIT = 100

/** Ce que l'outil a répondu — jamais une liste vide à la place d'un échec. */
type OdooSalesUnavailable =
  | { status: 'not_connected' }
  /** Délai dépassé : on ne SAIT pas (doctrine « un timeout n'est pas un échec »). */
  | { status: 'unknown'; message: string }
  | { status: 'error'; message: string }

type OdooSalesResponse = OdooSalesUnavailable | { status: 'ok'; demo: boolean; sales: OdooSaleRow[] }

type MissionCreator = (input: CreateMissionRequest, origin: { odooSaleOrderId: number }) => Promise<{ id: string }>

type OdooRepriseSkipReason = 'already_mission' | 'not_found' | 'ambiguous'

type OdooReprisePreview =
  | OdooSalesUnavailable
  | {
      status: 'ok'
      fingerprint: string
      items: OdooReprisePreviewItem[]
      skipped: { saleId: number; reference: string | null; reason: OdooRepriseSkipReason }[]
    }

type OdooRepriseResult =
  | OdooSalesUnavailable
  | {
      status: 'ok'
      created: { saleId: number; missionId: string }[]
      failed: { saleId: number; reason: 'already_mission' | 'refused' }[]
    }

/**
 * #2561/#2562 — « voir les ventes dans Bellum : pour Odoo ça représente les
 * missions/contrats ; proposer de synchroniser ces missions depuis l'outil »
 * (François Thomas, call bêta du 17/09/2026, redit avant la démo du 08/10).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PROTOCOLE
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. `list` — LIT les ventes confirmées de l'instance branchée (lecture
 *     seule, `OdooClient.listConfirmedSaleOrders`), et dit pour chacune :
 *     « déjà une mission » (lien posé, ou rapprochement compte + référence /
 *     libellé / dates) ou ce qui serait créé.
 *  2. `preview` — la PRÉVISUALISATION FIGÉE (porte d'écriture de la doctrine) :
 *     exactement les missions qui seront créées, et une empreinte.
 *  3. `importSales` — RELIT l'outil, recalcule la prévisualisation et REFUSE
 *     (409) si l'empreinte a changé : on ne crée jamais autre chose que ce que
 *     la personne a validé. Puis crée par le geste ORDINAIRE
 *     (`DeliveryService.create`, la vente en origine) : idempotent — une vente
 *     reprise sort de la prévisualisation suivante, et l'index unique partiel
 *     `(workspace_id, odoo_sale_order_id)` tranche une course.
 *
 * JAMAIS d'écriture dans Odoo ici. Erreur de l'outil → son message, jamais une
 * donnée inventée ; délai dépassé → `unknown`.
 *
 * GA-07 — l'espace et le mode démo se résolvent dans le CONTRÔLEUR ; ce
 * service ne reçoit qu'un `workspaceId` déjà tranché.
 */
@Injectable()
export class MissionOdooSalesService {
  private readonly logger = new Logger(MissionOdooSalesService.name)

  constructor(
    @InjectRepository(CrmConnectionEntity) private readonly connections: Repository<CrmConnectionEntity>,
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(MissionEntity) private readonly missions: Repository<MissionEntity>,
  ) {}

  async list(workspaceId: string, isDemo: boolean): Promise<OdooSalesResponse> {
    const read = await this.readSales(workspaceId, isDemo)
    if (read.status !== 'ok') return read
    return { status: 'ok', demo: isDemo, sales: await this.classify(workspaceId, read.sales) }
  }

  async preview(workspaceId: string, isDemo: boolean, saleIds: readonly number[]): Promise<OdooReprisePreview> {
    const listed = await this.list(workspaceId, isDemo)
    if (listed.status !== 'ok') return listed
    const wanted = new Set(saleIds)
    const byId = new Map(listed.sales.map(row => [row.saleId, row]))

    const items: OdooReprisePreviewItem[] = []
    const skipped: { saleId: number; reference: string | null; reason: OdooRepriseSkipReason }[] = []
    for (const saleId of wanted) {
      const row = byId.get(saleId)
      if (!row) {
        skipped.push({ saleId, reference: null, reason: 'not_found' })
      } else if (row.mission) {
        skipped.push({ saleId, reference: row.reference, reason: 'already_mission' })
      } else if (!row.account || !row.draft) {
        skipped.push({ saleId, reference: row.reference, reason: row.accountIssue ?? 'not_found' })
      } else {
        items.push({
          saleId,
          reference: row.reference,
          accountId: row.account.id,
          accountName: row.account.name,
          label: row.draft.label,
          startedOn: row.draft.startedOn,
          dailyRate: row.draft.dailyRate,
        })
      }
    }
    return { status: 'ok', fingerprint: previewFingerprint(items), items, skipped }
  }

  /**
   * `createMission` est le geste ORDINAIRE de création, passé par le
   * CONTRÔLEUR (`this.delivery.create`) : une mission ne naît que d'une route
   * HTTP, jamais d'un service (garde `mission-creation-is-a-human-gesture`).
   */
  async importSales(
    workspaceId: string,
    isDemo: boolean,
    saleIds: readonly number[],
    fingerprint: string,
    createMission: MissionCreator,
  ): Promise<OdooRepriseResult> {
    const preview = await this.preview(workspaceId, isDemo, saleIds)
    if (preview.status !== 'ok') return preview
    if (preview.fingerprint !== fingerprint) {
      throw new ConflictException(
        'Ces ventes ont changé dans l’outil depuis la prévisualisation — relis-les avant de les reprendre.',
      )
    }

    const created: { saleId: number; missionId: string }[] = []
    const failed: { saleId: number; reason: 'already_mission' | 'refused' }[] = []
    for (const item of preview.items) {
      try {
        const mission = await createMission(
          {
            accountId: item.accountId,
            label: item.label,
            ...(item.startedOn ? { startedOn: item.startedOn } : {}),
            ...(item.dailyRate ? { dailyRate: item.dailyRate } : {}),
          },
          { odooSaleOrderId: item.saleId },
        )
        created.push({ saleId: item.saleId, missionId: mission.id })
      } catch (error) {
        // L'index unique partiel a tranché une course : la vente EST reprise.
        if ((error as { code?: string })?.code === '23505') {
          failed.push({ saleId: item.saleId, reason: 'already_mission' })
          continue
        }
        this.logger.error('Odoo sale reprise failed', { error, tags: { saleId: item.saleId } })
        failed.push({ saleId: item.saleId, reason: 'refused' })
      }
    }
    return { status: 'ok', created, failed }
  }

  private async classify(workspaceId: string, sales: OdooSaleOrder[]): Promise<OdooSaleRow[]> {
    const [accounts, missions] = await Promise.all([
      this.accounts.find({ where: { workspace_id: workspaceId }, select: ['id', 'company_name', 'status'] }),
      this.missions.find({
        where: { workspace_id: workspaceId },
        select: ['id', 'label', 'account_id', 'started_on', 'daily_rate', 'odoo_sale_order_id'],
      }),
    ])
    // Un compte SUPPRIMÉ ne reçoit pas de mission reprise.
    const live = accounts.filter(account => account.status !== 'deleted')
    return classifyOdooSales(sales, live, missions)
  }

  private async readSales(
    workspaceId: string,
    isDemo: boolean,
  ): Promise<OdooSalesUnavailable | { status: 'ok'; sales: OdooSaleOrder[] }> {
    // La salle de démonstration n'a aucune instance branchée : elle sert ses
    // ventes FICTIVES (`DEMO_ODOO_SALES`), et seulement elle.
    if (isDemo) return { status: 'ok', sales: demoOdooSaleOrders(new Date()) }

    const row = await this.connections.findOne({ where: { ...workspaceScopeWhere(workspaceId), provider: 'odoo' } })
    if (!row) return { status: 'not_connected' }
    const linked = odooClientForConnection(row)
    if (!linked) return { status: 'error', message: 'Le lien enregistré est incomplet — rebranche l’instance.' }

    let sales: OdooSaleOrder[]
    try {
      sales = await linked.client.listConfirmedSaleOrders(linked.uid, SALES_LIMIT)
    } catch (error) {
      const name = (error as { name?: string })?.name
      const status = (error as { status?: number | null })?.status
      if (name === 'TimeoutError' || name === 'AbortError' || status === 504) {
        return { status: 'unknown', message: 'L’outil n’a pas répondu à temps — réessaie dans un instant.' }
      }
      this.logger.warn('Odoo sales read failed', { tags: { provider: 'odoo' } })
      return { status: 'error', message: error instanceof Error ? error.message : 'Erreur inconnue.' }
    }

    // Dernier usage RÉEL du lien, posé APRÈS une lecture réussie (même règle
    // que l'export de contact, `OdooService.exportContact`).
    await this.connections.update(row.id, { last_used_at: new Date() })
    return { status: 'ok', sales }
  }
}

/** Les ventes de la salle, dates calculées UNE fois à la lecture (relatives). */
function demoOdooSaleOrders(now: Date): OdooSaleOrder[] {
  const day = (offset: number): string => new Date(now.getTime() + offset * 86_400_000).toISOString().slice(0, 10)
  return DEMO_ODOO_SALES.map(sale => {
    const lines = sale.lines.map(line => ({
      label: line.label,
      quantity: line.quantity,
      unitPrice: line.unit_price,
      subtotal: line.quantity * line.unit_price,
    }))
    return {
      id: sale.id,
      reference: sale.reference,
      partnerName: sale.client,
      clientRef: sale.client_ref,
      orderDate: day(-sale.ordered_days_ago),
      commitmentDate: day(sale.starts_in_days),
      state: 'sale',
      invoiceStatus: sale.invoice_status,
      amountUntaxed: lines.reduce((sum, line) => sum + line.subtotal, 0),
      currency: 'EUR',
      lines,
    }
  })
}
