import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, In, Repository } from 'typeorm'
import {
  ACTIVITY_BODY_MAX_LENGTH,
  dedupeActivityBatch,
  engagementSummary,
  INTERACTION_ACTIVITY_KINDS,
  interactionActivityKindsSql,
  type Activity,
  type ActivityKind,
  type ActivityParticipant,
  type ActivityScope,
  type CallDebrief,
  type CallOutcome,
  type EngagementSummary,
  type IngestActivityInput,
  type LogActivityInput,
  NEAR_SIGNING_STAGES,
  projectStageInSql,
} from '@bellum/contracts'
import { classifyEngagement, daysSince, toIso, type EngagementReportRow } from './engagement-report'
import {
  BELLUM_NEAR_SIGNING_STAGES,
  isNearSigningCrmStage,
  type NearSigningBellumRow,
  type NearSigningCrmRow,
} from './near-signing'
import { ActivityParticipantEntity } from '../../database/entities/activity-participant.entity'
import { ActivityEntity } from '../../database/entities/activity.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ProjectEntity } from '../../database/entities/project.entity'
import { SyncLinkEntity } from '../../database/entities/sync-link.entity'
import { ActionPlanItemsService } from '../actions/action-plan-items.service'
import { CrmService } from '../crm/crm.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'
import { composeCrmCallNote } from './crm-call-note'

/**
 * #2984 → resserré le 25/09/2026 (#2386.A, #3010) — `ActivitiesService` PEUT
 * dépendre de `CrmService` (guard #2377.8, `un-outcome-interet-ne-cree-pas
 * -opportunite.spec.ts`, RESSERRÉE ce même jour plutôt qu'effacée), mais
 * UNIQUEMENT pour lire une fiche (`findContactRecord`) et y écrire une NOTE
 * (`logActivity`) — jamais pour créer ou faire avancer une AFFAIRE. Deux
 * appelants distincts partagent cette même dépendance optionnelle :
 *  · le diff CRM PROPOSÉ sur un `call_outcome` (`this.syncLinks` +
 *    `this.crm.logActivity(..., { origin: 'system' })`, doctrine « une
 *    écriture CRM/ERP passe par une porte » : ça reste `pending`) ;
 *  · l'écriture directe de la note d'appel depuis la saisie manuelle
 *    (`writebackCrmCallNote`, `this.crm.findContactRecord` puis
 *    `this.crm.logActivity(...)`, `origin: 'user'` par défaut — la saisie
 *    elle-même EST le geste qui autorise l'écriture).
 * `@Optional()` (règle #7 — retirer `CrmModule` ne casse pas les activités) :
 * sans CRM connecté, les deux restent des no-op.
 */

/** Combien d'activités au plus sur une fiche. Au-delà, personne ne lit. */
const TIMELINE_MAX = 200

/**
 * #2377.6 — le libellé de la prochaine action, dérivé de l'issue de l'appel
 * quand elle est connue. Un texte FIXE et prévisible plutôt qu'une phrase
 * composée à la volée : c'est ce que l'écran « Mes relances » affiche tel
 * quel, et une phrase générée qui varierait à chaque appel serait illisible
 * en liste.
 */
function nextActionLabel(outcome: CallOutcome | undefined): string {
  const byOutcome: Partial<Record<CallOutcome, string>> = {
    callback_scheduled: 'Rappeler — suite au précédent appel',
    interest: 'Donner suite à un intérêt exprimé',
    need_detected: 'Qualifier le besoin détecté à l’appel',
    need_confirmed: 'Avancer sur le besoin confirmé à l’appel',
    meeting_booked: 'Préparer le rendez-vous pris à l’appel',
    email_requested: 'Envoyer l’e-mail demandé à l’appel',
    document_requested: 'Envoyer le document demandé à l’appel',
  }
  return (outcome && byOutcome[outcome]) || 'Suite à donner à l’appel'
}

/**
 * #2984 — le brouillon de message de suivi qui suit la saisie d'un appel.
 *
 * COMPOSÉ ICI, jamais généré par un modèle : chaque ligne vient d'un champ que
 * le commercial a lui-même tapé (fait/besoin/engagement/prochaine action).
 * Rien n'est deviné — un appel qui n'a rien capturé (ni issue, ni debrief, ni
 * prochaine action) ne produit AUCUN brouillon plutôt qu'un texte générique
 * qui laisserait croire à une lecture du contenu de l'appel.
 *
 * Reste un BROUILLON : personne ne l'envoie depuis ce service — la doctrine
 * du dépôt (« le copilote n'envoie jamais d'e-mail ») s'applique ici comme
 * partout ailleurs.
 */
function composeFollowUpDraft(input: LogActivityInput): { subject: string | null; body: string } | null {
  if (input.kind !== 'call') return null
  const fact = input.callDebrief?.fact?.trim()
  const need = input.callDebrief?.need?.trim()
  const engagement = input.callDebrief?.engagement?.trim()
  const nextAction = input.nextAction
  if (!fact && !need && !engagement && !nextAction && !input.outcome) return null

  const lines = ['Bonjour,', '', 'Suite à notre échange téléphonique,']
  if (fact) lines.push(fact + '.')
  if (need) lines.push(`Je reviens vers vous au sujet de : ${need}.`)
  if (engagement) lines.push(`Pour rappel : ${engagement}.`)
  if (nextAction) lines.push(`Prochaine étape : ${nextAction.condition}.`)
  lines.push('', 'Bien à vous,')
  return { subject: null, body: lines.join('\n') }
}

