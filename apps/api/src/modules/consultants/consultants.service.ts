import { randomUUID } from 'node:crypto'
import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { isErasedConsultantIdentity } from './consultant-erasure.service'
import { consultantsKnowingSector } from './consultant-sector-knowledge'
import { type FindOptionsWhere, In, IsNull, Repository } from 'typeorm'
import type {
  Consultant,
  ConsultantArchiveBulkResult,
  ConsultantBrief,
  ConsultantCvRewrite,
  ConsultantFieldReport,
  ConsultantMatch,
  ConsultantPushFeedback,
  ConsultantUpsert,
  InterviewBrief,
  RecordConsultantFieldReportInput,
  RecordPushFeedback,
  RampUpBand,
  RecordTalentInterviewTraitInput,
  RecordTalentRampUpInput,
  RequiredSkill,
  SearchPeopleByNameResult,
  TalentInterviewTrait,
} from '@bellum/contracts'
import {
  applyFieldUpdates,
  buildLinkedinDraft,
  consentState,
  consultantSourceSchema,
  missingPartnerForEngagement,
  parseLinkedInProfileUrl,
  type ClientHistoryEntry,
  type EngagementKind,
  type FieldSource,
  type LinkedinDraft,
  type TalentConsent,
} from '@bellum/contracts'
import { findActiveEngagements, frenchDate } from './consultant-engagement'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { ConsultantCvRewriteEntity } from '../../database/entities/consultant-cv-rewrite.entity'
import { ConsultantPushFeedbackEntity } from '../../database/entities/consultant-push-feedback.entity'
import { ProjectEntity } from '../../database/entities/project.entity'
import { IaClient } from '../ia/ia.client'
import { buildConsultantBrief } from './consultant-brief'
import { buildInterviewBrief } from './interview-brief'
import { splitSkillEntries } from './skill-referential'
import { pruneDeclaredSkills, seedTypedSkills, syncStackFromSkills } from './skill-seed'
import { buildTalentDeletionPreview, type TalentDeletionPreview } from './talent-deletion-preview'

/** Un champ réellement modifié — la matière du journal d'écriture. */
type TalentFieldChange = { field: string; oldValue: unknown; newValue: unknown }

/**
 * Ce que l'appelant a le droit de VOIR sur une fiche talent (PDF 3 §13.1).
 *
 * Deux axes indépendants : les coordonnées (masquables par réglage d'espace,
 * décision D20) et les montants financiers (permission `finance:read`). Ce qui
 * n'est pas visible est RETIRÉ de la réponse — pas mis à zéro ni à vide, même
 * arbitrage que la marge d'une mission : un zéro se lit comme une valeur.
 */
export type TalentVisibility = { contacts: boolean; finance: boolean }

const FULL_VISIBILITY: TalentVisibility = { contacts: true, finance: true }

/**
 * « Un sous-traitant porte toujours son partenaire » (PDF 3 §2, règle 3), dit à
 * l'utilisateur.
 *
 * UNE seule phrase pour les deux portes — la création lit le corps de la requête,
 * la mise à jour lit la ligne fusionnée — parce que deux copies d'un message
 * divergent, et que l'utilisateur qui les compare ne saurait plus laquelle décrit
 * sa situation.
 */
export const PARTNER_REQUIRED_MESSAGE =
  'Un sous-traitant est porté par un partenaire : indiquez lequel. Sans lui, la fiche ne dit pas qui est responsable devant le client.'

/**
 * #2195.12 — personne n'est son propre manager.
 *
 * Une fiche qui se désigne elle-même produit une chaîne hiérarchique qui
 * boucle, et c'est une saisie qu'un doigt fait une fois. La contrainte
 * `consultants_manager_not_self` la refuse en base ; ce message est ce que
 * l'utilisateur LIT à la place d'un 500.
 */
export const MANAGER_OUT_OF_WORKSPACE_MESSAGE =
  'Ce manager est introuvable dans votre espace. Choisissez une fiche de votre équipe, ou laissez le champ vide.'
export const MANAGER_NOT_SELF_MESSAGE =
  'Une personne ne peut pas être son propre manager. Choisissez quelqu’un d’autre, ou laissez le champ vide.'
import {
  type MatchTarget,
  matchConsultant,
  rankConsultants,
  selectDefendableTop,
  selectPush,
} from './consultant-matching'
import { applyConsultantScope } from './consultant-scope'
import { sanitizeCvRewrite } from './cv-rewrite-guard'
import { GeocodingService } from './geocoding.service'
import {
  buildEnrichmentInput,
  demoSearchPeopleByName,
  demoTalentEnrichmentPatch,
  enrichmentPatchFrom,
} from './talent-enrichment'
import { classifyEnrichmentFailure } from '../contacts/enrichment-failure'
import { readableColumns } from './consultant-wire-columns'
import { importedExtraFor } from './imported-extra-visibility'

/** Un champ RÉELLEMENT écrit par l'enrichissement — matière du journal de
 *  provenance que le contrôleur pose (GA-07 : c'est lui qui traverse deux
 *  domaines, comme pour `commitCvParse`). */
type TalentEnrichmentWrite = { field: string; previous: unknown; value: string; source: FieldSource }

type TalentEnrichmentOutcome =
  | { ok: true; consultant: Consultant; written: TalentEnrichmentWrite[] }
  | { ok: false; code: 'not_found' | 'no_identity' | 'no_match_key' | 'ia_failed' }

/**
 * Vivier de consultants (annexe méthodo p22).
 *
 * CRUD scopé workspace (comme le reste des tables métier) + le matching d'un
 * besoin contre le vivier. Le classement lui-même vit dans `consultant-matching`
 * (pur, testé sans base) : ce service ne fait que charger les données et déléguer.
 */
/** `text` libre en base → valeur du contrat. Inconnu ⇒ `null` : afficher une
 *  clé brute vaut moins que dire « on ne sait pas ». */
function normaliseSource(raw: string | null): Consultant['source'] {
  if (!raw) return null
  const parsed = consultantSourceSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null
  // #4401.1 — une date invalide n'est pas une date : `toISOString()` y jette un RangeError (donc un 500).
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
  return String(value)
}

/** `bigint` Postgres → nombre. TypeORM le rend en chaîne pour ne pas perdre de
 *  précision ; un montant en centimes tient largement dans un `number`. */
function toCents(value: string | number | null): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

@Injectable()
export class ConsultantsService {
  private readonly logger = new Logger(ConsultantsService.name)

  constructor(
    @InjectRepository(ConsultantEntity)
    private readonly repo: Repository<ConsultantEntity>,
    @InjectRepository(ProjectEntity)
    private readonly opportunities: Repository<ProjectEntity>,
    @InjectRepository(ConsultantPushFeedbackEntity)
    private readonly feedback: Repository<ConsultantPushFeedbackEntity>,
    @InjectRepository(ConsultantCvRewriteEntity)
    private readonly cvRewrites: Repository<ConsultantCvRewriteEntity>,
    private readonly ia: IaClient,
    private readonly geocoding: GeocodingService,
  ) {}

  /**
   * Le CV du consultant réécrit pour un besoin (annexe méthodo p22 « Réécriture
   * du CV selon la mission »).
   *
   * Le seul appel LLM du vivier, et le plus risqué du produit : on demande à un
   * modèle de rendre un profil plus convaincant sur un besoin. La sortie ne part
   * donc JAMAIS telle quelle — `sanitizeCvRewrite` va chercher chaque citation
   * dans le CV source et retire ce qu'il ne retrouve pas, en le disant.
   *
   * Codes de retour, tous distincts parce que l'écran doit dire lequel :
   *   - `not_found`   : consultant ou besoin hors du scope de l'appelant ;
   *   - `no_cv`       : aucun CV source — rien à réécrire, et surtout rien à
   *                     vérifier. On refuse plutôt que de laisser composer ;
   *   - `ia_failed`   : l'IA n'a pas répondu. Rien n'est persisté.
   */
  async rewriteCv(
    consultantId: string,
    opportunityId: string,
    workspaceId: string | null,
    userId: string,
    generatedAt: string = new Date().toISOString(),
  ): Promise<{ ok: true; rewrite: ConsultantCvRewrite } | { ok: false; code: 'not_found' | 'no_cv' | 'ia_failed' }> {
    const entity = await this.findScoped(consultantId, workspaceId, userId)
    const target = await this.loadTarget(opportunityId, workspaceId)
    if (!entity || !target) return { ok: false, code: 'not_found' }

    const consultant = this.toWire(entity)
    if (!consultant.cv_text?.trim()) return { ok: false, code: 'no_cv' }

    let raw: unknown
    try {
      const envelope = await this.ia.rewriteCv({
        consultant: consultant as unknown as Record<string, unknown>,
        mission: target as unknown as Record<string, unknown>,
      })
      raw = (envelope as { data?: unknown }).data
    } catch (error) {
      this.logger.warn('CV rewrite failed — nothing persisted', {
        error: error instanceof Error ? error.message : String(error),
        consultantId,
        opportunityId,
      })
      return { ok: false, code: 'ia_failed' }
    }

    const rewrite = sanitizeCvRewrite(raw, consultant, target, generatedAt)

    // Upsert sur (consultant, besoin) : régénérer remplace le CV courant.
    const existing = await this.cvRewrites.findOne({
      where: { consultant_id: consultantId, opportunity_id: opportunityId },
    })
    await this.cvRewrites.save(
      existing
        ? Object.assign(existing, { content: rewrite })
        : this.cvRewrites.create({
            workspace_id: workspaceId,
            user_id: userId,
            consultant_id: consultantId,
            opportunity_id: opportunityId,
            content: rewrite,
          }),
    )
    return { ok: true, rewrite }
  }

