import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Optional,
  Param,
  Patch,
  Post,
  StreamableFile,
  UseGuards,
} from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import {
  localDayKey,
  parseChatImageObjects,
  parseChatImageRegions,
  ragScopeUpdateInputSchema,
  ragZipIngestInputSchema,
  storedFileContentTypeFor,
  type ChatImageObjects,
  type ChatImageRegion,
  type RagDocumentPreview,
  type RagZipIngestJobStart,
  type RagZipIngestJobStatus,
  type SignedDownload,
} from '@bellum/contracts'
import { unwrap } from '@bellum/utils'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { RequireFeature } from '../plan-features/require-feature.decorator'
import { IA_COST_HEADER, IaClient, type IaEnvelope } from '../ia/ia.client'
import { ProviderCostRecorder } from '../analytics/provider-cost-recorder'
import { RagExtractDto, RagIngestDto, RagQueryDto } from '../ia-proxy/dto/ia-proxy.dto'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { ImportWriterService } from '../import/import-writer.service'
import { ImportService } from '../import/import.service'
import { StorageService } from '../storage/storage.service'
import { classifyChatDropContent } from './chat-import-classifier'
import { RagService, type RagFailure } from './rag.service'
import { RagZipIngestJobService } from './rag-zip-ingest-job.service'

// #2667.1 — même forme que `CvZipImportDto` (talent.controller.ts) : le
// schéma zod porte déjà toute la validation (`@bellum/contracts`).
class RagZipIngestDto extends createZodDto(ragZipIngestInputSchema) {}

// #1954.22 — le corps de « changer la portée » : le schéma zod refuse déjà
// `conversation` sans `conversationId`, avant même d'atteindre le service.
class RagScopeUpdateDto extends createZodDto(ragScopeUpdateInputSchema) {}

function throwRagFailure(failure: RagFailure): never {
  const { code, message, cause } = failure
  switch (code) {
    case 'not_found':
      throw new NotFoundException(message, { cause })
    case 'delete_failed':
    case 'update_failed':
    case 'scope_requires_conversation':
    case 'scope_requires_account':
      throw new BadRequestException(message, { cause })
    // #2779 — un compte d'un autre espace : 404, sans dire s'il existe ailleurs.
    case 'account_not_in_workspace':
      throw new NotFoundException(message, { cause })
    default: {
      const _exhaustive: never = code
      throw new BadRequestException(`Unknown rag failure code: ${String(_exhaustive)}`)
    }
  }
}

@Controller('rag-documents')
// La base de connaissance est une surface de palier.
@RequireFeature('knowledge_base')
@UseGuards(JwtGuard, PlanFeatureGuard, WorkspacePermissionGuard)
export class RagController {
  private readonly logger = new Logger(RagController.name)

  constructor(
    private readonly rag: RagService,
    private readonly ia: IaClient,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly zipIngest: RagZipIngestJobService,
    // #2850 (#2431.11, 28/09) — la porte d'approbation existante de l'assistant
    // d'import (session + simulation FIGÉE) : jamais une seconde porte inventée
    // pour le dépôt `/chat`.
    private readonly importSessions: ImportService,
    private readonly importWriter: ImportWriterService,
    // #2876 (#2433.4) — optionnel comme partout où `StorageModule` est branché
    // (`ia-proxy.controller.ts`, voix) : son absence ne doit JAMAIS faire
    // échouer l'extraction de texte, qui fonctionnait déjà sans lui.
    @Optional() private readonly storage?: StorageService,
    // #2433.12 (lot P02 09/10) — le coût de la lecture d'une pièce jointe
    // (`x-bellum-costs`, outil compris, lot M10) : best-effort, optionnel.
    @Optional() private readonly providerCosts?: ProviderCostRecorder,
  ) {}

