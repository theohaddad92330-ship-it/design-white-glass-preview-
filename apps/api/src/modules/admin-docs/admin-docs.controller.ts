import {
  adminDocsProviderSchema,
  type AdminDocsProvider,
  type AdminDocsStatus,
  type PendingSignature,
  type ProposalSignatureStatus,
  type UnpaidInvoice,
} from '@bellum/contracts'
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { AdminDocsService } from './admin-docs.service'
import { AdminDocsConnectDto, AdminDocsSendDto } from './dto/admin-docs.dto'

/** Signature électronique et facturation : ce qui attend, ce qui n'a pas été payé. */
@Controller('admin-docs')
@UseGuards(JwtGuard)
export class AdminDocsController {
  constructor(private readonly adminDocs: AdminDocsService) {}

  @Get('status')
  status(@CurrentUser() user: CurrentUserPayload): Promise<AdminDocsStatus> {
    return this.adminDocs.status(user.userId)
  }

  @Post('connect')
  @HttpCode(200)
  @UseGuards(WorkspacePermissionGuard)
  @RequirePermission('integrations:manage')
  connect(@CurrentUser() user: CurrentUserPayload, @Body() dto: AdminDocsConnectDto): Promise<AdminDocsStatus> {
    return this.adminDocs.connect(user.userId, dto)
  }

  @Delete(':provider')
  @HttpCode(204)
  @UseGuards(WorkspacePermissionGuard)
  @RequirePermission('integrations:manage')
  async disconnect(@CurrentUser() user: CurrentUserPayload, @Param('provider') provider: string): Promise<void> {
    await this.adminDocs.disconnect(user.userId, adminDocsProviderSchema.parse(provider))
  }

  /** Les signatures en attente. `unavailable` dit quel outil n'a pas répondu —
   *  « rien à signaler » et « je n'ai pas pu regarder » ne se confondent pas.
   *
   *  ⚠️ `unavailable` est typé `AdminDocsProvider[]` et non `string[]` : le
   *  client TRADUIT ces valeurs pour nommer l'outil muet à l'écran, et une
   *  chaîne libre l'aurait laissé afficher une clé technique. */
  @Get('signatures')
  signatures(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ items: PendingSignature[]; unavailable: AdminDocsProvider[] }> {
    return this.adminDocs.pendingSignatures(user.userId)
  }

  /** #4295.27 — le statut de LA demande de signature d'une proposition (jamais la liste de tout le compte outil). */
  @Get('signatures/proposal/:projectId')
  @WorkspaceRead()
  proposalSignature(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<ProposalSignatureStatus> {
    return this.adminDocs.proposalSignatureStatus(user.userId, projectId)
  }

  @Get('invoices')
  invoices(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ items: UnpaidInvoice[]; unavailable: AdminDocsProvider[] }> {
    return this.adminDocs.unpaidInvoices(user.userId)
  }

  /** Envoie à signature une demande déjà préparée et relue chez le fournisseur. */
  @Post('signatures/send')
  @HttpCode(200)
  @UseGuards(WorkspacePermissionGuard)
  @RequirePermission('data:export')
  send(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: AdminDocsSendDto,
  ): Promise<{ ok: boolean; detail: string }> {
    return this.adminDocs.sendToSignature(user.userId, dto.signatureRequestId, dto.projectId)
  }
}
