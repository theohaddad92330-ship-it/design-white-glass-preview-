import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import {
  createCustomFieldSchema,
  createSavedViewSchema,
  customFieldEntitySchema,
  decideDuplicateSchema,
  savedViewScopeSchema,
  type CustomFieldDef,
  type AutoMergedPairView,
  type DuplicatePairView,
  type DuplicateScanView,
  type SavedView,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { RequireFeature } from '../plan-features/require-feature.decorator'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { DuplicatesSweeper } from './duplicates.sweeper'
import { GovernanceService } from './governance.service'

class CreateSavedViewDto extends createZodDto(createSavedViewSchema) {}
class CreateCustomFieldDto extends createZodDto(createCustomFieldSchema) {}
class DecideDuplicateDto extends createZodDto(decideDuplicateSchema) {}

const listViewsSchema = z.object({ scope: savedViewScopeSchema }).strict()
class ListViewsDto extends createZodDto(listViewsSchema) {}

const listFieldsSchema = z.object({ entityType: customFieldEntitySchema }).strict()
class ListFieldsDto extends createZodDto(listFieldsSchema) {}

const writeValueSchema = z.object({ entityId: z.string().guid(), value: z.unknown() }).strict()
class WriteValueDto extends createZodDto(writeValueSchema) {}

/** Vues sauvegardées, champs personnalisés, doublons proposés. */
@Controller('governance')
@RequireFeature('crm_native')
@UseGuards(JwtGuard, PlanFeatureGuard, WorkspacePermissionGuard)
export class GovernanceController {
  constructor(
    private readonly governance: GovernanceService,
    private readonly sweeper: DuplicatesSweeper,
  ) {}

  @Get('views')
  async views(@CurrentUser() user: CurrentUserPayload, @Query() query: ListViewsDto): Promise<{ items: SavedView[] }> {
    return { items: await this.governance.listViews(user.userId, query.scope) }
  }

  @Post('views')
  createView(@CurrentUser() user: CurrentUserPayload, @Body() body: CreateSavedViewDto): Promise<SavedView> {
    return this.governance.createView(user.userId, body)
  }

  @Delete('views/:id')
  @HttpCode(204)
  async removeView(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.governance.removeView(user.userId, id)
  }

  /** #3873 — « Rejouer » EST une exécution : elle se date, comme le ferait l'alerte automatique. */
  @Put('views/:id/run')
  @RequirePermission('records:write')
  @HttpCode(204)
  async markViewRun(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.governance.markRun(user.userId, id)
  }

  @Get('fields')
  async fields(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ListFieldsDto,
  ): Promise<{ items: CustomFieldDef[] }> {
    return { items: await this.governance.listFields(user.userId, query.entityType) }
  }

  /** Définir un champ est un réglage d'espace, pas une saisie de fiche. */
  @Post('fields')
  @RequirePermission('team:manage')
  createField(@CurrentUser() user: CurrentUserPayload, @Body() body: CreateCustomFieldDto): Promise<CustomFieldDef> {
    return this.governance.createField(user.userId, body)
  }

  @Delete('fields/:id')
  @RequirePermission('team:manage')
  @HttpCode(204)
  async archiveField(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.governance.archiveField(user.userId, id)
  }

  @Get('fields/values/:entityId')
  values(
    @CurrentUser() user: CurrentUserPayload,
    @Param('entityId', ParseUUIDPipe) entityId: string,
  ): Promise<Record<string, unknown>> {
    return this.governance.readValues(user.userId, entityId)
  }

  /** Remplir un champ est une saisie de fiche : `records:write`. */
  @Put('fields/:id/value')
  @RequirePermission('records:write')
  @HttpCode(204)
  async writeValue(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: WriteValueDto,
  ): Promise<void> {
    await this.governance.writeValue(user.userId, id, body.entityId, body.value)
  }

  @Get('duplicates')
  async duplicates(
    @CurrentUser() user: CurrentUserPayload,
    @Query('fresh') fresh?: string,
  ): Promise<{ items: DuplicatePairView[]; scan: DuplicateScanView | null }> {
    // #3490 — la liste dit AUSSI ce que le balayage a regardé : « aucun doublon »
    // ne se lit plus de la même façon selon qu'on a examiné 25 comptes ou aucun.
    const scan = await this.sweeper.refreshWorkspace(await this.governance.activeWorkspaceId(user.userId), {
      force: fresh === '1',
    })
    return { items: await this.governance.listDuplicates(user.userId), scan }
  }

  /**
   * #4016 L6 — les fusions AUTOMATIQUES en vigueur (≥ 0,99, dans Bellum
   * seulement) : ce que le balayeur a fait seul se LIT, avec de quoi l'annuler.
   */
  @Get('duplicates/auto-merged')
  @WorkspaceRead()
  async autoMerged(@CurrentUser() user: CurrentUserPayload): Promise<{ items: AutoMergedPairView[] }> {
    return { items: await this.governance.listAutoMerged(user.userId) }
  }

  /**
   * #4016 L6 — ANNULER une fusion automatique : la fiche revient, la paire
   * devient « ce ne sont pas les mêmes » et ne revient plus. Geste d'écriture,
   * même porte que la décision voisine.
   */
  @Post('duplicates/:id/undo-merge')
  @RequirePermission('records:write')
  async undoMerge(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ restored: boolean }> {
    return this.governance.undoAutoMerge(user.userId, id)
  }

  /**
   * Enregistre une décision HUMAINE. `merged` veut dire « quelqu'un a fusionné
   * à la main dans son CRM » — Bellum n'écrit rien dans le CRM.
   */
  @Post('duplicates/:id/decide')
  @RequirePermission('records:write')
  @HttpCode(204)
  async decide(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: DecideDuplicateDto,
  ): Promise<void> {
    await this.governance.decideDuplicate(user.userId, id, body)
  }
}
