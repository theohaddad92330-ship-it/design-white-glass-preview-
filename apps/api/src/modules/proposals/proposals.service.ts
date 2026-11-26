import { Injectable } from '@nestjs/common'
import { PRESENTED_SUBMISSION_STAGES } from './presented-submission-stages'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, Not, Repository, type SelectQueryBuilder } from 'typeorm'
import {
  buildProposalOutline,
  consentState,
  type ConsentState,
  type ProposalOutline,
  type RfpRequirement,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ConsultantSkillEntity } from '../../database/entities/consultant-skill.entity'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { CvVersionEntity } from '../../database/entities/cv-version.entity'
import { ProjectEntity } from '../../database/entities/project.entity'
import { ProofEntity } from '../../database/entities/proof.entity'
import { RfpEntity } from '../../database/entities/rfp.entity'
import { SubmissionEntity } from '../../database/entities/submission.entity'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'
import { type ProposalSources, toProposalInput } from './proposal-sources'

/**
 * Le studio de proposition — l'assembleur des neuf sections, branché.
 *
 * Il ne RÉDIGE rien et n'ENVOIE rien : il relit les objets que le produit porte
 * déjà (le compte, le besoin, sa qualification, les positionnements, les
 * preuves citables, l'appel d'offres) et les range dans les neuf sections, en
 * nommant ce qui manque. C'est pour cela qu'il n'a pas de table : le plan est
 * recalculé à CHAQUE lecture. Une copie stockée vieillirait en silence — elle
 * annoncerait une disponibilité périmée et un prix qui a changé, sur le seul
 * document du produit qui engage l'entreprise.
 *
 * La contrepartie est explicite : « modifier la proposition » se fait en
 * corrigeant l'objet qui porte le champ (le besoin, sa qualification, le vivier,
 * la bibliothèque de preuves), pas ici. C'est la loi « un réglage vit à un seul
 * endroit » ; l'écran conduit vers l'écran propriétaire de chaque manque.
 */

/** Ce que l'écran reçoit : le plan, et de quoi le titrer. */
export type ProposalStudioView = {
  project: { id: string; label: string; accountId: string; accountName: string | null }
  outline: ProposalOutline
}

/**
 * Une ligne du sélecteur de besoin.
 *
 * Volontairement SANS avancement : l'afficher demanderait d'assembler les neuf
 * sections de chaque besoin de l'espace, soit une centaine d'assemblages pour
 * remplir une liste déroulante. Le plan se lit sur le besoin ouvert.
 */
export type ProposalCandidate = {
  id: string
  label: string
  accountId: string
  accountName: string | null
}

/**
 * Les positionnements qui décrivent une équipe PROPOSABLE.
 *
 * `rejected` (le client a dit non) et `withdrawn` (nous avons retiré le profil)
 * en sortent : les remettre dans une proposition annoncerait au client une
 * personne dont l'un des deux camps ne veut plus.
 * Valeurs : `packages/contracts/src/schemas/submission.ts` (`SUBMISSION_STAGES`).
 */
const RETAINED_SUBMISSION_STAGES = ['shortlisted', 'submitted', 'interview', 'accepted']

/** Au-delà, le sélecteur n'aide plus à choisir : il fait défiler. */
const CANDIDATE_LIMIT = 100

/** Ce que `accounts.raw_analysis` porte comme risques (`planRiskSchema`). */
type RawAnalysisRisk = { risk?: unknown; probability?: unknown; impact?: unknown; mitigation?: unknown }

