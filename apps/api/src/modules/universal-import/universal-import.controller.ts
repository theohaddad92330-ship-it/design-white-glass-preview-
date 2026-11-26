import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common'
import type { ZodType } from 'zod'
import {
  universalImportCreateSchema,
  universalImportPartSchema,
  universalImportPreviewSchema,
  universalImportStartSchema,
  universalImportVerifySchema,
  type PersonalContact,
  type PersonalContactShare,
  type UniversalImportJobState,
  type UniversalImportPreview,
  type UniversalImportVerification,
} from '@bellum/contracts'
import { isFailure } from '@bellum/utils'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { AccountsService } from '../accounts/accounts.service'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { resolveBusinessUnitScope } from '../business-unit/resolve-business-unit-scope'
import { DataExit } from '../workspace/data-exit.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { UniversalImportService, type UniversalImportHistoryItem } from './universal-import.service'

/**
 * `/import/universal/*` — l'import universel (Louis 27/09/2026).
 *
 * Monté SOUS `/import` à dessein : la limite de corps de cette famille
 * (`main.ts`, 12 Mo) couvre une part base64 de {@link UNIVERSAL_IMPORT_PART_BYTES}.
 * Aucun plafond de LIGNES ni de FICHIER : c'est le fichier qui se découpe.
 *
 * L'espace actif se résout ICI (geste d'utilisateur) et chaque appel au service
 * porte `workspaceId` — le service ne lit jamais un job par son identifiant seul.
 */
@Controller('import/universal')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
@RequirePermission('records:write')
export class UniversalImportController {
  constructor(
    private readonly imports: UniversalImportService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly accounts: AccountsService,
    private readonly businessUnits: BusinessUnitService,
  ) {}

  private async workspaceOf(userId: string): Promise<string> {
    return (await this.workspaceContext.resolveActiveWorkspace(userId)).workspaceId
  }

  @Post('jobs')
  async create(@CurrentUser() user: CurrentUserPayload, @Body() body: unknown): Promise<UniversalImportJobState> {
    const input = parseBody(universalImportCreateSchema, body)
    const workspaceId = await this.workspaceOf(user.userId)
    if (input.accountId) {
      // Le MÊME droit que `POST /accounts/:id/contacts/bulk` : espace ET unité.
      const businessUnitScope = await resolveBusinessUnitScope(this.businessUnits, workspaceId, user.userId)
      if (isFailure(await this.accounts.findOneForWorkspace(input.accountId, workspaceId, businessUnitScope))) {
        throw new NotFoundException('Compte introuvable.')
      }
    }
    return this.imports.create(workspaceId, user.userId, input)
  }

  /**
   * #2927 — « Mes contacts personnels », tous comptes confondus (écran /contacts). Lecture bornée à `user_id`.
   */
  @Get('personal-contacts')
  async allPersonalContacts(@CurrentUser() user: CurrentUserPayload): Promise<PersonalContact[]> {
    return this.imports.listPersonalContacts(await this.workspaceOf(user.userId), user.userId)
  }

  /**
   * #2927 — « Mes contacts personnels » d'un compte : ceux que CET utilisateur a importés en portée Personnel.
   * Même droit que l'ouverture du compte (espace ET unité), lecture bornée à `user_id`.
   */
  @Get('personal-contacts/:accountId')
  async personalContacts(
    @CurrentUser() user: CurrentUserPayload,
    @Param('accountId', ParseUUIDPipe) accountId: string,
  ): Promise<PersonalContact[]> {
    const workspaceId = await this.workspaceOf(user.userId)
    const businessUnitScope = await resolveBusinessUnitScope(this.businessUnits, workspaceId, user.userId)
    if (isFailure(await this.accounts.findOneForWorkspace(accountId, workspaceId, businessUnitScope))) {
      throw new NotFoundException('Compte introuvable.')
    }
    return this.imports.listPersonalContacts(workspaceId, user.userId, accountId)
  }

