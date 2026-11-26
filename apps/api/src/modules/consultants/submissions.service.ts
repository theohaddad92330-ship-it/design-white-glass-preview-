import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  buildSubmissionPreview,
  CLOSED_SUBMISSION_STAGES,
  DEFAULT_FEEDBACK_REUSE_SCOPE,
  canTransition,
  canTransitionSubstatus,
  deriveSubstatusFromStage,
  plannedMarginCents,
  submissionFunnel,
  SUBSTATUS_TO_STAGE,
  timelineSystemSubject,
  type AdvanceSubmissionInput,
  type AdvanceSubstatusInput,
  type CreateSubmissionInput,
  type Interview,
  type RecordConsultantFeedbackInput,
  type RecordFeedbackInput,
  type RecordInterviewOutcomeInput,
  type RecordSubmissionDetailsInput,
  type RecordSubmissionNextActionInput,
  type ScheduleInterviewInput,
  type Submission,
  type SubmissionConsultantFeedback,
  type SubmissionFeedback,
  type SubmissionFunnel,
  type SubmissionPreview,
  type SubmissionStage,
  type SubmissionSubstatus,
  type SubmissionTimelineEvent,
} from '@bellum/contracts'
import { presentationReadiness } from './matching/presentation-readiness'
import { InterviewEntity } from '../../database/entities/interview.entity'
import { SubmissionConsultantFeedbackEntity } from '../../database/entities/submission-consultant-feedback.entity'
import { SubmissionFeedbackEntity } from '../../database/entities/submission-feedback.entity'
import { SubmissionEntity } from '../../database/entities/submission.entity'
import { ActivitiesService } from '../activities/activities.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { CommercialTransitionsService } from '../commercial-transitions/commercial-transitions.service'

type SubmissionRow = SubmissionEntity & {
  project_label: string | null
  account_id: string | null
  account_name: string | null
  need_role: string | null
  consultant_name: string | null
  consultant_title?: string | null
  owner_first: string | null
  owner_last: string | null
  owner_email: string | null
  // #2177.6 / .25 — le nom du contact destinataire, résolu à la lecture.
  recipient_contact_name: string | null
  // #2189.39 — le porteur de la prochaine action, résolu à la lecture.
  next_action_owner_first: string | null
  next_action_owner_last: string | null
  next_action_owner_email: string | null
}

/**
 * #2189 — le contrôle « avant présentation » se pose au moment d'entrer dans
 * « à valider » : le dernier arrêt AVANT l'envoi, dans la même étape
 * (`shortlisted`) que ce que `advanceSubstatus` peut atteindre. `presented` /
 * `presented_manually` appartiennent à l'étape `submitted` : cette route ne
 * les atteint jamais (elle ne fait jamais bouger `stage`) — elles naissent de
 * `advance()`, qui dérive le sous-statut d'entrée sans repasser par ici.
 */
const PRESENTING_SUBSTATUSES = new Set<SubmissionSubstatus>(['to_validate'])

/**
 * #3544.5 — les colonnes de la LISTE : tout sauf `cv_snapshot`. Le CV figé est
 * volumineux et la liste ne l'affiche pas ; le ramener pour 200 lignes faisait
 * durer le « Chargement… » de Positionnements. Il se lit sur le positionnement
 * (`readOne`, `s.*`), jamais deviné ici : la liste le rend `null`.
 */
const LIST_COLUMNS = `s.id, s.workspace_id, s.project_id, s.need_id, s.consultant_id, s.stage, s.substatus,
         s.stage_entered_at, s.submitted_at, s.pushable_score, s.first_feedback_at, s.closed_at,
         s.outcome_reason, s.outcome_detail, s.proposed_rate_cents, s.planned_days, s.daily_cost_cents,
         NULL::text AS cv_snapshot,
         s.owner_id, s.recipient_contact_id, s.channel, s.message, s.availability, s.conditions,
         s.consultant_agreement, s.consultant_agreement_date, s.next_action_label,
         s.next_action_due_at, s.next_action_owner_id, s.created_at, s.updated_at`

const selectSubmission = (columns: string) => `
  SELECT ${columns}, o.label AS project_label, o.account_id, a.company_name AS account_name,
         n.title AS need_role, c.full_name AS consultant_name, c.title AS consultant_title,
         p.first_name AS owner_first, p.last_name AS owner_last, p.email AS owner_email,
         rc.full_name AS recipient_contact_name,
         np.first_name AS next_action_owner_first, np.last_name AS next_action_owner_last,
         np.email AS next_action_owner_email
    FROM submissions s
    LEFT JOIN opportunities o ON o.id = s.project_id
    LEFT JOIN accounts a ON a.id = o.account_id
    LEFT JOIN project_needs n ON n.id = s.need_id
    LEFT JOIN consultants c ON c.id = s.consultant_id
    LEFT JOIN profiles p ON p.user_id = s.owner_id
    LEFT JOIN contacts rc ON rc.id = s.recipient_contact_id
    LEFT JOIN profiles np ON np.user_id = s.next_action_owner_id`

const SELECT_SUBMISSION = selectSubmission('s.*')
const SELECT_SUBMISSION_LIST = selectSubmission(LIST_COLUMNS)

