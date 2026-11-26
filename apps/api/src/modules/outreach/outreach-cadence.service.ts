import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import {
  blockingEnrollmentExclusions,
  evaluateEnrollmentExclusions,
  linkedinStepsToSkip,
  outreachMessageSpacingProblems,
  outreachOutcomesForKind,
  shiftDueAfterPause,
  vacationResumeDue,
  type OutreachEnrollmentExclusion,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { OutreachSequenceEntity } from '../../database/entities/outreach-sequence.entity'
import { OutreachSequenceStepEntity } from '../../database/entities/outreach-sequence-step.entity'
import { resolveRelationshipEvidence } from '../contacts/cadence-templates'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { workspaceGestureWhere, workspaceScopeWhere } from '../workspace/workspace-scoping'

/**
 * Lot L-B (#4165, épopée #4163) — les gestes et balayages du SOCLE multicanal
 * d'une séquence : issue déclarée d'une étape, « RDV pris », pause vacances,
 * saut LinkedIn, réordonnancement, exclusions à l'inscription.
 *
 * Aucun import de service voisin (GA-07) : le contrôleur, couche
 * d'orchestration, lui passe l'espace actif et le verdict RGPD. Il ne rend
 * jamais de DTO — le contrôleur relit la séquence par `OutreachService.get`.
 *
 * Toute mutation est PROPRIÉTAIRE STRICT (`user_id`) ; les lectures sont de
 * l'espace. Rien ici n'envoie quoi que ce soit : LinkedIn et l'appel restent
 * des gestes humains.
 */
@Injectable()
export class OutreachCadenceService {
  private readonly logger = new Logger(OutreachCadenceService.name)

  constructor(
    @InjectRepository(OutreachSequenceEntity)
    private readonly sequences: Repository<OutreachSequenceEntity>,
    @InjectRepository(OutreachSequenceStepEntity)
    private readonly steps: Repository<OutreachSequenceStepEntity>,
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /** #4804 — séquence de l'ESPACE de l'appelant (ou sa ligne ancienne), plus « propriétaire strict ». */
  private async loadOwned(userId: string, id: string): Promise<OutreachSequenceEntity> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const sequence = await this.sequences.findOne({
      where: workspaceGestureWhere<OutreachSequenceEntity>(workspaceId, userId, { id }),
    })
    if (!sequence) throw new NotFoundException('Séquence introuvable.')
    return sequence
  }

  private async journal(
    sequence: Pick<OutreachSequenceEntity, 'workspace_id' | 'id'>,
    userId: string,
    fromState: string,
    toState: string,
    actorKind: 'user' | 'system',
    cause: string,
  ): Promise<void> {
    await this.sequences.query(
      `INSERT INTO outreach_transitions
         (workspace_id, user_id, subject_kind, subject_id, from_state, to_state, actor, actor_kind, cause, result)
       VALUES ($1, $2, 'sequence', $3, $4, $5, $2, $6, $7, 'applied')`,
      [sequence.workspace_id, userId, sequence.id, fromState, toState, actorKind, cause],
    )
  }

  /* ------------------------------ issue déclarée ----------------------------- */

  /**
   * Déclare (ou efface, `null`) l'issue d'une étape : invitation LinkedIn
   * acceptée ou non, issue d'un appel. Un geste DÉCLARATIF — Bellum ne lit ni
   * LinkedIn ni le téléphone.
   */
  async declareOutcome(userId: string, sequenceId: string, stepId: string, outcome: string | null): Promise<void> {
    const sequence = await this.loadOwned(userId, sequenceId)
    const step = await this.steps.findOne({ where: { id: stepId, sequence_id: sequence.id } })
    if (!step) throw new NotFoundException('Étape introuvable dans cette séquence.')
    const allowed = outreachOutcomesForKind(step.kind)
    if (outcome !== null && !allowed.includes(outcome)) {
      throw new BadRequestException(
        allowed.length === 0
          ? 'Cette étape ne porte pas d’issue à déclarer.'
          : `Issue invalide pour cette étape (attendu : ${allowed.join(', ')}).`,
      )
    }
    const { outcome: _previous, ...rest } = step.payload ?? {}
    step.payload = outcome === null ? rest : { ...rest, outcome, outcome_at: new Date().toISOString() }
    await this.steps.save(step)
  }

  /* ---------------------------------- RDV pris ------------------------------- */

  /**
   * « RDV pris » : termine la séquence avec la cause `meeting_booked`, les
   * étapes restantes passent `skipped`. Depuis une étape, celle-ci est d'abord
   * marquée faite (le RDV est l'issue de CETTE touche). Le signal d'agenda
   * branché, lui, passe déjà par le statut du contact (`ContactsService`) :
   * ce geste est son pendant manuel, sans rien inventer.
   */
  async meetingBooked(userId: string, sequenceId: string, stepId?: string): Promise<void> {
    const sequence = await this.loadOwned(userId, sequenceId)
    if (sequence.status !== 'active' && sequence.status !== 'paused') {
      throw new BadRequestException(`La séquence est déjà « ${sequence.status} ».`)
    }
    if (stepId) {
      const step = await this.steps.findOne({ where: { id: stepId, sequence_id: sequence.id } })
      if (!step) throw new NotFoundException('Étape introuvable dans cette séquence.')
      if (step.status === 'pending') {
        step.status = 'done'
        step.done_at = new Date()
        await this.steps.save(step)
      }
    }
    const previous = sequence.status
    sequence.status = 'cancelled'
    sequence.vacation_paused_at = null
    sequence.vacation_until = null
    await this.sequences.save(sequence)
    await this.steps.update({ sequence_id: sequence.id, status: 'pending' }, { status: 'skipped' })
    await this.journal(sequence, userId, previous, 'cancelled', 'user', 'meeting_booked')
  }

  /* ------------------------------- pause vacances ---------------------------- */

  /** Met toutes les séquences ACTIVES de l'utilisateur en pause jusqu'à `until`. */
  async startVacation(userId: string, workspaceId: string, until: Date): Promise<number> {
    const now = new Date()
    if (until.getTime() <= now.getTime()) {
      throw new BadRequestException('La date de reprise doit être dans le futur.')
    }
    const active = await this.sequences.find({
      where: { user_id: userId, workspace_id: workspaceId, status: 'active' },
    })
    if (active.length === 0) return 0
    for (const sequence of active) {
      sequence.status = 'paused'
      sequence.vacation_paused_at = now
      sequence.vacation_until = until
    }
    await this.sequences.save(active)
    return active.length
  }

  /**
   * Reprend les séquences en PAUSE VACANCES parmi `sequences` : les échéances
   * restantes sont décalées de la durée de la pause (aucun rattrapage en
   * rafale). Une pause manuelle ou automatique n'est pas touchée. Rend le
   * nombre de séquences reprises.
   */
  async releaseVacation(sequences: OutreachSequenceEntity[]): Promise<number> {
    const now = new Date()
    let resumed = 0
    for (const sequence of sequences) {
      if (sequence.status !== 'paused' || !sequence.vacation_paused_at) continue
      const pausedAt = sequence.vacation_paused_at
      const pending = (await this.steps.find({ where: { sequence_id: sequence.id } })).filter(
        step => step.status === 'pending',
      )
      for (const step of pending) {
        step.due_at = shiftDueAfterPause(step.due_at, pausedAt, now, sequence.delay_unit ?? 'calendar_days')
      }
      if (pending.length > 0) await this.steps.save(pending)
      sequence.status = 'active'
      sequence.vacation_paused_at = null
      sequence.vacation_until = null
      await this.sequences.save(sequence)
      resumed += 1
    }
    return resumed
  }

  /** La séquence `id` de l'utilisateur si — et seulement si — elle est en PAUSE VACANCES (liste d'au plus un élément). */
  async ownedVacationPaused(userId: string, id: string): Promise<OutreachSequenceEntity[]> {
    const sequence = await this.loadOwned(userId, id)
    return sequence.status === 'paused' && sequence.vacation_paused_at ? [sequence] : []
  }

  /** Le bouton « Reprendre mes séquences » : toutes celles de l'utilisateur en pause vacances. */
  async resumeAllMine(userId: string, workspaceId: string): Promise<number> {
    const paused = await this.sequences.find({
      where: { user_id: userId, workspace_id: workspaceId, status: 'paused' },
    })
    return this.releaseVacation(paused)
  }

  /* ---------------------------------- balayages ------------------------------ */

  /**
   * Les deux balayages temporels du socle, best-effort à chaque lecture (même
   * patron que `applyMaxDelayReached` : ce module n'a pas de cron). Une panne
   * ne doit jamais faire échouer une lecture.
   */
  async sweep(workspaceId: string | null): Promise<void> {
    if (!workspaceId) return
    try {
      await this.resumeDueVacations(workspaceId)
    } catch (cause) {
      this.logger.warn('auto-resume vacation outreach sequences failed', { error: cause, workspaceId })
    }
    try {
      await this.skipUnacceptedLinkedinSteps(workspaceId)
    } catch (cause) {
      this.logger.warn('auto-skip linkedin outreach steps failed', { error: cause, workspaceId })
    }
  }

  private async resumeDueVacations(workspaceId: string): Promise<void> {
    const paused = await this.sequences.find({ where: { ...workspaceScopeWhere(workspaceId), status: 'paused' } })
    const now = new Date()
    await this.releaseVacation(paused.filter(sequence => vacationResumeDue(sequence.vacation_until, now)))
  }

  private async skipUnacceptedLinkedinSteps(workspaceId: string): Promise<void> {
    const active = await this.sequences.find({ where: { ...workspaceScopeWhere(workspaceId), status: 'active' } })
    const now = new Date()
    for (const sequence of active) {
      const all = await this.steps.find({ where: { sequence_id: sequence.id }, order: { position: 'ASC' } })
      const skipIds = new Set(
        linkedinStepsToSkip(
          all.map(step => ({ ...step, due_at: step.due_at.toISOString() })),
          now,
        ),
      )
      for (const step of all.filter(candidate => skipIds.has(candidate.id))) {
        step.status = 'skipped'
        step.payload = { ...step.payload, skip_reason: 'linkedin_invite_not_accepted', skipped_at: now.toISOString() }
        await this.steps.save(step)
        await this.journal(
          sequence,
          sequence.user_id,
          'pending',
          'step_skipped',
          'system',
          'linkedin_invite_not_accepted',
        )
      }
      // Sauter la dernière étape à faire termine la séquence, comme `stepDone`.
      if (skipIds.size > 0 && !all.some(step => step.status === 'pending' && !skipIds.has(step.id))) {
        sequence.status = 'completed'
        sequence.completed_at = now
        await this.sequences.save(sequence)
      }
    }
  }

  /* ------------------------------- réordonnancer ----------------------------- */

  /**
   * Réordonne les étapes ENCORE À FAIRE. Les créneaux (dates) ne bougent pas :
   * ce sont les mêmes, redistribués dans le nouvel ordre — la cadence garde son
   * rythme. Les mêmes gardes d'espacement que la création s'appliquent.
   */
  async reorder(userId: string, sequenceId: string, stepIds: string[]): Promise<void> {
    const sequence = await this.loadOwned(userId, sequenceId)
    if (sequence.status === 'completed' || sequence.status === 'cancelled') {
      throw new BadRequestException(`La séquence est « ${sequence.status} » — ses étapes ne se réordonnent plus.`)
    }
    const all = await this.steps.find({ where: { sequence_id: sequence.id }, order: { position: 'ASC' } })
    const pending = all.filter(step => step.status === 'pending')
    const requested = new Set(stepIds)
    if (
      requested.size !== stepIds.length ||
      requested.size !== pending.length ||
      !pending.every(step => requested.has(step.id))
    ) {
      throw new BadRequestException('La liste doit contenir exactement les étapes encore à faire, une fois chacune.')
    }
    const slots = [...pending]
      .sort((a, b) => a.position - b.position)
      .map(step => ({ position: step.position, due_at: step.due_at }))
      .sort((a, b) => a.due_at.getTime() - b.due_at.getTime())
    const positions = slots.map(slot => slot.position).sort((a, b) => a - b)
    const byId = new Map(pending.map(step => [step.id, step]))
    const reordered = stepIds.map((id, index) => ({
      step: byId.get(id) as OutreachSequenceStepEntity,
      due_at: (slots[index] as { due_at: Date }).due_at,
      position: positions[index] as number,
    }))
    const spacing = outreachMessageSpacingProblems(
      [
        ...all
          .filter(step => step.status !== 'pending' && step.status !== 'skipped')
          .map(step => ({ kind: step.kind, due_at: step.due_at })),
        ...reordered.map(entry => ({ kind: entry.step.kind, due_at: entry.due_at })),
      ].sort((a, b) => a.due_at.getTime() - b.due_at.getTime()),
    )
    if (spacing.length > 0) {
      const problem = spacing[0]
      throw new BadRequestException(
        `Deux messages à ${problem?.days ?? 0} jour(s) d'intervalle : il en faut au moins ${problem?.required ?? 0}.`,
      )
    }
    for (const entry of reordered) {
      entry.step.due_at = entry.due_at
      entry.step.position = entry.position
    }
    await this.steps.save(reordered.map(entry => entry.step))
  }

  /* -------------------------------- exclusions ------------------------------- */

  /**
   * Le dernier message ENVOYÉ à chaque contact (transition `sent` du journal
   * canonique) — pas une étape marquée « faite », qui ne porte jamais preuve
   * d'envoi (doctrine c81). Les contacts jamais écrits sont absents.
   */
  async lastSentAt(workspaceId: string, contactIds: string[]): Promise<Map<string, Date>> {
    if (contactIds.length === 0) return new Map()
    const rows = await this.sequences.query<{ contact_id: string; last_sent_at: Date | string }[]>(
      `SELECT m.contact_id, MAX(t.occurred_at) AS last_sent_at
         FROM outreach_transitions t
         JOIN outreach_messages m ON m.id = t.subject_id
        WHERE t.subject_kind = 'message' AND t.to_state = 'sent'
          AND m.workspace_id = $1 AND m.contact_id = ANY($2::uuid[])
        GROUP BY m.contact_id`,
      [workspaceId, contactIds],
    )
    return new Map((rows ?? []).map(row => [row.contact_id, new Date(row.last_sent_at)]))
  }

  /**
   * « Compte déjà client » quand l'information EXISTE dans le modèle : l'état
   * de relation n'est lu que s'il cite une preuve (même règle que
   * `cadenceScenario`). Sans preuve → `null`, jamais deviné.
   */
  clientStatus(account: Pick<AccountEntity, 'raw_analysis' | 'commercial_status'> | null): boolean | null {
    if (!account) return null
    const { state, evidence } = resolveRelationshipEvidence(account)
    if (evidence.length === 0) return null
    return state === 'client_actif'
  }

  /** Les exclusions de chaque contact (possédé par l'utilisateur, dans l'espace). */
  async eligibility(
    userId: string,
    workspaceId: string,
    contactIds: string[],
    erasedContactIds: ReadonlySet<string>,
  ): Promise<
    {
      contact_id: string
      contact_name: string | null
      exclusions: OutreachEnrollmentExclusion[]
      client_status_known: boolean
    }[]
  > {
    const unique = [...new Set(contactIds)]
    const owned = await this.contacts.find({
      where: { id: In(unique), user_id: userId, ...workspaceScopeWhere(workspaceId) },
    })
    if (owned.length === 0) return []
    const ids = owned.map(contact => contact.id)
    const [active, lastSent, accounts] = await Promise.all([
      this.sequences.find({ where: { ...workspaceScopeWhere(workspaceId), contact_id: In(ids), status: 'active' } }),
      this.lastSentAt(workspaceId, ids),
      this.accounts.find({
        where: {
          id: In([...new Set(owned.map(contact => contact.account_id).filter((id): id is string => !!id))]),
          ...workspaceScopeWhere(workspaceId),
        },
      }),
    ])
    const activeContacts = new Set(active.map(sequence => sequence.contact_id))
    const accountById = new Map(accounts.map(account => [account.id, account]))
    const now = new Date()
    return owned.map(contact => {
      const alreadyClient = this.clientStatus(contact.account_id ? (accountById.get(contact.account_id) ?? null) : null)
      return {
        contact_id: contact.id,
        contact_name: contact.full_name ?? null,
        exclusions: evaluateEnrollmentExclusions({
          hasActiveSequence: activeContacts.has(contact.id),
          lastSentAt: lastSent.get(contact.id) ?? null,
          erased: erasedContactIds.has(contact.id),
          alreadyClient,
          now,
        }),
        client_status_known: alreadyClient !== null,
      }
    })
  }

  /** Ce qui bloque encore l'inscription d'un contact : voir `blockingEnrollmentExclusions`. */
  blocking(exclusions: readonly OutreachEnrollmentExclusion[], forced: boolean): OutreachEnrollmentExclusion[] {
    return blockingEnrollmentExclusions(exclusions, forced)
  }
}