  /**
   * #2927 — « Partager avec l'équipe » : le propriétaire fait entrer un de ses contacts personnels dans les contacts
   * d'équipe. Même droit d'écriture que le reste du contrôleur ; la ligne se retrouve par `user_id`, jamais par id seul.
   */
  @Post('personal-contacts/:id/share')
  @HttpCode(200)
  async sharePersonalContact(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PersonalContactShare> {
    return this.imports.promotePersonalContact(await this.workspaceOf(user.userId), user.userId, id)
  }

  @Put('jobs/:id/parts/:index')
  async putPart(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('index') index: string,
    @Body() body: unknown,
  ): Promise<UniversalImportJobState> {
    const { dataB64 } = parseBody(universalImportPartSchema, body)
    return this.imports.putPart(await this.workspaceOf(user.userId), id, Number(index), dataB64)
  }

  /** #3666.9 — l'upload DIRECT d'une part vers le stockage : la porte signée… */
  @Post('jobs/:id/parts/:index/upload-url')
  async signPart(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('index') index: string,
  ): Promise<{ uploadUrl: string; path: string; token: string }> {
    return this.imports.signPart(await this.workspaceOf(user.userId), id, Number(index))
  }

  /** …puis la confirmation, une fois la part déposée (taille lue dans le stockage). */
  @Post('jobs/:id/parts/:index/uploaded')
  async confirmPart(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('index') index: string,
  ): Promise<UniversalImportJobState> {
    return this.imports.confirmPart(await this.workspaceOf(user.userId), id, Number(index))
  }

  @Post('jobs/:id/preview')
  @HttpCode(200)
  async preview(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body?: unknown,
  ): Promise<UniversalImportPreview> {
    // #4426.4 — l'onglet que l'humain vient de choisir ; un corps absent = le choix automatique.
    const { sheet } = parseBody(universalImportPreviewSchema, body ?? {})
    return this.imports.preview(await this.workspaceOf(user.userId), id, sheet)
  }

  @Post('jobs/:id/start')
  @HttpCode(202)
  async start(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<UniversalImportJobState> {
    const { mapping, sheet, sheets, skipLines, scope, sourceSystem } = parseBody(universalImportStartSchema, body)
    return this.imports.start(await this.workspaceOf(user.userId), id, mapping, sheet, {
      skipLines,
      sheets,
      scope,
      sourceSystem,
    })
  }

  /**
   * Théo B c4.R3 — la vérification AVANT d'importer : le plan du fichier, ligne à ligne, sans rien écrire.
   * Quelle que soit la taille ; c'est elle qui précède tout lancement (aussi en arrière-plan).
   */
  @Post('jobs/:id/verify')
  @HttpCode(200)
  async verify(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<UniversalImportVerification> {
    const { mapping, sheet, sheets, scope, sourceSystem } = parseBody(universalImportVerifySchema, body)
    return this.imports.verify(await this.workspaceOf(user.userId), id, mapping, sheet, {
      sheets,
      scope,
      sourceSystem,
    })
  }

  @Post('jobs/:id/resume')
  @HttpCode(202)
  async resume(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UniversalImportJobState> {
    return this.imports.resume(await this.workspaceOf(user.userId), id)
  }

  /** #4051.10 — l'historique des imports : date, fichier, volumes, statut. */
  @Get('jobs')
  async history(@CurrentUser() user: CurrentUserPayload): Promise<UniversalImportHistoryItem[]> {
    return this.imports.history(await this.workspaceOf(user.userId), user.userId)
  }

  @Get('jobs/:id')
  async state(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UniversalImportJobState> {
    return this.imports.state(await this.workspaceOf(user.userId), id)
  }

  /** #AM.9 — valider d'un clic les sociétés « à valider » du bilan. */
  @Post('jobs/:id/validate-companies')
  @HttpCode(200)
  async validateCompanies(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ created: number; alreadyThere: number }> {
    return this.imports.validateCompanies(await this.workspaceOf(user.userId), user.userId, id)
  }

  @Get('jobs/:id/report.csv')
  // Le rapport cite des libellés du fichier : il SORT des données, il lit la règle d'espace.
  @DataExit()
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="rapport-import.csv"')
  async report(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string): Promise<string> {
    // Le BOM : sans lui, Excel FR ouvre le rapport en Windows-1252 et casse les accents.
    return `${UTF8_BOM}${await this.imports.reportCsv(await this.workspaceOf(user.userId), id)}`
  }
}

const UTF8_BOM = String.fromCharCode(0xfeff)

/** Un corps validé par son schéma, ou un 400 qui dit POURQUOI — jamais un 500 sur une entrée fausse. */
function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Requête invalide.')
  return parsed.data
}