  @Get()
  async list(@CurrentUser() user: CurrentUserPayload) {
    // Multi-user Phase 2: knowledge documents are a shared, team-scoped resource.
    // Resolve the caller's active workspace and return the whole team's docs.
    // Identical to the old per-user scoping today (1 user = 1 workspace).
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // #2779 — l'auteur, pour ses documents `personal` (jamais ceux d'un collègue).
    return this.rag.listForWorkspace(workspaceId, user.userId)
  }

  /**
   * #2876 (#2433.4) — RÉOUVRIR une image de chat rangée : une URL signée de
   * cinq minutes. Même porte que `GET chat/messages/:id/voice`
   * (`ia-proxy.controller.ts`, #1939) : l'espace vient de la SESSION, jamais
   * du corps — un identifiant deviné ou d'un autre espace ne trouve rien.
   */
  @Get('image/:objectId')
  async downloadImage(
    @CurrentUser() user: CurrentUserPayload,
    @Param('objectId') objectId: string,
  ): Promise<{ url: string; expiresAt: string; fileName: string }> {
    if (!this.storage) {
      throw new NotFoundException('Le stockage des images de chat n’est pas activé sur ce serveur.')
    }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.storage.signedUrlFor(workspaceId, objectId)
  }

  @Get(':id')
  async getContent(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload): Promise<RagDocumentPreview> {
    // #1954.19 — « prévisualiser » une pièce déjà attachée arrive ici. Même
    // geste que `remove`/`updateScope` : l'appelant vient du jeton, l'espace
    // est résolu côté serveur. #3803 — un collègue lit un document d'équipe,
    // et l'original conservé est décrit (`source`, `null` sinon).
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return unwrap(await this.rag.getPreviewForReader(id, user.userId, workspaceId), throwRagFailure)
  }

  /**
   * #3803 (3803.2) — les OCTETS de l'original, pour la visionneuse (grille,
   * PDF, docx, slides). Servis par l'API : l'écran n'a le droit de se
   * connecter qu'à elle. `nosniff` + `attachment` : le navigateur ne les
   * interprète jamais comme une page de l'API.
   */
  @Get(':id/source')
  @WorkspaceRead()
  async downloadSource(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload): Promise<StreamableFile> {
    const { workspaceId, objectId } = await this.readableSource(id, user)
    const { bytes, fileName, contentType } = await this.requireStorage().readRagDocumentSource(workspaceId, objectId)
    return new StreamableFile(bytes, {
      type: contentType,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      length: bytes.byteLength,
    })
  }

  /** #3803 (3803.5) — « Télécharger l'original » : une URL signée de cinq minutes. */
  @Get(':id/source/link')
  @WorkspaceRead()
  async sourceLink(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload): Promise<SignedDownload> {
    const { workspaceId, objectId } = await this.readableSource(id, user)
    return this.requireStorage().signedUrlFor(workspaceId, objectId)
  }

