import {
  Body,
  Controller,
  Get,
  Logger,
  Optional,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import {
  benchPushRequestSchema,
  can,
  createOutreachSequenceRequestSchema,
  applySequenceTemplateRequestSchema,
  applySequenceTemplateAudienceRequestSchema,
  createOutreachStepInputSchema,
  declareOutreachEngagementSignalSchema,
  declareOutreachStepOutcomeSchema,
  outreachEligibilityRequestSchema,
  reorderOutreachStepsSchema,
  startOutreachVacationSchema,
  duplicateOutreachSequenceRequestSchema,
  updateOutreachStepInputSchema,
  type ApplySequenceTemplateAudienceItem,
  type ApplySequenceTemplateAudienceRequest,
  type ApplySequenceTemplateAudienceResult,
  type ApplySequenceTemplateRequest,
  type ApplySequenceTemplateResult,
  type BenchPushRequest,
  type CreateOutreachSequenceRequest,
  type CreateOutreachStepInput,
  type DeclareOutreachEngagementSignalInput,
  type DeclareOutreachStepOutcomeInput,
  type OutreachEligibilityRequest,
  type OutreachStepKind,
  type OutreachEligibilityResponse,
  type ReorderOutreachStepsInput,
  type StartOutreachVacationInput,
  type DuplicateOutreachSequenceRequest,
  type OutreachSequence,
  type UpdateOutreachStepInput,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { MailboxService } from '../mailbox/mailbox.service'
import { ContactStopService } from '../contact-stop/contact-stop.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { SequenceTemplatesService } from '../sequence-templates/sequence-templates.service'
import { OutreachMessageService } from './outreach-message.service'
import { OutreachDelegationService } from './outreach-delegation.service'
import { ListOutreachSequencesDto } from './dto/list-outreach-sequences.dto'
import { OutreachCadenceService } from './outreach-cadence.service'
import { BenchPushService } from './bench-push.service'
import { OutreachService } from './outreach.service'
import { CadenceService } from '../contacts/cadence.service'

/**
 * Séquences d'outreach multi-touch (roadmap §8) — surface HTTP JWT + RBAC.
 * Créer une séquence programme des relances : c'est un acte d'outreach, donc
 * gated par la permission `messages:send` (un viewer ne programme rien).
 * Lectures scope workspace ; pause/cancel/step-done = propriétaire strict.
 * AUCUNE route ici n'envoie d'email — les étapes email préparent + rappellent,
 * l'envoi reste le geste humain du send-email (#394).
 */
/** #4418 — les touches vers un contact (le geste humain qui SORT) ; un rappel ou une tâche sont internes. */
const MANUAL_TOUCH_KINDS: readonly OutreachStepKind[] = ['email', 'linkedin_message', 'linkedin_invite', 'call']

@Controller('outreach/sequences')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class OutreachController {
  private readonly logger = new Logger(OutreachController.name)

  constructor(
    private readonly outreach: OutreachService,
    // La capacité d'envoi RÉELLE. Elle était calculée par chaque écran, à
    // partir de sa propre lecture — deux écrans, deux vérités possibles sur la
    // même séquence — et le serveur, lui, créait une séquence `active` pleine
    // d'étapes e-mail sans avoir jamais regardé s'il pouvait en envoyer une.
    // Résolue dans le CONTRÔLEUR : c'est la couche d'orchestration, et
    // l'injecter dans le service ajouterait un lien service→service que GA-07
    // gèle depuis le 21/08.
    private readonly mailbox: MailboxService,
    // #2366.1 — le message CANONIQUE : une étape e-mail préparée par une
    // séquence est le MÊME objet que celui que valide le centre d'approbation,
    // jamais une copie propre à l'écran Séquences. Orchestré ici (GA-07).
    private readonly messages: OutreachMessageService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly contactStops: ContactStopService,
    // #3756 — la bibliothèque de modèles : orchestrée ICI (GA-07), le service
    // de modèles ne connaît pas `OutreachService`.
    private readonly sequenceTemplates: SequenceTemplatesService,
    // Lot L-B (#4165) — le socle multicanal (issue déclarée, RDV pris, pause
    // vacances, réordonnancement, exclusions). Orchestré ICI : il ne connaît ni
    // `OutreachService` ni les services voisins (GA-07).
    private readonly cadence: OutreachCadenceService,
    // #4016 L5 (reprise 20/10) — le mandat `workspace_sequences` de l'espace. APPENDÉ EN FIN (les
    // specs construisent ce contrôleur par position) et optionnel : sans lui, rien n'est délégué.
    @Optional() private readonly delegations?: OutreachDelegationService,
    // #4418 — la cadence de relances (J+3/J+6/J+9) : « Marquer envoyé » la planifie comme un envoi
    // Bellum. APPENDÉ EN FIN et optionnel (même raison que `delegations`) ; orchestré ICI (GA-07).
    @Optional() private readonly manualCadence?: CadenceService,
    // #5029.1 — « Proposer ce profil » depuis le Reverse Market (lecture seule, prépare la requête).
    // APPENDÉ EN FIN et optionnel (même raison que `delegations`) ; orchestré ICI (GA-07).
    @Optional() private readonly benchPushes?: BenchPushService,
  ) {}

  /**
   * #2366.1 — chaque étape e-mail qui porte un brouillon devient UN message
   * canonique `needs_review`, lié à son étape. Une étape sans brouillon n'en
   * fabrique aucun : on n'invente pas un texte que personne n'a préparé.
   *
   * #2382.1/.2/.3 (RÉFUTÉ en prod le 23/09) — appelée à la création ET
   * désormais à l'ajout d'une étape (`addStep`) : une séquence se construit
   * souvent au fil de l'eau, et une étape e-mail ajoutée après coup n'écrivait
   * jamais son message canonique. IDEMPOTENTE via `linkedStepIds` : une étape
   * déjà liée n'est jamais reliée une seconde fois.
   */
  private async linkEmailSteps(sequence: OutreachSequence, userId: string): Promise<void> {
    const drafts = sequence.steps.filter(step => step.kind === 'email' && readDraft(step.payload) !== null)
    if (drafts.length === 0) return
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const ctx = { userId, workspaceId, role }
    const linked = await this.messages.linkedStepIds(ctx, sequence.id)
    const stops = (ids: readonly string[]) => this.contactStops.stoppedAmong(workspaceId, ids)
    for (const step of drafts) {
      if (linked.has(step.id)) continue
      const draft = readDraft(step.payload)
      if (!draft) continue
      const message = await this.messages.create(
        ctx,
        {
          contact_id: sequence.contact_id,
          channel: 'email',
          intent: step.position === 0 ? 'open_relationship' : 'follow_up',
          source: 'sequences',
          subject: draft.subject,
          body: draft.body,
        },
        stops,
        'user',
        { sequence_id: sequence.id, sequence_step_id: step.id },
      )
      // #4016 L5 (reprise 20/10) — délégation par défaut des étapes de séquence : proposé au mandat
      // `workspace_sequences`, daté de l'échéance de l'étape (rattaché seulement sous un mandat vivant ;
      // le dispatcher relit la séquence et l'étape à chaque envoi). Rien ne part ici.
      // #5029.2 — une séquence qui PROPOSE un consultant (Reverse Market) reste TOUJOURS manuelle : jamais
      // rattachée au mandat, même signé — chaque mail est relu et validé à la main.
      if (message?.id && step.due_at && !sequence.consultant_id) {
        await this.delegations?.awaitIfMandated(workspaceId, message.id, 'workspace_sequences', new Date(step.due_at))
      }
    }
  }

  /**
   * #2382.1/.2/.3 — RÉFUTÉ en prod le 23/09 (2e recette, sur d61bf2983, qui
   * contient DÉJÀ le correctif `addStep` ci-dessus) : deux séquences THALES,
   * créées le 12/09 — dix jours avant même l'existence de #2366.1 (22/09, le
   * message canonique à la CRÉATION) — n'ont jamais eu ni `create` ni
   * `addStep` exécuté depuis, et ne l'auront plus jamais : leurs étapes sont
   * déjà posées, personne ne les retouchera. Le seul geste qui leur reste est
   * d'être LUES — rattrapé ICI, jamais par un script qui rejouerait les
   * données en bloc (doctrine « le rejeu ne part pas seul au déploiement » ;
   * de toute façon un tel script toucherait TOUT LE PARC, jamais le segment
   * borné du lecteur courant).
   *
   * Gardé DERRIÈRE la même permission que `create`/`addStep`
   * (`messages:send`) : une simple LECTURE ne doit jamais écrire à la place de
   * quelqu'un qui n'a pas le droit d'envoyer — sinon un `viewer` qui ouvre
   * `/actions/sequences` fabriquerait des messages en son nom sans avoir
   * cliqué sur rien (la même porte que `WorkspacePermissionGuard` pose sur les
   * routes d'écriture, vérifiée ici en code faute de décorateur sur un GET).
   */
  private async canWriteMessages(userId: string): Promise<boolean> {
    const { role, workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, userId)
    return can(role, extra, 'messages:send')
  }

  /**
   * Une messagerie est-elle connectée pour cet utilisateur ?
   *
   * Un statut illisible rend `false` — le pire cas HONNÊTE. Annoncer « prêt à
   * envoyer » sur une lecture en échec ferait préparer une séquence qui
   * n'enverra rien, et la panne ne se verrait qu'au premier envoi.
   */
  private async canSend(userId: string): Promise<boolean> {
    try {
      return (await this.mailbox.status(userId)).connected === true
    } catch {
      return false
    }
  }

  /** Programme une séquence (template ou étapes custom) sur un contact possédé. */
  @Post()
  @RequirePermission('messages:send')
  async create(
    @Body(new ZodValidationPipe(createOutreachSequenceRequestSchema)) dto: CreateOutreachSequenceRequest,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OutreachSequence> {
    const sequence = await this.outreach.create(
      dto,
      { userId: user.userId, email: user.email },
      await this.canSend(user.userId),
    )
    await this.linkEmailSteps(sequence, user.userId)
    return sequence
  }

  /**
   * #3756.2 — applique un modèle de la bibliothèque à UN contact : une séquence
   * MONO-contact (doctrine c74) étiquetée du nom de la campagne, avec TOUTES
   * les gardes de `create` (désabonné, risque, collision…). Les variables sont
   * résolues à la préparation ; une étape dont une variable manque est créée
   * BLOQUÉE (variable nommée, aucun brouillon) — jamais un `{{…}}` littéral.
   * Le copilote prépare, le commercial envoie : rien n'est envoyé ici.
   */
  @Post('from-template/:templateId')
  @RequirePermission('messages:send')
  async applyTemplate(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body(new ZodValidationPipe(applySequenceTemplateRequestSchema)) body: ApplySequenceTemplateRequest,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ApplySequenceTemplateResult> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const prepared = await this.sequenceTemplates.prepare(user.userId, workspaceId, templateId, body.contact_id)
    const sequence = await this.outreach.create(
      { contact_id: body.contact_id, name: prepared.name, campaign_label: prepared.name, steps: prepared.steps },
      { userId: user.userId, email: user.email },
      await this.canSend(user.userId),
    )
    await this.linkEmailSteps(sequence, user.userId)
    return { sequence, blocked_steps: prepared.blockedSteps }
  }

  /**
   * #5029.1 — « Proposer ce profil » depuis le Reverse Market d'un consultant en
   * intercontrat. Revient sur le NO-GO « Préparer un push profil » (levé par
   * Louis le 31/10/2026) : geste explicite par compte, profil ANONYMISÉ, UN
   * contact (#5029.3 — jamais `/audience`), séquence playbook F rattachée au
   * consultant (`consultant_id`) et TOUJOURS manuelle (#5029.2). Mêmes gardes
   * que `create` (désabonné, risque, collision…). Rien n'est envoyé ici.
   */
  @Post('bench-push')
  @RequirePermission('messages:send')
  async benchPush(
    @Body(new ZodValidationPipe(benchPushRequestSchema)) body: BenchPushRequest,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OutreachSequence> {
    if (!this.benchPushes) throw new ServiceUnavailableException('Proposition de profil indisponible.')
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const request = await this.benchPushes.prepare(workspaceId, body)
    const sequence = await this.outreach.create(
      request,
      { userId: user.userId, email: user.email },
      await this.canSend(user.userId),
      { consultant_id: body.consultant_id },
    )
    await this.linkEmailSteps(sequence, user.userId)
    return sequence
  }

  /**
   * #3894.3 — c74 assoupli le 10/10/2026 par Louis : multi-contacts SUR DEMANDE
   * EXPLICITE (« lance la prospection sur ces 3 contacts »). Le défaut reste
   * `applyTemplate` (un contact) ; le schéma refuse moins de deux contacts ou
   * l'attestation absente. Pas de second moteur : UNE séquence mono-contact par
   * personne, par le même `create` (toutes ses gardes), regroupées par la même
   * étiquette `campaign_label`. Un refus sur un contact se nomme et ne coupe pas
   * les autres. Le copilote prépare, le commercial envoie : rien n'est envoyé.
   */
  @Post('from-template/:templateId/audience')
  @RequirePermission('messages:send')
  async applyTemplateToAudience(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body(new ZodValidationPipe(applySequenceTemplateAudienceRequestSchema))
    body: ApplySequenceTemplateAudienceRequest,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ApplySequenceTemplateAudienceResult> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const canSend = await this.canSend(user.userId)
    const items: ApplySequenceTemplateAudienceItem[] = []
    let campaignLabel = body.campaign_label?.trim() || null
    for (const contactId of body.contact_ids) {
      try {
        const prepared = await this.sequenceTemplates.prepare(user.userId, workspaceId, templateId, contactId)
        campaignLabel ??= prepared.name
        const sequence = await this.outreach.create(
          { contact_id: contactId, name: prepared.name, campaign_label: campaignLabel, steps: prepared.steps },
          { userId: user.userId, email: user.email },
          canSend,
        )
        await this.linkEmailSteps(sequence, user.userId)
        items.push({ contact_id: contactId, sequence, blocked_steps: prepared.blockedSteps, error: null })
      } catch (error) {
        items.push({
          contact_id: contactId,
          sequence: null,
          blocked_steps: [],
          error: error instanceof Error ? error.message : 'Préparation impossible pour ce contact.',
        })
      }
    }
    return { campaign_label: campaignLabel ?? '', items }
  }

  /**
   * Les séquences du workspace actif (optionnellement filtrées par contact).
   *
   * #2382.1/.2/.3 — rattrape aussi, pour qui tient `messages:send`, le message
   * canonique des séquences nées avant que ce lien n'existe (voir
   * {@link canWriteMessages}). `linkEmailSteps` est idempotent : une étape déjà
   * liée n'est jamais reliée une seconde fois, donc relire deux fois la même
   * liste ne double rien.
   */
  @Get()
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ListOutreachSequencesDto,
  ): Promise<OutreachSequence[]> {
    // Lot L-B — les balayages temporels (reprise des pauses vacances échues,
    // saut des messages LinkedIn dont l'invitation n'est pas acceptée), avant de lire.
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.cadence.sweep(workspaceId)
    const sequences = await this.outreach.list(
      user.userId,
      await this.canSend(user.userId),
      query.contact_id,
      query.consultant_id,
    )
    if (await this.canWriteMessages(user.userId)) {
      for (const sequence of sequences) await this.linkEmailSteps(sequence, user.userId)
    }
    return sequences
  }

  /**
   * Lot L-B — les exclusions à l'inscription, contact par contact, AVANT de
   * créer. Les contacts qui ne sont pas à l'utilisateur sont absents de la
   * réponse. L'opposition RGPD vient de la porte `contactStops`.
   */
  @Post('eligibility')
  @RequirePermission('messages:send')
  async eligibility(
    @Body(new ZodValidationPipe(outreachEligibilityRequestSchema)) dto: OutreachEligibilityRequest,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OutreachEligibilityResponse> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const erased = await this.contactStops.stoppedAmong(workspaceId, dto.contact_ids)
    return { contacts: await this.cadence.eligibility(user.userId, workspaceId, dto.contact_ids, erased) }
  }

  /** Lot L-B — « Mettre toutes mes séquences en pause jusqu'au… ». */
  @Post('vacation')
  @RequirePermission('messages:send')
  async startVacation(
    @Body(new ZodValidationPipe(startOutreachVacationSchema)) dto: StartOutreachVacationInput,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ paused: number }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { paused: await this.cadence.startVacation(user.userId, workspaceId, new Date(dto.until)) }
  }

  /** Lot L-B — reprendre toutes mes séquences en pause vacances (échéances décalées de la durée de pause). */
  @Post('vacation/resume')
  @RequirePermission('messages:send')
  async resumeVacation(@CurrentUser() user: CurrentUserPayload): Promise<{ resumed: number }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { resumed: await this.cadence.resumeAllMine(user.userId, workspaceId) }
  }

  @Get(':id')
  async get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OutreachSequence> {
    return this.outreach.get(user.userId, id, await this.canSend(user.userId))
  }

  @Post(':id/pause')
  async pause(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OutreachSequence> {
    return this.outreach.pause(user.userId, id, await this.canSend(user.userId))
  }

  @Post(':id/resume')
  async resume(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OutreachSequence> {
    // Lot L-B — une séquence en PAUSE VACANCES se reprend en décalant ses
    // échéances de la durée de la pause ; une pause ordinaire, comme avant.
    const onVacation = await this.cadence.ownedVacationPaused(user.userId, id)
    if (onVacation.length > 0) {
      await this.cadence.releaseVacation(onVacation)
      return this.outreach.get(user.userId, id, await this.canSend(user.userId))
    }
    return this.outreach.resume(user.userId, id, await this.canSend(user.userId))
  }

  /** Lot L-B — « RDV pris » : termine la séquence (cause `meeting_booked`), depuis la séquence ou une étape. */
  @Post(':id/meeting-booked')
  @RequirePermission('messages:send')
  async meetingBooked(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { step_id?: string } | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OutreachSequence> {
    const stepId = typeof body?.step_id === 'string' ? body.step_id : undefined
    await this.cadence.meetingBooked(user.userId, id, stepId)
    return this.outreach.get(user.userId, id, await this.canSend(user.userId))
  }

  /** Lot L-B — réordonner les étapes encore à faire (mêmes créneaux, nouvel ordre). */
  @Post(':id/steps/reorder')
  @RequirePermission('messages:send')
  async reorderSteps(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reorderOutreachStepsSchema)) dto: ReorderOutreachStepsInput,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OutreachSequence> {
    await this.cadence.reorder(user.userId, id, dto.step_ids)
    return this.outreach.get(user.userId, id, await this.canSend(user.userId))
  }

  /** Lot L-B — déclarer (ou effacer) l'issue d'une étape : invitation acceptée ou non, issue d'un appel. */
  @Patch(':id/steps/:stepId/outcome')
  @RequirePermission('messages:send')
  async declareOutcome(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Body(new ZodValidationPipe(declareOutreachStepOutcomeSchema)) dto: DeclareOutreachStepOutcomeInput,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OutreachSequence> {
    await this.cadence.declareOutcome(user.userId, id, stepId, dto.outcome)
    return this.outreach.get(user.userId, id, await this.canSend(user.userId))
  }

  @Post(':id/cancel')
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OutreachSequence> {
    return this.outreach.cancel(user.userId, id, await this.canSend(user.userId))
  }

  /** Marque une étape faite → la séquence avance (complétée si dernière). */
  @Post(':id/steps/:stepId/done')
  async stepDone(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OutreachSequence> {
    const sequence = await this.outreach.stepDone(user.userId, id, stepId, await this.canSend(user.userId))
    await this.scheduleFollowUpsForManualTouch(user.userId, sequence, stepId)
    return sequence
  }

  /**
   * #4418.1 — « Marquer envoyé » / « Marquer fait » d'une touche vers un contact planifie la MÊME
   * cadence qu'un envoi Bellum (`CadenceService.scheduleForContact`, J+3/J+6/J+9), visible dans
   * Aujourd'hui. « Fait » reste DÉCLARATIF : rien ici n'écrit `email_sent_at` ni aucune preuve
   * d'envoi — seul le jour du geste ancre le calendrier. Idempotent (une cadence déjà posée n'est
   * jamais doublée) ; une réponse reçue rend ces relances caduques par le chemin #4181. Best-effort :
   * le « fait » est déjà enregistré, un échec de planification ne le défait pas.
   */
  private async scheduleFollowUpsForManualTouch(
    userId: string,
    sequence: OutreachSequence,
    stepId: string,
  ): Promise<void> {
    const step = sequence.steps.find(candidate => candidate.id === stepId)
    if (!step || !MANUAL_TOUCH_KINDS.includes(step.kind) || !this.manualCadence) return
    try {
      const contact = await this.outreach.contactOf(sequence.contact_id)
      if (!contact) return
      await this.manualCadence.scheduleForContact(contact, userId, new Date())
    } catch (error) {
      this.logger.warn('manual touch cadence scheduling failed (step already done)', {
        error: error instanceof Error ? error.message : String(error),
        tags: { sequenceId: sequence.id, stepId },
      })
    }
  }

  /**
   * #2153.39 — « Elle ne doit pas être une liste figée. » Ajoute une touche à
   * une séquence encore vivante. Même permission que `create` : armer une
   * étape e-mail est le même geste d'outreach, qu'elle naisse à la création
   * ou plus tard.
   */
  @Post(':id/steps')
  @RequirePermission('messages:send')
  async addStep(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createOutreachStepInputSchema)) input: CreateOutreachStepInput,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OutreachSequence> {
    const sequence = await this.outreach.addStep(user.userId, id, input, await this.canSend(user.userId))
    // #2382.1/.2/.3 — RÉFUTÉ en prod le 23/09 : sans cet appel, une étape
    // e-mail ajoutée après la création de la séquence n'écrivait jamais son
    // message canonique — le centre d'approbation (#2382) restait vide.
    await this.linkEmailSteps(sequence, user.userId)
    return sequence
  }

  /** #2378.5 — retoucher une étape encore à faire (mêmes gardes qu'à la création). */
  @Patch(':id/steps/:stepId')
  @RequirePermission('messages:send')
  async updateStep(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Body(new ZodValidationPipe(updateOutreachStepInputSchema)) input: UpdateOutreachStepInput,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OutreachSequence> {
    const sequence = await this.outreach.updateStep(user.userId, id, stepId, input, await this.canSend(user.userId))
    // #3702 — un objet + corps écrits à la main deviennent le message canonique
    // `needs_review` de l'étape (centre « À valider »), comme un brouillon préparé.
    if (input.email_draft) await this.linkEmailSteps(sequence, user.userId)
    return sequence
  }

  /** #2378.5 — retirer une étape à faire : elle est ARCHIVÉE (skipped), jamais effacée. */
  @Post(':id/steps/:stepId/remove')
  @RequirePermission('messages:send')
  async removeStep(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OutreachSequence> {
    return this.outreach.removeStep(user.userId, id, stepId, await this.canSend(user.userId))
  }

  /**
   * #2909 (#2378.2) — déclarer (ou effacer) le signal d'ouverture/clic
   * RAPPORTÉ par le commercial sur une étape. Jamais détecté automatiquement —
   * voir `OUTREACH_ENGAGEMENT_SIGNALS`.
   */
  @Patch(':id/steps/:stepId/engagement')
  @RequirePermission('messages:send')
  async declareEngagementSignal(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Body(new ZodValidationPipe(declareOutreachEngagementSignalSchema)) input: DeclareOutreachEngagementSignalInput,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OutreachSequence> {
    return this.outreach.declareEngagementSignal(user.userId, id, stepId, input, await this.canSend(user.userId))
  }

  /**
   * #2378.7 — dupliquer vers un AUTRE contact. La copie naît comme toute
   * séquence (mêmes gardes) ; ses étapes e-mail écrivent leur message canonique.
   */
  @Post(':id/duplicate')
  @RequirePermission('messages:send')
  async duplicate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(duplicateOutreachSequenceRequestSchema)) dto: DuplicateOutreachSequenceRequest,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OutreachSequence> {
    const copy = await this.outreach.duplicate(
      { userId: user.userId, email: user.email },
      id,
      dto,
      await this.canSend(user.userId),
    )
    await this.linkEmailSteps(copy, user.userId)
    return copy
  }
}

/** Le brouillon figé dans le payload d'une étape e-mail, ou `null`. */
function readDraft(payload: Record<string, unknown>): { subject: string | null; body: string } | null {
  const draft = payload['email_draft']
  if (!draft || typeof draft !== 'object') return null
  const body = (draft as { body?: unknown }).body
  const subject = (draft as { subject?: unknown }).subject
  if (typeof body !== 'string' || body.trim().length === 0) return null
  return { subject: typeof subject === 'string' ? subject : null, body }
}