  /** Le CV déjà réécrit pour ce couple, s'il existe. `null` = jamais généré (ou
   *  hors scope) — l'écran propose alors de le générer, il n'en invente pas un. */
  async findCvRewrite(
    consultantId: string,
    opportunityId: string,
    workspaceId: string | null,
    userId: string,
  ): Promise<ConsultantCvRewrite | null> {
    const consultant = await this.findScoped(consultantId, workspaceId, userId)
    if (!consultant) return null
    const row = await this.cvRewrites.findOne({
      where: { consultant_id: consultantId, opportunity_id: opportunityId },
    })
    return row?.content ?? null
  }

  /**
   * Enregistre le feedback d'un push (annexe méthodo p22 « retenu / refusé,
   * raison, apprentissage »). Append-only. Le consultant est vérifié dans le
   * workspace de l'appelant — `null` si hors scope.
   */
  async recordFeedback(
    consultantId: string,
    workspaceId: string | null,
    userId: string,
    input: RecordPushFeedback,
  ): Promise<ConsultantPushFeedback | null> {
    const consultant = await this.findScoped(consultantId, workspaceId, userId)
    if (!consultant) return null
    const saved = await this.feedback.save(
      this.feedback.create({
        workspace_id: workspaceId,
        user_id: userId,
        consultant_id: consultantId,
        opportunity_id: input.opportunity_id ?? null,
        outcome: input.outcome,
        reason: input.reason ?? null,
        learning: input.learning ?? null,
      }),
    )
    return this.feedbackToWire(saved)
  }

  /** Le REX d'un consultant : ses pushs passés et leur issue, récent d'abord. */
  async listFeedback(
    consultantId: string,
    workspaceId: string | null,
    userId: string,
  ): Promise<ConsultantPushFeedback[] | null> {
    const consultant = await this.findScoped(consultantId, workspaceId, userId)
    if (!consultant) return null
    const rows = await this.feedback.find({
      where: { consultant_id: consultantId },
      order: { created_at: 'DESC' },
    })
    return rows.map(row => this.feedbackToWire(row))
  }

  /**
   * Le brief de soutenance d'un consultant sur un besoin (annexe méthodo p22).
   * Déterministe : dérivé du consultant + du besoin + du match. `null` si l'un
   * des deux est hors scope.
   */
  async buildBrief(
    consultantId: string,
    opportunityId: string,
    workspaceId: string | null,
    userId: string,
  ): Promise<ConsultantBrief | null> {
    const entity = await this.findScoped(consultantId, workspaceId, userId)
    const target = await this.loadTarget(opportunityId, workspaceId)
    if (!entity || !target) return null
    const consultant = this.toWire(entity)
    return buildConsultantBrief(consultant, target, matchConsultant(consultant, target))
  }

  /**
   * #2189.23-.30 (épopée #2940) — le brief D'ENTRETIEN, distinct du brief de
   * soutenance ci-dessus : objectif, pitch, deux expériences, gaps,
   * objections, questions pour le consultant. Les participants et la
   * logistique restent ceux de l'entretien PLANIFIÉ (`GET
   * /submissions/:id/interviews`), jamais dupliqués ici.
   */
  async buildInterviewBrief(
    consultantId: string,
    opportunityId: string,
    workspaceId: string | null,
    userId: string,
  ): Promise<InterviewBrief | null> {
    const entity = await this.findScoped(consultantId, workspaceId, userId)
    const target = await this.loadTarget(opportunityId, workspaceId)
    if (!entity || !target) return null
    const consultant = this.toWire(entity)
    return buildInterviewBrief(consultant, target, matchConsultant(consultant, target))
  }

  private feedbackToWire(row: ConsultantPushFeedbackEntity): ConsultantPushFeedback {
    return {
      id: row.id,
      consultant_id: row.consultant_id,
      opportunity_id: row.opportunity_id,
      outcome: row.outcome as ConsultantPushFeedback['outcome'],
      reason: row.reason,
      learning: row.learning,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    }
  }

  /**
   * #5017.2 — les consultants de l'espace qui connaissent le secteur d'un compte. Lecture seule, filtrée
   * `workspace_id` : une fiche d'un autre espace ne sort jamais.
   */
  async listKnowingSector(workspaceId: string | null, userId: string, sector: string) {
    const qb = this.repo.createQueryBuilder('c').orderBy('c.updated_at', 'DESC')
    if (workspaceId) {
      qb.where('(c.workspace_id = :workspaceId OR (c.workspace_id IS NULL AND c.user_id = :userId))', {
        workspaceId,
        userId,
      })
    } else {
      qb.where('c.user_id = :userId', { userId })
    }
    qb.andWhere('c.archived_at IS NULL')
    const rows = await qb.getMany()
    return { sector, consultants: consultantsKnowingSector(rows, sector) }
  }

  /** Le vivier de l'équipe, plus récent d'abord. Repli sur `user_id` tant que le
   *  roll-out workspace n'est pas terminé, comme la policy RLS. */
  async listForWorkspace(
    workspaceId: string | null,
    userId: string,
    visibility: TalentVisibility = FULL_VISIBILITY,
  ): Promise<Consultant[]> {
    const qb = this.repo.createQueryBuilder('c').orderBy('c.updated_at', 'DESC')
    if (workspaceId) {
      qb.where('(c.workspace_id = :workspaceId OR (c.workspace_id IS NULL AND c.user_id = :userId))', {
        workspaceId,
        userId,
      })
    } else {
      qb.where('c.user_id = :userId', { userId })
    }
    const rows = await qb.getMany()
    // #2195.12 — UNE lecture pour tout le lot, jamais une par ligne : c'est la
    // résolution symétrique de `accountsOf` côté missions.
    const managerNames = await this.managerNamesOf(rows)
    const ownerNames = await this.ownerNamesOf(rows)
    return rows.map(row => this.toWire(row, visibility, managerNames, ownerNames))
  }

  /**
   * #2195.12 — LE NOM DES MANAGERS D'UN LOT DE FICHES, en une requête.
   *
   * Une entrée à `null` veut dire « la fiche pointée existe mais n'a pas encore
   * de nom » (D366 : `full_name` est nullable) ; une entrée ABSENTE veut dire
   * que la fiche pointée est introuvable — hors de l'espace, ou supprimée entre
   * les deux lectures. Les deux rendent « non renseigné » à l'écran, jamais un
   * identifiant brut ni un nom de repli.
   *
   * Une lecture qui ÉCHOUE rend une table vide : la fiche s'ouvre quand même,
   * avec « non renseigné ». Un incident de base ne doit pas fermer un écran.
   */
  private async managerNamesOf(rows: readonly ConsultantEntity[]): Promise<ReadonlyMap<string, string | null>> {
    const ids = [...new Set(rows.map(row => row.manager_id).filter((id): id is string => Boolean(id)))]
    if (ids.length === 0) return new Map()
    try {
      // #4559 — le filtre d'espace est dans la requête : un manager d'un autre
      // espace (donnée antérieure à la garde d'écriture) reste « non renseigné ».
      const workspaceIds = [...new Set(rows.map(row => row.workspace_id).filter((w): w is string => Boolean(w)))]
      const legacyUserIds = [...new Set(rows.filter(row => !row.workspace_id).map(row => row.user_id))]
      const scope: FindOptionsWhere<ConsultantEntity>[] = []
      if (workspaceIds.length > 0) scope.push({ id: In(ids), workspace_id: In(workspaceIds) })
      if (legacyUserIds.length > 0) scope.push({ id: In(ids), workspace_id: IsNull(), user_id: In(legacyUserIds) })
      if (scope.length === 0) return new Map()
      const managers = await this.repo.find({ where: scope, select: ['id', 'full_name'] })
      return new Map(managers.map(manager => [manager.id, manager.full_name ?? null]))
    } catch (err) {
      this.logger.error('managerNamesOf error', { error: err })
      return new Map()
    }
  }

  /**
   * #2185.10 — LE NOM DES RÉFÉRENTS COMMERCIAUX d'un lot de fiches, en une
   * requête. Même patron que {@link managerNamesOf}, mais résolu via
   * `profiles` (le référent est un membre de l'espace, pas un consultant) —
   * même requête que `AccountsService.resolveOwnerNames`.
   *
   * Une entrée ABSENTE ou `null` se lit « non attribué » à l'écran ; une
   * lecture qui échoue rend une table vide plutôt que de faire tomber la fiche.
   */
  private async ownerNamesOf(rows: readonly ConsultantEntity[]): Promise<ReadonlyMap<string, string | null>> {
    const ids = [...new Set(rows.map(row => row.owner_user_id).filter((id): id is string => Boolean(id)))]
    if (ids.length === 0) return new Map()
    try {
      const owners = await this.repo.manager.query<
        { userId: string; firstName: string | null; lastName: string | null; email: string | null }[]
      >(
        `SELECT user_id AS "userId", first_name AS "firstName", last_name AS "lastName", email AS "email"
         FROM profiles WHERE user_id = ANY($1)`,
        [ids],
      )
      const entries = owners
        .map(o => {
          const name = [o.firstName, o.lastName].filter(Boolean).join(' ').trim() || (o.email ?? '')
          return name ? ([o.userId, name] as [string, string]) : null
        })
        .filter((entry): entry is [string, string] => entry !== null)
      return new Map(entries)
    } catch (err) {
      this.logger.error('ownerNamesOf error', { error: err })
      return new Map()
    }
  }