/**
 * #2984 — la note interne posée dans le CRM connecté, DISTINCTE du brouillon
 * de suivi ci-dessus : celle-ci s'adresse à un collègue qui relit le dossier
 * plus tard, pas au contact. Mêmes règles : rien que du RÉELLEMENT saisi,
 * `null` si l'appel n'a rien capturé.
 */
function composeCrmNote(input: LogActivityInput): string | null {
  if (input.kind !== 'call') return null
  const lines: string[] = []
  if (input.outcome) lines.push(`Issue : ${input.outcome}`)
  if (input.callDebrief?.fact) lines.push(`Fait : ${input.callDebrief.fact}`)
  if (input.callDebrief?.need) lines.push(`Besoin : ${input.callDebrief.need}`)
  if (input.callDebrief?.objection) lines.push(`Objection : ${input.callDebrief.objection}`)
  if (input.callDebrief?.engagement) lines.push(`Engagement : ${input.callDebrief.engagement}`)
  return lines.length > 0 ? lines.join('\n') : null
}

/**
 * Les ACTIVITÉS — l'écriture et la lecture.
 *
 * Trois propriétés portent l'honnêteté du service, et chacune répond à un
 * accident précis :
 *
 * 1. **L'ingestion est idempotente**, garantie par l'index unique partiel
 *    `(workspace_id, source, external_id)`. On ne fait pas confiance à un
 *    `SELECT` préalable : deux captures concurrentes le passeraient toutes les
 *    deux. C'est `ON CONFLICT DO NOTHING` qui tranche, et le nombre de lignes
 *    réellement écrites qui est rapporté.
 * 2. **Un rattachement est prouvé ou absent.** Le service n'invente aucun lien :
 *    il écrit ce que `activity-linking.ts` a su démontrer, avec sa raison.
 * 3. **La lecture d'une fiche remonte AUSSI ce qui touche ses contacts.** La
 *    timeline d'un compte sans les échanges de ses interlocuteurs serait vide
 *    au moment précis où elle sert.
 */
@Injectable()
export class ActivitiesService {
  private readonly logger = new Logger(ActivitiesService.name)

  constructor(
    @InjectRepository(ActivityEntity) private readonly activities: Repository<ActivityEntity>,
    @InjectRepository(ActivityParticipantEntity)
    private readonly participants: Repository<ActivityParticipantEntity>,
    @InjectRepository(ContactEntity) private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(ProjectEntity) private readonly projects: Repository<ProjectEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly dataSource: DataSource,
    private readonly actionPlanItems: ActionPlanItemsService,
    // Les deux dépendances CRM, TOUTES DEUX optionnelles : sans lien de
    // synchronisation ou sans CRM connecté, les deux appelants (diff proposé
    // + writeback manuel, voir le docblock au-dessus de la classe) restent un
    // no-op plutôt qu'un échec au démarrage (règle #7 — retirer `CrmModule`
    // ne casse pas les activités).
    @Optional()
    @InjectRepository(SyncLinkEntity)
    private readonly syncLinks?: Repository<SyncLinkEntity>,
    @Optional() private readonly crm?: CrmService,
  ) {}

  /**
   * Écrit un lot d'activités capturées. Rend ce qui est ENTRÉ et ce qui était
   * DÉJÀ connu — le second nombre est la preuve visible que l'idempotence
   * fonctionne, et il vaut mieux l'afficher que le déduire.
   */
  async ingest(
    workspaceId: string,
    userId: string | null,
    inputs: readonly IngestActivityInput[],
  ): Promise<{ ingested: number; duplicates: number }> {
    const batch = dedupeActivityBatch(inputs)
    if (batch.length === 0) return { ingested: 0, duplicates: 0 }

    let ingested = 0
    for (const input of batch) {
      const written = await this.insertOne(workspaceId, userId, input)
      if (written) ingested += 1
    }
    return { ingested, duplicates: batch.length - ingested }
  }

