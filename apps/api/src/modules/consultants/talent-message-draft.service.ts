import { HttpException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { HttpError } from '@bellum/errors'
import type { DraftTalentMessageInput, TalentMessageDraft, TalentMessageObjective } from '@bellum/contracts'
import { NEED_OPEN_STATUSES } from '@bellum/contracts'
import { In, IsNull, Not, Repository } from 'typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ConsultantSkillEntity } from '../../database/entities/consultant-skill.entity'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { SubmissionEntity } from '../../database/entities/submission.entity'
import { demoTalentMessage } from '../demo/demo-talent-message'
import { IaClient } from '../ia/ia.client'
import { WorkspaceContextService } from '../workspace/workspace-context.service'

/** Les positionnements encore vivants : un besoin refusé ou retiré n'est pas celui qu'on propose. */
const LIVE_STAGES = ['shortlisted', 'submitted', 'interview']
const SKILLS_SENT = 8

const FAILURES = {
  unavailable: {
    status: 503,
    code: 'talent_message_unavailable',
    message: 'Laura ne peut pas rédiger pour le moment : le service de rédaction n’est pas disponible.',
  },
  failed: {
    status: 502,
    code: 'talent_message_failed',
    message: 'La rédaction a échoué. Réessaie dans un instant.',
  },
} as const

/**
 * #4347 — « Préparer un message » (fiche consultant) s'ouvre DÉJÀ RÉDIGÉ par Laura.
 *
 * Le consultant, le besoin et le client se lisent ICI, côté serveur : le navigateur ne dicte aucun fait.
 * Aucun critère protégé ne part au moteur (ni âge, ni photo, ni adresse, ni origine : on n'envoie que
 * le prénom, l'intitulé, les compétences et la disponibilité déclarée). Un échec se NOMME — jamais de
 * texte inventé en repli (doctrine). Le message est un brouillon : rien ici ne l'envoie.
 */
@Injectable()
export class TalentMessageDraftService {
  constructor(
    @InjectRepository(ConsultantEntity) private readonly consultants: Repository<ConsultantEntity>,
    @InjectRepository(ConsultantSkillEntity) private readonly skills: Repository<ConsultantSkillEntity>,
    @InjectRepository(SubmissionEntity) private readonly submissions: Repository<SubmissionEntity>,
    @InjectRepository(ProjectNeedEntity) private readonly needs: Repository<ProjectNeedEntity>,
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    private readonly ia: IaClient,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  async draft(
    consultantId: string,
    workspaceId: string,
    userId: string,
    input: DraftTalentMessageInput,
  ): Promise<TalentMessageDraft> {
    const talent = await this.consultants.findOne({ where: { id: consultantId, workspace_id: workspaceId } })
    if (!talent) throw new NotFoundException('Consultant introuvable')

    const firstName = talent.full_name?.trim().split(/\s+/)[0] || null
    const skills = await this.skills.find({
      where: { consultant_id: consultantId },
      order: { skill: 'ASC' },
      take: SKILLS_SENT,
    })
    // #4347.3 — l'objectif est DÉDUIT du besoin : un besoin qui matche → mission ; sinon → revalidation.
    // Une revalidation demandée n'emporte aucun besoin ; une mission demandée sans besoin se dit « revalidation ».
    const need =
      input.objective === 'revalidate_availability'
        ? null
        : ((await this.currentNeed(consultantId, workspaceId)) ??
          (await this.matchingOpenNeed(
            workspaceId,
            skills.map(row => row.skill),
          )))
    const objective: TalentMessageObjective = need ? 'propose_mission' : 'revalidate_availability'
    const client = need ? await this.clientNameOf(need.account_id) : null
    const basis = { consultant: firstName, need: need?.title ?? null, client }

    if (await this.workspaceContext.isDemoWorkspace(userId)) {
      // #4347 (craft rule n°9) — la salle montre la fenêtre déjà rédigée : texte semé, aucun appel moteur.
      return { ...demoTalentMessage(input, { firstName, need: basis.need, client }), basis, objective }
    }

    try {
      const envelope = await this.ia.talentMessageDraft({
        userId,
        channel: input.channel,
        consultant: {
          first_name: firstName,
          title: talent.title,
          skills: skills.map(row => row.skill),
          availability: talent.availability,
          available_from: talent.available_from,
        },
        ...(need
          ? {
              need: {
                title: need.title,
                client_name: client,
                skills: (need.skills ?? []).map(skill => skill.term).filter(Boolean),
                start_on: need.start_on,
                duration_months: need.duration_months,
              },
            }
          : {}),
        // #4347.2 — le registre n'est plus un réglage : le moteur TUTOIE le consultant sur tous les canaux.
        ...(input.variant ? { variant: input.variant } : {}),
        ...(input.previousBody ? { previousBody: input.previousBody } : {}),
      })
      const data = (envelope as { data?: { subject?: unknown; body?: unknown } } | null)?.data
      const body = typeof data?.body === 'string' ? data.body.trim() : ''
      if (!body) throw new Error('empty draft')
      const subject = typeof data?.subject === 'string' && data.subject.trim() ? data.subject.trim() : null
      return { subject: input.channel === 'email' ? subject : null, body, basis, objective }
    } catch (error) {
      throw this.failure(error)
    }
  }

  /** Le besoin du positionnement vivant le plus récent — `null` si le consultant n'est sur aucun. */
  private async currentNeed(consultantId: string, workspaceId: string): Promise<ProjectNeedEntity | null> {
    const submission = await this.submissions.findOne({
      where: { consultant_id: consultantId, workspace_id: workspaceId, need_id: Not(IsNull()), stage: In(LIVE_STAGES) },
      order: { stage_entered_at: 'DESC' },
    })
    if (!submission?.need_id) return null
    return this.needs.findOne({ where: { id: submission.need_id, workspace_id: workspaceId } })
  }

  /**
   * #4347.3 — un besoin OUVERT qui partage au moins une compétence avec le consultant (comparaison sans
   * casse, sur le terme) : le plus récent. `null` = aucun ne matche — jamais le premier venu.
   */
  private async matchingOpenNeed(workspaceId: string, skillNames: string[]): Promise<ProjectNeedEntity | null> {
    const wanted = new Set(skillNames.map(name => name.trim().toLowerCase()).filter(Boolean))
    if (wanted.size === 0) return null
    const open = await this.needs.find({
      where: { workspace_id: workspaceId, status: In([...NEED_OPEN_STATUSES]) },
      order: { created_at: 'DESC' },
      take: 50,
    })
    return (
      open.find(row => (row.skills ?? []).some(skill => wanted.has(skill.term?.trim().toLowerCase() ?? ''))) ?? null
    )
  }

  private async clientNameOf(accountId: string): Promise<string | null> {
    const account = await this.accounts.findOne({ where: { id: accountId } })
    return account?.trade_name?.trim() || account?.company_name?.trim() || null
  }

  /** Le moteur sans clé de modèle (503) se dit autrement qu'une panne — aucun contenu n'est recopié. */
  private failure(error: unknown): HttpException {
    const unavailable = error instanceof HttpError && error.status === 503
    const picked = unavailable ? FAILURES.unavailable : FAILURES.failed
    return new HttpException({ statusCode: picked.status, message: picked.message, code: picked.code }, picked.status)
  }
}