  /**
   * Le réglage de cloisonnement des coordonnées de l'espace (D20).
   *
   * Repli à `false` en cas de lecture impossible : le défaut du produit est
   * OUVERT, et une panne de lecture ne doit pas cacher des données à ceux qui y
   * ont droit — même arbitrage que le cloisonnement de portefeuille.
   */
  async hidesTalentContacts(workspaceId: string | null): Promise<boolean> {
    if (!workspaceId) return false
    try {
      const rows = await this.repo.manager.query<{ hide_talent_contacts_from_sales: boolean }[]>(
        `SELECT hide_talent_contacts_from_sales FROM workspaces WHERE id = $1`,
        [workspaceId],
      )
      return rows[0]?.hide_talent_contacts_from_sales === true
    } catch {
      return false
    }
  }

  /** Une fiche, scopée. `null` = hors de l'espace de l'appelant ou inconnue. */
  async findOneScoped(
    id: string,
    workspaceId: string | null,
    userId: string,
    visibility: TalentVisibility = FULL_VISIBILITY,
  ): Promise<Consultant | null> {
    const row = await this.findScoped(id, workspaceId, userId)
    if (!row) return null
    // #2195.12 / #2185.10 — la FICHE est l'endroit où le manager ET le
    // référent commercial s'affichent : leurs noms y sont résolus, sinon
    // l'écran n'aurait qu'un identifiant à montrer.
    return this.toWire(row, visibility, await this.managerNamesOf([row]), await this.ownerNamesOf([row]))
  }

  /**
   * #4559 — `manager_id` est un identifiant ÉTRANGER à la ligne : il doit
   * désigner une fiche du MÊME espace, vérifié ici, à l'écriture. Sans cela le
   * `full_name` d'une fiche d'un autre espace ressortait en `manager_name`.
   * `null`/absent ne valide rien (retirer ou ne pas toucher reste permis).
   */
  private async assertManagerInWorkspace(
    managerId: string | null | undefined,
    workspaceId: string | null,
    userId: string,
  ): Promise<void> {
    if (!managerId) return
    if (!(await this.findScoped(managerId, workspaceId, userId))) {
      throw new BadRequestException(MANAGER_OUT_OF_WORKSPACE_MESSAGE)
    }
  }

  async create(workspaceId: string | null, userId: string, input: ConsultantUpsert): Promise<Consultant> {
    // #3781 — une personne EFFACÉE (RGPD art. 17) ne revient pas par la saisie :
    // l'empreinte posée à l'effacement répond avant toute écriture.
    if (
      await isErasedConsultantIdentity(this.repo.manager, workspaceId, {
        full_name: input.full_name ?? null,
        email: input.email ?? null,
        public_profile_url: input.public_profile_url ?? null,
      })
    ) {
      throw new ConflictException(
        'Cette personne a demandé l’effacement de ses données : sa fiche ne peut pas être recréée.',
      )
    }
    await this.assertManagerInWorkspace(input.manager_id, workspaceId, userId)
    const entity = this.repo.create({
      ...this.fromUpsert(input),
      workspace_id: workspaceId,
      user_id: userId,
    })
    // Géocodé À LA SAISIE de la ville (§ décision du 31/08) : une fiche neuve
    // qui porte déjà des zones doit être trouvable au rayon dès sa création,
    // pas seulement à la première modification qui touche `zones`.
    if (input.zones !== undefined) await this.applyGeocoding(entity, input.zones)
    const saved = await this.repo.save(entity)
    await this.seedSkills(saved.id, workspaceId, saved.stack, 'declared')
    await this.syncStack(saved)
    return this.toWire(saved)
  }

  /**
   * La liste libre de la fiche → le référentiel typé, sans jamais rien écraser.
   *
   * Trouvé en recette : le champ « Compétences / stack » de la fiche et l'onglet
   * « Compétences » lisaient deux tables différentes, si bien qu'un recruteur
   * remplissait le premier et voyait « Aucune compétence saisie » dans le
   * second. Le semis relie les deux.
   *
   * Trois propriétés, chacune pour un accident précis :
   *  - `ON CONFLICT DO NOTHING` : une compétence vue en mission ne retombe
   *    jamais à « déclaré » parce que quelqu'un a réenregistré la fiche ;
   *  - niveau `inconnu` : personne n'a évalué ces compétences, et « autonome »
   *    (le défaut de la table) afficherait devant un client une évaluation que
   *    personne n'a faite ;
   *  - aucune suppression : retirer un mot de la liste libre n'efface pas une
   *    compétence prouvée ailleurs — c'est l'onglet qui sert à en retirer une.
   *
   * L'échec ne fait PAS tomber l'enregistrement de la fiche : la fiche est le
   * geste de l'utilisateur, le semis est un confort. Il est journalisé.
   */
  private async seedSkills(
    consultantId: string,
    workspaceId: string | null,
    stack: string[] | null,
    source: 'declared' | 'cv',
  ): Promise<void> {
    try {
      await seedTypedSkills(this.repo.manager, { consultantId, workspaceId, stack, source })
    } catch (error) {
      this.logger.error(`Semis des compétences impossible pour ${consultantId}`, { error })
    }
  }

  /**
   * #5016.1 — `consultant_skills` FAIT FOI : après toute écriture de la fiche, la
   * liste libre `stack` se resynchronise sur le référentiel (additif, filtré par
   * espace). L'échec ne fait pas tomber l'enregistrement — il est journalisé.
   */
  private async syncStack(saved: ConsultantEntity): Promise<void> {
    try {
      const next = await syncStackFromSkills(this.repo.manager, {
        consultantId: saved.id,
        workspaceId: saved.workspace_id,
      })
      if (next) saved.stack = next
    } catch (error) {
      this.logger.error(`Synchronisation de la liste de compétences impossible pour ${saved.id}`, { error })
    }
  }

  /**
   * Géocode la PREMIÈRE zone déclarée via la Base Adresse Nationale, et pose
   * ses coordonnées sur l'entité (§ décision de Louis du 31/08/2026, écran
   * Vivier).
   *
   * Une seule ville et non toutes les `zones` : le rayon a besoin d'UN centre
   * par fiche, pas d'un géocodage par élément d'une liste qui mélange déjà des
   * villes (« Lyon »), des régions (« IDF ») et des mots-clés (« remote »).
   *
   * ⚠️ N'ÉCRIT JAMAIS D'ERREUR VISIBLE : un échec de géocodage (réseau
   * indisponible, ville inconnue de la BAN) laisse les coordonnées à `null` —
   * la ville SAISIE reste ce qu'elle est, rien n'est inventé à sa place. La
   * fiche s'enregistre quand même ; elle sortira seulement du filtre par rayon
   * tant que personne n'aura reposé une zone géocodable.
   */
  private async applyGeocoding(entity: ConsultantEntity, zones: readonly string[]): Promise<void> {
    const city = zones[0]?.trim()
    if (!city) {
      entity.latitude = null
      entity.longitude = null
      return
    }
    const point = await this.geocoding.geocode(city)
    entity.latitude = point?.latitude ?? null
    entity.longitude = point?.longitude ?? null
  }