  /**
   * Une insertion, en une requête, avec sa clause de conflit.
   *
   * `ON CONFLICT DO NOTHING` plutôt qu'un `SELECT` puis `INSERT` : deux captures
   * concurrentes (un cron et un clic) passeraient toutes les deux le contrôle
   * préalable, et le doublon se lirait comme deux échanges.
   */
  private async insertOne(workspaceId: string, userId: string | null, input: IngestActivityInput): Promise<boolean> {
    const body =
      input.body && input.body.length > ACTIVITY_BODY_MAX_LENGTH
        ? input.body.slice(0, ACTIVITY_BODY_MAX_LENGTH)
        : input.body
    const truncated = Boolean(input.body && input.body.length > ACTIVITY_BODY_MAX_LENGTH)

    const rows = await this.activities.manager.query<{ id: string }[]>(
      `INSERT INTO activities (
         workspace_id, user_id, kind, source, direction, subject, body, body_truncated,
         occurred_at, duration_seconds, account_id, contact_id, project_id, link_reason,
         external_id, external_url, channel, verdict, call_outcome
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (workspace_id, source, external_id) WHERE external_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [
        workspaceId,
        userId,
        input.kind,
        input.source,
        input.direction,
        input.subject,
        body,
        truncated,
        input.occurredAt,
        input.durationSeconds,
        input.accountId,
        input.contactId,
        input.projectId,
        input.linkReason,
        input.externalId,
        input.externalUrl,
        // Le canal et le verdict d'un ENVOI. `null` pour une capture en
        // lecture : une activité relue dans une boîte n'a pas été envoyée par
        // nous, et lui prêter un canal ferait croire le contraire.
        input.channel ?? null,
        input.verdict ?? null,
        // Aucune source CAPTURÉE ne connaît l'issue d'un appel — c'est un
        // jugement du commercial, jamais lu chez un fournisseur.
        null,
      ],
    )

    const activityId = rows[0]?.id
    if (!activityId) return false

    if (input.participants.length > 0) {
      await this.participants.insert(
        input.participants.map(participant => ({
          activity_id: activityId,
          handle: participant.handle,
          display_name: participant.displayName,
          contact_id: participant.contactId,
          is_self: participant.isSelf,
        })),
      )
    }
    return true
  }

  /** La saisie à la main — « j'ai appelé, il rappelle en septembre ». */
  async log(userId: string, input: LogActivityInput): Promise<Activity> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const resolved = await this.resolveTargets(workspaceId, input)

    // #2377.6 — une prochaine action DÉCLARÉE (owner+date+condition, déjà
    // validés par `callNextActionSchema`) ne peut s'écrire que sur un compte
    // réel : `action_plan_items` n'existe qu'à l'échelle d'un compte. Refusé
    // AVANT l'écriture de l'activité — jamais une activité enregistrée avec
    // une prochaine action silencieusement perdue.
    if (input.kind === 'call' && input.nextAction && !resolved.accountId) {
      throw new BadRequestException('Une prochaine action doit être rattachée à un compte')
    }

    // #2984 — le brouillon de suivi est composé AVANT l'écriture : s'il n'y a
    // rien à écrire (aucune des trois raisons ci-dessous), `call_debrief` doit
    // rester `null` exactement comme avant #2984, pas un objet vide.
    const followUpDraft = composeFollowUpDraft(input)
    const callDebrief =
      input.kind === 'call' &&
      (input.callDebrief || input.nextAction || input.recordingConsent !== undefined || followUpDraft)
        ? {
            ...(input.callDebrief ?? {}),
            nextAction: input.nextAction ?? null,
            ...(input.recordingConsent !== undefined ? { recordingConsent: input.recordingConsent } : {}),
            ...(followUpDraft ? { followUpDraft } : {}),
          }
        : null

    const saved = await this.activities.save(
      this.activities.create({
        workspace_id: workspaceId,
        user_id: userId,
        kind: input.kind,
        source: 'manual',
        direction: input.direction,
        subject: input.subject ?? null,
        body: input.body ?? null,
        body_truncated: false,
        occurred_at: input.occurredAt ? new Date(input.occurredAt) : new Date(),
        duration_seconds: input.durationSeconds,
        account_id: resolved.accountId,
        contact_id: resolved.contactId,
        project_id: resolved.projectId,
        link_reason: 'manual',
        external_id: null,
        external_url: null,
        // Seul un APPEL porte une issue — le schéma refuse déjà toute autre
        // nature (`logActivitySchema`), ceci est la dernière garde avant
        // écriture.
        call_outcome: input.kind === 'call' ? (input.outcome ?? null) : null,
        call_debrief: callDebrief,
      }),
    )

    // #2377.6 — la prochaine action rejoint la MÊME liste que toute autre
    // tâche manuelle (`action_plan_items`, « Mes relances », le plan du
    // compte) : un second mécanisme parallèle finirait par diverger de celui
    // que l'écran Actions lit déjà.
    if (input.kind === 'call' && input.nextAction && resolved.accountId) {
      await this.actionPlanItems.createManual(userId, resolved.accountId, {
        label: nextActionLabel(input.outcome),
        dueDate: input.nextAction.dueDate,
        ownerName: input.nextAction.owner,
        reason: input.nextAction.condition,
        expectedOutcome: input.nextAction.expectedResult ?? null,
        contactId: resolved.contactId,
      })
    }

    // #2984 — le diff CRM PROPOSÉ, jamais écrit tout seul (doctrine : « une
    // écriture CRM/ERP passe par une porte »). Réutilise la porte existante
    // (`CrmService.logActivity` → `OutboundWriteService`), `origin: 'system'`
    // pour qu'elle reste `pending` — personne n'a rien vu, rien ne part.
    // Best-effort : ni un CRM absent, ni un contact non lié, ni une panne de
    // la porte ne doivent faire échouer la saisie de l'appel lui-même.
    if (input.kind === 'call' && resolved.contactId && this.syncLinks && this.crm) {
      try {
        const link = await this.syncLinks.findOne({
          where: {
            workspace_id: workspaceId,
            entity_type: 'contact',
            internal_id: resolved.contactId,
            provider: 'hubspot',
          },
        })
        const note = composeCrmNote(input)
        if (link && note) {
          await this.crm.logActivity(userId, link.external_id, note, { origin: 'system' })
        }
      } catch (error) {
        this.logger.warn(`Note CRM non proposée pour l'appel ${saved.id} : ${(error as Error).message}`)
      }
    }

