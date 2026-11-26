import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import {
  invoiceAttachmentPeriodSchema,
  storageUploadSchema,
  type InvoiceAttachmentsResponse,
  type SignedDownload,
  type StoredFile,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { StorageService } from '../storage/storage.service'
import { InvoiceAttachmentsService } from './invoice-attachments.service'

class UploadInvoiceAttachmentDto extends createZodDto(storageUploadSchema) {}

/**
 * #2814 — LES PIÈCES JOINTES d'une facture PRÉPARÉE, sur la prévisualisation.
 *
 * Une mission, un mois (`AAAA-MM-01`, la forme de la route d'écriture chez le
 * connecteur). Lire une pièce exige `finance:read` — une pièce de facture porte
 * le montant, l'ouvrir c'est le lire ; en déposer ou en retirer une exige
 * `finance:write`, comme toute écriture de facturation.
 *
 * L'ORCHESTRATION (les octets au stockage, puis le lien ; les octets
 * REPARTENT si le lien échoue) vit ICI, dans le contrôleur — la couche où un
 * geste traverse légitimement deux modules (GA-07, §3.2).
 *
 * ⚠️ Doctrine : ranger une pièce n'ÉMET rien et n'ENVOIE rien. La facture reste
 * PRÉPARÉE ; « facturé » ne s'écrit que sur preuve du connecteur, ailleurs.
 */
@Controller('delivery/invoice-attachments')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class InvoiceAttachmentsController {
  constructor(
    private readonly attachments: InvoiceAttachmentsService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly storage: StorageService,
  ) {}

  @Get(':missionId/:periodMonth')
  @RequirePermission('finance:read')
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Param('periodMonth') periodMonth: string,
  ): Promise<InvoiceAttachmentsResponse> {
    const month = parseMonth(periodMonth)
    const workspaceId = await this.workspaceOf(user)
    return { files: await this.attachments.list(workspaceId, missionId, month) }
  }

  @Post(':missionId/:periodMonth')
  @RequirePermission('finance:write')
  async upload(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Param('periodMonth') periodMonth: string,
    @Body() body: UploadInvoiceAttachmentDto,
  ): Promise<StoredFile> {
    const month = parseMonth(periodMonth)
    const workspaceId = await this.workspaceOf(user)
    // La mission est retrouvée DANS l'espace AVANT tout octet transmis.
    await this.attachments.assertMission(workspaceId, missionId)
    // Le stockage applique ses bornes : taille, type (sur l'extension, jamais
    // le type déclaré), signature des premiers octets, quota de l'espace.
    const stored = await this.storage.put({
      workspaceId,
      domain: 'invoice_attachment',
      fileName: body.fileName,
      contentType: body.contentType,
      fileB64: body.fileB64,
      uploadedBy: user.userId,
      today: new Date().toISOString().slice(0, 10),
    })
    try {
      return await this.attachments.link({ workspaceId, missionId, periodMonth: month, userId: user.userId, stored })
    } catch (error) {
      // Les octets repartent, PUIS la vraie erreur remonte.
      await this.storage.remove(workspaceId, stored.id)
      throw error
    }
  }

  /** Une URL signée de cinq minutes, APRÈS avoir retrouvé la pièce dans l'espace. */
  @Get(':missionId/:periodMonth/:attachmentId/download')
  @RequirePermission('finance:read')
  async download(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Param('periodMonth') periodMonth: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ): Promise<SignedDownload> {
    const month = parseMonth(periodMonth)
    const workspaceId = await this.workspaceOf(user)
    const objectId = await this.attachments.objectIdOf(workspaceId, missionId, month, attachmentId)
    return this.storage.signedUrlFor(workspaceId, objectId)
  }

  @Delete(':missionId/:periodMonth/:attachmentId')
  @HttpCode(204)
  @RequirePermission('finance:write')
  async remove(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Param('periodMonth') periodMonth: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ): Promise<void> {
    const month = parseMonth(periodMonth)
    const workspaceId = await this.workspaceOf(user)
    const objectId = await this.attachments.objectIdOf(workspaceId, missionId, month, attachmentId)
    // Les octets PUIS le lien : la ligne porte la référence — effacée d'abord,
    // elle laisserait des octets que plus rien ne retrouve.
    await this.storage.remove(workspaceId, objectId)
    await this.attachments.unlink(workspaceId, attachmentId)
  }

  private async workspaceOf(user: CurrentUserPayload): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return workspaceId
  }
}

function parseMonth(periodMonth: string): string {
  const parsed = invoiceAttachmentPeriodSchema.safeParse(periodMonth)
  if (!parsed.success) throw new BadRequestException('Le mois se dit AAAA-MM-01.')
  return parsed.data
}