  /**
   * Mise à jour partielle, scopée : un id d'une autre équipe est introuvable
   * (renvoie `null`), jamais modifié.
   *
   * Rend aussi les champs RÉELLEMENT changés, pour que l'appelant les
   * journalise. Éditer une fiche talent n'écrivait aucune ligne d'audit alors
   * que comptes et contacts en écrivent depuis la tranche T0 — un TJM changeait
   * sans laisser de trace, et c'est le champ le plus discuté d'une fiche.
   * Le journal est écrit par le CONTRÔLEUR : un service qui en importerait un
   * autre franchirait une frontière que la garde GA-07 tient fermée.
   */
  async update(
    id: string,
    workspaceId: string | null,
    userId: string,
    input: ConsultantUpsert,
  ): Promise<{ consultant: Consultant; changes: TalentFieldChange[] } | null> {
    const existing = await this.findScoped(id, workspaceId, userId)
    if (!existing) return null
    await this.assertManagerInWorkspace(input.manager_id, workspaceId, userId)
    const patch = this.fromUpsert(input)
    const changes: TalentFieldChange[] = []
    for (const [field, next] of Object.entries(patch)) {
      const before = (existing as unknown as Record<string, unknown>)[field]
      // Comparaison sur la forme sérialisée : deux tableaux d'égal contenu sont
      // des objets différents, et les journaliser produirait une ligne à chaque
      // enregistrement, y compris quand rien n'a bougé.
      if (JSON.stringify(before ?? null) === JSON.stringify(next ?? null)) continue
      changes.push({ field, oldValue: before ?? null, newValue: next ?? null })
    }
    Object.assign(existing, patch)
    // #5016.3 — correction humaine gagne : la stack enregistrée par une personne fait foi,
    // syncStack et le rattrapage ne réajoutent plus ce qu'elle a retiré.
    if (input.stack !== undefined) existing.stack_edited_by_human_at = new Date()
    // La règle se pose sur la ligne FUSIONNÉE, pas sur le corps de la requête.
    //
    // Le contrôleur lit le corps, et `missingPartnerForEngagement` rend `false`
    // dès que `engagement_kind` en est absent — ce qui est juste à la création,
    // où le corps EST la ligne. Sur une mise à jour partielle, un corps qui pose
    // `partner_account_id: null` sans redire l'engagement traversait la garde et
    // laissait une fiche sous-traitante que plus personne ne portait. C'est le
    // trou que la contrainte `consultants_subcontracting_partner_check` ferme
    // côté base ; ici on le ferme avec une PHRASE, parce qu'une violation de
    // `CHECK` remonte en erreur de driver et se lit 500.
    if (
      missingPartnerForEngagement({
        engagement_kind: existing.engagement_kind as EngagementKind,
        partner_account_id: existing.partner_account_id,
      })
    ) {
      throw new BadRequestException(PARTNER_REQUIRED_MESSAGE)
    }
    // #2195.12 — personne n'est son propre manager. La contrainte
    // `consultants_manager_not_self` le refuse côté base ; ici on le refuse avec
    // une PHRASE, parce qu'une violation de `CHECK` remonte en erreur de driver
    // et se lit 500. Même patron que le partenaire juste au-dessus.
    if (existing.manager_id !== null && existing.manager_id === existing.id) {
      throw new BadRequestException(MANAGER_NOT_SELF_MESSAGE)
    }
    // Regéocodé QUAND `zones` a été envoyé — même si le contenu final est
    // identique à l'ancien : un appelant qui renvoie la même ville ne doit
    // pas se retrouver avec des coordonnées jamais posées parce que la
    // création, elle, datait d'avant ce lot.
    if (input.zones !== undefined) await this.applyGeocoding(existing, existing.zones)
    const saved = await this.repo.save(existing)
    if (input.stack !== undefined) {
      await this.seedSkills(saved.id, saved.workspace_id, saved.stack, 'declared')
      // #3812.1 — un mot retiré du formulaire retire la compétence DÉCLARÉE du
      // référentiel (jamais une compétence prouvée) : fiche, onglet, vivier,
      // matching et Laura lisent la même liste.
      try {
        await pruneDeclaredSkills(this.repo.manager, { consultantId: saved.id, stack: saved.stack })
      } catch (error) {
        this.logger.error(`Retrait des compétences déclarées impossible pour ${saved.id}`, { error })
      }
      await this.syncStack(saved)
    }
    return { consultant: this.toWire(saved), changes }
  }

  /**
   * #2570 — « voir les consultants comme des contacts concernant
   * l'enrichissement » : la MÊME cascade fournisseur que `ContactsService.
   * enrichContact` (`IaClient.enrichContact`), jamais dupliquée, à la
   * DEMANDE de l'utilisateur (jamais déclenchée automatiquement — le
   * contrôleur ne l'appelle que sur ce POST).
   *
   * `currentSources` est lu par le contrôleur (GA-07, comme pour
   * `commitCvParse`) : c'est ce qui empêche une réponse fournisseur d'écraser
   * un titre qu'un humain a corrigé à la main — « une correction humaine
   * gagne toujours ».
   */
  async enrichTalent(
    id: string,
    workspaceId: string | null,
    userId: string,
    currentSources: Partial<Record<string, FieldSource>>,
    // #3831.1 — `apolloId` : l'homonyme choisi après `searchPeopleByName`,
    // seule clé disponible quand la fiche n'a pas de profil LinkedIn.
    options: { demo: boolean; apolloId?: string },
  ): Promise<TalentEnrichmentOutcome> {
    const talent = await this.findScoped(id, workspaceId, userId)
    if (!talent) return { ok: false, code: 'not_found' }

    let candidate: ReturnType<typeof enrichmentPatchFrom>
    let source: FieldSource

    // #3831 — recette salle démo 09/10 (6072641916) : la démo prenait la
    // branche `demo` AVANT cette porte, donc ne refusait JAMAIS
    // `no_match_key` — une fiche sans LinkedIn ni apolloId rendait un
    // résultat scripté direct, « Chercher par nom » n'apparaissait jamais.
    // La porte est désormais commune aux deux chemins (craft rule 9 : ce
    // geste doit AUSSI se montrer en démo, y compris son refus naturel).
    const request = buildEnrichmentInput(talent, { apolloId: options.apolloId })
    if (!request.ok) return { ok: false, code: request.reason }

    if (options.demo) {
      // Parité démo (craft rule 9) : zéro appel réseau, zéro crédit — le
      // contrôleur ne débite jamais ce chemin.
      candidate = demoTalentEnrichmentPatch(talent)
      source = 'pipeline'
    } else {
      try {
        const response = await this.ia.enrichContact(request.input)
        candidate = enrichmentPatchFrom(response.data)
      } catch (error) {
        const { reason, detail } = classifyEnrichmentFailure(error)
        this.logger.error(`enrichTalent provider failure (${reason}): ${detail ?? 'no detail'}`, {
          error,
          consultantId: id,
          userId,
          tags: { provider: 'apollo', reason },
        })
        return { ok: false, code: 'ia_failed' }
      }
      source = 'pipeline'
    }

    const { accepted } = applyFieldUpdates<Pick<ConsultantEntity, 'title' | 'email' | 'phone' | 'public_profile_url'>>({
      incoming: candidate,
      incomingSource: source,
      current: talent,
      currentSources,
    })

    const written: TalentEnrichmentWrite[] = Object.entries(accepted).map(([field, value]) => ({
      field,
      previous: (talent as unknown as Record<string, unknown>)[field] ?? null,
      value: value as string,
      source,
    }))

    const patch: Partial<ConsultantEntity> = {
      ...accepted,
      // La trace de tentative avance MÊME quand rien n'a été accepté (une
      // correction humaine a tout bloqué) : « on a essayé et rien n'a
      // bougé » est aussi une information, distincte de « on n'a jamais
      // essayé ». Ces deux colonnes ne sont pas dans `consultantUpsertSchema`
      // (un humain ne les saisit jamais) : elles n'entrent pas dans le champ
      // de la garde `no-blind-record-writes` ni de l'arbitre de provenance.
      last_enrichment_at: new Date(),
      last_enrichment_source: options.demo ? 'demo' : 'pipeline',
    }
    Object.assign(talent, patch)
    const saved = await this.repo.save(talent)
    return { ok: true, consultant: this.toWire(saved), written }
  }

  /**
   * H-DECISIONS #4348 — « ajouter un consultant depuis l'URL de son profil
   * LinkedIn » (décision Louis 20/10, `c95_linkedin_fournisseur_sous_contrat`).
   *
   * L'URL est une clé d'identité confiée au fournisseur sous contrat de l'IA
   * (`enrichContact`, même cascade et même cache par profil que l'enrichissement
   * d'une fiche) — jamais une visite de linkedin.com. N'ÉCRIT RIEN : le brouillon
   * pré-remplit le formulaire, que l'humain relit avant d'enregistrer.
   *
   * Sans clé, sans résultat ou fournisseur en panne : le MÊME `profile_not_found`
   * (l'écran renvoie vers le texte collé) — jamais une donnée inventée, jamais
   * un nom de fournisseur. Démo : brouillon FICTIF, zéro appel réseau.
   */
  async lookupLinkedinProfile(
    rawUrl: string,
    options: { demo: boolean },
  ): Promise<{ ok: true; draft: LinkedinDraft } | { ok: false; code: 'invalid_url' | 'profile_not_found' }> {
    const profile = parseLinkedInProfileUrl(rawUrl)
    if (!profile) return { ok: false, code: 'invalid_url' }

    if (options.demo) {
      const first = profile.slug.split('-')[0] ?? ''
      const name = first ? first.charAt(0).toUpperCase() + first.slice(1) : 'Camille'
      return {
        ok: true,
        draft: {
          full_name: `${name} Démo`,
          title: 'Consultant data (fiche de démonstration)',
          public_profile_url: profile.url,
          email: null,
          phone: null,
          cv_text: 'Consultant data · Nordia · 2021-03 – aujourd’hui\nAnalyste BI · Acme · 2018-01 – 2021-02',
          stack: [],
          missing: ['email', 'phone', 'stack'],
          source: 'linkedin_profile',
        },
      }
    }

    try {
      const response = await this.ia.enrichContact({ linkedinUrl: profile.url })
      const draft = buildLinkedinDraft(response.data, profile.url)
      return draft ? { ok: true, draft } : { ok: false, code: 'profile_not_found' }
    } catch (error) {
      const { reason, detail } = classifyEnrichmentFailure(error)
      this.logger.warn(`linkedinLookup provider failure (${reason}): ${detail ?? 'no detail'}`, {
        tags: { provider: 'apollo', reason },
      })
      return { ok: false, code: 'profile_not_found' }
    }
  }

  /**
   * #3831.1 — « je tape un nom, je vois les homonymes, je choisis » : même
   * capacité que `ContactsService.searchPeopleByName` (#2727), jamais
   * dupliquée côté IA (`IaClient.searchPeopleByName`, tier GRATUIT People-
   * Search). Pure délégation : aucune écriture, aucun crédit débité ici — le
   * reveal (`enrichTalent` ci-dessus, avec l'`apolloId` de l'homonyme CHOISI)
   * reste le geste payant et séparé.
   *
   * Démonstration : même court-circuit que `enrichTalent` (craft rule 9) —
   * AUCUN appel Apollo réel.
   */
  async searchPeopleByName(
    fullName: string,
    organizationName: string | undefined,
    options: { demo: boolean },
  ): Promise<SearchPeopleByNameResult> {
    if (options.demo) return demoSearchPeopleByName(fullName, organizationName)
    return this.ia.searchPeopleByName({ fullName, organizationName })
  }

