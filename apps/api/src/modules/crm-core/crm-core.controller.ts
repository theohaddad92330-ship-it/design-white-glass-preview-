import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Optional,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import type {
  ConflictedField,
  Note,
  NoteScopeAccount,
  RecordFieldAudit,
  RecordImportMark,
  RecordPatchResult,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { RequireFeature } from '../plan-features/require-feature.decorator'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import {
  AccountCorePatchDto,
  ContactCorePatchDto,
  CreateContactDto,
  CreateNoteDto,
  ListNotesQueryDto,
  UpdateNoteDto,
} from './dto/crm-core.dto'
import { NotesService } from './notes.service'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { resolveBusinessUnitScope } from '../business-unit/resolve-business-unit-scope'
import { FieldConflictService } from './field-conflict.service'
import { ProvenanceService } from './provenance.service'
import { RecordEditService } from './record-edit.service'

/**
 * Édition de la fiche COMPTE.
 *
 * Un contrôleur à part plutôt qu'une méthode de plus dans `AccountsController` :
 * le module `crm-core` doit pouvoir être retiré sans emporter l'analyse
 * (règle #7). Nest accepte plusieurs contrôleurs sur le même préfixe tant que
 * les chemins ne se recouvrent pas — `PATCH /accounts/:id` n'existait pas.
 */
@Controller('accounts')
@RequireFeature('crm_native')
@UseGuards(JwtGuard, PlanFeatureGuard, WorkspacePermissionGuard)
export class AccountRecordController {
  constructor(
    private readonly records: RecordEditService,
    private readonly provenance: ProvenanceService,
    /** Les contradictions ouvertes de la fiche (PDF 6 §5.3). */
    private readonly conflictsService: FieldConflictService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /** Corriger l'identité et les coordonnées d'un compte. */
  @Patch(':id')
  @RequirePermission('records:write')
  patch(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AccountCorePatchDto,
  ): Promise<RecordPatchResult> {
    return this.records.patchAccount(user.userId, id, body)
  }

  /** « Qui a changé ça ? » — le journal d'écriture de la fiche. */
  @Get(':id/history')
  async history(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ items: RecordFieldAudit[]; importedFrom: RecordImportMark | null }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // #4051 — « Importé le <date> depuis <source> » : la trace d'import la plus récente, `null` si jamais importée.
    const [items, importedFrom] = await Promise.all([
      this.provenance.history(workspaceId, 'account', id),
      this.provenance.latestImportMark(workspaceId, 'account', id),
    ])
    return { items, importedFrom }
  }

  /**
   * « JE NE TRANCHE PAS » — les contradictions ouvertes de la fiche (PDF 6 §5.3).
   *
   * Deux sources automatiques de MÊME autorité qui ne disent pas la même chose.
   * Jusqu'ici la dernière écrasait la précédente en silence : la valeur écartée
   * était bien archivée dans `record_field_audit`, mais racontée nulle part.
   *
   * ⚠️ Une LECTURE, et c'est délibéré : le produit ne tranche pas à la place de
   * l'utilisateur. « C'est laquelle ? » est une correction humaine ordinaire —
   * elle passe par `PATCH :id`, prend la provenance `human`, et l'arbitre
   * existant la fait gagner sur tout le reste, quelle que soit sa date.
   */
  @Get(':id/conflicts')
  @WorkspaceRead()
  async conflicts(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    /** #190.2 — `?include=settled` : rend AUSSI les contradictions tranchées toutes seules. */
    @Query('include') include?: string,
  ): Promise<{ items: ConflictedField[] }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return {
      items: await this.conflictsService.openConflicts(workspaceId, 'account', id, {
        includeSettled: include === 'settled',
      }),
    }
  }
}

/** Édition, création et suppression réversible d'un CONTACT. */
@Controller('contacts')
@RequireFeature('crm_native')
@UseGuards(JwtGuard, PlanFeatureGuard, WorkspacePermissionGuard)
export class ContactRecordController {
  constructor(
    private readonly records: RecordEditService,
    private readonly provenance: ProvenanceService,
    /** Les contradictions ouvertes de la fiche (PDF 6 §5.3). */
    private readonly conflictsService: FieldConflictService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /** Créer un contact à la main — le geste du commercial qui revient de salon. */
  @Post()
  @RequirePermission('records:write')
  create(@CurrentUser() user: CurrentUserPayload, @Body() body: CreateContactDto) {
    return this.records.createContact(user.userId, body)
  }

  @Patch(':id')
  @RequirePermission('records:write')
  patch(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ContactCorePatchDto,
  ): Promise<RecordPatchResult> {
    return this.records.patchContact(user.userId, id, body)
  }

  /** Suppression réversible. Le contact sort des listes, sa ligne reste. */
  @Delete(':id')
  @RequirePermission('records:write')
  remove(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.records.softDeleteContact(user.userId, id)
  }

  /** Le rattrapage de la suppression — sans lui, « réversible » n'est qu'un mot. */
  @Post(':id/restore')
  @RequirePermission('records:write')
  @HttpCode(204)
  async restore(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.records.restoreContact(user.userId, id)
  }

  @Get(':id/history')
  async history(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ items: RecordFieldAudit[]; importedFrom: RecordImportMark | null }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // #4051 — « Importé le <date> depuis <source> » : la trace d'import la plus récente, `null` si jamais importée.
    const [items, importedFrom] = await Promise.all([
      this.provenance.history(workspaceId, 'contact', id),
      this.provenance.latestImportMark(workspaceId, 'contact', id),
    ])
    return { items, importedFrom }
  }