/**
 * Les POSITIONNEMENTS — ce qui part chez le client, et ce qu'il en dit.
 *
 * Quatre propriétés, chacune contre une erreur qui coûte un compte :
 *
 * 1. **Les transitions sont une machine fermée.** Un profil ne repart pas de
 *    `rejected` : effacer un refus client sans trace, c'est repousser la même
 *    personne au même endroit.
 * 2. **`submitted_at` n'est posé qu'une fois**, au premier envoi réel. Le
 *    réécrire à chaque changement d'étape ferait fondre les délais mesurés.
 * 3. **Le CV envoyé est FIGÉ** à l'envoi. Le CV du vivier continue d'évoluer ;
 *    sans copie, on ne sait plus ce que le client a lu.
 * 4. **Chaque étape laisse une ACTIVITÉ** sur le compte, sous une clé stable.
 *    L'historique d'un compte sans ses positionnements raconte la moitié de
 *    l'histoire.
 */
@Injectable()
export class SubmissionsService {
  private readonly logger = new Logger(SubmissionsService.name)

  constructor(
    @InjectRepository(SubmissionEntity) private readonly submissions: Repository<SubmissionEntity>,
    @InjectRepository(InterviewEntity) private readonly interviews: Repository<InterviewEntity>,
    @InjectRepository(SubmissionFeedbackEntity)
    private readonly feedback: Repository<SubmissionFeedbackEntity>,
    @InjectRepository(SubmissionConsultantFeedbackEntity)
    private readonly consultantFeedback: Repository<SubmissionConsultantFeedbackEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly commercialTransitions: CommercialTransitionsService,
    @Optional() private readonly activities?: ActivitiesService,
  ) {}

  async list(
    userId: string,
    filters: { projectId?: string; consultantId?: string; stage?: SubmissionStage } = {},
  ): Promise<{ items: Submission[]; funnel: SubmissionFunnel }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const where: string[] = ['s.workspace_id = $1']
    const params: unknown[] = [workspaceId]

    if (filters.projectId) {
      params.push(filters.projectId)
      where.push(`s.project_id = $${params.length}`)
    }
    if (filters.consultantId) {
      params.push(filters.consultantId)
      where.push(`s.consultant_id = $${params.length}`)
    }
    if (filters.stage) {
      params.push(filters.stage)
      where.push(`s.stage = $${params.length}`)
    }

