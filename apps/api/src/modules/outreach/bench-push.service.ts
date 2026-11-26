import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Repository } from 'typeorm'
import {
  anonymizedBenchProfile,
  buildBenchPushCreateRequest,
  type BenchPushRequest,
  type CreateOutreachSequenceRequest,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ConsultantAccountConsentEntity } from '../../database/entities/consultant-account-consent.entity'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { ConsultantSkillEntity } from '../../database/entities/consultant-skill.entity'
import { ContactEntity } from '../../database/entities/contact.entity'

/**
 * #5029.1 — PROPOSER UN CONSULTANT EN INTERCONTRAT À UN COMPTE (Reverse Market).
 *
 * Revient sur le NO-GO « Préparer un push profil » (levé par Louis le
 * 31/10/2026) : SEULEMENT sur geste explicite par compte, profil ANONYMISÉ,
 * mail relu et validé. Ce service ne fait que PRÉPARER la requête de création
 * (lecture seule) ; la création passe par `OutreachService.create` et toutes
 * ses gardes, orchestrée par le contrôleur (GA-07).
 *
 * Tout se lit dans l'ESPACE ACTIF : un consultant, un contact ou un compte d'un
 * autre espace est INTROUVABLE (404) — jamais « interdit », qui confirmerait
 * qu'il existe ailleurs.
 */
@Injectable()
export class BenchPushService {
  constructor(
    @InjectRepository(ConsultantEntity) private readonly consultants: Repository<ConsultantEntity>,
    @InjectRepository(ConsultantSkillEntity) private readonly skills: Repository<ConsultantSkillEntity>,
    @InjectRepository(ContactEntity) private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ConsultantAccountConsentEntity)
    private readonly consents: Repository<ConsultantAccountConsentEntity>,
  ) {}

  async prepare(workspaceId: string, body: BenchPushRequest): Promise<CreateOutreachSequenceRequest> {
    const consultant = await this.consultants.findOne({ where: { id: body.consultant_id, workspace_id: workspaceId } })
    if (!consultant) throw new NotFoundException('Consultant introuvable dans cet espace.')
    const contact = await this.contacts.findOne({ where: { id: body.contact_id, workspace_id: workspaceId } })
    if (!contact) throw new NotFoundException('Contact introuvable dans cet espace.')
    const account = contact.account_id
      ? await this.accounts.findOne({ where: { id: contact.account_id, workspace_id: workspaceId } })
      : null
    if (!account) throw new NotFoundException('Compte du contact introuvable dans cet espace.')

    // #2329.37/.38 — le refus de représentation pour CE compte est le seul « non » qui arrête :
    // `null` (jamais demandé) n'est pas un refus.
    const consent = await this.consents.findOne({ where: { consultant_id: consultant.id, account_id: account.id } })
    if (consent?.can_represent === false) {
      throw new ForbiddenException('Cette personne a refusé d’être proposée à ce compte.')
    }

    const skills = await this.skills.find({ where: { consultant_id: consultant.id } })
    const profile = anonymizedBenchProfile({
      title: consultant.title,
      seniority: consultant.seniority,
      years_experience: consultant.years_experience,
      skills: skills.map(row => row.skill),
      available_from: consultant.available_from,
    })
    return buildBenchPushCreateRequest({
      contactId: contact.id,
      contactName: contact.full_name ?? '',
      profile,
      accountName: account.company_name,
      accountContext: body.account_context ?? null,
    })
  }
}
