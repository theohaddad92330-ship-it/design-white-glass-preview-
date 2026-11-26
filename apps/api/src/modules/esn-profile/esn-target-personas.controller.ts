import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common'
import type { EsnTargetPersonasImportReport, EsnTargetPersonasResponse } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { ImportEsnTargetPersonasDto } from './dto/import-esn-target-personas.dto'
import { EsnTargetPersonasService } from './esn-target-personas.service'

/**
 * #3754 — les postes cibles de l'ESN et leur niveau décideur. Un contrôleur
 * à part de `EsnProfileController` (construit positionnellement par son spec).
 */
@Controller('esn-profile/target-personas')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class EsnTargetPersonasController {
  constructor(private readonly targetPersonas: EsnTargetPersonasService) {}

  // Lecture du profil de sa propre société : ouverte à tous les rôles, comme `GET /esn-profile`.
  @Get()
  @WorkspaceRead()
  async list(@CurrentUser() user: CurrentUserPayload): Promise<EsnTargetPersonasResponse> {
    return { personas: await this.targetPersonas.list(user.userId) }
  }

  /** Remplace l'ensemble des postes cibles de l'espace : réservé à qui gère l'entreprise. */
  @Post('import')
  @HttpCode(200)
  @RequirePermission('team:manage')
  async importFile(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: ImportEsnTargetPersonasDto,
  ): Promise<EsnTargetPersonasImportReport> {
    return this.targetPersonas.importFile(user.userId, body.format, body.content, body.sheet)
  }
}