    const rows = await this.submissions.manager.query<SubmissionRow[]>(
      `${SELECT_SUBMISSION_LIST} WHERE ${where.join(' AND ')} ORDER BY s.updated_at DESC LIMIT 200`,
      params,
    )
    const items = rows.map(toWire)
    return {
      items,
      funnel: submissionFunnel(
        items.map(item => ({
          stage: item.stage,
          submittedAt: item.submittedAt,
          firstFeedbackAt: item.firstFeedbackAt,
          outcomeReason: item.outcomeReason,
        })),
      ),
    }
  }

  /**
   * #2953 (#2193.48) — UN positionnement, par son id : la fiche « Ce que
   * BellumAI sait déjà » (#2973) et le dossier de mission (`submission_id`)
   * y renvoient tous deux, sans page de destination avant ce point. Même
   * lecture que les six autres appelants de `readOne` ci-dessous — pas une
   * seconde requête.
   */
  async get(userId: string, submissionId: string): Promise<Submission> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return this.readOne(submissionId, workspaceId)
  }

  /**
   * Positionne un talent.
   *
   * Un doublon est refusé AVEC sa raison : deux fois la même personne sur le
   * même rôle se lit chez le client comme deux candidatures, et c'est lui qui
   * s'en aperçoit.
   */
  async create(userId: string, input: CreateSubmissionInput): Promise<Submission> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await this.assertProject(input.projectId, workspaceId)
    await this.assertConsultant(input.consultantId, workspaceId)

    const now = new Date()
    const rows = await this.submissions.manager.query<{ id: string }[]>(
      `INSERT INTO submissions (
         workspace_id, project_id, need_id, consultant_id, stage, substatus, stage_entered_at,
         submitted_at, proposed_rate_cents, owner_id, planned_days, daily_cost_cents
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
         -- #4192 — coût absent : pré-rempli depuis le coût du talent (NULL s'il n'en a pas, jamais 0).
         COALESCE($12::bigint, (SELECT cost_rate_cents FROM consultants WHERE workspace_id = $1 AND id = $4)))
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        workspaceId,
        input.projectId,
        input.needId ?? null,
        input.consultantId,
        input.stage,
        // #2335.1 — le sous-statut d'entrée de l'étape choisie à la création.
        deriveSubstatusFromStage(input.stage, null),
        now,
        // `submitted_at` n'existe que si le CV part VRAIMENT dès la création.
        input.stage === 'submitted' ? now : null,
        input.proposedRateCents,
        userId,
        input.plannedDays ?? null,
        input.dailyCostCents ?? null,
      ],
    )
    const id = rows[0]?.id
    if (!id) {
      throw new BadRequestException('Ce profil est déjà positionné sur ce rôle — deux fois la même personne se voit.')
    }

    const submission = await this.readOne(id, workspaceId)
    if (input.stage === 'submitted') await this.trace(workspaceId, userId, submission, 'submitted')

    // #2339.1-.13 (épopée #2795) — le POSITIONNEMENT entre dans le journal
    // besoin→shortlist→positionnement→mission (#2320.23) dès sa création :
    // dernier des quatre sujets déclarés par ce chantier à n'avoir aucun
    // appelant (need et shortlist l'avaient déjà, mission aussi désormais).
    await this.commercialTransitions.record({
      workspaceId,
      subjectType: 'submission',
      subjectId: submission.id,
      fromState: null,
      toState: submission.stage,
      actorId: userId,
      proof: null,
    })
    return submission
  }

  /**
   * Fait avancer un positionnement.
   *
   * La transition est vérifiée contre la machine fermée du contrat, et le refus
   * NOMME l'étape d'origine : « impossible depuis “refusé” » se comprend, « 400 »
   * non.
   */
  async advance(userId: string, submissionId: string, input: AdvanceSubmissionInput): Promise<Submission> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const current = await this.submissions.findOne({ where: { id: submissionId, workspace_id: workspaceId } })
    if (!current) throw new NotFoundException('Positionnement introuvable')

    const from = current.stage as SubmissionStage
    if (!canTransition(from, input.stage)) {
      throw new BadRequestException(
        `Passage impossible de « ${from} » à « ${input.stage} » : un refus client ne se réécrit pas en silence.`,
      )
    }

    const now = new Date()
    current.stage = input.stage
    // #2335.1 — le sous-statut suit l'étape : c'est le niveau de détail qui
    // s'affiche sur la fiche, et le point de départ de la timeline (#2335.3).
    current.substatus = deriveSubstatusFromStage(input.stage, input.outcomeReason ?? null)
    current.stage_entered_at = now
    // Posé UNE SEULE FOIS : le réécrire ferait fondre tous les délais mesurés.
    if (input.stage === 'submitted' && !current.submitted_at) current.submitted_at = now
    if (CLOSED_SUBMISSION_STAGES.includes(input.stage)) {
      current.closed_at = now
      current.outcome_reason = input.outcomeReason ?? null
      current.outcome_detail = input.outcomeDetail ?? null
      // Une clôture EST un retour — sauf quand le motif dit justement qu'il n'y
      // en a jamais eu. Sans cette exception, « sans retour » compterait comme
      // un retour instantané et écraserait la latence médiane.
      if (!current.first_feedback_at && input.outcomeReason !== 'no_feedback') current.first_feedback_at = now
    } else {
      // Rouvrir depuis un retrait efface la clôture : « à envoyer » avec une
      // date de clôture est un état impossible.
      current.closed_at = null
      current.outcome_reason = null
      current.outcome_detail = null
    }
    if (input.proposedRateCents !== undefined) {
      current.proposed_rate_cents = input.proposedRateCents
    }
    if (input.plannedDays !== undefined) current.planned_days = input.plannedDays
    if (input.dailyCostCents !== undefined) current.daily_cost_cents = input.dailyCostCents
    if (input.cvSnapshot !== undefined) current.cv_snapshot = input.cvSnapshot

    await this.submissions.save(current)
    const submission = await this.readOne(submissionId, workspaceId)
    await this.trace(workspaceId, userId, submission, input.stage)

    // #2339.1-.13 (épopée #2795) — même porte que la création : chaque
    // avancée est déjà passée par la machine fermée de `canTransition`
    // ci-dessus, ce service n'ENREGISTRE que ce qui a été décidé.
    await this.commercialTransitions.record({
      workspaceId,
      subjectType: 'submission',
      subjectId: submission.id,
      fromState: from,
      toState: input.stage,
      actorId: userId,
      proof: null,
    })
    return submission
  }

  /**
   * #2177.11 / .12 / .13 / .15 / .20 / .21 — fait avancer le SOUS-statut,
   * sans toucher `stage`.
   *
   * Les seize sous-statuts existaient depuis #2335.1, posés une seule fois à
   * l'ENTRÉE de chaque étape (`deriveSubstatusFromStage`) — rien ne les
   * faisait avancer ensuite (« accord consultant attendu » → « prêt à
   * présenter » → « à valider »…). `null` reste refusé, même raison que
   * `substatus` à la création : une ligne sans sous-statut n'a rien à partir
   * de quoi avancer, et lui en inventer un serait une déclaration qui n'a pas
   * eu lieu.
   *
   * ⚠️ Cantonné à la MÊME étape (`SUBSTATUS_TO_STAGE[from] === … [to]`) : le
   * contrat autorise des sous-statuts qui retombent sur une autre étape, mais
   * cette route ne fait jamais bouger `stage` — la laisser sauter d'étape
   * ferait mentir le badge d'étape à côté du badge de sous-statut (ex. « CV
   * envoyé » avec un sous-statut d'entretien).
   */
  async advanceSubstatus(userId: string, submissionId: string, input: AdvanceSubstatusInput): Promise<Submission> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const current = await this.submissions.findOne({ where: { id: submissionId, workspace_id: workspaceId } })
    if (!current) throw new NotFoundException('Positionnement introuvable')

    const from = current.substatus as SubmissionSubstatus | null
    if (!from) {
      throw new BadRequestException('Ce positionnement n’a pas encore de sous-statut posé — rien à faire avancer.')
    }
    if (!canTransitionSubstatus(from, input.substatus)) {
      throw new BadRequestException(`Passage impossible de « ${from} » à « ${input.substatus} ».`)
    }
    if (SUBSTATUS_TO_STAGE[from] !== SUBSTATUS_TO_STAGE[input.substatus]) {
      throw new BadRequestException(
        `« ${input.substatus} » appartient à une autre étape : cette route ne fait jamais bouger l'étape.`,
      )
    }

    // #2189.1/.4/.5/.6/.7/.9 — le contrôle « avant présentation » se pose au
    // dernier arrêt avant l'envoi (« à valider »). Les warnings sont
    // journalisés, jamais silencieux ; seul le refus explicite du consultant
    // bloque le passage.
    if (PRESENTING_SUBSTATUSES.has(input.substatus)) {
      const readiness = presentationReadiness(await this.presentationContext(current, workspaceId))
      if (readiness.blocked) {
        throw new BadRequestException(
          readiness.checks.find(c => c.level === 'blocking')?.label ?? 'présentation refusée',
        )
      }
      const warnings = readiness.checks.filter(c => c.level === 'warning')
      if (warnings.length > 0) {
        this.logger.warn('Présentation avec réserves', {
          submissionId,
          target: input.substatus,
          warnings: warnings.map(w => w.label),
        })
      }
    }

    current.substatus = input.substatus
    await this.submissions.save(current)
    return this.readOne(submissionId, workspaceId)
  }

  /** Le contexte du contrôle « avant présentation » (#2189), lu au moment où
   *  il compte — pas mis en cache, pas recalculé d'avance. */
  private async presentationContext(
    current: SubmissionEntity,
    workspaceId: string,
  ): Promise<Parameters<typeof presentationReadiness>[0]> {
    const rows = await this.submissions.manager.query<
      {
        account_name: string | null
        need_status: string | null
        need_role: string | null
        consultant_restrictions: string | null
        cv_version_status: string | null
      }[]
    >(
      `SELECT a.company_name AS account_name, n.status AS need_status, n.title AS need_role,
              c.consent_restrictions AS consultant_restrictions, cv.status AS cv_version_status
         FROM submissions s
         LEFT JOIN opportunities o ON o.id = s.project_id
         LEFT JOIN accounts a ON a.id = o.account_id
         LEFT JOIN project_needs n ON n.id = s.need_id
         LEFT JOIN consultants c ON c.id = s.consultant_id
         LEFT JOIN LATERAL (
           SELECT status FROM cv_versions
            WHERE consultant_id = s.consultant_id AND (need_id = s.need_id OR s.need_id IS NULL)
            ORDER BY generated_at DESC
            LIMIT 1
         ) cv ON true
        WHERE s.id = $1 AND s.workspace_id = $2`,
      [current.id, workspaceId],
    )
    const row = rows[0]
    return {
      consultantAgreement: current.consultant_agreement,
      cvVersionStatus: row?.cv_version_status ?? null,
      accountName: row?.account_name ?? null,
      needStatus: row?.need_status ?? null,
      needRole: row?.need_role ?? null,
      recipientContactId: current.recipient_contact_id,
      consultantRestrictions: row?.consultant_restrictions ?? null,
    }
  }

  /**
   * #2177.6 / .8 / .24 / .25 / .28 / .30 — le DÉTAIL d'un positionnement :
   * destinataire, canal, message préparé, disponibilité annoncée, conditions.
   *
   * Chaque champ n'est touché que s'il est PRÉSENT dans l'entrée (`!==
   * undefined`) : un client qui n'envoie que `channel` ne doit jamais effacer
   * `message` posé la veille — même garde que `advance()` pour `proposedRateCents`.
   */
  async recordDetails(userId: string, submissionId: string, input: RecordSubmissionDetailsInput): Promise<Submission> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const current = await this.assertSubmission(submissionId, workspaceId)

    if (input.recipientContactId !== undefined && input.recipientContactId !== null) {
      await this.assertRecipientContact(input.recipientContactId, submissionId, workspaceId)
    }

    if (input.recipientContactId !== undefined) current.recipient_contact_id = input.recipientContactId
    if (input.channel !== undefined) current.channel = input.channel
    if (input.message !== undefined) current.message = input.message
    if (input.availability !== undefined) current.availability = input.availability
    if (input.conditions !== undefined) current.conditions = input.conditions
    if (input.consultantAgreement !== undefined) current.consultant_agreement = input.consultantAgreement
    if (input.consultantAgreementDate !== undefined) current.consultant_agreement_date = input.consultantAgreementDate

    await this.submissions.save(current)
    return this.readOne(submissionId, workspaceId)
  }

  /**
   * #2189.39 — la prochaine action de CE positionnement, toujours datée et
   * attribuée : le contrat (`recordSubmissionNextActionSchema`) refuse déjà
   * un champ posé sans les deux autres, cette route ne fait que persister les
   * trois ensemble (ou les trois `null` pour l'effacer).
   */
  async recordNextAction(
    userId: string,
    submissionId: string,
    input: RecordSubmissionNextActionInput,
  ): Promise<Submission> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const current = await this.assertSubmission(submissionId, workspaceId)

    current.next_action_label = input.label
    current.next_action_due_at = input.dueAt
    current.next_action_owner_id = input.ownerId

    await this.submissions.save(current)
    return this.readOne(submissionId, workspaceId)
  }

  /**
   * #2189.10-.16 — l'APERÇU d'une présentation : ce qui se lit déjà dans
   * `SubmissionDetailsDialog` (destinataire, message, canal, conditions) plus
   * ce qui manquait entièrement (objet, CV réellement figé, source des
   * arguments). `cvCapturedAt` vient de la DERNIÈRE version de CV retrouvée
   * pour ce besoin — jamais devinée si aucune ne l'est.
   */
  async preview(userId: string, submissionId: string): Promise<SubmissionPreview> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const submission = await this.readOne(submissionId, workspaceId)
    const rows = await this.submissions.manager.query<{ generated_at: Date }[]>(
      `SELECT generated_at FROM cv_versions
        WHERE consultant_id = $1 AND ($2::uuid IS NULL OR need_id = $2)
        ORDER BY generated_at DESC
        LIMIT 1`,
      [submission.consultantId, submission.needId],
    )
    const cvCapturedAt = iso(rows[0]?.generated_at ?? null)
    return buildSubmissionPreview(submission, cvCapturedAt)
  }

  // ─────────────────────────────── entretiens ──────────────────────────────

  async listInterviews(userId: string, submissionId: string): Promise<Interview[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await this.assertSubmission(submissionId, workspaceId)
    const rows = await this.interviews.find({
      where: { submission_id: submissionId },
      order: { scheduled_at: 'DESC' },
    })
    return rows.map(toInterviewWire)
  }

  async scheduleInterview(userId: string, submissionId: string, input: ScheduleInterviewInput): Promise<Interview> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const submission = await this.assertSubmission(submissionId, workspaceId)

    const saved = await this.interviews.save(
      this.interviews.create({
        submission_id: submissionId,
        workspace_id: workspaceId,
        scheduled_at: new Date(input.scheduledAt),
        mode: input.mode,
        client_attendees: input.clientAttendees,
        outcome: 'pending',
        notes: input.notes ?? null,
      }),
    )

    // Programmer un entretien fait AVANCER le positionnement — sinon l'écran
    // affiche « CV envoyé » alors qu'un rendez-vous est posé, et l'entonnoir
    // sous-compte les entretiens.
    if (submission.stage === 'submitted') {
      await this.advance(userId, submissionId, { stage: 'interview' })
    }
    return toInterviewWire(saved)
  }

  async recordInterviewOutcome(
    userId: string,
    submissionId: string,
    interviewId: string,
    input: RecordInterviewOutcomeInput,
  ): Promise<Interview> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await this.assertSubmission(submissionId, workspaceId)
    const interview = await this.interviews.findOne({ where: { id: interviewId, submission_id: submissionId } })
    if (!interview) throw new NotFoundException('Entretien introuvable')

    interview.outcome = input.outcome
    if (input.notes !== undefined) interview.notes = input.notes
    await this.interviews.save(interview)
    return toInterviewWire(interview)
  }

  /**
   * #2875/#3398 (BM) — appelé à la première ouverture du brief d'entretien
   * (`InterviewBriefDialog`). Posé une seule fois : une ré-ouverture ne
   * recule jamais la date, exactement comme `previous_seen_at`
   * (`laura-probe.service.ts`) ne se rembobine pas à chaque visite.
   */
  async markInterviewBriefViewed(userId: string, submissionId: string, interviewId: string): Promise<Interview> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await this.assertSubmission(submissionId, workspaceId)
    const interview = await this.interviews.findOne({ where: { id: interviewId, submission_id: submissionId } })
    if (!interview) throw new NotFoundException('Entretien introuvable')

    if (!interview.brief_viewed_at) {
      interview.brief_viewed_at = new Date()
      await this.interviews.save(interview)
    }
    return toInterviewWire(interview)
  }

  // ──────────────────────────────── retours ────────────────────────────────

  async listFeedback(userId: string, submissionId: string): Promise<SubmissionFeedback[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await this.assertSubmission(submissionId, workspaceId)
    return this.readFeedback(submissionId)
  }

  /**
   * Enregistre un retour client.
   *
   * Le premier retour DATE le positionnement (`first_feedback_at`) : c'est ce
   * qui rend mesurable « combien de temps le client met-il à répondre ». Posé
   * une seule fois — le second retour ne raccourcit pas le premier délai.
   */
  async recordFeedback(userId: string, submissionId: string, input: RecordFeedbackInput): Promise<SubmissionFeedback> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const submission = await this.assertSubmission(submissionId, workspaceId)

    await this.feedback.save(
      this.feedback.create({
        submission_id: submissionId,
        workspace_id: workspaceId,
        technical: input.technical,
        experience: input.experience,
        communication: input.communication,
        price: input.price,
        // #2335.4 — six axes de plus, additifs.
        seniority: input.seniority,
        context: input.context,
        availability: input.availability,
        location: input.location,
        timing: input.timing,
        other_axis: input.other,
        // #2178.29 — onzième axe, additif.
        personality: input.personality,
        verbatim: input.verbatim ?? null,
        // #2335.6 — note libre, jamais réécrite sur le profil consultant :
        // c'est CE qui garantit qu'aucune preuve n'est écrasée.
        learning: input.learning ?? null,
        // Toujours la portée la plus fermée : un retour se réutilise sur
        // décision, jamais par omission. Le `verbatim` ci-dessus est ce qu'un
        // client a répondu — il ne sort d'aucune façon de cet espace, quelle
        // que soit la portée (addendum Stelya §20.1, garde GA-47).
        reuse_scope: DEFAULT_FEEDBACK_REUSE_SCOPE,
        recorded_by: userId,
      }),
    )

    if (!submission.first_feedback_at) {
      submission.first_feedback_at = new Date()
      await this.submissions.save(submission)
    }

    const [latest] = await this.readFeedback(submissionId)
    if (!latest) throw new NotFoundException('Retour introuvable')
    return latest
  }

  // ──────────────────────────── retour consultant ───────────────────────────

  /**
   * #2335.5 — le retour du CONSULTANT, une table séparée du retour client
   * (`SubmissionFeedbackEntity`) : jamais lu par la même méthode, jamais rendu
   * dans le même bloc à l'écran.
   */
  async listConsultantFeedback(userId: string, submissionId: string): Promise<SubmissionConsultantFeedback[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await this.assertSubmission(submissionId, workspaceId)
    return this.readConsultantFeedback(submissionId)
  }

  async recordConsultantFeedback(
    userId: string,
    submissionId: string,
    input: RecordConsultantFeedbackInput,
  ): Promise<SubmissionConsultantFeedback> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await this.assertSubmission(submissionId, workspaceId)

    await this.consultantFeedback.save(
      this.consultantFeedback.create({
        submission_id: submissionId,
        workspace_id: workspaceId,
        interest: input.interest,
        understanding: input.understanding,
        manager: input.manager,
        mission: input.mission,
        conditions: input.conditions,
        concerns: input.concerns,
        availability: input.availability,
        decision: input.decision,
        verbatim: input.verbatim ?? null,
        recorded_by: userId,
      }),
    )

    const [latest] = await this.readConsultantFeedback(submissionId)
    if (!latest) throw new NotFoundException('Retour introuvable')
    return latest
  }

  private async readConsultantFeedback(submissionId: string): Promise<SubmissionConsultantFeedback[]> {
    const rows = await this.consultantFeedback.manager.query<
      (SubmissionConsultantFeedbackEntity & {
        first_name: string | null
        last_name: string | null
        email: string | null
      })[]
    >(
      `SELECT f.*, p.first_name, p.last_name, p.email
         FROM submission_consultant_feedback f
         LEFT JOIN profiles p ON p.user_id = f.recorded_by
        WHERE f.submission_id = $1
        ORDER BY f.created_at DESC`,
      [submissionId],
    )
    return rows.map(row => {
      const full = [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
      return {
        id: row.id,
        submissionId: row.submission_id,
        interest: row.interest as SubmissionConsultantFeedback['interest'],
        understanding: row.understanding as SubmissionConsultantFeedback['understanding'],
        manager: row.manager as SubmissionConsultantFeedback['manager'],
        mission: row.mission as SubmissionConsultantFeedback['mission'],
        conditions: row.conditions as SubmissionConsultantFeedback['conditions'],
        concerns: row.concerns as SubmissionConsultantFeedback['concerns'],
        availability: row.availability as SubmissionConsultantFeedback['availability'],
        decision: row.decision as SubmissionConsultantFeedback['decision'],
        verbatim: row.verbatim,
        recordedAt: iso(row.created_at) ?? new Date().toISOString(),
        recordedByName: full || row.email || null,
      }
    })
  }

  // ──────────────────────────────── timeline ────────────────────────────────

  /**
   * #2335.3 — chaque étape avec sa date, dans l'ordre où elle est arrivée.
   *
   * Lit `activities` sur le préfixe `submission:<id>:` déjà posé par
   * `trace()` — la même trace qu'utilise déjà le panneau « Historique » d'un
   * compte (`timelineEventTitle`, `apps/web/src/features/activities/model`).
   * Aucune nouvelle table : la donnée existait, seule la route qui la sert au
   * singulier manquait sur la fiche d'UN positionnement.
   */
  async listTimeline(userId: string, submissionId: string): Promise<SubmissionTimelineEvent[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await this.assertSubmission(submissionId, workspaceId)
    const rows = await this.submissions.manager.query<{ subject: string | null; occurred_at: Date }[]>(
      `SELECT subject, occurred_at
         FROM activities
        WHERE workspace_id = $1 AND external_id LIKE $2
        ORDER BY occurred_at ASC`,
      [workspaceId, `submission:${submissionId}:%`],
    )
    return rows.map(row => ({
      subject: row.subject,
      occurredAt: iso(row.occurred_at) ?? new Date().toISOString(),
    }))
  }

  /**
   * #2339.7 (épopée #2795) — LE positionnement RETENU d'un besoin, pour la
   * conversion en mission (`create_mission`). `null` quand ce n'est pas
   * exactement UN (aucun positionnement `accepted` sur ce besoin, ou
   * plusieurs — un headcount > 1 le permet, et alors AUCUN des deux n'est
   * « le » talent retenu) : même prudence que `soleNeedOf`
   * (`projects.controller.ts`), jamais un premier ou un dernier deviné.
   */
  async acceptedForNeed(workspaceId: string, needId: string): Promise<{ id: string; consultantId: string } | null> {
    const rows = await this.submissions.find({
      where: { workspace_id: workspaceId, need_id: needId, stage: 'accepted' },
      select: ['id', 'consultant_id'],
    })
    if (rows.length !== 1) return null
    const only = rows[0]
    if (!only) return null
    return { id: only.id, consultantId: only.consultant_id }
  }

  /**
   * #4192 — TOUS les positionnements retenus d'une affaire (une mission par
   * positionnement retenu). Contrairement à `acceptedForNeed`, plusieurs lignes
   * sont légitimes ici.
   */
  async acceptedForOpportunity(
    workspaceId: string,
    projectId: string,
  ): Promise<
    {
      id: string
      consultantId: string
      needId: string | null
      proposedRateCents: number | null
      dailyCostCents: number | null
      plannedDays: number | null
    }[]
  > {
    const rows = await this.submissions.find({
      where: { workspace_id: workspaceId, project_id: projectId, stage: 'accepted' },
      select: ['id', 'consultant_id', 'need_id', 'proposed_rate_cents', 'daily_cost_cents', 'planned_days'],
    })
    return rows.map(row => ({
      id: row.id,
      consultantId: row.consultant_id,
      needId: row.need_id,
      proposedRateCents: row.proposed_rate_cents == null ? null : Number(row.proposed_rate_cents),
      dailyCostCents: row.daily_cost_cents == null ? null : Number(row.daily_cost_cents),
      plannedDays: row.planned_days ?? null,
    }))
  }

  // ───────────────────────────────── socle ─────────────────────────────────

  private async readFeedback(submissionId: string): Promise<SubmissionFeedback[]> {
    const rows = await this.feedback.manager.query<
      (SubmissionFeedbackEntity & { first_name: string | null; last_name: string | null; email: string | null })[]
    >(
      `SELECT f.*, p.first_name, p.last_name, p.email
         FROM submission_feedback f
         LEFT JOIN profiles p ON p.user_id = f.recorded_by
        WHERE f.submission_id = $1
        ORDER BY f.created_at DESC`,
      [submissionId],
    )
    return rows.map(row => {
      const full = [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
      return {
        id: row.id,
        submissionId: row.submission_id,
        technical: row.technical as SubmissionFeedback['technical'],
        experience: row.experience as SubmissionFeedback['experience'],
        communication: row.communication as SubmissionFeedback['communication'],
        price: row.price as SubmissionFeedback['price'],
        seniority: row.seniority as SubmissionFeedback['seniority'],
        context: row.context as SubmissionFeedback['context'],
        availability: row.availability as SubmissionFeedback['availability'],
        location: row.location as SubmissionFeedback['location'],
        timing: row.timing as SubmissionFeedback['timing'],
        other: row.other_axis as SubmissionFeedback['other'],
        // #2178.29 — onzième axe, additif.
        personality: row.personality as SubmissionFeedback['personality'],
        verbatim: row.verbatim,
        learning: row.learning,
        recordedAt: iso(row.created_at) ?? new Date().toISOString(),
        recordedByName: full || row.email || null,
      }
    })
  }

  private async readOne(id: string, workspaceId: string): Promise<Submission> {
    const rows = await this.submissions.manager.query<SubmissionRow[]>(
      `${SELECT_SUBMISSION} WHERE s.id = $1 AND s.workspace_id = $2`,
      [id, workspaceId],
    )
    const row = rows[0]
    if (!row) throw new NotFoundException('Positionnement introuvable')
    return toWire(row)
  }

  private async assertSubmission(id: string, workspaceId: string): Promise<SubmissionEntity> {
    const found = await this.submissions.findOne({ where: { id, workspace_id: workspaceId } })
    if (!found) throw new NotFoundException('Positionnement introuvable')
    return found
  }

  private async assertProject(projectId: string, workspaceId: string): Promise<void> {
    const rows = await this.submissions.manager.query<{ id: string }[]>(
      `SELECT id FROM opportunities WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
      [projectId, workspaceId],
    )
    if (rows.length === 0) throw new NotFoundException('Projet introuvable')
  }

  private async assertConsultant(consultantId: string, workspaceId: string): Promise<void> {
    const rows = await this.submissions.manager.query<{ id: string }[]>(
      `SELECT id FROM consultants WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
      [consultantId, workspaceId],
    )
    if (rows.length === 0) throw new NotFoundException('Talent introuvable')
  }

  /**
   * #2177.6 / .25 — le destinataire doit appartenir au COMPTE du
   * positionnement : proposer un contact d'un autre client serait une
   * confusion de compte, pas un simple champ mal rempli.
   */
  private async assertRecipientContact(contactId: string, submissionId: string, workspaceId: string): Promise<void> {
    const rows = await this.submissions.manager.query<{ id: string }[]>(
      `SELECT c.id
         FROM contacts c
         JOIN submissions s ON s.id = $2
         JOIN opportunities o ON o.id = s.project_id
        WHERE c.id = $1 AND c.account_id = o.account_id AND s.workspace_id = $3
        LIMIT 1`,
      [contactId, submissionId, workspaceId],
    )
    if (rows.length === 0) {
      throw new BadRequestException('Ce contact n’appartient pas au compte de ce positionnement.')
    }
  }

  /**
   * Chaque étape laisse une trace dans l'historique du compte.
   *
   * Best-effort et sous clé STABLE (`submission:<id>:<étape>`) : rejouer la même
   * étape ne produit pas deux lignes, et rater la trace n'annule pas un
   * positionnement déjà enregistré.
   */
  private async trace(
    workspaceId: string,
    userId: string,
    submission: Submission,
    stage: SubmissionStage,
  ): Promise<void> {
    if (!this.activities || !submission.accountId) return
    try {
      await this.activities.ingest(workspaceId, userId, [
        {
          kind: 'task',
          source: 'system',
          direction: 'outbound',
          // #2124.68 — le nom lisible, puis la CLÉ d'étape, que l'écran traduit.
          subject: timelineSystemSubject(submission.consultantName ?? 'Profil', stage),
          body: submission.projectLabel,
          occurredAt: new Date().toISOString(),
          durationSeconds: null,
          accountId: submission.accountId,
          contactId: null,
          projectId: submission.projectId,
          linkReason: 'project_explicit',
          externalId: `submission:${submission.id}:${stage}`,
          externalUrl: null,
          participants: [],
        },
      ])
    } catch (error) {
      this.logger.warn(`Submission trace not recorded: ${(error as Error).message}`)
    }
  }
}

function toWire(row: SubmissionRow): Submission {
  const ownerFull = [row.owner_first, row.owner_last].filter(Boolean).join(' ').trim()
  const nextActionOwnerFull = [row.next_action_owner_first, row.next_action_owner_last].filter(Boolean).join(' ').trim()
  return {
    id: row.id,
    projectId: row.project_id,
    projectLabel: row.project_label,
    accountId: row.account_id,
    accountName: row.account_name,
    needId: row.need_id,
    needRole: row.need_role,
    consultantId: row.consultant_id,
    consultantName: row.consultant_name,
    consultantTitle: row.consultant_title?.trim() || null,
    stage: row.stage as SubmissionStage,
    substatus: row.substatus as Submission['substatus'],
    stageEnteredAt: iso(row.stage_entered_at) ?? new Date(0).toISOString(),
    submittedAt: iso(row.submitted_at),
    firstFeedbackAt: iso(row.first_feedback_at),
    closedAt: iso(row.closed_at),
    outcomeReason: row.outcome_reason as Submission['outcomeReason'],
    outcomeDetail: row.outcome_detail,
    // `bigint` traverse en CHAÎNE : le laisser tel quel enverrait `"45000"` au
    // client, qui l'afficherait comme un texte et refuserait de l'additionner.
    proposedRateCents: row.proposed_rate_cents === null ? null : Number(row.proposed_rate_cents),
    plannedDays: row.planned_days ?? null,
    dailyCostCents: row.daily_cost_cents == null ? null : Number(row.daily_cost_cents),
    plannedMarginCents: plannedMarginCents({
      proposedRateCents: row.proposed_rate_cents === null ? null : Number(row.proposed_rate_cents),
      dailyCostCents: row.daily_cost_cents == null ? null : Number(row.daily_cost_cents),
      plannedDays: row.planned_days ?? null,
    }),
    cvSnapshot: row.cv_snapshot,
    ownerId: row.owner_id,
    ownerName: ownerFull || row.owner_email || null,
    recipientContactId: row.recipient_contact_id,
    recipientContactName: row.recipient_contact_name,
    channel: row.channel as Submission['channel'],
    message: row.message,
    availability: row.availability,
    conditions: row.conditions,
    consultantAgreement: row.consultant_agreement,
    consultantAgreementDate: row.consultant_agreement_date,
    nextActionLabel: row.next_action_label,
    nextActionDueAt: row.next_action_due_at,
    nextActionOwnerId: row.next_action_owner_id,
    nextActionOwnerName: nextActionOwnerFull || row.next_action_owner_email || null,
    createdAt: iso(row.created_at) ?? new Date().toISOString(),
    updatedAt: iso(row.updated_at) ?? new Date().toISOString(),
  }
}

function toInterviewWire(row: InterviewEntity): Interview {
  return {
    id: row.id,
    submissionId: row.submission_id,
    scheduledAt: iso(row.scheduled_at) ?? new Date(0).toISOString(),
    mode: row.mode as Interview['mode'],
    clientAttendees: row.client_attendees ?? [],
    outcome: row.outcome as Interview['outcome'],
    notes: row.notes,
    createdAt: iso(row.created_at) ?? new Date().toISOString(),
    briefViewedAt: iso(row.brief_viewed_at),
  }
}

/** ISO d'une date réelle, ou `null`. Jamais « maintenant » par défaut. */
function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
