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
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common'
import type {
  ConversationSummaryView,
  MemoryForgetAllResult,
  MemoryItemHistory,
  MemoryLedger,
  ReplyMemoryUses,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import {
  CorrectConversationSummaryDto,
  ForgetMemoryParamsDto,
  GetConversationSummaryDto,
  ListFactsDto,
  PatchPreferencesDto,
  PinFactDto,
  UpdateFactDto,
  UpdateFactScopeDto,
} from './dto/memory.dto'
import { MemoryReplyUsesService } from './memory-reply-uses.service'
import { MemoryService, type PinnedFact } from './memory.service'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'

/**
 * Browser-facing CRUD for the copilot's durable "long memory" (Théo P2): pinned
 * facts + per-user preferences. JWT-guarded; pinned facts are team-scoped to the
 * caller's active workspace (writes stamp `user_id` from the token), preferences
 * are personal (per JWT user).
 */
@Controller('memory')
@UseGuards(JwtGuard)
export class MemoryController {
  constructor(
    private readonly memory: MemoryService,
    private readonly workspaceContext: WorkspaceContextService,
    // #1916.24 — la trace des éléments envoyés à Laura. Toujours fournie par
    // `MemoryModule` ; `@Optional()` et EN DERNIER pour les suites qui
    // construisent ce contrôleur par position.
    @Optional() private readonly replyUses?: MemoryReplyUsesService,
    // #1918.2 — les périmètres que l'appelant PORTE. `@Optional()` et en
    // dernier pour la même raison que ci-dessus ; absent, {@link perimetersOf}
    // rend une liste VIDE — donc aucune mémoire d'équipe. Le repli est FERMÉ :
    // l'erreur inverse ouvrirait la mémoire d'une agence à tout l'espace sans
    // qu'aucun écran change d'apparence.
    @Optional() private readonly businessUnits?: BusinessUnitService,
  ) {}

  /**
   * #1918.2 — les périmètres de l'appelant, résolus AU BORD (la convention du
   * dépôt pour le cloisonnement de périmètre : `resolveBusinessUnitScope`).
   *
   * ⚠️ Ici on lit l'APPARTENANCE (`perimetersOf`) et non l'ACCÈS (`scopeFor`) :
   * voir la raison écrite dans `BusinessUnitService.perimetersOf`.
   */
  private async perimetersOf(workspaceId: string, userId: string): Promise<string[]> {
    if (!this.businessUnits) return []
    return this.businessUnits.perimetersOf(workspaceId, userId)
  }

  /**
   * #1916.18 / #1916.24 — SOUS UNE RÉPONSE : les éléments de mémoire qui étaient
   * dans le contexte envoyé à Laura, tels que LE LECTEUR a le droit de les voir.
   *
   * Lue à l'OUVERTURE du panneau « Voir la source », jamais à l'affichage d'une
   * bulle. Bornée à l'espace actif (un message d'un autre espace ne rend rien)
   * et au lecteur du jeton : l'élément « Toi uniquement » d'un collègue n'est
   * qu'un compte. `@WorkspaceRead` : un fil est une ressource d'équipe, tout
   * membre qui le lit peut voir ce qui a servi à ses réponses.
   *
   * Sans le service : 503, jamais une liste vide qui se lirait « aucun élément ».
   */
  @WorkspaceRead()
  @Get('reply-uses/:messageId')
  async readReplyUses(
    @CurrentUser() user: CurrentUserPayload,
    @Param('messageId', ParseUUIDPipe) messageId: string,
  ): Promise<ReplyMemoryUses> {
    if (!this.replyUses) throw new ServiceUnavailableException('La trace de la mémoire est indisponible.')
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.replyUses.readForMessage({ messageId, workspaceId, viewerId: user.userId })
  }

  @Get('facts')
  async listFacts(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ListFactsDto,
  ): Promise<{ facts: PinnedFact[] }> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // #1918.1 — `userId` du JETON : la lecture ne rend que le partagé et ce que
    // l'appelant a épinglé. #1918.7 — le rôle RÉSOLU ne sert qu'à `canForget`.
    return {
      facts: await this.memory.listFacts({
        workspaceId,
        userId: user.userId,
        accountId: query.accountId ?? null,
        role,
        // #1918.2 / #1918.5 — deux portées de plus, chacune bornée à son
        // contexte : les périmètres PORTÉS, et le fil OUVERT (absent hors d'un fil).
        businessUnitIds: await this.perimetersOf(workspaceId, user.userId),
        ...(query.conversationId
          ? { thread: { accountId: query.accountId ?? null, conversationId: query.conversationId } }
          : {}),
      }),
    }
  }

  @Post('facts')
  async pinFact(@CurrentUser() user: CurrentUserPayload, @Body() dto: PinFactDto): Promise<{ fact: PinnedFact }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const fact = await this.memory.pinFact({
      // Le propriétaire : le JETON. Le DTO (zod) ne porte aucun champ d'identité,
      // et un `userId` glissé dans le corps est retiré à la validation.
      userId: user.userId,
      workspaceId,
      accountId: dto.accountId ?? null,
      fact: dto.fact,
      // Nature / origine / échéance (V2 §20). Absents ⇒ défauts historiques.
      kind: dto.kind,
      origin: dto.origin,
      expiresAt: dto.expiresAt ?? null,
      // #1917.3 — la portée choisie à la confirmation (énumération validée).
      scope: dto.scope,
      // #1918.5 / #1918.2 — ce que la portée DÉSIGNE. Le service ne retient la
      // désignation que pour la portée qui la demande, et vérifie que le
      // périmètre est bien l'un de ceux que l'appelant PORTE : le corps désigne,
      // l'appartenance autorise.
      conversationId: dto.conversationId ?? null,
      businessUnitId: dto.businessUnitId ?? null,
      businessUnitIds: await this.perimetersOf(workspaceId, user.userId),
      // #2260.7 — l'objet visé : contact, besoin, consultant ou mission.
      object: dto.object ?? null,
    })
    return { fact }
  }

  @Delete('facts/:id')
  @HttpCode(204)
  async unpinFact(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string): Promise<void> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // #1918.1 — l'élément « moi » d'un collègue est hors d'atteinte (404).
    // #1918.7 — un élément partagé : son auteur ou un manager (403 sinon). Le
    // rôle est celui de `resolveActiveWorkspace`, comme `WorkspacePermissionGuard`.
    await this.memory.unpinFact({ id, workspaceId, userId: user.userId, role })
  }

  /**
   * #1916.19 / #1916.22 — MODIFIER le texte et/ou l'échéance d'un élément. Même
   * règle que la suppression (#1918.7) : l'auteur, et sur un élément partagé un
   * manager ; l'élément « moi » d'un collègue reste un 404. Le service met le
   * critère DANS la requête d'écriture et journalise le geste avec son auteur
   * (#1916.23). Identifiant validé à la porte (uuid) : une chaîne quelconque est
   * un 400, pas une erreur SQL.
   *
   * #1962.19 — le même corps porte aussi `confirm: true` : CONFIRMER une note
   * de Laura sans réécrire son texte, un geste dédié à côté de la réécriture.
   */
  @Patch('facts/:id')
  async updateFact(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateFactDto,
  ): Promise<{ fact: PinnedFact }> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const fact = await this.memory.updateFact({
      id,
      workspaceId,
      userId: user.userId,
      role,
      fact: dto.fact,
      expiresAt: dto.expiresAt,
      // #1962.19 — confirmer une note de Laura sans réécrire son texte.
      confirm: dto.confirm,
    })
    return { fact }
  }

  /**
   * #1916.21 — le PROPRIÉTAIRE change la portée de ce qu'il a épinglé : « toi
   * uniquement » ↔ « toute ton ESN ». Un autre membre reçoit un 404 (le service
   * borne l'écriture par `user_id` = l'appelant). L'identifiant est un uuid
   * validé à la porte : une chaîne quelconque est un 400, pas une erreur SQL.
   */
  @Patch('facts/:id/scope')
  async setFactScope(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateFactScopeDto,
  ): Promise<{ fact: PinnedFact }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { fact: await this.memory.setFactScope({ id, workspaceId, userId: user.userId, scope: dto.scope }) }
  }

  /**
   * #1916.23 — L'HISTORIQUE d'un élément : sa création, puis chaque geste, avec
   * le prénom de qui l'a fait. Lisible par qui VOIT l'élément (un élément « moi »
   * d'un collègue reste un 404) — c'est une lecture d'espace, pas un privilège.
   */
  @WorkspaceRead()
  @Get('facts/:id/history')
  async factHistory(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<MemoryItemHistory> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.memory.factHistory({ id, workspaceId, userId: user.userId })
  }

  /**
   * TOUT ce que Laura garde, en clair — la règle de transparence du tome 6
   * §12.1. Quatre couches, une ligne par élément, et les couches ILLISIBLES
   * nommées : l'écran ne doit jamais présenter une panne comme un « rien ».
   */
  /**
   * ⚠️ `@WorkspaceRead` et non `@PersonalScope` : le registre montre QUATRE
   * couches, et celle des faits épinglés appartient à l'ESPACE — un collègue
   * les voit, par construction (D5, portefeuille partagé). Le déclarer
   * personnel serait faux, et `ALTERNATIVE_GUARDS` exempterait en prime tout
   * le contrôleur, y compris ses écritures.
   *
   * La matrice n'a aucune permission de LECTURE à donner (D39) : `viewer` n'en
   * détient aucune et lit pourtant tout l'espace.
   *
   * #1916 — la vue ÉCRAN : auteur, droit de modifier, surfaces, et les éléments
   * ÉCHUS avec leur date. L'outil `get_memory` de Laura lit la vue par défaut,
   * sans identité et sans élément échu.
   */
  @WorkspaceRead()
  @Get('ledger')
  async readLedger(@CurrentUser() user: CurrentUserPayload): Promise<MemoryLedger> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const ledger = await this.memory.readLedger({
      userId: user.userId,
      workspaceId,
      role,
      view: 'screen',
      // #1918.2 — la mémoire d'une équipe entre au registre de qui en est
      // MEMBRE. #1918.5 — aucune mémoire de fil : Réglages n'est pas un fil.
      businessUnitIds: await this.perimetersOf(workspaceId, user.userId),
    })
    return this.withConsultations(ledger, workspaceId, user.userId)
  }

  /**
   * #1916.24 — « consulté dans N réponses, la dernière le … » sur chaque élément
   * épinglé, pour le LECTEUR. Une lecture de trace ratée laisse le champ ABSENT :
   * l'écran ne dit alors ni « consulté » ni « pas encore consulté ».
   */
  private async withConsultations(ledger: MemoryLedger, workspaceId: string, viewerId: string): Promise<MemoryLedger> {
    const factIds = ledger.entries.filter(entry => entry.layer === 'facts').map(entry => entry.id)
    if (!this.replyUses || factIds.length === 0) return ledger
    try {
      const consultations = await this.replyUses.consultationsFor({ workspaceId, viewerId, factIds })
      return {
        ...ledger,
        entries: ledger.entries.map(entry => {
          const consultation = entry.layer === 'facts' ? consultations.get(entry.id) : undefined
          return consultation ? { ...entry, consultations: consultation } : entry
        }),
      }
    } catch {
      return ledger
    }
  }

  /**
   * TOUT OUBLIER — le geste global de la source (§3.6), et ce qu'il NE fait pas.
   *
   * Il n'emporte que ce qui est à L'APPELANT : ses faits, ses préférences, ses
   * résumés de ce fil, ses traces. Un fait épinglé par un collègue survit, et
   * l'écran l'annonce avant de demander confirmation — personne ne peut
   * consentir à effacer ce qu'il n'a pas vu.
   *
   * ⚠️ Déclaré AVANT `ledger/:layer/:id` par lisibilité, pas par nécessité : les
   * deux routes n'ont pas le même nombre de segments et ne se capturent donc
   * jamais l'une l'autre.
   *
   * `200` et non `204` : la réponse porte un compte rendu, et surtout la liste
   * des couches qui n'ont PAS pu être vidées. Un geste irréversible qui échoue
   * à moitié doit le dire.
   */
  @Delete('ledger')
  async forgetAll(@CurrentUser() user: CurrentUserPayload): Promise<MemoryForgetAllResult> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // #1916.24 — les traces « cet élément était dans le contexte de telle
    // réponse » de CETTE personne partent AVANT les couches. Si elles ne partent
    // pas, le compte rendu NOMME la couche des conversations en échec : un « tout
    // oublier » qui laisserait des traces derrière lui ne se dit pas réussi.
    const tracesForgotten = this.replyUses
      ? await this.replyUses.forgetForUser({ userId: user.userId, workspaceId }).then(
          () => true,
          () => false,
        )
      : true
    const result = await this.memory.forgetAll({ userId: user.userId, workspaceId })
    if (tracesForgotten || result.failedLayers.includes('conversations')) return result
    return { ...result, failedLayers: [...result.failedLayers, 'conversations'] }
  }

  /**
   * « … et peut en supprimer n'importe quelle ligne. » Une seule porte pour les
   * couches oubliables : le service décide de la portée, jamais l'appelant.
   * Une couche DÉCLARÉE (`identity`, `workspace`) y répond en 400 — elle se
   * corrige là où elle se saisit, elle ne s'oublie pas.
   *
   * `id` est PARAMÉTRÉ (donc décodé par Nest) parce qu'une clé de conversation
   * (`account:<uuid>`) et une clé de préférence portent des caractères qui
   * doivent voyager encodés.
   */
  @Delete('ledger/:layer/:id')
  @HttpCode(204)
  async forgetLedgerEntry(
    @CurrentUser() user: CurrentUserPayload,
    @Param() params: ForgetMemoryParamsDto,
  ): Promise<void> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.memory.forgetLedgerEntry({
      userId: user.userId,
      workspaceId,
      layer: params.layer,
      id: params.id,
      // #1918.7 — le rôle RÉSOLU : un fait partagé ne s'oublie que par son auteur ou un manager.
      role,
    })
  }

  @Get('preferences')
  async getPreferences(@CurrentUser() user: CurrentUserPayload): Promise<{ preferences: Record<string, unknown> }> {
    return { preferences: await this.memory.getPreferences(user.userId) }
  }

  @Patch('preferences')
  async patchPreferences(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: PatchPreferencesDto,
  ): Promise<{ preferences: Record<string, unknown> }> {
    return { preferences: await this.memory.patchPreferences(user.userId, dto.preferences) }
  }

  /**
   * #1955.30 — le résumé roulant du fil OUVERT, avec sa date. Le registre
   * (`GET /memory/ledger`) montrait déjà ce texte, mais seulement dans
   * Réglages › Mémoire de Laura ; cet endpoint sert `/chat`, où la personne
   * travaille. Personnel comme `facts`/`preferences` : la portée vient du JWT
   * et de l'espace actif, jamais du corps.
   */
  @Get('summary')
  async readConversationSummary(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: GetConversationSummaryDto,
  ): Promise<{ summary: ConversationSummaryView }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return {
      summary: await this.memory.getConversationSummaryDetail({
        userId: user.userId,
        workspaceId,
        accountId: query.accountId ?? null,
        conversationId: query.conversationId ?? null,
      }),
    }
  }

  /**
   * #1955.31 — « une correction humaine gagne toujours » (CLAUDE.md) : le
   * commercial peut réécrire le résumé du fil ouvert. 404 si le fil n'a pas
   * encore de résumé — corriger n'est pas créer une mémoire qui n'existait pas.
   */
  @Patch('summary')
  async correctConversationSummary(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CorrectConversationSummaryDto,
  ): Promise<{ summary: ConversationSummaryView }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const summary = await this.memory.correctConversationSummary({
      userId: user.userId,
      workspaceId,
      accountId: dto.accountId ?? null,
      conversationId: dto.conversationId ?? null,
      summary: dto.summary,
    })
    return { summary }
  }
}
