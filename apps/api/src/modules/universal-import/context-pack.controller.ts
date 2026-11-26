import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common'
import {
  classifyContextPackFile,
  contextPackClassifyRequestSchema,
  contextPackRecordRequestSchema,
  type ContextPackHistoryItem,
  contextPackExtension,
  type ContextPackClassification,
  type ContextPackOriginalUrl,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { readContextPackHeaders } from './context-pack-headers'
import { ContextPackHistoryService } from './context-pack-history.service'
import { ContextPackOriginalsService } from './context-pack-originals.service'

/**
 * `/import/context-pack/*` — le ROUTEUR du pack de contexte (R21-JE, import-contexte Je.2).
 *
 * Il CLASSE, il n'importe pas : chaque fichier part ensuite, sur clic de l'utilisateur, vers l'importeur
 * existant de sa destination. Classement déterministe (`classifyContextPackFile`, `@bellum/contracts`) —
 * aucun appel modèle, aucune lecture ni écriture en base. Mêmes gardes que l'import universel voisin :
 * l'espace de l'appelant est résolu (membre authentifié, droit d'écriture), jamais pris dans la requête.
 *
 * Monté sous `/import` : la limite de corps de cette famille (`main.ts`, 12 Mo) couvre un classeur de 4 Mo en base64.
 */
@Controller('import/context-pack')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
@RequirePermission('records:write')
export class ContextPackController {
  constructor(
    private readonly workspaceContext: WorkspaceContextService,
    private readonly history: ContextPackHistoryService,
    private readonly originals: ContextPackOriginalsService,
  ) {}

  /**
   * #4573 — l'APERÇU de l'original d'un import de pack : une URL signée à durée courte (celle des CV). L'espace vient
   * de la session, jamais de la requête : un import d'un autre espace rend le même 404 qu'un id inexistant.
   */
  @Get('history/:id/original-url')
  async originalUrl(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ContextPackOriginalUrl> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.originals.signedUrl(workspaceId, id)
  }

  /** #4422.1 — l'historique des imports de l'assistant (hors comptes), les plus récents d'abord. */
  @Get('history')
  async listHistory(@CurrentUser() user: CurrentUserPayload): Promise<ContextPackHistoryItem[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.history.list(workspaceId)
  }

  /** #4422.1 — le bilan d'UN fichier importé par l'assistant, écrit par l'appelant après l'importeur de sa destination. */
  @Post('history')
  @HttpCode(204)
  async recordHistory(@CurrentUser() user: CurrentUserPayload, @Body() body: unknown): Promise<void> {
    const parsed = contextPackRecordRequestSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Requête invalide.')
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.history.record(workspaceId, user.userId, parsed.data)
  }

  @Post('classify')
  @HttpCode(200)
  async classify(@CurrentUser() user: CurrentUserPayload, @Body() body: unknown): Promise<ContextPackClassification> {
    const parsed = contextPackClassifyRequestSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Requête invalide.')
    await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const { fileName, headB64 } = parsed.data
    const extension = contextPackExtension(fileName)
    if (extension !== 'csv' && extension !== 'tsv' && extension !== 'xlsx') {
      return classifyContextPackFile({ fileName, headers: null, sheetCount: null })
    }
    const read = headB64
      ? await readContextPackHeaders(extension, Buffer.from(headB64, 'base64'))
      : { headers: null, sheetCount: null }
    return classifyContextPackFile({ fileName, ...read })
  }
}
