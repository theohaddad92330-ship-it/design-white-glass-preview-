import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { OwnershipTransferDto, OwnershipTransferQueryDto } from './dto/ownership-transfer.dto'
import {
  WorkspaceOwnershipTransferService,
  type OwnershipTransferPreview,
  type OwnershipTransferResult,
} from './workspace-ownership-transfer.service'

/**
 * #4158.33 — transfert de propriété d'un espace, back-office seulement.
 * Même modèle de confiance que le reste de `internal/admin` : inter-espaces par
 * conception, gardé par le seul secret interne que le dashboard-manager attache
 * côté serveur. Le geste est journalisé (audit) par la route du dashboard-manager.
 */
@Controller('internal/admin')
@UseGuards(InternalSecretGuard)
export class WorkspaceOwnershipTransferController {
  constructor(private readonly transfers: WorkspaceOwnershipTransferService) {}

  /** Récapitulatif avant validation : une LECTURE, elle n'écrit RIEN (comme « Créer un client »). */
  @Get('workspaces/:id/ownership-transfer/preview')
  preview(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: OwnershipTransferQueryDto,
  ): Promise<OwnershipTransferPreview> {
    return this.transfers.preview(id, dto.newOwnerUserId)
  }

  @Post('workspaces/:id/ownership-transfer')
  transfer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OwnershipTransferDto,
  ): Promise<OwnershipTransferResult> {
    return this.transfers.transfer(id, dto.newOwnerUserId)
  }
}