  /** Le document doit être LISIBLE par l'appelant, dans SON espace — sinon 404. */
  private async readableSource(
    id: string,
    user: CurrentUserPayload,
  ): Promise<{ workspaceId: string; objectId: string }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const objectId = unwrap(await this.rag.sourceObjectIdForReader(id, user.userId, workspaceId), throwRagFailure)
    return { workspaceId, objectId }
  }

  private requireStorage(): StorageService {
    if (!this.storage) throw new NotFoundException('Le stockage des originaux n’est pas activé sur ce serveur.')
    return this.storage
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload): Promise<void> {
    // #1954.20 — « retirer » une pièce jointe du chat arrive ici. L'auteur vient
    // du jeton, l'espace est résolu côté serveur : jamais lus du corps.
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const { sourceObjectId } = unwrap(await this.rag.deleteForUser(id, user.userId, workspaceId), throwRagFailure)
    // #3803 (3803.1) — l'original part AVEC son document. Best-effort : un
    // magasin indisponible laisse un orphelin que le balayage de 03:41 reprend
    // (`purgeOrphanRagDocumentSources`), jamais une suppression qui échoue.
    if (sourceObjectId && this.storage) {
      await this.storage.remove(workspaceId, sourceObjectId).catch(error => {
        this.logger.warn(`Original non effacé, repris par le balayage : ${(error as Error)?.name ?? 'Error'}`)
      })
    }
  }

  @Patch(':id/scope')
  @HttpCode(204)
  async updateScope(
    @Param('id') id: string,
    @Body() dto: RagScopeUpdateDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<void> {
    // #1954.22 — « changer la portée » d'une pièce déjà attachée. Même geste
    // que `remove` : l'auteur vient du jeton, l'espace est résolu côté
    // serveur, jamais lus du corps — seule la PORTÉE demandée l'est.
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    unwrap(
      await this.rag.updateScopeForUser(
        id,
        user.userId,
        workspaceId,
        dto.scope,
        dto.conversationId ?? null,
        dto.accountId ?? null,
      ),
      throwRagFailure,
    )
  }

  /** Ingest a document into the caller's WORKSPACE RAG store (proxied to IA).
   *  `user_id` and `workspace_id` are both resolved server-side — never the body —
   *  so a client can't write into another tenant's store. The workspace stamp is
   *  what makes the upload grounding for every colleague's analysis. */
  @Post('ingest')
  async ingest(@CurrentUser() user: CurrentUserPayload, @Body() dto: RagIngestDto): Promise<IaEnvelope> {
    // Salle de démonstration : le dépôt est REFUSÉ, pour la même raison que
    // l'enregistrement d'une réunion — un visiteur ne dépose pas un document de
    // son entreprise sur un espace partagé et remis à neuf entre deux passages.
    // Il découpe et vectorise en plus, donc il coûte. La base de démonstration
    // est déjà remplie de documents fictifs : le visiteur voit l'écran plein et
    // ce que Bellum en fait, sans rien y laisser.
    if (await this.workspaceContext.isDemoWorkspace(user.userId)) {
      throw new BadRequestException(
        'Le dépôt d’un document est désactivé dans l’espace de démonstration : il resterait sur un espace partagé. Les documents d’exemple sont déjà là, et le copilote s’en sert.',
      )
    }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.assertAccountInWorkspace(dto.scope, dto.accountId, workspaceId)
    const envelope = await this.ia.ragIngest({
      userId: user.userId,
      workspaceId,
      title: dto.title,
      content: dto.content,
      category: dto.category,
      // RAG PDF server-side (Théo p.21) : fichier base64 → extraction texte IA.
      fileB64: dto.fileB64,
      filename: dto.filename,
      // #1954.7 — un document joint au chat sert au FIL par défaut ; il
      // n'entre dans la base de l'ESN que sur ce choix EXPLICITE. Absents
      // (comme aujourd'hui, tant que l'écran du chat ne les envoie pas),
      // `IaClient.ragIngest` omet les deux clés : comportement inchangé.
      scope: dto.scope,
      conversationId: dto.conversationId,
      // #2779 — le compte visé, vérifié juste au-dessus.
      accountId: dto.accountId,
      // #2861 (#2437.2, niveau SOURCE) — la langue DÉCLARÉE, jamais devinée.
      language: dto.language,
    })
    // #3803 (3803.1) — l'ORIGINAL est gardé, APRÈS l'ingestion (il lui faut
    // l'id du document). Best-effort : l'ingestion a déjà réussi.
    await this.persistDocumentSource(user.userId, workspaceId, envelope, dto)
    // #2850 (#2431.2/.10, reste 27/09) — le fichier est ingéré dans le RAG
    // EXACTEMENT comme avant (rien ci-dessus ne change) ; ce qui manquait au
    // composeur `/chat` est de le DIRE quand ce fichier ressemble à un export
    // métier connu. `dto.content` : le seul cas où le texte brut est déjà là
    // (`Chat.tsx::fileToIngestInput`, csv/txt/md/json) — un PDF (`fileB64`)
    // n'a pas encore de texte extrait à ce point, donc rien n'est classifié.
    if (dto.content) {
      const suggestion = classifyChatDropContent(dto.content)
      if (suggestion) {
        envelope.data = { ...envelope.data, suggestedImportObject: suggestion.object }
        // #2850 (#2431.11, décision Louis 28/09) — AUCUNE écriture automatique :
        // seule la confiance « élevée » est PROPOSÉE par défaut, via la porte
        // d'approbation déjà existante de l'assistant d'import (`ImportService`
        // création + simulation FIGÉE, jamais une écriture directe). Confiance
        // « basse » reste une suggestion à revoir manuellement (comportement
        // inchangé ci-dessus) — le geste utilisateur reste seul à approuver.
        if (suggestion.confidence === 'high') {
          const pendingImportSessionId = await this.proposeImportFromChatDrop(
            user.userId,
            workspaceId,
            suggestion.sourceKey,
            dto.content,
          )
          if (pendingImportSessionId) {
            envelope.data = { ...envelope.data, pendingImportSessionId }
          }
        }
      }
    }
    return envelope
  }

  /**
   * Crée et simule (jamais n'écrit) une session d'import à partir d'un contenu
   * classifié en confiance HAUTE au dépôt `/chat`. `null` si la simulation
   * échoue (fichier reclassé entre-temps, source retirée du catalogue) : le
   * dépôt RAG, lui, a déjà réussi au-dessus — une proposition en plus qui rate
   * ne doit jamais faire échouer un ingest par ailleurs réussi.
   */
  private async proposeImportFromChatDrop(
    userId: string,
    workspaceId: string,
    sourceKey: string,
    content: string,
  ): Promise<string | null> {
    try {
      const session = await this.importSessions.create(userId, workspaceId, sourceKey)
      const [knownParents, existing] = await Promise.all([
        this.importWriter.knownCompanyKeys(workspaceId),
        this.importWriter.existingKeys(workspaceId, session.object_type),
      ])
      await this.importSessions.simulate(workspaceId, session.id, { content, knownParents, existing })
      return session.id
    } catch (error) {
      this.logger.warn('Proposition d’import depuis /chat non simulée', { sourceKey, error })
      return null
    }
  }

  /**
   * #2431.5 (reste, épopée #2886) — « Remplacer / actualiser » une source déjà
   * importée. Ingère le NOUVEAU document par la MÊME porte que `ingest`
   * ci-dessus (même refus démo, même vérification de compte), puis lie
   * l'ANCIEN au nouveau via `RagService.replaceDocument` — jamais l'inverse :
   * si le dépôt échoue, rien n'est marqué remplacé.
   *
   * `duplicate: true` avec le MÊME id que `:id` (contenu byte-identique,
   * dédoublonnage #2431.7) ne lie rien : un document ne peut pas être
   * « remplacé par lui-même ». `duplicate: true` vers un AUTRE id existant
   * (contenu déjà présent ailleurs) lie normalement — l'ancien est alors
   * remplacé par ce document déjà connu, sans qu'aucune donnée soit inventée.
   */
  @Post(':id/replace')
  @RequirePermission('records:write')
  async replace(
    @Param('id') id: string,
    @Body() dto: RagIngestDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<IaEnvelope> {
    if (await this.workspaceContext.isDemoWorkspace(user.userId)) {
      throw new BadRequestException(
        'Remplacer un document est désactivé dans l’espace de démonstration : il resterait sur un espace partagé. Les documents d’exemple sont déjà là, et le copilote s’en sert.',
      )
    }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.assertAccountInWorkspace(dto.scope, dto.accountId, workspaceId)
    const envelope = await this.ia.ragIngest({
      userId: user.userId,
      workspaceId,
      title: dto.title,
      content: dto.content,
      category: dto.category,
      fileB64: dto.fileB64,
      filename: dto.filename,
      scope: dto.scope,
      conversationId: dto.conversationId,
      accountId: dto.accountId,
    })
    const newId = typeof envelope.data?.['id'] === 'string' ? (envelope.data['id'] as string) : null
    // #3803 (3803.1) — la nouvelle version garde son original, comme un dépôt.
    await this.persistDocumentSource(user.userId, workspaceId, envelope, dto)
    if (newId && newId !== id) {
      unwrap(await this.rag.replaceDocument(id, user.userId, workspaceId, newId), throwRagFailure)
    }
    return envelope
  }

  /**
   * #3803 (3803.1) — RANGE l'original d'un document qui vient d'être ingéré,
   * sous `rag_document_source`, et le lie à `rag_documents.source_object_id`.
   *
   *  · un fichier binaire (PDF, docx, xlsx, pptx) arrive en `fileB64` : ce sont
   *    ses octets, tels quels ;
   *  · un texte (csv, txt, md, json) arrive déjà lu en `content` par l'écran
   *    (`fileToIngestInput`) : son original EST ce texte, réencodé en UTF-8.
   *
   * BEST-EFFORT, comme l'image de chat : un stockage absent, un refus (quota,
   * signature) ou un lien impossible ne font JAMAIS échouer une ingestion
   * réussie — le document s'ouvre alors en texte, et l'écran le DIT. Un lien
   * refusé (doublon dont l'original existe déjà) fait repartir l'objet :
   * aucun octet sans document.
   */
  private async persistDocumentSource(
    userId: string,
    workspaceId: string,
    envelope: IaEnvelope,
    dto: RagIngestDto,
  ): Promise<void> {
    const documentId = typeof envelope?.data?.['id'] === 'string' ? (envelope.data['id'] as string) : null
    if (!this.storage || !documentId || !dto.filename) return
    const contentType = storedFileContentTypeFor('rag_document_source', dto.filename)
    const fileB64 = dto.fileB64 || (dto.content ? Buffer.from(dto.content, 'utf8').toString('base64') : '')
    if (!contentType || !fileB64) return
    try {
      const stored = await this.storage.put({
        workspaceId,
        domain: 'rag_document_source',
        fileName: dto.filename,
        contentType,
        fileB64,
        uploadedBy: userId,
        today: localDayKey(new Date()),
      })
      if (!(await this.rag.attachSource(documentId, workspaceId, stored.id))) {
        await this.storage.remove(workspaceId, stored.id)
      }
    } catch (error) {
      this.logger.warn(`Original non conservé (best-effort) : ${(error as Error)?.name ?? 'Error'}`)
    }
  }

  /**
   * #2779 — le compte d'une portée `account` vient du corps : il doit être un
   * compte de l'espace résolu côté serveur, sinon 404 et RIEN n'est déposé.
   */
  private async assertAccountInWorkspace(
    scope: string | undefined,
    accountId: string | undefined,
    workspaceId: string,
  ): Promise<void> {
    if (scope !== 'account') return
    if (!accountId || !(await this.rag.accountInWorkspace(accountId, workspaceId))) {
      throw new NotFoundException('Compte introuvable')
    }
  }

  /**
   * #2148.16 — LA PIÈCE JOINTE DE CONVERSATION (cas a) : extraire le texte
   * d'un fichier pour que Laura le lise CE tour, sans créer AUCUN objet
   * durable. Contrairement à `ingest` ci-dessus, jamais refusé en salle de
   * démonstration : rien n'est écrit, donc rien n'y reste entre deux
   * passages.
   *
   * GA-05 — même famille que `ingest/zip` ci-dessous : `records:write`. La
   * route ne dépose aucune ligne, mais elle fait le même geste qu'un dépôt
   * (lire un fichier envoyé par le client, l'envoyer au service IA) — un
   * `viewer` n'a pas plus de raison de la déclencher que d'ingérer.
   */
  @Post('extract')
  @RequirePermission('records:write')
  async extract(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: RagExtractDto,
  ): Promise<{
    text: string
    partial: boolean
    imageObjectId?: string
    regions?: ChatImageRegion[]
    objects?: ChatImageObjects
  }> {
    const isDemo = await this.workspaceContext.isDemoWorkspace(user.userId)
    const isChatImage = Boolean(dto.filename && storedFileContentTypeFor('chat_image_attachment', dto.filename))
    let costHeader: string | null = null
    const envelope = await this.ia.ragExtract(
      {
        fileB64: dto.fileB64,
        filename: dto.filename,
        // #2433.12 (épopée #2876, lot P02 09/10) — le localiseur d'objets : un
        // second appel de vision, pour une IMAGE seulement, et JAMAIS en salle
        // de démonstration (aucun modèle n'y est appelé pour un inconnu — la
        // salle montre une capture semée, `demo-chat-script.ts`).
        locateObjects: isChatImage && !isDemo,
      },
      { responseHeaderName: IA_COST_HEADER, onResponseHeader: (_name, value) => (costHeader = value) },
    )
    await this.recordExtractCost(user, costHeader)
    const data = envelope?.data as
      | { text?: string; partial?: boolean; regions?: unknown; objects?: unknown }
      | undefined
    const imageObjectId = isDemo ? null : await this.persistChatImage(user, dto)
    // #2433.4 (épopée #2876, lot M10 09/10) — OÙ chaque ligne a été lue dans
    // l'image (`vision_regions.locate_lines`) : relu ici, une zone invalide
    // est écartée. Aucune zone ⇒ aucune clé.
    const regions = parseChatImageRegions(data?.regions)
    const objects = parseChatImageObjects(data?.objects)
    return {
      text: data?.text || '',
      partial: Boolean(data?.partial),
      ...(imageObjectId ? { imageObjectId } : {}),
      ...(regions.length ? { regions } : {}),
      // #2433.12 — les bords du document et la grille d'un tableau, RELUS :
      // `null` = rien mesuré ⇒ aucune clé (l'écran ne dit alors rien).
      ...(objects ? { objects } : {}),
    }
  }

  /**
   * #2433.12 (lot P02 09/10) — ce que la lecture a coûté, fournisseur par
   * fournisseur et outil compris (`provider_costs.tool`, lot M10). Best-effort :
   * une mesure ne fait jamais échouer la lecture qu'elle accompagne.
   */
  private async recordExtractCost(user: CurrentUserPayload, header: string | null): Promise<void> {
    if (!this.providerCosts || !header) return
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
      await this.providerCosts.recordHeader(header, { workspaceId, userId: user.userId, feature: 'chat_image_extract' })
    } catch (error) {
      this.logger.warn(`Coût de lecture non écrit (best-effort) : ${(error as Error)?.name ?? 'Error'}`)
    }
  }

  /**
   * #2876 (#2433.4) — RANGE l'image d'une pièce ÉPHÉMÈRE de conversation, sous
   * son propre domaine (`chat_image_attachment`, 30 jours — même politique que
   * `chat_voice_message`, #1939.3). Avant ce lot, la preuve visuelle
   * n'existait que sous une URL `blob:` locale, perdue au rechargement,
   * invisible à qui relit le fil ensuite.
   *
   * BEST-EFFORT, à dessein : ni un fichier qui n'est pas une image (PDF,
   * DOCX…), ni un stockage absent ou en refus (quota, taille) ne doivent
   * jamais faire échouer l'extraction de texte, qui fonctionnait déjà sans ce
   * domaine — `null` dans ces trois cas, jamais une erreur remontée.
   *
   * ⚠️ JAMAIS en salle de DÉMONSTRATION (gardé par `extract`, qui lit la salle
   * une seule fois pour ce rangement ET le localiseur d'objets) : l'extraction elle-même y reste
   * autorisée (rien n'était écrit avant ce lot, `extract` ne refuse jamais la
   * salle), mais RANGER une image y laisserait un objet entre deux passages —
   * la même raison qui fait refuser `ingest`/`ingestZip` dans cette salle.
   */
  private async persistChatImage(user: CurrentUserPayload, dto: RagExtractDto): Promise<string | null> {
    if (!this.storage || !dto.filename) return null
    const contentType = storedFileContentTypeFor('chat_image_attachment', dto.filename)
    if (!contentType) return null
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
      const stored = await this.storage.put({
        workspaceId,
        domain: 'chat_image_attachment',
        fileName: dto.filename,
        contentType,
        fileB64: dto.fileB64,
        uploadedBy: user.userId,
        today: localDayKey(new Date()),
      })
      return stored.id
    } catch (error) {
      this.logger.warn(`Image de chat non rangée (best-effort) : ${(error as Error)?.name ?? 'Error'}`)
      return null
    }
  }

  /**
   * #2667.1 — retour Louis (20/09/2026) : « en pièces jointes on doit aussi
   * pouvoir donner des archives zip et tout ». Décision (QCM du 21/09) : le
   * .zip est déplié ICI, ses entrées lisibles traversent le MÊME chemin que
   * `ingest` ci-dessus (`RagZipIngestService` → `IaClient.ragIngest`). Les
   * plafonds (nombre d'entrées, taille décompressée, chemin hors archive,
   * archive imbriquée) refusent l'archive ENTIÈRE, nommément — jamais un
   * échec muet (`RagZipIngestService`, `@bellum/contracts`).
   *
   * GA-05 — même famille que toute création de contenu dans l'espace :
   * `records:write` (l'archive dépose des documents dans la base partagée,
   * ce n'est pas une lecture).
   */
  @Post('ingest/zip')
  @RequirePermission('records:write')
  async ingestZip(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: RagZipIngestDto,
  ): Promise<RagZipIngestJobStart> {
    // Même refus que `ingest` : la salle de démonstration reste figée entre
    // deux passages, une archive n'y échappe pas plus qu'un fichier seul.
    if (await this.workspaceContext.isDemoWorkspace(user.userId)) {
      throw new BadRequestException(
        'Le dépôt d’un document est désactivé dans l’espace de démonstration : il resterait sur un espace partagé. Les documents d’exemple sont déjà là, et le copilote s’en sert.',
      )
    }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.assertAccountInWorkspace(dto.scope, dto.accountId, workspaceId)
    // #3623.11 / #3666.10 — l'archive n'est PLUS ouverte dans la requête
    // (incident du 05/10/2026) : elle part en file, l'identifiant revient
    // tout de suite, l'état se lit sur `GET ingest/zip/:jobId`.
    return this.zipIngest.enqueue(user.userId, workspaceId, dto.fileB64, {
      filename: dto.filename,
      category: dto.category,
      scope: dto.scope,
      conversationId: dto.conversationId,
      accountId: dto.accountId,
    })
  }

  /**
   * #3623.11 / #3666.10 — l'état d'une archive en file : en attente / en cours /
   * terminée / partielle / interrompue (`lib/operation-status.ts`), avec le
   * rapport par entrée à la fin. Borné à l'espace résolu côté serveur.
   * Lecture : aucune permission d'écriture requise.
   */
  @Get('ingest/zip/:jobId')
  async ingestZipStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param('jobId') jobId: string,
  ): Promise<RagZipIngestJobStatus> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.zipIngest.status(workspaceId, jobId)
  }

  /** Semantic search over the WORKSPACE's RAG store (proxied to IA): the team's
   *  knowledge base, scoped to the caller's workspace and nothing wider. */
  @Post('query')
  async query(@CurrentUser() user: CurrentUserPayload, @Body() dto: RagQueryDto): Promise<IaEnvelope> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.ia.ragQuery({ userId: user.userId, workspaceId, query: dto.query, topK: dto.topK })
  }
}
