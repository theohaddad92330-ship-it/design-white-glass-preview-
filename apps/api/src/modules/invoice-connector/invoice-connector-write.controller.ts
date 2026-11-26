import { Body, ConflictException, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { createZodDto } from 'nestjs-zod'
import {
  billingEntityOf,
  connectedClientTools,
  sendInvoiceConnectorWriteSchema,
  type InvoiceConnectorWriteRequestView,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { MissionEntity } from '../../database/entities/mission.entity'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { ToolRegistryService } from '../tool-registry/tool-registry.service'
import { InvoiceReadinessService } from '../delivery/invoice-readiness.service'
import { LegalEntitiesService } from '../legal-entities/legal-entities.service'
import type { InvoiceConnectorWriteRequestEntity } from '../../database/entities/invoice-connector-write-request.entity'
import { InvoiceConnectorWriteService } from './invoice-connector-write.service'

class SendInvoiceConnectorWriteDto extends createZodDto(sendInvoiceConnectorWriteSchema) {}

/**
 * #2565 — l'écran ne voit jamais l'entité brute (elle porte `provider`, un
 * identifiant technique, et la charge utile complète). Jamais un recalcul :
 * la prévisualisation qui voyage est celle qui a été FIGÉE à la création.
 */
function toView(row: InvoiceConnectorWriteRequestEntity): InvoiceConnectorWriteRequestView {
  return {
    id: row.id,
    missionId: row.mission_id,
    periodMonth: row.period_month,
    state: row.state,
    preview: row.preview,
    invoiceReference: row.invoice_reference,
    detail: row.detail,
    // #2418.2 — l'état du DOCUMENT chez le client ne voyage QU'AVEC sa preuve :
    // les trois colonnes ensemble ou rien. Une seule manquante et l'écran lit
    // `null`, c'est-à-dire « on ne sait pas » — jamais « rejetée ».
    documentStatus:
      row.document_state && row.document_state_reference && row.document_state_at
        ? {
            state: row.document_state,
            reference: row.document_state_reference,
            observedAt: row.document_state_at.toISOString(),
          }
        : null,
    createdAt: row.created_at.toISOString(),
  }
}

/**
 * #2565 — CRÉER la facture PRÉPARÉE dans l'outil de gestion branché par le
 * client. L'ORCHESTRATION inter-domaines (l'outil connecté vient du registre
 * des outils, la vérification du mois vient de la facturabilité) vit ICI,
 * dans le contrôleur — la couche où un geste utilisateur traverse
 * légitimement plusieurs domaines (§3.2, GA-07). `InvoiceConnectorWriteService`
 * ne connaît, lui, ni le registre d'outils ni un nom d'éditeur : il reçoit un
 * `provider` déjà résolu, ou `null`.
 *
 * #2565.10 — et il reçoit aussi le MOIS tel que l'écran le lit
 * (`InvoiceReadinessService.list`, le calcul qui affiche « Prêt » sur la
 * fiche mission). Il relisait avant `invoice_readiness.state`, une colonne
 * que rien n'écrit jamais à `'ready'` : la porte refusait tout mois prêt.
 */
@Controller('delivery/invoice-connector')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class InvoiceConnectorWriteController {
  constructor(
    private readonly writes: InvoiceConnectorWriteService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly readiness: InvoiceReadinessService,
    // #2426.98 — lue directement ici (comme `StaffingService` le fait déjà
    // pour `MissionEntity`) : ce n'est pas un service de `DeliveryModule`, et
    // le module n'en importe donc toujours aucun (voir le module, en tête).
    @InjectRepository(MissionEntity)
    private readonly missions: Repository<MissionEntity>,
    private readonly legalEntities: LegalEntitiesService,
  ) {}

  /**
   * #2565.10 — le mois de CETTE mission, par le MÊME calcul que l'écran
   * (jours, TJM, montant préparé, compte, bloqueurs). `canReadFinance: true`
   * n'ouvre rien à l'appelant : la route exige déjà `finance:write`, et le
   * montant sert à ÉCRIRE ce qui a été prévisualisé, pas à le renvoyer.
   * `null` = la mission n'apparaît pas sur ce mois (brouillon, hors période) —
   * le service le refuse comme un mois non prêt, jamais deviné.
   */
  private async assessedMonth(workspaceId: string, missionId: string, periodMonth: string) {
    const { items } = await this.readiness.list(
      workspaceId,
      { month: periodMonth.slice(0, 7), missionId, blockedOnly: false },
      { canReadFinance: true },
    )
    return items.find(item => item.missionId === missionId) ?? null
  }

  /**
   * L'outil de gestion BRANCHÉ par l'espace, s'il y en a un. `admin_docs` est
   * la famille du registre (Yousign, DocuSign, Qonto, Tiime) ; Odoo — le cas
   * cité par le client — y est catalogué comme CRM (`tool-catalog.ts`), donc
   * accepté ICI EN PLUS par son identifiant, sans lui inventer une famille
   * qu'il n'a pas dans le registre. Jamais un nom : seulement l'identifiant
   * technique, que le service range dans la ligne, jamais dans une vue.
   */
  private async connectedInvoicingProvider(userId: string): Promise<string | null> {
    const tools = await this.toolRegistry.list(userId)
    const connected = connectedClientTools(tools)
    const target = connected.find(tool => tool.family === 'admin_docs' || tool.provider === 'odoo')
    return target?.provider ?? null
  }

  /**
   * #2426.98 — la société PORTEUSE de la mission ne peut plus être ARCHIVÉE
   * au moment d'un dépôt NEUF. Une société archivée a pu facturer par le
   * passé (l'historique reste lisible, D9) ; PRÉPARER une facture neuve sous
   * une société qui n'existe plus commercialement produirait un document qui
   * ment sur qui facture.
   *
   * `billingEntityOf` (`packages/contracts/src/schemas/legal-entity.ts`)
   * portait cette règle depuis le 31/08/2026 sans AUCUN appelant de
   * production — la dette est écrite dans son fichier. Cette route est le
   * premier appelant.
   *
   * Ne lève RIEN quand la mission ne porte aucune société (le cas
   * mono-société ordinaire) : `billingEntityOf` rend alors `null`.
   */
  private async assertLegalEntityCanInvoice(workspaceId: string, missionId: string): Promise<void> {
    const mission = await this.missions.findOne({ where: { id: missionId, workspace_id: workspaceId } })
    const { items: entities } = await this.legalEntities.list(workspaceId)
    const billingEntity = billingEntityOf({ legal_entity_id: mission?.legal_entity_id ?? null }, entities)
    if (billingEntity?.archived) {
      throw new ConflictException(
        `La société "${billingEntity.name}" est archivée : elle ne peut plus porter de facture nouvelle. ` +
          'Rattache la mission à une société active dans Réglages › Sociétés.',
      )
    }
  }

  @Post('send')
  // #2565.10 — déposer une facture chez le client, même en BROUILLON, est un
  // acte FINANCIER : `finance:write` seul, comme encaisser, annuler ou ouvrir
  // un litige (`invoice-readiness.controller.ts`). `records:write` n'y suffit plus.
  @RequirePermission('finance:write')
  async send(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: SendInvoiceConnectorWriteDto,
  ): Promise<InvoiceConnectorWriteRequestView> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.assertLegalEntityCanInvoice(workspaceId, body.missionId)
    const provider = await this.connectedInvoicingProvider(user.userId)
    const month = await this.assessedMonth(workspaceId, body.missionId, body.periodMonth)
    const row = await this.writes.send({
      workspaceId,
      userId: user.userId,
      missionId: body.missionId,
      periodMonth: body.periodMonth,
      provider,
      month,
    })
    return toView(row)
  }

  @Get(':missionId/:periodMonth')
  @RequirePermission('finance:read')
  async latest(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId') missionId: string,
    @Param('periodMonth') periodMonth: string,
  ): Promise<InvoiceConnectorWriteRequestView | null> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const row = await this.writes.latest(workspaceId, missionId, periodMonth)
    return row ? toView(row) : null
  }
}
