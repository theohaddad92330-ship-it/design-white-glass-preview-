import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Optional,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { createZodDto } from 'nestjs-zod'
import {
  KPI_DICTIONARY,
  assignInterventionSchema,
  decideInterventionSchema,
  decidePlaybookSendSchema,
  isPlaybookApprovalExpired,
  playbookKeySchema,
  snoozeApprovalRequestSchema,
  updatePlaybookSchema,
  type Intervention,
  type KpiDefinition,
  type PlaybookApproval,
  type PlaybookDryRun,
  type PlaybookKey,
  type PlaybookSubscription,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { DecisionGatesService } from '../decision-gates/decision-gates.service'
import { MailboxService } from '../mailbox/mailbox.service'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { PlaybooksService } from './playbooks.service'

class UpdatePlaybookDto extends createZodDto(updatePlaybookSchema) {}
class DecideInterventionDto extends createZodDto(decideInterventionSchema) {}
class AssignInterventionDto extends createZodDto(assignInterventionSchema) {}
class DecidePlaybookSendDto extends createZodDto(decidePlaybookSendSchema) {}
/**
 * #2856 — reste du lot précédent : REPORTER une relance en attente. Même
 * contrat que `snoozeApprovalRequestSchema` (Action OS) — GA-26.
 */
class SnoozePlaybookSendDto extends createZodDto(snoozeApprovalRequestSchema) {}

/**
 * Playbooks de niveau 5, file d'intervention, dictionnaire des indicateurs.
 *
 * Armer un playbook demande `team:manage` : c'est la décision d'autoriser des
 * e-mails automatiques vers des clients au nom de l'espace, et elle n'appartient
 * pas au même siège que la saisie d'une fiche.
 */
@Controller('playbooks')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class PlaybooksController {
  constructor(
    private readonly playbooks: PlaybooksService,
    private readonly workspaceContext: WorkspaceContextService,
    // L'envoi vit ICI et non dans un service : il traverse deux domaines, et
    // c'est la sortie que GA-07 nomme elle-même — un contrôleur est la couche
    // où un geste d'utilisateur traverse légitimement plusieurs modules. Le
    // balayeur, lui, n'a plus aucun accès à la messagerie.
    private readonly mailbox: MailboxService,
    // Journal des portes — `@Optional()` : le retirer ne doit pas empêcher
    // d'armer ou de désarmer un playbook.
    @Optional() private readonly gates?: DecisionGatesService,
  ) {}

  @Get()
  async list(@CurrentUser() user: CurrentUserPayload): Promise<{ items: PlaybookSubscription[] }> {
    return { items: await this.playbooks.list(user.userId) }
  }

  @Put(':playbook')
  @RequirePermission('team:manage')
  async update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('playbook') playbook: string,
    @Body() body: UpdatePlaybookDto,
  ): Promise<PlaybookSubscription> {
    const key: PlaybookKey = playbookKeySchema.parse(playbook)
    const updated = await this.playbooks.update(user.userId, key, body)

    // Porte G5 — armer un playbook est le geste le plus engageant du produit :
    // à partir de ce clic, des messages partent SEULS au nom de l'utilisateur.
    // Le désarmement est journalisé aussi : « depuis quand n'envoie-t-il plus »
    // est une question qu'on se pose exactement autant que l'inverse.
    if (typeof body.enabled === 'boolean') {
      await this.recordArmingGate(user.userId, key, body.enabled)
    }
    return updated
  }

  /** Journal de la porte G5. Best-effort : l'armement est déjà persisté, et une
   *  panne d'audit ne doit pas se présenter comme une panne de produit. */
  private async recordArmingGate(userId: string, playbook: PlaybookKey, enabled: boolean): Promise<void> {
    if (!this.gates) return
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      await this.gates.record(workspaceId, userId, {
        gate: 'playbook_arming',
        decision: enabled ? 'accept' : 'refuse',
        subject: 'playbook',
        subjectId: playbook,
        // Désarmer est un `refuse`, qui exige un motif : celui-ci est explicite
        // et non deviné — l'écran ne pose pas la question, et inventer une
        // raison à la place de l'utilisateur serait de la donnée fabriquée.
        reason: enabled ? 'Playbook armé' : 'Playbook désarmé',
        missing: [],
      })
    } catch {
      // Journalisé côté service ; rien à ajouter ici.
    }
  }

  /**
   * SIMULER un playbook — ce qu'il ferait s'il était armé, sans rien envoyer.
   *
   * En LECTURE SEULE et sans permission d'écriture : regarder ce qui partirait
   * n'engage rien, et c'est précisément ce qui doit être consultable avant de
   * décider d'armer — l'armement, lui, exige `team:manage`.
   */
  @Get(':playbook/dry-run')
  dryRun(@CurrentUser() user: CurrentUserPayload, @Param('playbook') playbook: string): Promise<PlaybookDryRun> {
    return this.playbooks.dryRun(user.userId, playbookKeySchema.parse(playbook))
  }

  @Get('interventions')
  async interventions(@CurrentUser() user: CurrentUserPayload): Promise<{ items: Intervention[] }> {
    return { items: await this.playbooks.listInterventions(user.userId) }
  }

  @Post('interventions/:id/decide')
  @RequirePermission('records:write')
  @HttpCode(204)
  async decide(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: DecideInterventionDto,
  ): Promise<void> {
    await this.playbooks.decide(user.userId, id, body)
  }

  // #2206.53 — « le manager peut attribuer une action » (critère de recette).
  // `team:manage`, comme l'armement d'un playbook juste au-dessus : c'est un
  // geste de répartition d'équipe, pas la mise à jour d'une fiche.
  @Post('interventions/:id/assign')
  @RequirePermission('team:manage')
  @HttpCode(204)
  async assign(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AssignInterventionDto,
  ): Promise<void> {
    await this.playbooks.assign(user.userId, id, body)
  }

  /**
   * Ce qui attend MA validation avant de partir.
   *
   * Scopé à l'utilisateur et non à l'espace : la messagerie d'où partirait le
   * message est personnelle (D58). Montrer à un collègue les relances préparées
   * depuis la boîte d'un autre exposerait le contenu d'échanges clients qu'il
   * n'a aucune raison de lire.
   */
  @Get('approvals')
  async approvals(@CurrentUser() user: CurrentUserPayload): Promise<{ items: PlaybookApproval[] }> {
    return { items: await this.playbooks.pendingApprovals(user.userId) }
  }

  /**
   * Valider — ou refuser — une relance automatique.
   *
   * `messages:send` : approuver ici, c'est envoyer. Un siège qui n'a pas le
   * droit d'écrire à un client n'a pas celui d'autoriser la machine à le faire
   * à sa place.
   *
   * L'ordre compte, et il est l'inverse de l'intuition : on marque la décision
   * AVANT d'envoyer. Un envoi parti sur une ligne restée « en attente » serait
   * renvoyé au prochain clic ; une décision posée sur un envoi qui a échoué se
   * répare, et l'état `failed` le dit.
   */
  @Post('approvals/:id')
  @RequirePermission('messages:send')
  async decideSend(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: DecidePlaybookSendDto,
  ): Promise<{ state: 'sent' | 'rejected' | 'failed'; reason?: string }> {
    const pending = await this.playbooks.pendingForDecision(user.userId, id)
    if (!pending) throw new NotFoundException("Cette relance n'attend plus ta validation.")

    if (body.decision === 'reject') {
      await this.playbooks.markDecision(id, user.userId, 'rejected', body.reason ?? null)
      return { state: 'rejected' }
    }

    // Périmée : on ne l'envoie pas, et on le DIT. Approuver un lundi une
    // relance préparée dix jours plus tôt enverrait un message qui parle d'un
    // silence qui n'existe plus.
    if (isPlaybookApprovalExpired(pending.expires_at, new Date())) {
      await this.playbooks.markDecision(id, user.userId, 'expired', 'Validée après expiration')
      throw new BadRequestException('Cette relance a expiré. Elle ne sera pas envoyée.')
    }
    if (!pending.subject || !pending.body) {
      // Une demande sans son texte figé ne peut pas être ce qu'on a montré.
      await this.playbooks.markDecision(id, user.userId, 'expired', 'Message introuvable')
      throw new BadRequestException("Le message de cette relance est introuvable. Elle n'a pas été envoyée.")
    }

    await this.playbooks.markDecision(id, user.userId, 'approved', body.reason ?? null)
    try {
      // Le chemin gouverné, et le seul : opt-out revérifié destinataire par
      // destinataire, déduplication, arrêt après trois échecs, signature du
      // compte connecté. Un émetteur maison devrait tout redémontrer.
      const result = await this.mailbox.sendBatch(user.userId, {
        batchId: randomUUID(),
        mode: 'send',
        items: [{ to: pending.recipient, subject: pending.subject, body: pending.body }],
      })
      if (result.sent < 1) {
        await this.playbooks.markFailed(id, "La messagerie n'a pas envoyé le message.")
        return { state: 'failed', reason: "La messagerie n'a pas envoyé le message." }
      }
      await this.playbooks.markDispatched(id)
      return { state: 'sent' }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Envoi impossible'
      await this.playbooks.markFailed(id, reason)
      return { state: 'failed', reason }
    }
  }

  /**
   * #2856 — reste du lot précédent : REPORTER une relance en attente de MA
   * validation (`null` la réveille). Rien n'est décidé : la ligne reste
   * `pending_approval`. PAS de délégation à un collègue sur cette route (D58,
   * voir `PlaybooksService.snooze`) — reporter ne fait que retirer la ligne
   * de SA PROPRE file jusqu'à une date choisie.
   */
  @Post('approvals/:id/snooze')
  @RequirePermission('messages:send')
  async snoozeSend(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SnoozePlaybookSendDto,
  ): Promise<{ id: string; snoozedUntil: string | null }> {
    const snoozed = await this.playbooks.snooze(user.userId, id, body.until === null ? null : new Date(body.until))
    return { id: snoozed.id, snoozedUntil: snoozed.snoozed_until ? snoozed.snoozed_until.toISOString() : null }
  }

  /**
   * Le DICTIONNAIRE des indicateurs.
   *
   * Servi depuis le CODE et non depuis la base : une définition éditable sans
   * revue rendrait deux exports incomparables d'un mois à l'autre.
   *
   * ⚠️ #1440 — l'ÉCRAN ne l'appelle plus. `/pilotage` montait deux
   * dictionnaires ; celui qui restait (« Dictionnaire des indicateurs »)
   * affiche désormais les exclusions en lisant `KPI_DICTIONARY` par le lien
   * `dictionaryKey` du contrat, sans second appel. La route reste ouverte
   * parce qu'elle est un CONTRAT d'API : la retirer casserait un client hors
   * de ce dépôt sans qu'on puisse le vérifier.
   */
  @Get('kpi-dictionary')
  dictionary(): { items: readonly KpiDefinition[] } {
    return { items: KPI_DICTIONARY }
  }
}