  /**
   * Ce qui partira, ce qui restera orphelin, ce qui est conservé (PDF 3 §7.3).
   *
   * Lecture seule, appelée AVANT le geste. `null` = talent introuvable dans
   * l'espace de l'appelant.
   */
  async deletionPreview(id: string, workspaceId: string | null, userId: string): Promise<TalentDeletionPreview | null> {
    const existing = await this.findScoped(id, workspaceId, userId)
    if (!existing) return null
    const today = new Date().toISOString().slice(0, 10)
    const [row] = await this.repo.manager.query<
      {
        skills: string
        documents: string
        submissions: string
        cv_rewrites: string
        push_feedback: string
        assignments: string
        open_assignments: string
      }[]
    >(
      `SELECT
         (SELECT count(*) FROM consultant_skills        WHERE consultant_id = $1)::text AS skills,
         (SELECT count(*) FROM consultant_documents     WHERE consultant_id = $1)::text AS documents,
         (SELECT count(*) FROM submissions              WHERE consultant_id = $1)::text AS submissions,
         (SELECT count(*) FROM consultant_cv_rewrites   WHERE consultant_id = $1)::text AS cv_rewrites,
         (SELECT count(*) FROM consultant_push_feedback WHERE consultant_id = $1)::text AS push_feedback,
         (SELECT count(*) FROM mission_assignments      WHERE consultant_id = $1)::text AS assignments,
         (SELECT count(*) FROM mission_assignments
            WHERE consultant_id = $1
              AND starts_on <= $2::date
              AND (ends_on IS NULL OR ends_on >= $2::date))::text AS open_assignments`,
      [id, today],
    )
    return buildTalentDeletionPreview({
      skills: Number(row?.skills ?? 0),
      documents: Number(row?.documents ?? 0),
      submissions: Number(row?.submissions ?? 0),
      cvRewrites: Number(row?.cv_rewrites ?? 0),
      pushFeedback: Number(row?.push_feedback ?? 0),
      assignments: Number(row?.assignments ?? 0),
      openAssignments: Number(row?.open_assignments ?? 0),
    })
  }

  /**
   * Sort une fiche du vivier actif (§10 B13, §13.2).
   *
   * Archiver et non supprimer : le cas courant n'est pas « cette fiche est une
   * erreur » mais « cette personne est partie ». Ses missions restent, ce qui
   * conserve la preuve de compétence dont l'ESN se sert pour vendre les
   * suivants — et un ancien revient parfois.
   */
  async archive(
    id: string,
    workspaceId: string | null,
    userId: string,
    reason: string | null,
  ): Promise<Consultant | null> {
    const existing = await this.findScoped(id, workspaceId, userId)
    if (!existing) return null
    await this.assertNoneOnMission([existing.id])
    existing.archived_at = existing.archived_at ?? new Date()
    existing.archived_reason = reason
    return this.toWire(await this.repo.save(existing))
  }

  /**
   * #4196 — un consultant en mission n'est JAMAIS archivé : le geste est refusé
   * (409) et nomme la date de fin. À l'unité seulement : EN LOT, l'archivage est
   * PARTIEL (#4191 G5, `archiveBulk`) — chaque ligne en mission est refusée et
   * nommée, les autres sont archivées.
   */
  private async assertNoneOnMission(ids: readonly string[]): Promise<void> {
    const busy = await findActiveEngagements(this.repo.manager, ids, new Date().toISOString().slice(0, 10))
    if (busy.length === 0) return
    const detail = (engagement: (typeof busy)[number]): string =>
      engagement.endsOn
        ? `en mission jusqu’au ${frenchDate(engagement.endsOn)}`
        : 'en mission (sans date de fin connue)'
    const first = busy[0]
    if (!first) return
    throw new ConflictException(
      busy.length === 1
        ? `Archivage refusé : ce consultant est ${detail(first)}.`
        : `Archivage refusé : ${busy.length} consultants sont en mission (le premier ${detail(first)}).`,
    )
  }

  /**
   * #2662.2 — archive une SÉLECTION de fiches en un geste (« nettoyer mon
   * vivier », Louis 20/09/2026). Le même geste que `archive()` ci-dessus,
   * jamais une suppression — appliqué en lot.
   *
   * UN SEUL SELECT pour toute la sélection (cloisonné par `applyConsultantScope`,
   * comme `findScoped`) puis un SEUL `save` en lot, au lieu d'un aller-retour
   * par identifiant — même patron que `ContactsService.sendEmailBulk`
   * (compte de requêtes fixe, pas O(n)). Un id hors du périmètre de l'espace,
   * ou déjà inexistant, revient dans `refused` (`not_found`) : il n'est PAS de son
   * workspace, il ne peut donc pas être touché — c'est `applyConsultantScope`
   * qui le garantit, testé par `consultants.service.archive-bulk.spec.ts`.
   */
  async archiveBulk(
    ids: readonly string[],
    workspaceId: string | null,
    userId: string,
    reason: string | null,
  ): Promise<ConsultantArchiveBulkResult> {
    const unique = [...new Set(ids)]
    if (unique.length === 0) return { archived: [], refused: [] }

    const found = await applyConsultantScope(
      this.repo.createQueryBuilder('c').where('c.id IN (:...ids)', { ids: unique }),
      'c',
      workspaceId,
      userId,
    ).getMany()
    const byId = new Map(found.map(entity => [entity.id, entity]))

    // Une seule lecture des affectations en cours pour tout le lot. Le premier
    // engagement de chaque consultant (fin la plus lointaine, ou inconnue) nomme
    // la date : même ordre que le refus à l'unité.
    const busy = await findActiveEngagements(
      this.repo.manager,
      found.map(entity => entity.id),
      new Date().toISOString().slice(0, 10),
    )
    const engagedUntil = new Map<string, string | null>()
    for (const engagement of busy) {
      if (!engagedUntil.has(engagement.consultantId)) engagedUntil.set(engagement.consultantId, engagement.endsOn)
    }

    const toSave: ConsultantEntity[] = []
    const refused: ConsultantArchiveBulkResult['refused'] = []
    for (const id of unique) {
      const entity = byId.get(id)
      if (!entity) {
        refused.push({ id, reason: 'not_found', ends_on: null })
        continue
      }
      if (engagedUntil.has(id)) {
        refused.push({ id, reason: 'on_mission', ends_on: engagedUntil.get(id) ?? null })
        continue
      }
      entity.archived_at = entity.archived_at ?? new Date()
      entity.archived_reason = reason
      toSave.push(entity)
    }

    const saved = toSave.length > 0 ? await this.repo.save(toSave) : []
    return { archived: saved.map(entity => entity.id), refused }
  }

  /**
   * Remet une fiche dans le vivier actif (§10 B14).
   *
   * ⚠️ Le consentement se lit AVANT. Réactiver remet la personne dans le
   * matching, donc dans les profils qu'on propose à des clients — et le
   * contrôle existait juste à côté, au positionnement, pas ici.
   *
   * L'arbitrage du dépôt s'applique tel quel plutôt que d'en inventer un
   * second : un consentement **expiré** refuse (l'accord a été donné puis a
   * expiré ; le reposer est un geste), un consentement **jamais recueilli**
   * laisse passer — bloquer là empêcherait de ranger un talent qu'on vient
   * justement de rappeler pour lui poser la question.
   */
  async reactivate(
    id: string,
    workspaceId: string | null,
    userId: string,
    now: Date = new Date(),
  ): Promise<Consultant | null> {
    const existing = await this.findScoped(id, workspaceId, userId)
    if (!existing) return null

    const state = consentState(
      {
        basis: (existing.consent_basis as TalentConsent['basis']) ?? null,
        givenAt: existing.consent_given_at ? existing.consent_given_at.toISOString() : null,
        expiresAt: existing.consent_expires_at ? existing.consent_expires_at.toISOString() : null,
        restrictions: existing.consent_restrictions ?? null,
      },
      now,
    )
    if (state === 'expired') {
      throw new ConflictException(
        'Le consentement de ce talent a expiré : le renouveler avant de le remettre dans le vivier actif.',
      )
    }

    existing.archived_at = null
    existing.archived_reason = null
    // Réactiver remet le compteur de rétention à zéro : c'est un contact, et
    // c'est ce qui justifie de garder le dossier.
    existing.last_contact_at = new Date()
    return this.toWire(await this.repo.save(existing))
  }

  /**
   * #2185.48 — « Valider disponibilité » : REVALIDER la disponibilité
   * DÉCLARÉE sans en changer la valeur (§3.3, `declared-availability.ts`).
   *
   * Toucher `availability`/`available_from` via l'édition générale (`update`,
   * plus haut) revalide déjà la fraîcheur — mais seulement quand la VALEUR
   * change. Confirmer une disponibilité qui reste juste (« oui, toujours
   * disponible sous un mois ») n'avait aucun chemin : re-saisir la même
   * valeur dans le formulaire d'édition ne déclenche AUCUNE écriture, et donc
   * AUCUNE revalidation de `availability_checked_at`.
   */
  async confirmAvailability(id: string, workspaceId: string | null, userId: string): Promise<Consultant | null> {
    const existing = await this.findScoped(id, workspaceId, userId)
    if (!existing) return null
    existing.availability_checked_at = new Date()
    return this.toWire(await this.repo.save(existing))
  }