@Injectable()
export class ProposalsService {
  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projects: Repository<ProjectEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(SubmissionEntity)
    private readonly submissions: Repository<SubmissionEntity>,
    @InjectRepository(ConsultantEntity)
    private readonly consultants: Repository<ConsultantEntity>,
    @InjectRepository(ConsultantSkillEntity)
    private readonly consultantSkills: Repository<ConsultantSkillEntity>,
    @InjectRepository(ProofEntity)
    private readonly proofs: Repository<ProofEntity>,
    @InjectRepository(RfpEntity)
    private readonly rfps: Repository<RfpEntity>,
    @InjectRepository(CvVersionEntity)
    private readonly cvVersions: Repository<CvVersionEntity>,
  ) {}

  /** Les besoins de l'espace pour lesquels un plan peut être assemblé. */
  async listCandidates(workspaceId: string): Promise<ProposalCandidate[]> {
    const rows = await this.scopedProjects(workspaceId)
      .select(['o.id AS id', 'o.label AS label', 'o.account_id AS "accountId"', 'a.company_name AS "accountName"'])
      .orderBy('o.updated_at', 'DESC')
      .limit(CANDIDATE_LIMIT)
      .getRawMany<ProposalCandidate>()
    return rows
  }

  /** Le plan d'un besoin. `null` = il n'appartient pas à cet espace (404). */
  async buildForProject(projectId: string, workspaceId: string): Promise<ProposalStudioView | null> {
    const project = await this.findProjectForWorkspace(projectId, workspaceId)
    if (!project) return null

    const assembled = await this.assemble(project, workspaceId)
    return {
      project: {
        id: project.id,
        label: project.label,
        accountId: project.account_id,
        accountName: assembled.accountName,
      },
      outline: assembled.outline,
    }
  }

  /* ------------------------------------------------------------------ */
  /* Lectures — chacune cloisonnée par espace                            */
  /* ------------------------------------------------------------------ */

  /**
   * Le besoin, à condition qu'il appartienne à l'espace de l'appelant.
   *
   * Le prédicat `(o.workspace_id = :ws OR a.workspace_id = :ws)` n'est pas une
   * invention : le roll-out `user_id → workspace_id` est en cours et les lignes
   * antérieures n'ont que le rattachement du compte. C'est exactement le
   * prédicat de `ProjectsService.updateBtmmp` — le reprendre évite qu'un même
   * besoin soit visible d'un côté et introuvable de l'autre.
   */
  private findProjectForWorkspace(projectId: string, workspaceId: string): Promise<ProjectEntity | null> {
    return this.scopedProjects(workspaceId).andWhere('o.id = :projectId', { projectId }).getOne()
  }

  private scopedProjects(workspaceId: string): SelectQueryBuilder<ProjectEntity> {
    return this.projects
      .createQueryBuilder('o')
      .innerJoin(AccountEntity, 'a', 'a.id = o.account_id')
      .where('(o.workspace_id = :workspaceId OR a.workspace_id = :workspaceId)', { workspaceId })
      .andWhere("a.status <> 'deleted'")
  }

  private async assemble(
    project: ProjectEntity,
    workspaceId: string,
  ): Promise<{ outline: ProposalOutline; accountName: string | null }> {
    const account = await this.accounts.findOne({
      where: { id: project.account_id, ...workspaceScopeWhere(workspaceId) },
    })
    const team = await this.readTeam(project.id, workspaceId)
    const { risks: rfpRisks, openRequirements } = await this.readRfpSignals(project.account_id, workspaceId)

    const sources: ProposalSources = {
      account: account
        ? {
            company_name: account.company_name,
            sector: account.sector,
            it_challenges: Array.isArray(account.it_challenges) ? account.it_challenges : [],
          }
        : null,
      project: {
        label: project.label,
        detail: project.detail,
        offer: project.offer,
        estimated_amount: project.estimated_amount,
        btmmp: project.btmmp,
      },
      team,
      clientSafeProofs: await this.readClientSafeProofs(project.account_id, workspaceId),
      risks: [...this.readAccountRisks(account), ...rfpRisks],
      openRequirements,
    }

    return { outline: buildProposalOutline(toProposalInput(sources)), accountName: account?.company_name ?? null }
  }

  /**
   * L'équipe : les positionnements du besoin, croisés avec la fiche vivier.
   *
   * La disponibilité et les compétences sont lues AUJOURD'HUI, pas recopiées du
   * jour du positionnement : une proposition qu'on s'apprête à envoyer annonce
   * une disponibilité, et une disponibilité d'il y a six semaines n'en est pas
   * une.
   */
  private async readTeam(projectId: string, workspaceId: string): Promise<ProposalSources['team']> {
    const submissions = await this.submissions.find({
      where: {
        project_id: projectId,
        stage: In(RETAINED_SUBMISSION_STAGES),
        ...workspaceScopeWhere(workspaceId),
      },
      order: { created_at: 'ASC' },
    })
    const consultantIds = [...new Set(submissions.map(submission => submission.consultant_id))]
    if (consultantIds.length === 0) return []

    const [consultants, skills, cvVersionByConsultant, priorPresentations] = await Promise.all([
      this.consultants.find({ where: { id: In(consultantIds), ...workspaceScopeWhere(workspaceId) } }),
      this.consultantSkills.find({
        where: { consultant_id: In(consultantIds), ...workspaceScopeWhere(workspaceId) },
      }),
      this.readLatestCvVersions(consultantIds, projectId, workspaceId),
      this.countPriorPresentations(consultantIds, projectId, workspaceId),
    ])
    const byId = new Map(consultants.map(consultant => [consultant.id, consultant]))

    return submissions.flatMap(submission => {
      const consultant = byId.get(submission.consultant_id)
      // Une fiche hors espace ou supprimée : la personne SORT de l'équipe.
      // L'inverse écrirait une ligne sans nom dans la section « équipe ».
      if (!consultant) return []
      const cvVersion = cvVersionByConsultant.get(consultant.id) ?? null
      return [
        {
          fullName: consultant.full_name,
          availability: consultant.availability,
          skills: skills
            .filter(skill => skill.consultant_id === consultant.id)
            .map(skill => ({ label: skill.raw_label ?? skill.skill, source: skill.source })),
          proposedRateCents: toCents(submission.proposed_rate_cents),
          consentState: this.consentStateFor(consultant),
          cvVersionStatus: (cvVersion?.status as ProposalSources['team'][number]['cvVersionStatus']) ?? null,
          cvChanges: cvVersion?.changes ?? [],
          hasSourceCv: Boolean(consultant.cv_text?.trim()),
          priorPresentationsCount: priorPresentations.get(consultant.id) ?? 0,
        },
      ]
    })
  }

  /**
   * Le consentement du talent (BEL-SC-239), réduit à un état AUJOURD'HUI.
   * `consentState()` (`@bellum/contracts`) est la SEULE dérivation qui existe
   * pour cette date — la reproduire ici en second endroit ferait diverger
   * l'écran vivier et la proposition sur le même profil.
   */
  private consentStateFor(consultant: ConsultantEntity): ConsentState {
    return consentState(
      {
        givenAt: consultant.consent_given_at ? consultant.consent_given_at.toISOString() : null,
        expiresAt: consultant.consent_expires_at ? consultant.consent_expires_at.toISOString() : null,
        basis: consultant.consent_basis,
        restrictions: consultant.consent_restrictions,
      },
      new Date(),
    )
  }

  /**
   * La version de dossier de compétences la plus RÉCENTE par consultant, pour
   * CE besoin précisément — un dossier adapté pour un autre besoin n'a rien à
   * dire sur celui-ci, ses compétences mises en avant seraient hors sujet.
   */
  private async readLatestCvVersions(
    consultantIds: string[],
    projectId: string,
    workspaceId: string,
  ): Promise<Map<string, CvVersionEntity>> {
    const rows = await this.cvVersions.find({
      where: { consultant_id: In(consultantIds), opportunity_id: projectId, ...workspaceScopeWhere(workspaceId) },
      order: { generated_at: 'DESC' },
    })
    const latest = new Map<string, CvVersionEntity>()
    for (const row of rows) {
      if (!latest.has(row.consultant_id)) latest.set(row.consultant_id, row)
    }
    return latest
  }

  /**
   * Combien de fois chaque profil a déjà été présenté à un AUTRE besoin — la
   * transparence que « historique de présentation » demande. `shortlisted` et
   * `withdrawn` n'en font pas partie (`PRESENTED_SUBMISSION_STAGES`) : un choix
   * interne ou un retrait avant présentation n'a rien montré à personne.
   */
  private async countPriorPresentations(
    consultantIds: string[],
    projectId: string,
    workspaceId: string,
  ): Promise<Map<string, number>> {
    const rows = await this.submissions.find({
      where: {
        consultant_id: In(consultantIds),
        stage: In(PRESENTED_SUBMISSION_STAGES),
        project_id: Not(projectId),
        ...workspaceScopeWhere(workspaceId),
      },
    })
    const counts = new Map<string, number>()
    for (const row of rows) counts.set(row.consultant_id, (counts.get(row.consultant_id) ?? 0) + 1)
    return counts
  }

  /**
   * Les preuves qu'on peut sortir. `scope = 'client_safe'` est la décision du
   * produit, prise à la saisie ; la relire ici serait s'en donner une seconde,
   * et le pire défaut par défaut serait d'aller dans le sens de la sortie.
   *
   * Les témoignages (`testimonials`) ne sont VOLONTAIREMENT pas repris : ils
   * citent une personne nommée, et faire entrer une citation signée dans un
   * document assemblé automatiquement est une question de consentement qui se
   * tranche, pas qui se code au passage.
   */
  private async readClientSafeProofs(
    accountId: string,
    workspaceId: string,
  ): Promise<ProposalSources['clientSafeProofs']> {
    const proofs = await this.proofs.find({
      where: [
        { account_id: accountId, scope: 'client_safe', ...workspaceScopeWhere(workspaceId) },
        // Une preuve sans compte est une preuve de l'ESN, réutilisable partout.
        { account_id: IsNull(), scope: 'client_safe', ...workspaceScopeWhere(workspaceId) },
      ],
      order: { created_at: 'DESC' },
      take: 10,
    })
    return proofs.map(proof => ({ claim: proof.claim, detail: proof.detail }))
  }

  /**
   * Les risques que l'analyse a écrits sur le compte.
   *
   * Seul le LIBELLÉ traverse. `probability` reste où il est : le produit
   * n'affiche aucune probabilité, et une proposition commerciale est le dernier
   * endroit où en faire apparaître une.
   */
  private readAccountRisks(account: AccountEntity | null): string[] {
    const raw: unknown = (account?.raw_analysis as Record<string, unknown> | undefined)?.['risks']
    if (!Array.isArray(raw)) return []
    return raw
      .map(entry => {
        const label = (entry as RawAnalysisRisk | null)?.risk
        return typeof label === 'string' && label.trim() ? label.trim() : null
      })
      .filter((label): label is string => label !== null)
  }

  /**
   * Ce que l'appel d'offres du compte laisse ouvert.
   *
   * La règle du « manque » n'est pas réécrite ici : c'est celle de
   * `computeRfpCompliance` (`packages/contracts/src/schemas/rfp.ts`) — une
   * exigence non `validated` compte, une exigence `informative` n'engage à rien
   * et n'en est pas une. Deux dérivations divergeraient.
   */
  private async readRfpSignals(
    accountId: string,
    workspaceId: string,
  ): Promise<{ risks: string[]; openRequirements: string[] }> {
    const rfps = await this.rfps.find({
      where: { account_id: accountId, ...workspaceScopeWhere(workspaceId) },
      order: { updated_at: 'DESC' },
      take: 5,
    })
    const requirements: RfpRequirement[] = rfps.flatMap(rfp =>
      Array.isArray(rfp.requirements) ? rfp.requirements : [],
    )

    return {
      risks: requirements
        .map(requirement => requirement.risk)
        .filter((risk): risk is string => typeof risk === 'string' && risk.trim().length > 0),
      openRequirements: requirements
        .filter(requirement => requirement.answer_status !== 'validated' && requirement.weight !== 'informative')
        .map(requirement => requirement.text),
    }
  }
}

/** `bigint` revient en chaîne via le driver pg. Illisible → `null`, jamais 0. */
function toCents(value: string | number | null): number | null {
  if (value == null) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
