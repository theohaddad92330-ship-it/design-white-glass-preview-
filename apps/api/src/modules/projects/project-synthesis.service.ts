import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  projectSynthesisHasVaguePhraseWithoutFact,
  projectSynthesisSchema,
  type ProjectSynthesis,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ProjectContactEntity } from '../../database/entities/project-contact.entity'
import { ProjectEntity } from '../../database/entities/project.entity'
import { IaClient } from '../ia/ia.client'

type ProjectSynthesisResult =
  | { ok: true; synthesis: ProjectSynthesis }
  | { ok: false; code: 'not_found' | 'ia_failed' | 'vague_without_fact' }

/** Combien de contacts liés partent au modèle — le circuit de décision d'une
 *  opportunité tient rarement à plus d'une poignée de personnes. */
const MAX_CONTACTS = 12

/**
 * #2171.27 — synthèse en 7 questions d'une opportunité. Contrat déjà posé
 * (`packages/contracts/src/schemas/project-synthesis.ts`) ; ce service en est
 * le premier APPELANT RÉEL.
 *
 * Génération à la demande, jamais persistée — même choix que `icebreaker` /
 * `generateMessage` (IaProxyController) plutôt que le cache payant de
 * `NeedPlayService` : contrairement à un besoin, une opportunité change
 * d'étape en continu, et une synthèse qui resterait figée après le premier
 * clic mentirait sur l'état réel de l'affaire. Tranché sans Louis (portée du
 * lot #3003) : le geste "régénérer" recouvre la lecture, ce n'est pas la même
 * promesse d'honnêteté qu'un plan d'attaque payé une fois pour l'équipe.
 */
@Injectable()
export class ProjectSynthesisService {
  private readonly logger = new Logger(ProjectSynthesisService.name)

  constructor(
    @InjectRepository(ProjectEntity) private readonly projects: Repository<ProjectEntity>,
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ProjectContactEntity) private readonly projectContacts: Repository<ProjectContactEntity>,
    @InjectRepository(ContactEntity) private readonly contacts: Repository<ContactEntity>,
    private readonly ia: IaClient,
  ) {}

  async generate(projectId: string, workspaceId: string): Promise<ProjectSynthesisResult> {
    const project = await this.projects.findOne({ where: { id: projectId, workspace_id: workspaceId } })
    if (!project) return { ok: false, code: 'not_found' }

    const account = await this.accounts.findOne({ where: { id: project.account_id } })

    const links = await this.projectContacts.find({ where: { project_id: projectId }, take: MAX_CONTACTS })
    const contactRows = links.length
      ? await this.contacts.find({ where: links.map(link => ({ id: link.contact_id })) })
      : []
    const roleByContactId = new Map(links.map(link => [link.contact_id, link.role]))
    const contactsPayload = contactRows.map(c => ({
      full_name: c.full_name,
      role: roleByContactId.get(c.id) ?? '',
    }))

    const projectPayload = {
      label: project.label,
      kind: project.kind,
      detail: project.detail ?? '',
      offer: project.offer ?? '',
      urgency: project.urgency ?? '',
      stage: project.stage,
    }
    const accountPayload = {
      company_name: account?.company_name ?? '',
      sector: account?.sector ?? '',
      context:
        account && typeof account.raw_analysis === 'object' ? JSON.stringify(account.raw_analysis).slice(0, 6000) : '',
    }

    let raw: unknown
    try {
      const envelope = await this.ia.projectSynthesis({
        project: projectPayload,
        account: accountPayload,
        contacts: contactsPayload,
      })
      raw = (envelope as { data?: unknown }).data
    } catch (error) {
      this.logger.warn('Project synthesis failed — nothing returned', {
        error: error instanceof Error ? error.message : String(error),
        projectId,
      })
      return { ok: false, code: 'ia_failed' }
    }

    const parsed = projectSynthesisSchema.safeParse({
      ...(raw as Record<string, unknown>),
      projectId,
      generatedAt: new Date().toISOString(),
    })
    if (!parsed.success) {
      this.logger.warn('Project synthesis rejected — shape does not match the contract', {
        projectId,
        issues: parsed.error.issues,
      })
      return { ok: false, code: 'ia_failed' }
    }

    // #2171.28 — la garde ne fait pas confiance au prompt seul : une phrase
    // vague sans fait pour la porter n'atteint jamais l'écran.
    if (projectSynthesisHasVaguePhraseWithoutFact(parsed.data)) {
      return { ok: false, code: 'vague_without_fact' }
    }

    return { ok: true, synthesis: parsed.data }
  }
}