  /**
   * « JE NE TRANCHE PAS » — les contradictions ouvertes de la fiche (PDF 6 §5.3).
   *
   * Deux sources automatiques de MÊME autorité qui ne disent pas la même chose.
   * Jusqu'ici la dernière écrasait la précédente en silence : la valeur écartée
   * était bien archivée dans `record_field_audit`, mais racontée nulle part.
   *
   * ⚠️ Une LECTURE, et c'est délibéré : le produit ne tranche pas à la place de
   * l'utilisateur. « C'est laquelle ? » est une correction humaine ordinaire —
   * elle passe par `PATCH :id`, prend la provenance `human`, et l'arbitre
   * existant la fait gagner sur tout le reste, quelle que soit sa date.
   */
  @Get(':id/conflicts')
  @WorkspaceRead()
  async conflicts(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    /** #190.2 — `?include=settled` : rend AUSSI les contradictions tranchées toutes seules. */
    @Query('include') include?: string,
  ): Promise<{ items: ConflictedField[] }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return {
      items: await this.conflictsService.openConflicts(workspaceId, 'contact', id, {
        includeSettled: include === 'settled',
      }),
    }
  }
}

/** Les notes, sur n'importe quel objet du CRM/ATS. */
@Controller('notes')
@RequireFeature('crm_native')
@UseGuards(JwtGuard, PlanFeatureGuard, WorkspacePermissionGuard)
export class NotesController {
  constructor(
    private readonly notes: NotesService,
    private readonly workspaceContext: WorkspaceContextService,
    // Optionnel pour le CONSTRUCTEUR (specs positionnelles), jamais pour la RÈGLE : absent, la
    // résolution LÈVE (fail-closed, `resolveBusinessUnitScope`).
    @Optional() private readonly businessUnits?: BusinessUnitService,
  ) {}

  @Get()
  async list(@CurrentUser() user: CurrentUserPayload, @Query() query: ListNotesQueryDto): Promise<{ items: Note[] }> {
    // #4158.62 — les droits suivent l'ENTITÉ : un compte hors du périmètre BU du lecteur ne livre pas ses notes.
    const scope = query.entityType === 'account' ? await this.buScope(user.userId) : null
    return { items: await this.notes.list(user.userId, query.entityType, query.entityId, scope) }
  }

  /** #3895 — les autres entités du groupe d'un compte : où une note peut aussi valoir. */
  @Get('group-entities/:accountId')
  @RequirePermission('records:write') // alimente le composeur : qui ne peut pas écrire n'a rien à rattacher
  async groupEntities(
    @CurrentUser() user: CurrentUserPayload,
    @Param('accountId', ParseUUIDPipe) accountId: string,
  ): Promise<{ items: NoteScopeAccount[] }> {
    // #4158.62 — périmètre BU résolu au bord, comme `AccountsController` : une entité hors du
    // périmètre du lecteur n'apparaît pas dans le composeur de notes.
    const scope = await this.buScope(user.userId)
    return { items: await this.notes.groupEntities(user.userId, accountId, scope) }
  }

  /** Périmètre BU de l'appelant, résolu au bord et fail-closed (voir `resolveBusinessUnitScope`). */
  private async buScope(userId: string) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return resolveBusinessUnitScope(this.businessUnits, workspaceId, userId)
  }

  @Post()
  @RequirePermission('records:write')
  async create(@CurrentUser() user: CurrentUserPayload, @Body() body: CreateNoteDto): Promise<Note> {
    // #4158.58 — écrire une note sur un compte suit le périmètre BU du rédacteur, comme la lecture (#4158.62).
    const scope = body.entityType === 'account' ? await this.buScope(user.userId) : null
    return this.notes.create(user.userId, body, { scope })
  }

  @Patch(':id')
  @RequirePermission('records:write')
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateNoteDto,
  ): Promise<Note> {
    return this.notes.update(user.userId, id, body)
  }

  @Delete(':id')
  @RequirePermission('records:write')
  @HttpCode(204)
  async remove(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.notes.remove(user.userId, id)
  }
}