  /**
   * #2948 (#2329.47) — « TJM validé » : un des 7 axes de l'accord avant
   * présentation. Même patron que `confirmAvailability` : un geste explicite
   * du commercial, jamais déduit d'une autre écriture.
   */
  async confirmTjmValidated(id: string, workspaceId: string | null, userId: string): Promise<Consultant | null> {
    const existing = await this.findScoped(id, workspaceId, userId)
    if (!existing) return null
    existing.tjm_validated_at = new Date()
    return this.toWire(await this.repo.save(existing))
  }

  /**
   * #2948 (#2329.51) — « CV validé ou règles d'usage acceptées ».
   */
  async confirmCvValidated(id: string, workspaceId: string | null, userId: string): Promise<Consultant | null> {
    const existing = await this.findScoped(id, workspaceId, userId)
    if (!existing) return null
    existing.cv_validated_at = new Date()
    return this.toWire(await this.repo.save(existing))
  }

  /**
   * BEL-SC-238 (#3267) — enregistre un trait observé en ENTRETIEN
   * (communication, autonomie). `source` n'est jamais un paramètre : il vaut
   * TOUJOURS `'interview'`, la seule source que ce geste peut écrire — même
   * garde de forme que `talentInterviewTraitSchema.source` (contrat).
   *
   * Une entrée par trait au plus : un nouveau geste REMPLACE la précédente
   * (l'entretien le plus récent fait foi), il ne l'empile pas.
   */
  async recordInterviewTrait(
    id: string,
    workspaceId: string | null,
    userId: string,
    input: RecordTalentInterviewTraitInput,
    recordedByName: string | null,
  ): Promise<Consultant | null> {
    const existing = await this.findScoped(id, workspaceId, userId)
    if (!existing) return null
    const entry: TalentInterviewTrait = {
      trait: input.trait,
      level: input.level,
      source: 'interview',
      note: input.note ?? null,
      recordedAt: new Date().toISOString(),
      recordedByName,
    }
    const previous = (existing.interview_traits ?? []) as TalentInterviewTrait[]
    existing.interview_traits = [...previous.filter(trait => trait.trait !== input.trait), entry]
    return this.toWire(await this.repo.save(existing))
  }

  /** BEL-SC-238 (#3267) — le temps avant efficacité ANNONCÉ en entretien, un
   *  fait unique qui remplace le précédent, jamais empilé. */
  async recordRampUp(
    id: string,
    workspaceId: string | null,
    userId: string,
    input: RecordTalentRampUpInput,
    recordedByName: string | null,
  ): Promise<Consultant | null> {
    const existing = await this.findScoped(id, workspaceId, userId)
    if (!existing) return null
    existing.ramp_up_band = input.band
    existing.ramp_up_note = input.note ?? null
    existing.ramp_up_recorded_at = new Date()
    existing.ramp_up_recorded_by_name = recordedByName
    return this.toWire(await this.repo.save(existing))
  }

  /**
   * #3406 — capitalise une information TERRAIN remontée par ce consultant.
   * APPEND-ONLY, même patron que `recordInterviewTrait` : une information
   * périmée reste dans l'historique plutôt que de disparaître (doctrine « on
   * archive, on ne supprime pas »).
   */
  async recordFieldReport(
    id: string,
    workspaceId: string | null,
    userId: string,
    input: RecordConsultantFieldReportInput,
    recordedByName: string | null,
  ): Promise<Consultant | null> {
    const existing = await this.findScoped(id, workspaceId, userId)
    if (!existing) return null
    const entry: ConsultantFieldReport = {
      id: randomUUID(),
      accountId: input.accountId ?? null,
      accountName: input.accountName ?? null,
      entity: input.entity ?? null,
      team: input.team ?? null,
      manager: input.manager ?? null,
      project: input.project ?? null,
      technologies: input.technologies ?? [],
      teamSize: input.teamSize ?? null,
      partnersObserved: input.partnersObserved ?? [],
      painPoints: input.painPoints ?? null,
      possibleSponsor: input.possibleSponsor ?? null,
      decisionMakers: input.decisionMakers ?? [],
      uncoveredNeed: input.uncoveredNeed ?? null,
      peopleToContact: input.peopleToContact ?? [],
      introductionPossible: input.introductionPossible ?? null,
      notForCommercialUse: input.notForCommercialUse ?? false,
      confidentialityLevel: input.confidentialityLevel,
      usageAuthorization: input.usageAuthorization ?? null,
      scope: input.scope ?? null,
      confidence: input.confidence,
      recordedByUserId: userId,
      recordedByName,
      declaredAt: new Date().toISOString(),
    }
    const previous = (existing.field_reports ?? []) as unknown as ConsultantFieldReport[]
    existing.field_reports = [...previous, entry] as unknown as ConsultantEntity['field_reports']
    return this.toWire(await this.repo.save(existing))
  }

  /**
   * #2185.10 — « Suivi par » : désigne (ou retire) le référent commercial de
   * la fiche. Même patron que `StaffingService.setClientManager` (#2836) :
   * une route à part de l'édition générale, `records:write`, une seule garde
   * d'appartenance avant l'écriture.
   *
   * Le membre DOIT appartenir au MÊME espace que la fiche — un utilisateur
   * d'un autre espace n'a aucune raison de porter ce talent. `ownerUserId:
   * null` retire l'attribution (« non attribué »), pas un état à part.
   */
  async setOwner(
    id: string,
    workspaceId: string | null,
    userId: string,
    ownerUserId: string | null,
  ): Promise<Consultant | null> {
    const existing = await this.findScoped(id, workspaceId, userId)
    if (!existing) return null
    if (ownerUserId) {
      const rows = await this.repo.manager.query<{ user_id: string }[]>(
        `SELECT user_id FROM workspace_members WHERE user_id = $1 AND workspace_id = $2 LIMIT 1`,
        [ownerUserId, workspaceId],
      )
      if (rows.length === 0) throw new BadRequestException("Ce membre n'appartient pas à l'espace de travail")
    }
    existing.owner_user_id = ownerUserId
    return this.toWire(await this.repo.save(existing), FULL_VISIBILITY, undefined, await this.ownerNamesOf([existing]))
  }

  /**
   * Les missions d'un talent, la plus récente d'abord (onglet 7).
   *
   * Les données existaient (`mission_assignments`) sans qu'aucune lecture ne les
   * relie au vivier : une fiche talent ne savait pas dire où la personne était
   * passée, alors que c'est la première question d'un client.
   */
  async missionsOf(
    id: string,
    workspaceId: string | null,
    userId: string,
  ): Promise<
    | {
        missionId: string
        label: string | null
        accountName: string | null
        status: string | null
        startsOn: string | null
        endsOn: string | null
        loadPercent: number
      }[]
    | null
  > {
    const existing = await this.findScoped(id, workspaceId, userId)
    if (!existing) return null
    const rows = await this.repo.manager.query<
      {
        mission_id: string
        label: string | null
        account_name: string | null
        status: string | null
        starts_on: string | null
        ends_on: string | null
        load_percent: number
      }[]
    >(
      `SELECT ma.mission_id, m.label, a.company_name AS account_name, m.status,
              ma.starts_on::text AS starts_on, ma.ends_on::text AS ends_on, ma.load_percent
         FROM mission_assignments ma
         JOIN missions m ON m.id = ma.mission_id
         LEFT JOIN accounts a ON a.id = m.account_id
        WHERE ma.consultant_id = $1
        ORDER BY ma.starts_on DESC`,
      [id],
    )
    return rows.map(row => ({
      missionId: row.mission_id,
      label: row.label,
      accountName: row.account_name,
      status: row.status,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      loadPercent: Number(row.load_percent),
    }))
  }

  /**
   * L'historique horodaté des taux (§8.1).
   *
   * Lu depuis le journal d'écriture plutôt que d'une table dédiée : le journal
   * enregistre déjà chaque changement avec son auteur et sa date depuis que les
   * fiches talent y écrivent. Une seconde table finirait par diverger de la
   * première, et il faudrait alors choisir laquelle croire.
   */
  async rateHistory(
    id: string,
    workspaceId: string | null,
    userId: string,
  ): Promise<{ field: string; oldValue: string | null; newValue: string | null; changedAt: string }[] | null> {
    const existing = await this.findScoped(id, workspaceId, userId)
    if (!existing) return null
    const rows = await this.repo.manager.query<
      { field: string; old_value: string | null; new_value: string | null; created_at: Date }[]
    >(
      `SELECT field, old_value, new_value, created_at
         FROM record_field_audit
        WHERE entity_type = 'consultant' AND entity_id = $1
          AND field IN ('tjm', 'min_tjm_cents', 'cost_rate_cents', 'purchase_tjm_cents')
        ORDER BY created_at DESC
        LIMIT 100`,
      [id],
    )
    return rows.map(row => ({
      field: row.field,
      oldValue: row.old_value,
      newValue: row.new_value,
      changedAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    }))
  }