    // #2386.A — la porte d'écriture CRM (`CrmService.logActivity`, déjà
    // branchée depuis la téléphonie) n'avait aucun appelant depuis LA saisie
    // manuelle — le chemin le plus fréquent d'un outcome d'appel
    // (LogActivityDialog, session de prospection). Best-effort et APRÈS
    // l'écriture : un CRM indisponible ne doit jamais faire perdre l'appel
    // que le commercial vient de consigner.
    if (input.kind === 'call' && input.outcome && resolved.contactId) {
      await this.writebackCrmCallNote(userId, workspaceId, resolved.contactId, {
        outcome: input.outcome,
        subject: input.subject,
        body: input.body,
        callDebrief: input.callDebrief ?? null,
      })
    }

    const [activity] = await this.hydrate([saved], userId)
    if (!activity) throw new NotFoundException('Activité introuvable')
    return activity
  }

  /**
   * #2386.A — écrit l'issue d'un appel sur la fiche CRM du contact, quand un
   * connecteur EST branché et QUE le CRM connaît déjà cette adresse. Sans clé
   * (`findContactRecord` renvoie `null`) ou sans e-mail sur le contact : aucun
   * appel réseau — même règle « sans clé = no-op strict » que le reste du
   * dépôt. `origin: 'user'` (défaut de `CrmService`) : la saisie elle-même EST
   * le geste utilisateur qui autorise l'écriture, jamais une préview figée de
   * plus pour un texte que le commercial vient de composer à la main.
   */
  private async writebackCrmCallNote(
    userId: string,
    workspaceId: string,
    contactId: string,
    note: { outcome: CallOutcome; subject?: string; body?: string; callDebrief: CallDebrief | null },
  ): Promise<void> {
    if (!this.crm) return
    try {
      const contact = await this.contacts.findOne({
        where: { id: contactId, ...workspaceScopeWhere(workspaceId) },
        select: ['id', 'email'],
      })
      if (!contact?.email) return
      const record = await this.crm.findContactRecord(userId, contact.email)
      if (!record) return
      await this.crm.logActivity(userId, record.recordId, composeCrmCallNote(note))
    } catch (error) {
      this.logger.warn('Écriture CRM après appel impossible — l’activité reste consignée quand même', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * #1791.2 — la trace de ce que Laura lit chez un connecteur, pour UN compte.
   *
   * `POST internal/copilot/crm/presence` journalisait dans le logger serveur —
   * rien dans le journal que l'utilisateur peut consulter. Décision de Louis :
   * une entrée VISIBLE, au même endroit que les e-mails et les rendez-vous de
   * ce compte, pas un second mécanisme.
   *
   * ⚠️⚠️ **Le GESTE, jamais le CONTENU.** `subject` et `body` restent `null` :
   * le client rend déjà « Laura a consulté ton CRM » depuis le seul `kind`
   * (i18n, `activities:kinds.crm_lookup`), et écrire la phrase ICI la figerait
   * dans une langue pour toujours — le défaut déjà payé sur un autre écran
   * (« un libellé d'affichage écrit dans un contrat est français pour
   * toujours »). Aucun paramètre de cette méthode ne porte ce qui a été
   * TROUVÉ (connecté ou non, nombre de contacts, affaires) : l'appelant ne
   * peut pas faire fuir un contenu qu'il n'a pas le moyen de transmettre.
   *
   * `source: 'system'` (ni `'crm'` — ce n'est pas une ligne CAPTURÉE chez le
   * fournisseur, ni `'manual'` — personne ne l'a saisie) ; `direction:
   * 'internal'` — ce n'est pas une touche envoyée au client. `link_reason:
   * null` : l'appelant a déjà vérifié que ce compte lui appartient, il n'y a
   * rien à déduire d'une adresse ou d'un domaine.
   *
   * Aucune valeur de retour : c'est un best-effort côté appelant (voir
   * `CopilotBridgeController.crmPresence`) — une trace qui échoue à s'écrire
   * ne doit pas empêcher Laura de répondre.
   */
  async recordCrmLookup(workspaceId: string, userId: string, accountId: string): Promise<void> {
    await this.activities.save(
      this.activities.create({
        workspace_id: workspaceId,
        user_id: userId,
        kind: 'crm_lookup',
        source: 'system',
        direction: 'internal',
        subject: null,
        body: null,
        body_truncated: false,
        occurred_at: new Date(),
        duration_seconds: null,
        account_id: accountId,
        contact_id: null,
        project_id: null,
        link_reason: null,
        external_id: null,
        external_url: null,
        call_outcome: null,
      }),
    )
  }

  /**
   * Retire une activité SAISIE À LA MAIN, et seulement par son auteur.
   *
   * Deux refus, chacun pour une raison différente :
   *
   *  - **une activité capturée ne se supprime pas.** Elle décrit un e-mail ou un
   *    appel qui a réellement eu lieu chez le fournisseur ; l'effacer ne le fait
   *    pas disparaître, et la prochaine capture la ramènerait. Un bouton qui ne
   *    tient pas est pire que pas de bouton.
   *  - **seul l'auteur retire sa saisie.** Effacer la note d'un collègue réécrit
   *    l'historique d'un compte partagé — même règle que les notes (T0), pour la
   *    même raison : un document que quelqu'un peut réécrire n'est plus cru.
   */
  async remove(userId: string, activityId: string): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const activity = await this.activities.findOne({ where: { id: activityId, workspace_id: workspaceId } })
    if (!activity) throw new NotFoundException('Activité introuvable')
    if (activity.source !== 'manual') {
      throw new BadRequestException(
        'Seule une activité saisie à la main peut être retirée : un échange lu chez ton fournisseur reviendrait à la prochaine récupération.',
      )
    }
    if (activity.user_id !== userId) throw new ForbiddenException('Seul l’auteur peut retirer sa saisie')
    await this.activities.delete({ id: activityId })
  }

  /**
   * Vérifie que les cibles appartiennent bien à l'espace, et COMPLÈTE ce qui
   * se déduit sans risque : un contact connaît son compte, un projet aussi.
   *
   * Compléter ici plutôt que de laisser le client le faire évite une classe
   * entière d'incohérences — une activité rattachée à un contact d'ACME mais au
   * compte BETA n'apparaîtrait ni là où on la cherche, ni là où elle a eu lieu.
   */
  private async resolveTargets(
    workspaceId: string,
    input: { accountId?: string; contactId?: string; projectId?: string },
  ): Promise<{ accountId: string | null; contactId: string | null; projectId: string | null }> {
    let accountId = input.accountId ?? null
    const contactId = input.contactId ?? null
    const projectId = input.projectId ?? null

    if (contactId) {
      // #2671 — la borne d'espace est DANS la lecture, comme partout ailleurs
      // où un contact se lit par id (`account-entities.service.ts`,
      // `reply-feedback.service.ts`, `action-os.controller.ts`,
      // `copilot-card.service.ts`). Sans elle, le contrôle de périmètre plus bas
      // ne rattrapait le contact que lorsque le compte en était DÉDUIT : un
      // client qui envoyait SON compte et le contactId d'une autre ESN gardait
      // son compte (`accountId ?? contact.account_id`), passait le contrôle, et
      // écrivait une activité pointant le contact du concurrent — un oracle
      // d'existence sur tout le parc, en prime.
      const contact = await this.contacts.findOne({
        where: { id: contactId, ...workspaceScopeWhere(workspaceId) },
        select: ['id', 'account_id'],
      })
      if (!contact) throw new NotFoundException('Contact introuvable')
      accountId = accountId ?? contact.account_id
    }
    if (projectId) {
      const project = await this.projects.findOne({
        where: { id: projectId, workspace_id: workspaceId },
        select: ['id', 'account_id'],
      })
      if (!project) throw new NotFoundException('Projet introuvable')
      accountId = accountId ?? project.account_id
    }
    if (accountId) {
      const rows = await this.activities.manager.query<{ id: string }[]>(
        `SELECT id FROM accounts WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
        [accountId, workspaceId],
      )
      if (rows.length === 0) throw new NotFoundException('Compte introuvable')
    }
    if (!accountId && !contactId && !projectId) {
      throw new BadRequestException('Une activité doit être rattachée à un compte, un contact ou un projet')
    }
    return { accountId, contactId, projectId }
  }

  /**
   * La timeline d'un objet.
   *
   * Sur un COMPTE, on remonte aussi ce qui touche ses contacts : une timeline de
   * compte qui n'affiche que les activités rattachées au compte lui-même serait
   * vide dans le cas le plus courant — un e-mail est adressé à quelqu'un, pas à
   * une société.
   */
  async timeline(
    userId: string,
    scope: ActivityScope,
    entityId: string,
    options: { kind?: ActivityKind; limit?: number } = {},
  ): Promise<{ items: Activity[]; engagement: EngagementSummary }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const limit = Math.min(options.limit ?? TIMELINE_MAX, TIMELINE_MAX)

    const where: string[] = ['a.workspace_id = $1']
    const params: unknown[] = [workspaceId]

    if (scope === 'account') {
      params.push(entityId)
      where.push(
        `(a.account_id = $${params.length}
          OR a.contact_id IN (SELECT id FROM contacts WHERE account_id = $${params.length})
          OR a.project_id IN (SELECT id FROM opportunities WHERE account_id = $${params.length}))`,
      )
    } else if (scope === 'contact') {
      params.push(entityId)
      where.push(`a.contact_id = $${params.length}`)
    } else {
      params.push(entityId)
      where.push(`a.project_id = $${params.length}`)
    }

    if (options.kind) {
      params.push(options.kind)
      where.push(`a.kind = $${params.length}`)
    }

    params.push(limit)
    const rows = await this.activities.manager.query<ActivityEntity[]>(
      `SELECT a.* FROM activities a
        WHERE ${where.join(' AND ')}
        ORDER BY a.occurred_at DESC
        LIMIT $${params.length}`,
      params,
    )

    const items = await this.hydrate(rows, userId)
    return {
      items,
      // #2744.1 — LE COMPTEUR ET LE FILTRE « INTERACTIONS » LISENT LE MÊME
      // PRÉDICAT.
      //
      // `engagementSummary` comptait TOUTE activité (une tâche, une note, un
      // changement d'étape…) et le badge de l'en-tête affichait ce total sous
      // le mot « échange ». L'onglet Historique, lui, filtre « Interactions »
      // avec `INTERACTION_ACTIVITY_KINDS` (email/call/meeting/linkedin) — donc
      // un compte avec UNE tâche et ZÉRO échange affichait « 1 échange » en
      // tête pendant que le filtre rendait « Aucun échange de ce type ».
      // `INTERACTION_ACTIVITY_KINDS` est LA liste fermée qui répond déjà à
      // « ce compte est-il silencieux ? » (packages/contracts/src/schemas/activity.ts) ;
      // on la réutilise ici plutôt que d'en écrire une seconde version qui
      // finirait par diverger.
      engagement: engagementSummary(
        items
          .filter(item => (INTERACTION_ACTIVITY_KINDS as readonly ActivityKind[]).includes(item.kind))
          .map(item => ({ kind: item.kind, direction: item.direction, occurredAt: item.occurredAt })),
        new Date(),
      ),
    }
  }

  /**
   * #3903 — « sur les 90 derniers jours, chez qui puis-je relancer ? ». Pour
   * chaque compte ayant au moins une interaction (email/appel/réunion/
   * LinkedIn, jamais une tâche ou une note interne) dans la fenêtre : sa
   * DERNIÈRE interaction (date, sens, canal), le nombre de tentatives dans la
   * fenêtre, et la catégorie qu'elles dérivent (`classifyEngagement` — jamais
   * un second moteur, GA-26).
   *
   * `sinceIso` borne la fenêtre par le bas (inclusif) ; `occurred_at <=
   * now()` la borne par le haut — une relance PLANIFIÉE (rappel à venir,
   * `daysAgo` négatif au semis) n'a pas encore eu lieu, ce n'est jamais la
   * preuve d'un dernier échange. Les comptes supprimés ou fusionnés
   * (`status = 'deleted'`) sont exclus, même garde que `listAccountSignals`.
   * Une direction `internal` (note/tâche interne capturée en `meeting`)
   * n'est jamais la preuve d'un échange avec le client : seules
   * `inbound`/`outbound` comptent.
   */
  async engagementReport(workspaceId: string, sinceIso: string): Promise<EngagementReportRow[]> {
    const rows = await this.activities.manager.query<
      Array<{
        account_id: string
        company_name: string
        last_occurred_at: Date | string
        last_direction: 'inbound' | 'outbound'
        last_kind: string
        attempts: string
        consecutive_outbound_emails?: string | null
        open_crm_deals: string | null
        open_crm_deal_names: string[] | null
      }>
    >(
      `
      SELECT DISTINCT ON (a.account_id)
        a.account_id     AS account_id,
        acc.company_name AS company_name,
        a.occurred_at    AS last_occurred_at,
        a.direction      AS last_direction,
        a.kind           AS last_kind,
        (
          SELECT COUNT(*) FROM activities a2
          WHERE a2.account_id = a.account_id
            AND a2.workspace_id = $1
            AND a2.kind IN ${interactionActivityKindsSql()}
            AND a2.direction IN ('inbound', 'outbound')
            AND a2.occurred_at >= $2
            AND a2.occurred_at <= now()
        ) AS attempts,
        -- #3904 (décision Louis 09/10) — les e-mails sortants CONSÉCUTIFS en
        -- fin de fil : ceux postérieurs à toute autre interaction de la fenêtre.
        (
          SELECT COUNT(*) FROM activities a3
          WHERE a3.account_id = a.account_id
            AND a3.workspace_id = $1
            AND a3.kind = 'email' AND a3.direction = 'outbound'
            AND a3.occurred_at >= $2
            AND a3.occurred_at <= now()
            AND a3.occurred_at > COALESCE((
              SELECT MAX(a4.occurred_at) FROM activities a4
              WHERE a4.account_id = a.account_id
                AND a4.workspace_id = $1
                AND a4.kind IN ${interactionActivityKindsSql()}
                AND a4.direction IN ('inbound', 'outbound')
                AND a4.occurred_at >= $2
                AND a4.occurred_at <= now()
                AND NOT (a4.kind = 'email' AND a4.direction = 'outbound')
            ), '-infinity'::timestamptz)
        ) AS consecutive_outbound_emails,
        -- #3903 (lot M01) — les affaires OUVERTES du CRM rattachées à CE compte
        -- par la jointure #3918.a (id société / SIREN / domaine, jamais le nom).
        (
          SELECT COUNT(*) FROM crm_deal_facts f
          WHERE f.workspace_id = $1 AND f.account_id = a.account_id AND f.is_closed = false
        ) AS open_crm_deals,
        (
          SELECT array_agg(d.name) FROM (
            SELECT f.name FROM crm_deal_facts f
            WHERE f.workspace_id = $1 AND f.account_id = a.account_id AND f.is_closed = false AND f.name IS NOT NULL
            ORDER BY f.deal_created_at ASC NULLS LAST
            LIMIT 3
          ) d
        ) AS open_crm_deal_names
      FROM activities a
      JOIN accounts acc ON acc.id = a.account_id AND acc.status <> 'deleted'
      WHERE a.workspace_id = $1
        AND a.kind IN ${interactionActivityKindsSql()}
        AND a.direction IN ('inbound', 'outbound')
        AND a.occurred_at >= $2
        AND a.occurred_at <= now()
        AND a.account_id IS NOT NULL
      ORDER BY a.account_id, a.occurred_at DESC
      `,
      [workspaceId, sinceIso],
    )

    const now = new Date()
    return rows.map(row => {
      const openCrmDeals = Number(row.open_crm_deals ?? 0)
      return {
        accountId: row.account_id,
        companyName: row.company_name,
        lastOccurredAt: toIso(row.last_occurred_at),
        lastDirection: row.last_direction,
        lastKind: row.last_kind,
        attempts: Number(row.attempts),
        consecutiveOutboundEmails: Number(row.consecutive_outbound_emails ?? 0),
        openCrmDeals,
        openCrmDealNames: row.open_crm_deal_names ?? [],
        category: classifyEngagement(row.last_direction, daysSince(row.last_occurred_at, now), openCrmDeals),
      }
    })
  }

  /**
   * #3904 — DÉCISION LOUIS 09/10 : « proche de signer » = une opportunité au
   * stade proposition OU négociation, lue dans Bellum (`opportunities`) ET
   * dans le cache CRM (`crm_deal_facts`, rattaché au compte par #3918.a —
   * jamais par le nom). Un stade déclaré, jamais une probabilité. Le stade CRM
   * est un texte libre : seuls ceux qui DISENT proposition/négociation sont
   * gardés (`isNearSigningCrmStage`), jamais devinés.
   */
  async nearSigning(workspaceId: string): Promise<{ bellum: NearSigningBellumRow[]; crm: NearSigningCrmRow[] }> {
    const [bellumRows, crmRows] = await Promise.all([
      this.activities.manager.query<
        Array<{ account_id: string; company_name: string; opportunity_id: string; label: string; stage: string }>
      >(
        `
        -- near-signing: bellum
        SELECT p.account_id AS account_id, acc.company_name AS company_name,
               p.id AS opportunity_id, p.label AS label, p.stage AS stage
        FROM opportunities p
        JOIN accounts acc ON acc.id = p.account_id AND acc.status <> 'deleted'
        WHERE p.workspace_id = $1
          AND ${projectStageInSql('p.stage', NEAR_SIGNING_STAGES)}
          AND p.closed_at IS NULL
          AND p.archived_at IS NULL
        ORDER BY p.stage_entered_at DESC
        `,
        [workspaceId],
      ),
      this.activities.manager.query<
        Array<{
          account_id: string
          company_name: string
          name: string | null
          stage: string | null
          stage_label: string | null
        }>
      >(
        `
        -- near-signing: crm
        SELECT f.account_id AS account_id, acc.company_name AS company_name,
               f.name AS name, f.stage AS stage, f.stage_label AS stage_label
        FROM crm_deal_facts f
        JOIN accounts acc ON acc.id = f.account_id AND acc.status <> 'deleted'
        WHERE f.workspace_id = $1 AND f.is_closed = false AND f.account_id IS NOT NULL
        ORDER BY f.deal_created_at DESC NULLS LAST
        `,
        [workspaceId],
      ),
    ])
    return {
      bellum: bellumRows
        .filter((row): row is typeof row & { stage: NearSigningBellumRow['stage'] } =>
          (BELLUM_NEAR_SIGNING_STAGES as readonly string[]).includes(row.stage),
        )
        .map(row => ({
          accountId: row.account_id,
          companyName: row.company_name,
          opportunityId: row.opportunity_id,
          label: row.label,
          stage: row.stage,
        })),
      crm: crmRows
        .filter(row => isNearSigningCrmStage(row.stage, row.stage_label))
        .map(row => ({
          accountId: row.account_id,
          companyName: row.company_name,
          dealName: row.name,
          stageLabel: row.stage_label ?? row.stage,
        })),
    }
  }

  /**
   * #3903 (lot M01, 09/10/2026) — l'espace a-t-il un cache CRM d'affaires
   * (`crm_deal_facts`) ? Sans aucune ligne, « deal jamais closé » n'est PAS
   * évalué (aucun CRM lu) : le bilan le nomme dans `notEvaluated` plutôt que
   * de laisser lire « aucun deal ouvert ».
   */
  async hasCrmDealCache(workspaceId: string): Promise<boolean> {
    const rows = await this.activities.manager.query<Array<{ one: number }>>(
      `SELECT 1 AS one FROM crm_deal_facts WHERE workspace_id = $1 LIMIT 1`,
      [workspaceId],
    )
    return rows.length > 0
  }

  /**
   * #3903 — quels CANAUX d'interaction ont au moins une ligne dans cette
   * fenêtre, pour TOUT l'espace. Sert à nommer une source non lue plutôt que
   * de laisser un bilan vide se lire « rien à relancer » : un canal absent
   * ICI peut vouloir dire « non branché » (mailbox jamais connectée) aussi
   * bien que « rien reçu par ce canal » — le bilan NOMME le canal, jamais la
   * raison qu'il ne peut pas connaître depuis cette seule table.
   */
  async observedInteractionKinds(workspaceId: string, sinceIso: string): Promise<ActivityKind[]> {
    const rows = await this.activities.manager.query<Array<{ kind: ActivityKind }>>(
      `
      SELECT DISTINCT kind FROM activities
      WHERE workspace_id = $1
        AND kind IN ${interactionActivityKindsSql()}
        AND direction IN ('inbound', 'outbound')
        AND occurred_at >= $2
        AND occurred_at <= now()
      `,
      [workspaceId, sinceIso],
    )
    return rows.map(row => row.kind)
  }

  /**
   * Ajoute aux lignes ce qui ne s'y trouve pas : les participants et le nom de
   * l'auteur. Deux requêtes de plus pour tout le lot, jamais une par ligne — une
   * timeline de 200 lignes en ferait 400.
   */
  private async hydrate(rows: readonly ActivityEntity[], viewerId: string): Promise<Activity[]> {
    if (rows.length === 0) return []
    const ids = rows.map(row => row.id)

    const [participantRows, authorRows] = await Promise.all([
      this.participants.find({ where: { activity_id: In(ids) } }),
      this.authorNames(rows),
    ])

    const byActivity = new Map<string, ActivityParticipant[]>()
    for (const participant of participantRows) {
      const bucket = byActivity.get(participant.activity_id) ?? []
      bucket.push({
        handle: participant.handle,
        displayName: participant.display_name,
        contactId: participant.contact_id,
        isSelf: participant.is_self,
      })
      byActivity.set(participant.activity_id, bucket)
    }

    return rows.map(row => {
      /**
       * Le CORPS ne sort qu'à son auteur (décision D65 du 22/08).
       *
       * ─────────────────────────────────────────────────────────────────────
       * CE QUI SE PASSAIT AVANT
       * ─────────────────────────────────────────────────────────────────────
       * La timeline est scopée à l'ESPACE, et elle rendait `body` tel quel.
       * N'importe quel membre lisait donc le texte intégral des messages de
       * n'importe quel collègue — sans permission, sans trace, et sur un écran
       * qu'on ouvre par réflexe avant un rendez-vous.
       *
       * Ce n'était pas une porte laissée ouverte par choix : le 21/08, la
       * lecture croisée des BOÎTES avait été fermée (`personal-connection.ts`),
       * et la timeline recopiait le même contenu par l'autre bout.
       *
       * Tout le RESTE est conservé — canal, objet, date, verdict, auteur,
       * participants. « Qui a relancé ce client, quand et par quel canal » est
       * précisément ce qu'un responsable doit voir ; le texte du message ne
       * l'est pas.
       *
       * `row.user_id === null` (un échange sans auteur identifié côté Bellum)
       * est traité comme « pas le mien » : en cas de doute, on masque.
       */
      const own = row.user_id != null && row.user_id === viewerId
      const redacted = !own && row.body != null && row.body.length > 0
      return {
        id: row.id,
        kind: row.kind as ActivityKind,
        source: row.source as Activity['source'],
        direction: row.direction as Activity['direction'],
        subject: row.subject,
        body: own ? row.body : null,
        bodyTruncated: own ? row.body_truncated : false,
        bodyRedacted: redacted,
        occurredAt: iso(row.occurred_at) ?? new Date(0).toISOString(),
        durationSeconds: row.duration_seconds,
        accountId: row.account_id,
        contactId: row.contact_id,
        projectId: row.project_id,
        linkReason: row.link_reason as Activity['linkReason'],
        userId: row.user_id,
        authorName: row.user_id ? (authorRows.get(row.user_id) ?? null) : null,
        participants: byActivity.get(row.id) ?? [],
        externalId: row.external_id,
        /**
         * ⚠️ Le canal et le verdict sont RELUS ici depuis le 28/08/2026.
         *
         * Ils étaient écrits à l'insertion (l. 95 et 120) et jamais rendus : le
         * commentaire quinze lignes plus haut promettait « canal, objet, date,
         * verdict » pendant que l'objet retourné n'en portait aucun des deux.
         * `activitySchema` les déclare `nullish`, donc l'omission passait la
         * validation en silence — colonnes écrites, jamais relues, le défaut
         * n°1 de ce dépôt sous sa forme la plus discrète.
         *
         * Le cast est nécessaire : la ligne SQL brute rend des `string`.
         */
        channel: (row.channel as Activity['channel']) ?? null,
        verdict: (row.verdict as Activity['verdict']) ?? null,
        // Même leçon que `channel` et `verdict` juste au-dessus : une colonne
        // écrite et jamais RELUE ici serait invisible à `activitySchema` (le
        // champ est `nullish`, donc l'omission passerait la validation en
        // silence) et se lirait « non renseignée » même sur une ligne qui la
        // porte.
        outcome: (row.call_outcome as Activity['outcome']) ?? null,
        // #2377.1/.4/.6 — même règle de confidentialité que `body` (D65) : le
        // debrief d'un appel PORTE la même matière (fait/besoin/objection),
        // il ne s'expose pas à un collègue qui n'en est pas l'auteur.
        callDebrief: own ? ((row.call_debrief as Activity['callDebrief']) ?? null) : null,
        externalUrl: row.external_url,
        // Retombe sur la date de l'événement quand `created_at` n'est pas encore
        // rempli — un `save()` qui vient d'écrire ne recharge pas toujours ses
        // colonnes par défaut, et rendre 500 APRÈS avoir committé la ligne serait
        // la pire des réponses possibles.
        createdAt: iso(row.created_at) ?? iso(row.occurred_at) ?? new Date().toISOString(),
      }
    })
  }

  private async authorNames(rows: readonly ActivityEntity[]): Promise<Map<string, string | null>> {
    const userIds = [...new Set(rows.map(row => row.user_id).filter((id): id is string => Boolean(id)))]
    if (userIds.length === 0) return new Map()
    try {
      const profiles = await this.dataSource.query<
        { user_id: string; first_name: string | null; last_name: string | null; email: string | null }[]
      >(`SELECT user_id, first_name, last_name, email FROM profiles WHERE user_id = ANY($1)`, [userIds])
      return new Map(
        profiles.map(profile => {
          const full = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim()
          return [profile.user_id, full || profile.email || null] as const
        }),
      )
    } catch (error) {
      // Le nom d'auteur est un confort : son absence affiche « Auteur inconnu »,
      // elle ne doit pas faire tomber la timeline qu'on ouvre avant un rendez-vous.
      this.logger.warn(`Activity author names unavailable: ${(error as Error).message}`)
      return new Map()
    }
  }
}

/**
 * ISO-8601 d'une date réelle, ou `null`. Une date illisible ne devient JAMAIS
 * maintenant : la dater faussement casserait l'ordre, seule promesse de la
 * timeline.
 */
function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
