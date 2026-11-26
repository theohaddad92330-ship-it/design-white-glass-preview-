import { Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import {
  AUTOMATION_SIGNAL_INTENT,
  buildPlaybookContext,
  buildPlaybookCreateRequest,
  noGoMessageRefusal,
  OUTREACH_PLAYBOOKS,
  OUTREACH_STEP_INTENT_LABELS,
  PLAYBOOK_ENGINE_CHANNEL,
  playbookSequenceName,
  type OutreachEnrollmentExclusion,
  type PlaybookStepDrafts,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ContactStopEntity } from '../../database/entities/contact-stop.entity'
import { messageDraftPortFrom } from '../action-router/card-effect-ports'
import { IaClient } from '../ia/ia.client'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'
import type { AutomationActionsPort } from '../automation-rules/automation-ports'
import { OutreachCadenceService } from './outreach-cadence.service'
import { OutreachMessageService } from './outreach-message.service'
import { OutreachDelegationService } from './outreach-delegation.service'
import { OutreachService } from './outreach.service'

/** Ce que Laura reçoit comme offre et comme objectif quand une AUTOMATISATION prépare (aucun assistant n'a posé de question). */
const AUTOMATION_OFFER = 'des profils et une expertise adaptés à ce besoin'
const AUTOMATION_GOAL = 'obtenir une réponse'

/**
 * Lot L-D1 (#4167) — la réalisation du port `AutomationActionsPort` : COMMENT une
 * règle inscrit un contact et prépare ses messages.
 *
 * Elle vit ICI, dans le module outreach, parce que c'est lui qui possède les
 * portes : l'inscription (`OutreachService.create` — exclusions, opposition RGPD,
 * collision, niveau d'approbation de l'espace), le message canonique
 * (`OutreachMessageService.create` — il naît `needs_review`) et l'éligibilité
 * (`OutreachCadenceService.eligibility`). Rien n'est réécrit : le module des
 * automatisations n'a PAS de chemin d'inscription à lui.
 *
 * ⚠️ Aucun forçage : ni `override_exclusions` ni `force_justification` — une
 * automatisation ne passe jamais outre une exclusion. Aucun envoi : les messages
 * sont `source: 'automation'`, `needs_review`, à valider sous mandat (c82).
 */
@Injectable()
export class OutreachAutomationAdapter implements AutomationActionsPort {
  private readonly logger = new Logger(OutreachAutomationAdapter.name)

  constructor(
    private readonly outreach: OutreachService,
    private readonly messages: OutreachMessageService,
    private readonly cadence: OutreachCadenceService,
    @InjectRepository(ContactEntity) private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ContactStopEntity) private readonly stops: Repository<ContactStopEntity>,
    private readonly ia: IaClient,
    // #4016 L5 (reprise 20/10) — le mandat `workspace_sequences`. APPENDÉ EN FIN (les specs construisent
    // cet adaptateur par position) et optionnel : sans lui, les messages restent à relire, rien n'est délégué.
    @Optional() private readonly delegations?: OutreachDelegationService,
  ) {}

  private async stopped(workspaceId: string, contactIds: readonly string[]): Promise<Set<string>> {
    const unique = [...new Set(contactIds)]
    if (unique.length === 0) return new Set()
    const rows = await this.stops.find({
      where: { workspace_id: workspaceId, contact_id: In(unique) },
      select: ['contact_id'],
    })
    return new Set(rows.map(row => row.contact_id))
  }

  async eligibility(input: {
    userId: string
    workspaceId: string
    contactIds: readonly string[]
  }): Promise<Map<string, OutreachEnrollmentExclusion[]>> {
    const ids = [...new Set(input.contactIds)]
    if (ids.length === 0) return new Map()
    const erased = await this.stopped(input.workspaceId, ids)
    const rows = await this.cadence.eligibility(input.userId, input.workspaceId, ids, erased)
    return new Map(rows.map(row => [row.contact_id, row.exclusions]))
  }

  /**
   * UN brouillon par le moteur de rédaction existant. Un compte en NO-GO ne
   * reçoit rien (même règle que Laura, `noGoMessageRefusal`) ; un échec rend
   * `null` — l'étape reste vide, jamais un texte inventé.
   */
  private async draft(
    input: { userId: string; contactId: string },
    channel: 'email' | 'linkedin' | 'phone',
    context: string,
    contact: ContactEntity,
  ): Promise<{ subject: string; body: string } | null> {
    try {
      if (contact.account_id) {
        const account = await this.accounts.findOne({
          where: { id: contact.account_id },
          select: ['id', 'sprint', 'sprint_reason'],
        })
        if (noGoMessageRefusal(account?.sprint, account?.sprint_reason)) return null
      }
      const generated = await messageDraftPortFrom(this.ia).generate({
        userId: input.userId,
        contactId: input.contactId,
        channel,
        context,
      })
      return { subject: channel === 'email' ? (generated.subject ?? '') : '', body: generated.body }
    } catch (error) {
      this.logger.warn('automation draft failed (non-fatal)', {
        contactId: input.contactId,
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  private async owned(userId: string, workspaceId: string, contactId: string): Promise<ContactEntity> {
    const contact = await this.contacts.findOne({
      where: { id: contactId, user_id: userId, ...workspaceScopeWhere(workspaceId) },
    })
    if (!contact) throw new Error('Contact introuvable chez cette personne.')
    return contact
  }

  async enroll(input: Parameters<AutomationActionsPort['enroll']>[0]): ReturnType<AutomationActionsPort['enroll']> {
    const contact = await this.owned(input.userId, input.workspaceId, input.contactId)
    const steps = OUTREACH_PLAYBOOKS[input.playbook].steps
    const drafts: Record<number, { subject: string; body: string } | undefined> = {}
    for (const [index, step] of steps.entries()) {
      const channel = PLAYBOOK_ENGINE_CHANNEL[step.kind]
      if (!channel) continue
      drafts[index] =
        (await this.draft(
          input,
          channel,
          buildPlaybookContext({
            trigger: input.evidence,
            stepLabel: step.label,
            intent: OUTREACH_STEP_INTENT_LABELS[step.intent],
            offer: AUTOMATION_OFFER,
            goal: AUTOMATION_GOAL,
          }),
          contact,
        )) ?? undefined
    }
    const request = buildPlaybookCreateRequest({
      contactId: contact.id,
      playbook: input.playbook,
      name: playbookSequenceName(input.playbook, contact.full_name ?? ''),
      drafts: drafts as PlaybookStepDrafts,
    })
    // Aucun forçage : si une exclusion subsiste malgré l'éligibilité (course), `create` refuse et la règle le consigne.
    const sequence = await this.outreach.create(request, { userId: input.userId, email: input.email }, false, {
      expected_workspace_id: input.workspaceId,
    })

    const ctx = { userId: input.userId, workspaceId: input.workspaceId, role: input.role }
    const lookup = (ids: readonly string[]) => this.stopped(input.workspaceId, ids)
    const messageIds: string[] = []
    for (const [index, step] of sequence.steps.entries()) {
      const draft = drafts[index]
      if (step.kind !== 'email' || !draft?.body.trim()) continue
      try {
        const message = await this.messages.create(
          ctx,
          {
            contact_id: contact.id,
            channel: 'email',
            intent: index === 0 ? AUTOMATION_SIGNAL_INTENT[input.signal] : 'follow_up',
            source: 'automation',
            reason: input.evidence,
            subject: draft.subject.trim() || null,
            body: draft.body,
          },
          lookup,
          'system',
          { sequence_id: sequence.id, sequence_step_id: step.id },
        )
        messageIds.push(message.id)
        // #4016 L5 (reprise 20/10) — proposé au mandat `workspace_sequences`, daté de l'échéance de
        // l'étape (rattaché seulement sous un mandat vivant ; l'étape relue à chaque envoi).
        if (step.due_at) {
          await this.delegations?.awaitIfMandated(
            input.workspaceId,
            message.id,
            'workspace_sequences',
            new Date(step.due_at),
          )
        }
      } catch (error) {
        // L'inscription existe ; un message qui n'a pas pu être posé reste vide et se refait à la main.
        this.logger.warn('automation message link failed (non-fatal)', {
          sequenceId: sequence.id,
          stepId: step.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    return { sequenceId: sequence.id, messageIds }
  }

  async prepareEmail(
    input: Parameters<AutomationActionsPort['prepareEmail']>[0],
  ): ReturnType<AutomationActionsPort['prepareEmail']> {
    const contact = await this.owned(input.userId, input.workspaceId, input.contactId)
    const draft = await this.draft(
      input,
      'email',
      buildPlaybookContext({
        trigger: input.evidence,
        stepLabel: 'Premier e-mail',
        intent: 'obtenir une réponse',
        offer: AUTOMATION_OFFER,
        goal: AUTOMATION_GOAL,
      }),
      contact,
    )
    if (!draft?.body.trim()) return null
    const message = await this.messages.create(
      { userId: input.userId, workspaceId: input.workspaceId, role: input.role },
      {
        contact_id: contact.id,
        channel: 'email',
        intent: AUTOMATION_SIGNAL_INTENT[input.signal],
        source: 'automation',
        reason: input.evidence,
        subject: draft.subject.trim() || null,
        body: draft.body,
      },
      ids => this.stopped(input.workspaceId, ids),
      'system',
    )
    return { messageId: message.id }
  }

  async prepareCall(
    input: Parameters<AutomationActionsPort['prepareCall']>[0],
  ): ReturnType<AutomationActionsPort['prepareCall']> {
    const contact = await this.owned(input.userId, input.workspaceId, input.contactId)
    const pitch = await this.draft(
      input,
      'phone',
      buildPlaybookContext({
        trigger: input.evidence,
        stepLabel: 'Appel',
        intent: 'obtenir un échange',
        offer: AUTOMATION_OFFER,
        goal: AUTOMATION_GOAL,
      }),
      contact,
    )
    const call = await this.messages.createCallTask(
      { userId: input.userId, workspaceId: input.workspaceId, role: input.role },
      {
        contact_id: contact.id,
        source: 'automation',
        reason: input.evidence,
        objective: 'Appeler pour comprendre le besoin',
        ...(pitch?.body.trim() ? { pitch: pitch.body.trim().slice(0, 2000) } : {}),
        expected_outcome: 'Obtenir un échange',
      },
      ids => this.stopped(input.workspaceId, ids),
    )
    return { callTaskId: call.id }
  }
}