  /**
   * Le matching du vivier contre un besoin (`opportunities.id`), scopé workspace.
   *
   * Rend le vivier ENTIER classé (`ranked`) — le commercial doit pouvoir regarder
   * au-delà des deux premiers —, le TOP des profils défendables (`top`, borné à
   * cinq, jamais rempli artificiellement — #2330.7/.9), plus la sélection
   * réellement poussable (`push`, bornée à 1-2, jamais un profil bloqué). Un
   * besoin d'une autre équipe est introuvable, jamais matché.
   */
  async matchOpportunity(
    opportunityId: string,
    workspaceId: string | null,
    userId: string,
  ): Promise<{ ranked: ConsultantMatch[]; top: ConsultantMatch[]; push: ConsultantMatch[] } | null> {
    const target = await this.loadTarget(opportunityId, workspaceId)
    if (!target) return null

    const consultants = await this.listForWorkspace(workspaceId, userId)
    // L'historique du CLIENT, pas du besoin : « un client qui a dit non à
    // quelqu'un ne l'a pas dit à un poste, il l'a dit à une personne ». Chargé
    // une fois pour tout le classement.
    const clientHistory = await this.clientHistoryFor(opportunityId, workspaceId)
    const ranked = rankConsultants(consultants, target, clientHistory)
    return { ranked, top: selectDefendableTop(ranked), push: selectPush(ranked) }
  }

  /**
   * Les passages antérieurs du vivier chez le client de CE besoin (§7.2).
   *
   * La chaîne passe par le projet, seul porteur du compte :
   * `project_needs → opportunities → accounts`. On remonte tous les
   * positionnements des AUTRES projets du même compte, parce que le drapeau
   * vaut pour le compte entier — c'est tout l'intérêt du ticket.
   *
   * Une lecture en échec rend `[]` : perdre le drapeau dégrade l'écran, le
   * faire tomber empêcherait tout matching.
   */
  private async clientHistoryFor(opportunityId: string, workspaceId: string | null): Promise<ClientHistoryEntry[]> {
    try {
      const rows = await this.repo.manager.query<
        { consultant_id: string; stage: string; outcome_reason: string | null; closed_at: Date | string | null }[]
      >(
        `SELECT s.consultant_id, s.stage, s.outcome_reason, s.closed_at
           FROM submissions s
           JOIN opportunities o ON o.id = s.project_id
          WHERE o.account_id = (SELECT account_id FROM opportunities WHERE id = $1)
            AND ($2::uuid IS NULL OR s.workspace_id = $2)
          ORDER BY s.closed_at DESC NULLS LAST
          LIMIT 2000`,
        [opportunityId, workspaceId],
      )
      return rows.map(row => ({
        consultantId: row.consultant_id,
        stage: row.stage,
        outcomeReason: row.outcome_reason,
        closedAt: row.closed_at instanceof Date ? row.closed_at.toISOString() : (row.closed_at ?? null),
      }))
    } catch {
      return []
    }
  }

  private async loadTarget(opportunityId: string, workspaceId: string | null): Promise<MatchTarget | null> {
    const row = await this.opportunities
      .createQueryBuilder('o')
      .leftJoin('accounts', 'a', 'a.id = o.account_id')
      .select([
        'o.label AS label',
        'o.detail AS detail',
        'o.offer AS offer',
        'a.sector AS sector',
        'a.headquarters AS zone',
      ])
      .where('o.id = :opportunityId', { opportunityId })
      .andWhere(workspaceId ? '(o.workspace_id = :workspaceId OR a.workspace_id = :workspaceId)' : '1 = 1', {
        workspaceId,
      })
      .getRawOne<{
        label: string
        detail: string | null
        offer: string | null
        sector: string | null
        zone: string | null
      }>()
    if (!row) return null
    return {
      label: row.label,
      detail: row.detail,
      offer: row.offer,
      sector: row.sector,
      zone: row.zone,
      mustHaveSkills: await this.mustHaveSkillsFor(opportunityId),
    }
  }

  /**
   * Les termes ÉLIMINATOIRES des besoins (`project_needs`) rattachés à cette
   * opportunité (#2330.3). `[]` quand aucun besoin détaillé n'y est rattaché —
   * l'opportunité reste matchée comme avant, rien n'est déduit d'un must-have
   * qui n'a pas été SAISI. Une lecture en échec dégrade au même `[]`, jamais
   * une erreur qui ferait tomber tout le matching pour un détail annexe.
   */
  private async mustHaveSkillsFor(opportunityId: string): Promise<string[]> {
    try {
      const rows = await this.opportunities.manager.query<{ skills: RequiredSkill[] }[]>(
        `SELECT skills FROM project_needs WHERE project_id = $1`,
        [opportunityId],
      )
      const terms = new Set<string>()
      for (const row of rows) {
        for (const skill of row.skills ?? []) {
          if (skill.required) terms.add(skill.term)
        }
      }
      return [...terms]
    } catch {
      return []
    }
  }

  private async findScoped(id: string, workspaceId: string | null, userId: string): Promise<ConsultantEntity | null> {
    // Prédicat de cloisonnement partagé (voir consultant-scope.ts, finding #2).
    return applyConsultantScope(
      this.repo.createQueryBuilder('c').where('c.id = :id', { id }),
      'c',
      workspaceId,
      userId,
    ).getOne()
  }

  /** Entité → forme de contrat. Les dates deviennent ISO, les nullités restent
   *  nulles (jamais un 0 ou une chaîne vide qui mentirait). */
  private toWire(
    raw: ConsultantEntity,
    visibility: TalentVisibility = FULL_VISIBILITY,
    /**
     * #2195.12 — les noms de managers déjà RÉSOLUS pour ce lot de lignes.
     *
     * ⚠️ Absent volontairement chez les appelants qui rendent une fiche qu'ils
     * viennent d'écrire : la clé `manager_name` SORT alors de la réponse, et
     * « pas résolu ici » ne se confond pas avec « pas de manager ». Vider la
     * clé aurait fait afficher « non renseigné » juste après une saisie.
     */
    managerNames?: ReadonlyMap<string, string | null>,
    /** #2185.10 — même contrat que `managerNames`, pour le référent commercial. */
    ownerNames?: ReadonlyMap<string, string | null>,
  ): Consultant {
    // #4401.1 — une colonne JSON de forme inattendue (CV importé partiel) est ramenée à « absent » et NOMMÉE ;
    // elle ne fait jamais tomber la fiche entière en 500.
    const { row, unreadable } = readableColumns(raw)
    if (unreadable.length > 0) this.logger.warn('fiche talent : colonnes illisibles', { id: raw.id, unreadable })
    return {
      id: row.id,
      workspace_id: row.workspace_id,
      manager_id: row.manager_id ?? null,
      ...(unreadable.length > 0 ? { unreadable_fields: unreadable } : {}),
      // Import universel (27/09/2026) — voir `importedExtraFor`.
      ...importedExtraFor(row.extra, visibility),
      ...(managerNames === undefined
        ? {}
        : { manager_name: row.manager_id ? (managerNames.get(row.manager_id) ?? null) : null }),
      owner_user_id: row.owner_user_id ?? null,
      ...(ownerNames === undefined
        ? {}
        : { owner_name: row.owner_user_id ? (ownerNames.get(row.owner_user_id) ?? null) : null }),
      // `kind` et `source` existaient en base depuis la tranche T5 et ne
      // franchissaient pas le fil : l'écran ne pouvait pas distinguer un
      // candidat d'un salarié. Une valeur hors contrat (la colonne `source`
      // est un `text` libre) devient `null` plutôt qu'une clé brute affichée.
      kind: row.kind === 'candidate' ? 'candidate' : 'consultant',
      source: normaliseSource(row.source),
      last_contact_at: toIso(row.last_contact_at),
      archived_at: toIso(row.archived_at),
      review_status: row.review_status === 'needs_review' ? 'needs_review' : 'qualified',
      consent: {
        givenAt: toIso(row.consent_given_at),
        expiresAt: toIso(row.consent_expires_at),
        basis: row.consent_basis ?? null,
        restrictions: row.consent_restrictions ?? null,
      },
      archived_reason: row.archived_reason ?? null,
      full_name: row.full_name,
      title: row.title,
      seniority: (row.seniority ?? 'inconnu') as Consultant['seniority'],
      years_experience: row.years_experience ?? null,
      // Lecture seule ici — l'écriture passe par `PUT /talents/:id/photo`
      // (`TalentPhotoService`), jamais par cet upsert (§ critère protégé).
      photoUrl: row.photo_url ?? null,
      availability: (row.availability ?? 'inconnu') as Consultant['availability'],
      available_from: row.available_from,
      contract_type: (row.contract_type ?? 'inconnu') as Consultant['contract_type'],
      engagement_kind: (row.engagement_kind ?? 'inconnu') as Consultant['engagement_kind'],
      partner_account_id: row.partner_account_id,
      // Ce qui n'est pas visible est RETIRÉ, pas mis à vide : « pas renseigné »
      // et « pas ton périmètre » sont deux informations différentes, et
      // confondre les deux ferait chercher une donnée qui existe.
      ...(visibility.contacts
        ? { email: row.email, phone: row.phone, location: row.location, public_profile_url: row.public_profile_url }
        : {}),
      contact_visible: visibility.contacts,
      tjm: row.tjm,
      ...(visibility.finance
        ? {
            min_tjm_cents: toCents(row.min_tjm_cents),
            cost_rate_cents: toCents(row.cost_rate_cents),
            purchase_tjm_cents: toCents(row.purchase_tjm_cents),
            tjm_metadata: row.tjm_metadata ?? null,
          }
        : {}),
      finance_visible: visibility.finance,
      // KEVIN-FIX K.2 — rattrape l'existant À LA LECTURE : une saisie d'un trait ou en doublon s'affiche découpée.
      stack: splitSkillEntries(row.stack ?? []),
      sectors: row.sectors ?? [],
      zones: row.zones ?? [],
      // #2183.26/#2784 — les formations lues dans le CV, persistées comme la
      // ville, jamais gated par `contact_visible` (ce n'est pas une coordonnée).
      education: row.education ?? [],
      // #3935.2a — `null` voyage tel quel : « non lu », jamais aplati en `[]`.
      environments: row.environments ?? null,
      tools: row.tools ?? null,
      certifications: row.certifications ?? null,
      mobility: {
        zones: row.mobility_zones,
        remote: (row.remote_preference ?? null) as Consultant['mobility']['remote'],
        travel: (row.travel_acceptance ?? null) as Consultant['mobility']['travel'],
        relocation: row.relocation,
        // #2948 (#2329.19/.22/.23)
        siteFrequency: (row.site_frequency ?? null) as Consultant['mobility']['siteFrequency'],
        international: row.international_mobility,
        restrictions: row.mobility_restrictions,
      },
      preferences: {
        wantedSectors: row.wanted_sectors ?? [],
        refusedSectors: row.refused_sectors ?? [],
        refusedTechnologies: row.refused_technologies ?? [],
        wantedContractKinds: row.wanted_contract_kinds ?? [],
        // #3410.10/.11/.13/.14 — retour bêta #3410.
        preferredClientTypes: row.preferred_client_types ?? [],
        refusedClients: row.refused_clients ?? [],
        environmentsToAvoid: row.environments_to_avoid ?? [],
        nonNegotiableConditions: row.non_negotiable_conditions ?? null,
      },
      // #2948 (#2329.30-.34) — owner NON repris ici : `owner_user_id`/`owner_name`
      // le portent déjà (GA-26), voir `talentProcessSchema`.
      process: {
        inProgress: row.process_in_progress,
        exclusive: row.process_exclusive,
        otherInterviews: row.process_other_interviews,
        decisionDeadline: row.process_decision_deadline,
      },
      // #2948 (#2329.45-.51) — `otherProcessesKnown` DÉRIVÉ de
      // `process_other_interviews`, jamais un second champ (GA-26).
      positioningAgreement: {
        tjmValidatedAt: toIso(row.tjm_validated_at),
        cvValidatedAt: toIso(row.cv_validated_at),
        otherProcessesKnown: row.process_other_interviews !== null,
      },
      // BEL-SC-238 (#3267) — ce que l'entretien a appris, jamais un CV.
      interviewAssessment: {
        traits: (row.interview_traits ?? []) as TalentInterviewTrait[],
        rampUp: row.ramp_up_band
          ? {
              band: row.ramp_up_band as RampUpBand,
              note: row.ramp_up_note,
              recordedAt: toIso(row.ramp_up_recorded_at) ?? new Date(0).toISOString(),
              recordedByName: row.ramp_up_recorded_by_name,
            }
          : null,
      },
      // #3406 — les informations terrain capitalisées, append-only.
      fieldReports: (row.field_reports ?? []) as unknown as ConsultantFieldReport[],
      references: row.references ?? [],
      languages: (row.languages ?? []) as Consultant['languages'],
      clearances: row.clearances ?? [],
      wants: row.wants,
      notes: row.notes,
      cv_text: row.cv_text,
      // #2570 — la trace du dernier enrichissement, voir `talent_enrichment.ts`.
      last_enrichment_at: toIso(row.last_enrichment_at),
      last_enrichment_source: (row.last_enrichment_source ?? null) as Consultant['last_enrichment_source'],
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    }
  }

