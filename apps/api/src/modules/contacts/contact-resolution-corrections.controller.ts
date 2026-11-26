import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Optional,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common'
import { unwrap } from '@bellum/utils'
import { contactResolutionCorrectionRequestSchema, type ContactResolutionCorrection } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { resolveBusinessUnitScope } from '../business-unit/resolve-business-unit-scope'
import { ContactsService } from './contacts.service'
import { ContactResolutionCorrectionsService } from './contact-resolution-corrections.service'

/**
 * #2159.35 — « CE N'EST PAS LA MÊME PERSONNE ».
 *
 * La réponse de l'humain à un rapprochement d'import : une fiche déjà en base
 * matchée par e-mail sur une ligne du fichier, alors que l'e-mail est un
 * standard partagé (accueil, secrétariat) qui désigne quelqu'un d'autre.
 * `POST` et non `PUT` : chaque geste est une VERSION de plus, jamais le
 * remplacement de la précédente (on archive, on ne supprime pas). Même
 * patron que `EntityResolutionCorrectionsController` (comptes, #2284.65).
 *
 * Contrôleur SÉPARÉ de `ContactsController` (même préfixe, routes disjointes).
 */
@Controller('contacts')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class ContactResolutionCorrectionsController {
  constructor(
    private readonly corrections: ContactResolutionCorrectionsService,
    private readonly contactsService: ContactsService,
    private readonly workspaceContext: WorkspaceContextService,
    /** ⚠️ Optionnel pour le CONSTRUCTEUR, jamais pour la RÈGLE : absent,
     *  `resolveBusinessUnitScope` LÈVE au lieu de servir tout l'espace. */
    @Optional() private readonly businessUnits?: BusinessUnitService,
  ) {}

  /** La porte d'espace ET de périmètre, AVANT toute lecture ou écriture : un
   *  contact hors de portée rend 404 et rien n'est écrit. */
  private async visibleWorkspace(contactId: string, userId: string): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    unwrap(
      await this.contactsService.findOne(
        contactId,
        userId,
        await resolveBusinessUnitScope(this.businessUnits, workspaceId, userId),
      ),
      failure => {
        throw new NotFoundException(failure.message)
      },
    )
    return workspaceId
  }

  @Get(':id/resolution-corrections')
  @WorkspaceRead()
  async list(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ContactResolutionCorrection[]> {
    const workspaceId = await this.visibleWorkspace(id, user.userId)
    return this.corrections.list(workspaceId, id)
  }

  @Post(':id/resolution-corrections')
  @RequirePermission('records:write')
  async record(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: unknown,
  ): Promise<ContactResolutionCorrection> {
    // `safeParse` et non `parse` : un `ZodError` nu sortirait en 500 opaque.
    const parsed = contactResolutionCorrectionRequestSchema.safeParse(body)
    if (!parsed.success) {
      throw new BadRequestException(
        'Correction illisible : elle dit « c’est bien la même personne » ou « ce n’est pas la même personne ».',
      )
    }
    const workspaceId = await this.visibleWorkspace(id, user.userId)
    // L'espace et l'auteur viennent du JETON : le schéma a jeté ceux du corps.
    return this.corrections.record({ workspaceId, contactId: id, decidedBy: user.userId, request: parsed.data })
  }
}