  /** DTO validé → colonnes. Un champ absent de l'upsert n'écrase rien (mise à
   *  jour partielle) ; un champ présent mais `null` efface (l'utilisateur retire
   *  une info). On ne devine jamais une valeur non fournie. */
  private fromUpsert(input: ConsultantUpsert): Partial<ConsultantEntity> {
    const patch: Partial<ConsultantEntity> = { full_name: input.full_name }
    if (input.kind !== undefined) patch.kind = input.kind
    if (input.source !== undefined) patch.source = input.source ?? null
    if (input.consent_given_at !== undefined)
      patch.consent_given_at = input.consent_given_at ? new Date(input.consent_given_at) : null
    if (input.consent_expires_at !== undefined)
      patch.consent_expires_at = input.consent_expires_at ? new Date(input.consent_expires_at) : null
    if (input.consent_basis !== undefined) patch.consent_basis = input.consent_basis ?? null
    if (input.consent_restrictions !== undefined) patch.consent_restrictions = input.consent_restrictions ?? null
    if (input.title !== undefined) patch.title = input.title ?? null
    if (input.seniority !== undefined) patch.seniority = input.seniority
    if (input.years_experience !== undefined) patch.years_experience = input.years_experience ?? null
    if (input.availability !== undefined) patch.availability = input.availability
    if (input.available_from !== undefined) patch.available_from = input.available_from ?? null
    if (input.contract_type !== undefined) patch.contract_type = input.contract_type
    if (input.engagement_kind !== undefined) patch.engagement_kind = input.engagement_kind
    if (input.partner_account_id !== undefined) patch.partner_account_id = input.partner_account_id ?? null
    // #2195.12 — manager SAISI à la main, jamais dérivé : ni de la BU, ni du
    // propriétaire commercial. `null` retire, et « non renseigné » reste
    // « non renseigné » — aucun repli deviné ne prend sa place.
    if (input.manager_id !== undefined) patch.manager_id = input.manager_id ?? null
    if (input.email !== undefined) patch.email = input.email ?? null
    if (input.phone !== undefined) patch.phone = input.phone ?? null
    if (input.public_profile_url !== undefined) patch.public_profile_url = input.public_profile_url ?? null
    if (input.tjm !== undefined) patch.tjm = input.tjm ?? null
    if (input.min_tjm_cents !== undefined) patch.min_tjm_cents = input.min_tjm_cents ?? null
    if (input.cost_rate_cents !== undefined) patch.cost_rate_cents = input.cost_rate_cents ?? null
    if (input.purchase_tjm_cents !== undefined) patch.purchase_tjm_cents = input.purchase_tjm_cents ?? null
    if (input.tjm_metadata !== undefined) patch.tjm_metadata = input.tjm_metadata ?? null
    // KEVIN-FIX K.2 — « java spring vue » s'écrit en trois compétences, sans doublon.
    if (input.stack !== undefined) patch.stack = splitSkillEntries(input.stack)
    if (input.sectors !== undefined) patch.sectors = input.sectors
    if (input.zones !== undefined) patch.zones = input.zones
    if (input.mobility_zones !== undefined) patch.mobility_zones = input.mobility_zones ?? null
    if (input.remote_preference !== undefined) patch.remote_preference = input.remote_preference ?? null
    if (input.travel_acceptance !== undefined) patch.travel_acceptance = input.travel_acceptance ?? null
    if (input.relocation !== undefined) patch.relocation = input.relocation ?? null
    // #2948 (#2329.19/.22/.23)
    if (input.site_frequency !== undefined) patch.site_frequency = input.site_frequency ?? null
    if (input.international_mobility !== undefined) patch.international_mobility = input.international_mobility ?? null
    if (input.mobility_restrictions !== undefined) patch.mobility_restrictions = input.mobility_restrictions ?? null
    // #2948 (#2329.30-.34)
    if (input.process_in_progress !== undefined) patch.process_in_progress = input.process_in_progress ?? null
    if (input.process_exclusive !== undefined) patch.process_exclusive = input.process_exclusive ?? null
    if (input.process_other_interviews !== undefined)
      patch.process_other_interviews = input.process_other_interviews ?? null
    if (input.process_decision_deadline !== undefined)
      patch.process_decision_deadline = input.process_decision_deadline ?? null
    if (input.wanted_sectors !== undefined) patch.wanted_sectors = input.wanted_sectors
    if (input.refused_sectors !== undefined) patch.refused_sectors = input.refused_sectors
    if (input.refused_technologies !== undefined) patch.refused_technologies = input.refused_technologies
    if (input.wanted_contract_kinds !== undefined) patch.wanted_contract_kinds = input.wanted_contract_kinds
    // #3410.10/.11/.13/.14 — retour bêta #3410.
    if (input.preferred_client_types !== undefined) patch.preferred_client_types = input.preferred_client_types
    if (input.refused_clients !== undefined) patch.refused_clients = input.refused_clients
    if (input.environments_to_avoid !== undefined) patch.environments_to_avoid = input.environments_to_avoid
    if (input.non_negotiable_conditions !== undefined)
      patch.non_negotiable_conditions = input.non_negotiable_conditions ?? null
    if (input.references !== undefined) patch.references = input.references
    if (input.languages !== undefined) patch.languages = input.languages
    if (input.clearances !== undefined) patch.clearances = input.clearances
    // Toucher à la disponibilité, c'est la revalider : c'est ce geste-là que la
    // pénalité de fraîcheur mesure (§3.3), pas la date d'une modification de
    // note ou de TJM.
    if (input.availability !== undefined || input.available_from !== undefined) {
      patch.availability_checked_at = new Date()
    }
    if (input.wants !== undefined) patch.wants = input.wants ?? null
    if (input.notes !== undefined) patch.notes = input.notes ?? null
    if (input.cv_text !== undefined) patch.cv_text = input.cv_text ?? null
    return patch
  }
}
