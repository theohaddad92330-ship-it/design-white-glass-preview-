import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import {
  proofFieldsToPropose,
  proposeProofFields,
  serializeAuditValue,
  testimonialProblems,
  type CreateLostDealRex,
  type CreateLostDealRuleProposal,
  type CreateProof,
  type CreateRex,
  type CreateTestimonial,
  type EvidencedClaim,
  resolveProofSectorGroup,
  type LostDealRex,
  type LostDealRuleProposal,
  type LostDealRuleProposalDecision,
  type Proof,
  type ProofContentType,
  type ProofFieldProvenance,
  type ProofEvidenceField,
  type ProofFieldsProposal,
  type ProofSource,
  type RelationStagesBySirenResponse,
  relationshipStateSchema,
  type RexEntry,
  type CaseBuyingModel,
  type CaseOrganisation,
  type CaseStrategy,
  CASE_BUYING_MODELS,
  CASE_ORGANISATIONS,
  CASE_STRATEGIES,
  type TechnoPrevalenceTier,
  type Testimonial,
  type ValidateProofFields,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ActivityEntity } from '../../database/entities/activity.entity'
import { AccountPartnerEntity } from '../../database/entities/account-partner.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { OutreachMessageEntity } from '../../database/entities/outreach-message.entity'
import { LostDealRexEntity } from '../../database/entities/lost-deal-rex.entity'
import { LostDealRuleProposalEntity } from '../../database/entities/lost-deal-rule-proposal.entity'
import { MissionEntity } from '../../database/entities/mission.entity'
import { ProjectEntity } from '../../database/entities/project.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { ProofEntity } from '../../database/entities/proof.entity'
import { RecordFieldAuditEntity } from '../../database/entities/record-field-audit.entity'
import { RexEntryEntity } from '../../database/entities/rex-entry.entity'
import { TestimonialEntity } from '../../database/entities/testimonial.entity'
import {
  deriveSimilarCases,
  medianClosedCycleDays,
  observedCycleDays,
  openAgeDays,
  relationStageOf,
  similarityDimensionGaps,
  timingOf,
  deriveCaseMemory,
  meetingSourceGap,
  type CaseCandidate,
  type SimilarCase,
} from './similar-cases'

/** Une mission terminée dont personne n'a encore recueilli le retour. */
type PendingRex = {
  mission_id: string
  label: string
  account_id: string | null
  ended_on: string | null
}

/**
 * #2124.34 — un retour DÉJÀ recueilli sur CE compte.
 *
 * Volontairement plus étroit que `CollectedRexRow` (la vue d'espace) : ici le
 * compte est connu de l'appelant, le répéter sur chaque ligne n'apprendrait
 * rien. `mission_label` vaut `null` quand la mission citée n'est pas dans ce
 * compte — une donnée manquante, jamais un « Mission inconnue » de remplissage.
 */
type AccountRexRow = {
  id: string
  mission_id: string
  mission_label: string | null
  summary: string
  what_worked: string | null
  what_failed: string | null
  // #2424.3 — trois des quinze champs nommés.
  team: string | null
  skills: string | null
  constraints: string | null
  // #3210.2 (épopée #3246) — sept des douze champs restants.
  offer: string | null
  expertise: string | null
  access_path: string | null
  first_door: string | null
  proof_used: string | null
  cycle_duration: string | null
  partner: string | null
  strategy: CaseStrategy | null
  buying_model: CaseBuyingModel | null
  organisation: CaseOrganisation | null
  collected_at: string
}

export type AccountCapitalisation = {
  delivered: { mission_id: string; label: string; status: string; started_on: string | null; ended_on: string | null }[]
  proofs: Proof[]
  pendingRex: PendingRex[]
  /**
   * #2124.34 — LES RETOURS DÉJÀ RECUEILLIS, enfin rendus.
   *
   * Ces lignes étaient lues à chaque ouverture du dossier (`this.rex.find`)
   * et servaient UNIQUEMENT à soustraire les missions débriefées de
   * `pendingRex`. Leur contenu ne sortait d'aucune réponse : écrit par un
   * consultant qui revenait de mission, stocké, relu, jamais montré.
   */
  collectedRex: AccountRexRow[]
  testimonials: Testimonial[]
  /**
   * #1638.2 — le palier de prévalence des technologies déclarées par les
   * preuves ci-dessus, DANS NOTRE RÉFÉRENTIEL.
   *
   * Composé par le CONTRÔLEUR (GA-07 est au plafond, et il nomme le contrôleur
   * comme la porte d'une orchestration neuve) : aucune ligne de ce service ne
   * lit la mémoire marché, et le module reste autonome.
   *
   * `undefined` — jamais `[]` — quand la question n'a pas été posée : aucune
   * technologie déclarée, mémoire marché non montée, ou lecture indisponible.
   * Une technologie sans palier n'y figure PAS : « inconnu » n'est pas
   * « courante ».
   */
  techno_prevalence?: { techno: string; tier: TechnoPrevalenceTier }[]
}

/**
 * #2124.49 à .55 — ce que Laura propose pour la preuve d'une mission.
 *
 * `proof_id` nomme la preuve DÉJÀ attachée à cette mission, s'il y en a une :
 * c'est elle que la validation met à jour, et c'est sur ses valeurs que la
 * proposition s'efface (une valeur posée n'est jamais recouverte).
 */
export type MissionProofProposal = {
  mission: { mission_id: string; label: string; ended_on: string | null }
  proof_id: string | null
  proposal: ProofFieldsProposal
}

/**
 * Une mission en attente de retour, vue depuis l'espace — avec le NOM de son
 * compte.
 *
 * `account_label` vaut `null` quand cet espace ne porte pas le compte cité.
 * C'est une donnée manquante, pas un « Compte inconnu » : le libellé de repli
 * serait une valeur inventée, et l'écran doit pouvoir dire que le nom manque.
 */
type PendingRexRow = PendingRex & { account_label: string | null }

/** Un retour DÉJÀ recueilli, prêt à lire. */
type CollectedRexRow = {
  id: string
  mission_id: string
  mission_label: string | null
  account_id: string | null
  account_label: string | null
  summary: string
  what_worked: string | null
  what_failed: string | null
  // #2424.3 — trois des quinze champs nommés.
  team: string | null
  skills: string | null
  constraints: string | null
  // #3210.2 (épopée #3246) — sept des douze champs restants.
  offer: string | null
  expertise: string | null
  access_path: string | null
  first_door: string | null
  proof_used: string | null
  cycle_duration: string | null
  partner: string | null
  strategy: CaseStrategy | null
  buying_model: CaseBuyingModel | null
  organisation: CaseOrganisation | null
  collected_at: string
}

/**
 * Les retours d'expérience d'un espace : ce qui ATTEND, et ce qui EST recueilli.
 *
 * Les deux ensemble, jamais l'un sans l'autre. Une file d'attente seule se lit
 * comme une liste de reproches ; une liste de retours seule ne dit pas ce qui
 * manque encore.
 */
export type WorkspaceRex = {
  pending: PendingRexRow[]
  collected: CollectedRexRow[]
}

/**
 * La capitalisation vue depuis un compte (PDF 2 §12).
 *
 * Quatre blocs, et les tenir séparés est le sujet : ce qu'on a LIVRÉ ici (des
 * faits), ce qu'on peut MONTRER (des preuves relues), ce qui ATTEND d'être
 * recueilli (des missions finies sans retour), et ce qu'un client a ACCEPTÉ de
 * dire (des témoignages, avec leur accord archivé).
 *
 * Le bloc « REX en attente » se CALCULE — il n'a pas de table. Une liste de
 * choses à faire qui se stocke se périme le jour où quelqu'un oublie de la
 * mettre à jour ; celle-ci ne peut pas mentir.
 */
/** #3272.6 — le nombre de REX de perte les plus récents envoyés à Laura pour
 *  un compte : assez pour repérer un motif qui se répète, jamais tout
 *  l'historique (budget de contexte, voir `lost-deal-rex-context.ts`). */
const LOST_DEAL_REX_FOR_ACCOUNT_MAX = 3

@Injectable()
export class CapitalisationService {
  constructor(
    @InjectRepository(ProofEntity)
    private readonly proofs: Repository<ProofEntity>,
    @InjectRepository(RexEntryEntity)
    private readonly rex: Repository<RexEntryEntity>,
    @InjectRepository(TestimonialEntity)
    private readonly testimonials: Repository<TestimonialEntity>,
    @InjectRepository(MissionEntity)
    private readonly missions: Repository<MissionEntity>,
    // Uniquement pour NOMMER un compte derrière son identifiant. Un écran ne
    // peut pas le faire sans re-demander la liste des comptes, et un
    // identifiant affiché n'apprend rien à personne.
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    /**
     * #2124.49 — le besoin à l'origine de la mission, d'où le PROBLÈME traité
     * est proposé. EN DERNIER : un dépôt inséré au milieu d'un constructeur
     * décale silencieusement les specs qui le construisent positionnellement.
     */
    @InjectRepository(ProjectNeedEntity)
    private readonly needs: Repository<ProjectNeedEntity>,
    /**
     * #2424.14 — le journal d'audit des écritures de preuve. Le MÊME
     * `record_field_audit` que le CRM (`ProvenanceService`), mais écrit
     * directement ici : une preuve a son PROPRE modèle de provenance (sa
     * colonne `field_provenance` jsonb, `origin: 'proposed' | 'human'`), pas
     * celui du CRM (`field_provenance` table, arbitrage pipeline/humain). Les
     * deux tables ne se confondent pas, seul le journal d'ÉCRITURE est partagé.
     */
    @InjectRepository(RecordFieldAuditEntity)
    private readonly auditLog: Repository<RecordFieldAuditEntity>,
    /** #3210 — les opportunités `lost`, seule source du dépôt à porter un motif d'échec. */
    @InjectRepository(ProjectEntity)
    private readonly projects: Repository<ProjectEntity>,
    /**
     * BEL-SC-243 (#3272) — EN DERNIER, même règle que `needs` ci-dessus : un
     * dépôt inséré au milieu décale silencieusement les specs qui construisent
     * ce service à la main.
     */
    @InjectRepository(LostDealRexEntity)
    private readonly lostDealRex: Repository<LostDealRexEntity>,
    @InjectRepository(LostDealRuleProposalEntity)
    private readonly lostDealRuleProposals: Repository<LostDealRuleProposalEntity>,
    /** #3210.1 — les ESN en place sur un compte, EN DERNIER (même règle). */
    @InjectRepository(AccountPartnerEntity)
    private readonly accountPartners: Repository<AccountPartnerEntity>,
    /** #3210.1 (lot R17) — les canaux déjà utilisés, lus via les contacts du compte. */
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(OutreachMessageEntity)
    private readonly outreachMessages: Repository<OutreachMessageEntity>,
    /** #3210.1 (lot M11) — les rendez-vous captés (`activities.kind = 'meeting'`), EN DERNIER, optionnel. */
    @Optional()
    @InjectRepository(ActivityEntity)
    private readonly activities?: Repository<ActivityEntity>,
  ) {}

  /** #2424.14 — une ligne du journal, pour une écriture de preuve. */
  private async auditProofWrite(params: {
    workspaceId: string
    proofId: string
    field: string
    oldValue?: unknown
    newValue?: unknown
    actorId: string
  }): Promise<void> {
    await this.auditLog.save({
      workspace_id: params.workspaceId,
      entity_type: 'proof',
      entity_id: params.proofId,
      field: params.field,
      old_value: serializeAuditValue(params.oldValue ?? null),
      new_value: serializeAuditValue(params.newValue ?? null),
      source: 'human',
      actor_id: params.actorId,
    })
  }

  /**
   * #2045.8 (épopée #2859) — combien de missions cet espace a DÉJÀ tracées,
   * TOUS comptes confondus. `forAccount` (ci-dessous) fait la même lecture
   * pour UN compte ; l'onboarding (`reseau-comptage.ts`) demande le nombre
   * agrégé pour ne pas faire deviner une bande là où le produit sait déjà
   * compter exactement — voir `answers-reseau.ts` pour la décision.
   *
   * Un simple COUNT, jamais une bande : un espace tout neuf en onboarding
   * rend honnêtement `0` — un vrai zéro, mesuré, jamais une absence déguisée
   * (gardes GA-18/GA-19). GA-43 : un seul espace est jamais lu.
   */
  async workspaceMissionCount(workspaceId: string): Promise<number> {
    return this.missions.count({ where: { workspace_id: workspaceId } })
  }

  async forAccount(workspaceId: string, accountId: string): Promise<AccountCapitalisation> {
    const [missions, proofs, rexRows, testimonials] = await Promise.all([
      this.missions.find({
        where: { workspace_id: workspaceId, account_id: accountId },
        order: { created_at: 'DESC' },
      }),
      this.proofs.find({ where: { workspace_id: workspaceId, account_id: accountId }, order: { created_at: 'DESC' } }),
      this.rex.find({ where: { workspace_id: workspaceId, account_id: accountId } }),
      this.testimonials.find({
        where: { workspace_id: workspaceId, account_id: accountId },
        order: { created_at: 'DESC' },
      }),
    ])

    const pendingRex = pendingFrom(missions, rexRows)
    const missionLabels = new Map(missions.map(mission => [mission.id, mission.label ?? null]))

    return {
      delivered: missions.map(mission => ({
        mission_id: mission.id,
        label: mission.label ?? '',
        status: mission.status,
        started_on: mission.started_on ? new Date(mission.started_on).toISOString() : null,
        ended_on: mission.ends_on ? new Date(mission.ends_on).toISOString() : null,
      })),
      proofs: proofs.map(toProofWire),
      pendingRex,
      // #2124.34 — les plus récents en tête : un retour se lit comme une
      // nouvelle, et la plus fraîche est celle qui change l'approche.
      collectedRex: [...rexRows]
        .sort((a, b) => new Date(b.collected_at).getTime() - new Date(a.collected_at).getTime())
        .map(row => ({
          id: row.id,
          mission_id: row.mission_id,
          mission_label: missionLabels.get(row.mission_id) ?? null,
          summary: row.summary,
          what_worked: row.what_worked ?? null,
          what_failed: row.what_failed ?? null,
          team: row.team ?? null,
          skills: row.skills ?? null,
          constraints: row.constraints ?? null,
          offer: row.offer ?? null,
          expertise: row.expertise ?? null,
          access_path: row.access_path ?? null,
          first_door: row.first_door ?? null,
          proof_used: row.proof_used ?? null,
          cycle_duration: row.cycle_duration ?? null,
          partner: row.partner ?? null,
          strategy: toStrategy(row.strategy),
          buying_model: toBuyingModel(row.buying_model),
          organisation: toOrganisation(row.organisation),
          collected_at: toIso(row.collected_at),
        })),
      testimonials: testimonials.map(toTestimonialWire),
    }
  }

  async createProof(workspaceId: string, userId: string, input: CreateProof): Promise<Proof> {
    // #2124.49 à .55 — la PREMIÈRE validation crée souvent la preuve : sa
    // provenance doit être aussi vraie que celle des suivantes.
    const kept = new Set(input.kept_from_proposal ?? [])
    const proposal = kept.size > 0 && input.mission_id ? await this.proposalFor(workspaceId, input.mission_id) : null
    const at = new Date().toISOString()
    const provenance: Record<string, ProofFieldProvenance> = {}
    const note = (field: ProofEvidenceField, value: unknown, from: ProofSource | null) => {
      if (value === undefined || value === null) return
      if (typeof value === 'string' && value.trim().length === 0) return
      if (Array.isArray(value) && value.length === 0) return
      provenance[field] = kept.has(field) ? { origin: 'proposed', at, from } : { origin: 'human', at, from: null }
    }
    note('claim', input.claim, proposal?.claim?.from ?? null)
    note('problem', input.problem, proposal?.problem?.from ?? null)
    note('result', input.result, proposal?.result?.from ?? null)
    note('expertise', input.expertise, proposal?.expertise?.from ?? null)
    // Jamais proposée : l'autorisation de citer est un accord du client.
    note('citation_allowed', input.citation_allowed, null)
    note('source', input.source, null)

    const saved = await this.proofs.save(
      this.proofs.create({
        workspace_id: workspaceId,
        account_id: input.account_id ?? null,
        mission_id: input.mission_id ?? null,
        claim: input.claim.trim(),
        detail: input.detail?.trim() || null,
        strength: input.strength ?? 'declared',
        // `internal` par défaut, et jamais l'inverse : une preuve dont personne
        // n'a validé qu'on peut la citer ne sort pas.
        scope: input.scope ?? 'internal',
        sector: input.sector?.trim() || null,
        anonymised: input.anonymised ?? false,
        // #1612.1 / #1638.1 — saisi par qui déclare la preuve ; personne
        // d'autre dans le pipeline ne peut la deviner. Liste VIDE par défaut,
        // jamais absente (`proofs.technologies` est NOT NULL).
        technologies: input.technologies ?? [],
        // #2124.49 à .55 — saisis ou validés par un humain ; le producteur ne
        // passe JAMAIS par ici.
        problem: input.problem?.trim() || null,
        result: input.result?.trim() || null,
        expertise: input.expertise ?? [],
        // `null` = personne n'a tranché. Ni autorisé, ni refusé.
        citation_allowed: input.citation_allowed ?? null,
        source: input.source ?? null,
        // #2424.6 — CE QUE la preuve montre. `null` = pas encore classée.
        content_type: input.content_type ?? null,
        // #2424.4 — la référence externe : canaux autorisés, durée accordée,
        // échéance qui en découle. Deux champs distincts (voir le contrat).
        allowed_channels: input.allowed_channels ?? [],
        validity_duration_months: input.validity_duration_months ?? null,
        valid_until: input.valid_until ? new Date(input.valid_until) : null,
        field_provenance: provenance,
        created_by: userId,
      }),
    )
    // #2424.14 — la trace de qui a créé cette preuve.
    await this.auditProofWrite({
      workspaceId,
      proofId: saved.id,
      field: 'proof',
      newValue: saved.claim,
      actorId: userId,
    })
    return toProofWire(saved)
  }

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * #2124.49 à .55 — LA PROPOSITION. Elle n'écrit RIEN.
   * ───────────────────────────────────────────────────────────────────────────
   *
   * Décision de Louis du 14/09/2026 : « Laura les propose, l'humain valide ».
   *
   * Quatre lectures, toutes bornées à l'espace, et zéro écriture — pas même
   * une trace. C'est la doctrine du copilote appliquée à la lettre : ses
   * chemins de proposition n'ont aucun chemin d'écriture, et ce n'est pas une
   * convention mais l'absence de code. La proposition est un objet EN ATTENTE
   * que l'humain valide ; c'est `validateProofFields` qui écrit, et lui seul.
   *
   * Ce qui n'est fondé sur AUCUN enregistrement reste vide : le producteur
   * (`proposeProofFields`, pur, dans les contrats) ne rend que du texte déjà
   * écrit quelque part.
   */
  async proofProposalForMission(workspaceId: string, missionId: string): Promise<MissionProofProposal> {
    const mission = await this.missions.findOne({ where: { id: missionId, workspace_id: workspaceId } })
    if (!mission) throw new NotFoundException('Mission introuvable dans cet espace.')

    const [need, rexRow, proof] = await Promise.all([
      mission.need_id
        ? this.needs.findOne({ where: { id: mission.need_id, workspace_id: workspaceId } })
        : Promise.resolve(null),
      this.rex.findOne({ where: { workspace_id: workspaceId, mission_id: missionId } }),
      this.proofs.findOne({ where: { workspace_id: workspaceId, mission_id: missionId } }),
    ])

    return {
      mission: {
        mission_id: mission.id,
        label: mission.label ?? '',
        ended_on: mission.ends_on ? new Date(mission.ends_on).toISOString() : null,
      },
      proof_id: proof?.id ?? null,
      proposal: proofFieldsToPropose(proposalFrom(mission, need, rexRow), proof ?? {}),
    }
  }

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * #2124.49 à .55 — LA VALIDATION. Le seul chemin d'écriture.
   * ───────────────────────────────────────────────────────────────────────────
   *
   * Le clic de validation EST la décision (geste d'utilisateur = auto-approuvé,
   * doctrine « une écriture passe par une porte ») : pas de prévisualisation
   * figée ni d'expiration, qui ne valent que pour un geste de SYSTÈME.
   *
   * Un champ ABSENT du corps n'est pas touché ; un champ à `null` est effacé
   * volontairement. Les confondre rendrait impossible de valider « je ne sais
   * pas », ce qui est précisément la réponse qu'on veut pouvoir donner.
   *
   * Chaque champ écrit reçoit sa provenance — qui, quand, et depuis quel
   * enregistrement — et la version monte d'un cran : une preuve citée en
   * clientèle doit pouvoir dire QUELLE version a été citée.
   */
  async validateProofFields(
    workspaceId: string,
    userId: string,
    proofId: string,
    input: ValidateProofFields,
  ): Promise<Proof> {
    const proof = await this.proofs.findOne({ where: { id: proofId, workspace_id: workspaceId } })
    if (!proof) throw new NotFoundException('Preuve introuvable dans cet espace.')

    const kept = new Set(input.kept_from_proposal ?? [])
    // La provenance d'un champ validé TEL QUEL garde l'enregistrement d'origine.
    // On recalcule la proposition — elle est déterministe et en lecture seule —
    // plutôt que de croire un client sur la source d'une valeur.
    const proposal = kept.size > 0 && proof.mission_id ? await this.proposalFor(workspaceId, proof.mission_id) : null

    const at = new Date().toISOString()
    const provenance: Record<string, ProofFieldProvenance> = { ...(proof.field_provenance ?? {}) }
    // #2424.14 — une ligne d'audit par champ RÉELLEMENT touché.
    const changes: { field: string; oldValue: unknown; newValue: unknown }[] = []
    const touch = (field: ProofEvidenceField, from: ProofSource | null, oldValue: unknown, newValue: unknown) => {
      provenance[field] = kept.has(field) ? { origin: 'proposed', at, from } : { origin: 'human', at, from: null }
      changes.push({ field, oldValue, newValue })
    }

    if (input.claim !== undefined) {
      const oldValue = proof.claim
      proof.claim = input.claim
      touch('claim', proposal?.claim?.from ?? null, oldValue, proof.claim)
    }
    if (input.problem !== undefined) {
      const oldValue = proof.problem
      proof.problem = input.problem ?? null
      touch('problem', proposal?.problem?.from ?? null, oldValue, proof.problem)
    }
    if (input.result !== undefined) {
      const oldValue = proof.result
      proof.result = input.result ?? null
      touch('result', proposal?.result?.from ?? null, oldValue, proof.result)
    }
    if (input.expertise !== undefined) {
      const oldValue = proof.expertise
      proof.expertise = input.expertise
      touch('expertise', proposal?.expertise?.from ?? null, oldValue, proof.expertise)
    }
    if (input.citation_allowed !== undefined) {
      const oldValue = proof.citation_allowed
      proof.citation_allowed = input.citation_allowed ?? null
      // Jamais proposée : l'autorisation de citer est un accord du client.
      touch('citation_allowed', null, oldValue, proof.citation_allowed)
    }
    if (input.source !== undefined) {
      const oldValue = proof.source
      proof.source = input.source ?? null
      touch('source', null, oldValue, proof.source)
    }

    proof.field_provenance = provenance
    proof.version = (proof.version ?? 1) + 1
    proof.validated_by = userId
    const saved = await this.proofs.save(proof)
    for (const change of changes) {
      await this.auditProofWrite({
        workspaceId,
        proofId: saved.id,
        field: change.field,
        oldValue: change.oldValue,
        newValue: change.newValue,
        actorId: userId,
      })
    }
    return toProofWire(saved)
  }

  /** La proposition SEULE, pour la validation. Lecture seule, comme l'autre. */
  private async proposalFor(workspaceId: string, missionId: string): Promise<ProofFieldsProposal | null> {
    const mission = await this.missions.findOne({ where: { id: missionId, workspace_id: workspaceId } })
    if (!mission) return null
    const [need, rexRow] = await Promise.all([
      mission.need_id
        ? this.needs.findOne({ where: { id: mission.need_id, workspace_id: workspaceId } })
        : Promise.resolve(null),
      this.rex.findOne({ where: { workspace_id: workspaceId, mission_id: missionId } }),
    ])
    return proposalFrom(mission, need, rexRow)
  }

  async createRex(workspaceId: string, userId: string, input: CreateRex): Promise<RexEntry> {
    const existing = await this.rex.findOne({ where: { workspace_id: workspaceId, mission_id: input.mission_id } })
    // Deux retours sur la même mission ne se contredisent pas, ils se corrigent.
    if (existing) throw new BadRequestException('Un retour existe déjà pour cette mission.')

    const saved = await this.rex.save(
      this.rex.create({
        workspace_id: workspaceId,
        mission_id: input.mission_id,
        account_id: input.account_id ?? null,
        summary: input.summary.trim(),
        what_worked: input.what_worked?.trim() || null,
        what_failed: input.what_failed?.trim() || null,
        // #2424.3 — trois des quinze champs nommés (équipe, compétences,
        // contraintes) : saisis par l'humain, jamais déduits.
        team: input.team?.trim() || null,
        skills: input.skills?.trim() || null,
        constraints: input.constraints?.trim() || null,
        // #3210.2 (épopée #3246) — saisis par l'humain, jamais déduits.
        offer: input.offer?.trim() || null,
        expertise: input.expertise?.trim() || null,
        access_path: input.access_path?.trim() || null,
        first_door: input.first_door?.trim() || null,
        proof_used: input.proof_used?.trim() || null,
        cycle_duration: input.cycle_duration?.trim() || null,
        partner: input.partner?.trim() || null,
        strategy: input.strategy ?? null,
        buying_model: input.buying_model ?? null,
        organisation: input.organisation ?? null,
        collected_by: userId,
      }),
    )
    return {
      id: saved.id,
      mission_id: saved.mission_id,
      account_id: saved.account_id ?? null,
      summary: saved.summary,
      what_worked: saved.what_worked ?? null,
      what_failed: saved.what_failed ?? null,
      team: saved.team ?? null,
      skills: saved.skills ?? null,
      constraints: saved.constraints ?? null,
      offer: saved.offer ?? null,
      expertise: saved.expertise ?? null,
      access_path: saved.access_path ?? null,
      first_door: saved.first_door ?? null,
      proof_used: saved.proof_used ?? null,
      cycle_duration: saved.cycle_duration ?? null,
      partner: saved.partner ?? null,
      strategy: toStrategy(saved.strategy),
      buying_model: toBuyingModel(saved.buying_model),
      organisation: toOrganisation(saved.organisation),
      collected_at: toIso(saved.collected_at),
    }
  }

  /**
   * BEL-SC-243 — REX PERTE (#3272.1). `project_id` n'est PAS unique : une
   * opportunité rouverte puis reperdue garde chaque REX (voir l'entité).
   */
  async createLostDealRex(workspaceId: string, userId: string, input: CreateLostDealRex): Promise<LostDealRex> {
    const saved = await this.lostDealRex.save(
      this.lostDealRex.create({
        workspace_id: workspaceId,
        project_id: input.project_id,
        account_id: input.account_id ?? null,
        perimeter: input.perimeter?.trim() || null,
        need: input.need?.trim() || null,
        people_involved: input.people_involved?.trim() || null,
        real_decider: input.real_decider?.trim() || null,
        sponsor: input.sponsor?.trim() || null,
        route_used: input.route_used?.trim() || null,
        proof_used: input.proof_used?.trim() || null,
        angle_tried: input.angle_tried?.trim() || null,
        angles_not_tried: input.angles_not_tried,
        last_action: input.last_action?.value ?? null,
        last_action_distinction: input.last_action?.distinction ?? null,
        declared_motif: input.declared_motif ?? null,
        declared_motif_note: input.declared_motif_note?.value ?? null,
        declared_motif_distinction: input.declared_motif_note?.distinction ?? null,
        suspected_motif: input.suspected_motif ?? null,
        suspected_motif_note: input.suspected_motif_note?.value ?? null,
        suspected_motif_distinction: input.suspected_motif_note?.distinction ?? null,
        competitor: input.competitor?.trim() || null,
        timing: input.timing?.trim() || null,
        cycle_days: input.cycle_days ?? null,
        procurement_friction: input.procurement_friction?.trim() || null,
        consultant_gap: input.consultant_gap?.trim() || null,
        economics: input.economics?.trim() || null,
        what_team_knows_now: input.what_team_knows_now?.value ?? null,
        what_team_knows_now_distinction: input.what_team_knows_now?.distinction ?? null,
        revisit_on: input.revisit_on?.trim() || null,
        // Déclaratif seulement — voir le docblock de `lost-deal-rex.ts` :
        // aucune ligne de ce service n'écrit dans la stratégie de compte, la
        // route ou un message à partir de cette liste.
        reuse_targets: input.reuse_targets,
        created_by: userId,
      }),
    )
    return toLostDealRexWire(saved)
  }

  /** Tous les REX de perte connus pour une opportunité, du plus récent au plus ancien. */
  async lostDealRexForProject(workspaceId: string, projectId: string): Promise<LostDealRex[]> {
    const rows = await this.lostDealRex.find({
      where: { workspace_id: workspaceId, project_id: projectId },
      order: { created_at: 'DESC' },
    })
    return rows.map(toLostDealRexWire)
  }

  /**
   * #3295 — les REX de perte de l'ESPACE, du plus récent au plus ancien : la
   * matière que l'écran d'apprentissage propose de CITER (2+ convergents).
   */
  async lostDealRexForWorkspace(workspaceId: string): Promise<LostDealRex[]> {
    const rows = await this.lostDealRex.find({
      where: { workspace_id: workspaceId },
      order: { created_at: 'DESC' },
      take: 200,
    })
    return rows.map(toLostDealRexWire)
  }

  /** #3295 — les propositions d'apprentissage de l'espace (`GET` jusque-là absent). */
  async lostDealRuleProposalsForWorkspace(workspaceId: string): Promise<LostDealRuleProposal[]> {
    const rows = await this.lostDealRuleProposals.find({
      where: { workspace_id: workspaceId },
      order: { created_at: 'DESC' },
      take: 100,
    })
    return rows.map(toLostDealRuleProposalWire)
  }

  /**
   * #3272.6 — les REX de perte du COMPTE (un compte peut porter plusieurs
   * opportunités perdues), bornés aux plus récents : ce que Laura peut
   * réellement condenser dans un tour sans dépasser son budget de contexte.
   */
  async lostDealRexForAccount(workspaceId: string, accountId: string): Promise<LostDealRex[]> {
    const rows = await this.lostDealRex.find({
      where: { workspace_id: workspaceId, account_id: accountId },
      order: { created_at: 'DESC' },
      take: LOST_DEAL_REX_FOR_ACCOUNT_MAX,
    })
    return rows.map(toLostDealRexWire)
  }

  /**
   * BEL-SC-243 — apprentissage contrôlé (#3272.5). `convergent_rex_ids` a
   * déjà un plancher de deux au SCHÉMA (NO-GO, #3272.7) ; ce service vérifie
   * en plus que chaque REX cité existe RÉELLEMENT dans cet espace — citer
   * l'identifiant d'un REX d'un autre espace, ou inventé, ne doit pas
   * pouvoir fabriquer une convergence qui n'existe pas.
   */
  async createLostDealRuleProposal(
    workspaceId: string,
    userId: string,
    input: CreateLostDealRuleProposal,
  ): Promise<LostDealRuleProposal> {
    const known = await this.lostDealRex.find({
      where: { workspace_id: workspaceId },
      select: { id: true },
    })
    const knownIds = new Set(known.map(row => row.id))
    const unknown = input.convergent_rex_ids.filter(id => !knownIds.has(id))
    if (unknown.length > 0) {
      throw new BadRequestException(`REX introuvable dans cet espace : ${unknown.join(', ')}.`)
    }

    const saved = await this.lostDealRuleProposals.save(
      this.lostDealRuleProposals.create({
        workspace_id: workspaceId,
        domain: input.domain,
        convergent_rex_ids: input.convergent_rex_ids,
        observation: input.observation.trim(),
        status: 'pending',
        proposed_by: userId,
        decided_by: null,
        decided_at: null,
      }),
    )
    return toLostDealRuleProposalWire(saved)
  }

  /** La SEULE façon de sortir de `pending` — un geste humain explicite. */
  async decideLostDealRuleProposal(
    workspaceId: string,
    userId: string,
    id: string,
    decision: LostDealRuleProposalDecision,
  ): Promise<LostDealRuleProposal> {
    const existing = await this.lostDealRuleProposals.findOne({ where: { id, workspace_id: workspaceId } })
    if (!existing) throw new NotFoundException('Proposition introuvable dans cet espace.')
    if (existing.status !== 'pending') {
      throw new BadRequestException('Cette proposition a déjà été décidée.')
    }

    existing.status = decision
    existing.decided_by = userId
    existing.decided_at = new Date()
    const saved = await this.lostDealRuleProposals.save(existing)
    return toLostDealRuleProposalWire(saved)
  }

  async createTestimonial(workspaceId: string, input: CreateTestimonial): Promise<Testimonial> {
    const problems = testimonialProblems({
      publishable: input.publishable ?? false,
      consentReference: input.consent_reference ?? null,
      quote: input.quote,
    })
    if (problems.length > 0) throw new BadRequestException(problems.join(' '))

    const saved = await this.testimonials.save(
      this.testimonials.create({
        workspace_id: workspaceId,
        account_id: input.account_id ?? null,
        author_name: input.author_name?.trim() || null,
        author_title: input.author_title?.trim() || null,
        quote: input.quote.trim(),
        consent_reference: input.consent_reference?.trim() || null,
        publishable: input.publishable ?? false,
      }),
    )
    return toTestimonialWire(saved)
  }

  /**
   * #3181.2 (épopée #3247) — LES SECTEURS (vocabulaire FERMÉ) où l'espace possède déjà une preuve.
   * Le texte libre de `Proof.sector` passe par `resolveProofSectorGroup` : lu ou `null`, jamais
   * deviné. Un secteur illisible est COMPTÉ à part (`unclassified`), pas rangé au hasard. Seuls des
   * noms de groupes sortent — jamais le contenu d'une preuve.
   */
  async proofSectorGroups(workspaceId: string): Promise<{ groups: string[]; unclassified: number }> {
    const rows = await this.proofs.find({ where: { workspace_id: workspaceId }, select: { id: true, sector: true } })
    const groups = new Set<string>()
    let unclassified = 0
    for (const row of rows) {
      if (!row.sector?.trim()) continue
      const group = resolveProofSectorGroup(row.sector)
      if (group) groups.add(group)
      else unclassified += 1
    }
    return { groups: [...groups].sort(), unclassified }
  }

  /**
   * Les preuves MOBILISABLES pour un contenu client, sur un compte cible —
   * optionnellement affinées par facette.
   *
   * Le filtre de confidentialité est appliqué ICI, une fois, plutôt que dans
   * chaque écran qui compose un message : c'est le seul endroit où « une
   * preuve interne n'apparaît jamais dans un contenu destiné au client » peut
   * être tenu.
   *
   * #2424.12 — LA BIBLIOTHÈQUE indexée par NEUF facettes nommées. Tranche
   * livrée : les trois facettes déjà PORTÉES par `proof.entity.ts` (secteur,
   * expertise, technologies) deviennent filtrables ICI, au même endroit que le
   * filtre de confidentialité — jamais dans un écran qui composerait son
   * propre filtre en aval du gate. ⚠️ CE QUI RESTE : l'autorisation
   * (`citation_allowed`) et le périmètre (`scope`) sont déjà des GATES, pas
   * des filtres à activer/désactiver ; et quatre facettes du chapitre (type de
   * mission, taille, géographie, résultat structuré) n'ont encore AUCUNE
   * colonne sur `proof.entity.ts` — une extension de schéma, hors de cette
   * tranche.
   */
  async usableProofs(
    workspaceId: string,
    targetAccountId: string | null,
    facets?: { sector?: string; expertise?: string[]; technologies?: string[] },
  ): Promise<Proof[]> {
    const rows = await this.proofs.find({
      where: { workspace_id: workspaceId, scope: 'client_safe' },
      order: { created_at: 'DESC' },
    })
    return rows
      .filter(row => row.anonymised || !row.account_id || row.account_id !== targetAccountId)
      .filter(row => !facets?.sector || row.sector === facets.sector)
      .filter(
        row => !facets?.expertise?.length || facets.expertise.some(value => (row.expertise ?? []).includes(value)),
      )
      .filter(
        row =>
          !facets?.technologies?.length || facets.technologies.some(value => (row.technologies ?? []).includes(value)),
      )
      .map(toProofWire)
  }

  /**
   * #2424.10 — câblage restant : au moins un REX RÉELLEMENT recueilli sur ce
   * compte porte un « ce qui a marché ». Jamais un sentiment déduit d'un texte
   * libre — l'EXISTENCE d'un `what_worked` non vide, rien de plus. Consommé
   * par `recommend_actions_from_context` côté IA (`action_recommender.py`).
   */
  async hasPositiveRex(workspaceId: string, accountId: string): Promise<boolean> {
    const rows = await this.rex.find({ where: { workspace_id: workspaceId, account_id: accountId } })
    return rows.some(row => Boolean(row.what_worked?.trim()))
  }

  /**
   * #4158.49 — une référence client est LISIBLE par l'espace, mais seule son
   * auteur ou un détenteur de `team:manage` la modifie ou la retire. Une
   * référence d'un autre espace (ou absente) est introuvable (404). Sans auteur
   * enregistré (`created_by` nul), rien ne permet de l'attribuer : elle reste
   * modifiable par qui a le droit d'écrire (tranché sans Louis).
   */
  async assertCanModifyProof(workspaceId: string, userId: string, id: string, canManage: boolean): Promise<void> {
    const proof = await this.proofs.findOne({ where: { id, workspace_id: workspaceId } })
    if (!proof) throw new NotFoundException('Preuve introuvable dans cet espace.')
    if (canManage || !proof.created_by || proof.created_by === userId) return
    throw new ForbiddenException("Seuls l'auteur de la référence ou un responsable d'équipe peuvent la modifier.")
  }

  async removeProof(workspaceId: string, userId: string, id: string): Promise<{ deleted: true }> {
    // #2424.14 — la claim d'AVANT suppression, pour que le journal garde ce
    // qui a disparu, pas seulement qu'une ligne a disparu.
    const existing = await this.proofs.findOne({ where: { id, workspace_id: workspaceId } })
    const result = await this.proofs.delete({ id, workspace_id: workspaceId })
    if (!result.affected) throw new NotFoundException('Preuve introuvable dans cet espace.')
    await this.auditProofWrite({
      workspaceId,
      proofId: id,
      field: 'proof',
      oldValue: existing?.claim ?? null,
      actorId: userId,
    })
    return { deleted: true }
  }

  /**
   * Les retours d'expérience de l'ESPACE — ce qui attend, et ce qui est déjà là.
   *
   * ⚠️ Trois lectures, toutes bornées à `workspace_id`. Un espace est une ESN,
   * donc un concurrent de son voisin : un libellé de compte qui traverse la
   * cloison est une fuite, pas un confort. Le compte est cherché dans l'espace
   * DEMANDÉ, jamais par son seul identifiant.
   *
   * Les comptes ne sont lus que si une ligne en cite un — un espace sans mission
   * terminée ne déclenche aucune requête à vide.
   */
  async rexForWorkspace(workspaceId: string): Promise<WorkspaceRex> {
    const [missions, collectedRows] = await Promise.all([
      this.missions.find({
        where: { workspace_id: workspaceId },
        order: { ends_on: 'DESC' },
        select: { id: true, label: true, status: true, account_id: true, ends_on: true },
      }),
      this.rex.find({ where: { workspace_id: workspaceId }, order: { collected_at: 'DESC' } }),
    ])

    const missionById = new Map(missions.map(mission => [mission.id, mission]))
    const pending = pendingFrom(missions, collectedRows)

    // Le compte d'un retour vient d'abord de la ligne elle-même, et à défaut de
    // sa mission : `account_id` est nullable sur `rex_entries`, et une mission
    // en porte toujours un.
    const accountOf = (row: RexEntryEntity): string | null =>
      row.account_id ?? missionById.get(row.mission_id)?.account_id ?? null

    const referenced = new Set<string>()
    for (const row of pending) if (row.account_id) referenced.add(row.account_id)
    for (const row of collectedRows) {
      const accountId = accountOf(row)
      if (accountId) referenced.add(accountId)
    }

    const labels = await this.accountLabels(workspaceId, [...referenced])

    return {
      pending: pending.map(row => ({
        ...row,
        account_label: row.account_id ? (labels.get(row.account_id) ?? null) : null,
      })),
      collected: collectedRows.map(row => {
        const accountId = accountOf(row)
        return {
          id: row.id,
          mission_id: row.mission_id,
          mission_label: missionById.get(row.mission_id)?.label ?? null,
          account_id: accountId,
          account_label: accountId ? (labels.get(accountId) ?? null) : null,
          summary: row.summary,
          what_worked: row.what_worked ?? null,
          what_failed: row.what_failed ?? null,
          team: row.team ?? null,
          skills: row.skills ?? null,
          constraints: row.constraints ?? null,
          offer: row.offer ?? null,
          expertise: row.expertise ?? null,
          access_path: row.access_path ?? null,
          first_door: row.first_door ?? null,
          proof_used: row.proof_used ?? null,
          cycle_duration: row.cycle_duration ?? null,
          partner: row.partner ?? null,
          strategy: toStrategy(row.strategy),
          buying_model: toBuyingModel(row.buying_model),
          organisation: toOrganisation(row.organisation),
          collected_at: toIso(row.collected_at),
        }
      }),
    }
  }

  /**
   * #4289.12 — le STADE DE RELATION par SIREN, pour le générateur d'alternatives (apps/ia). Le MÊME moteur que
   * {@link similarCases} (`relationStageOf` : stade saisi, à défaut missions signées) — jamais une seconde
   * définition de « même stade de relation ». Un SIREN sans compte de CET espace, sans stade établi, ou porté par
   * deux comptes en désaccord est ABSENT : « on ne sait pas » n'est pas un stade (GA-18/GA-19).
   */
  async relationStagesBySiren(
    workspaceId: string,
    sirens: readonly string[],
  ): Promise<RelationStagesBySirenResponse['bySiren']> {
    if (!sirens.length) return {}
    const accounts = await this.accounts.find({
      where: sirens.map(siren => ({ siren, workspace_id: workspaceId })),
      select: { id: true, siren: true, relationship_memory: true },
    })
    if (!accounts.length) return {}
    const missions = await this.missions.find({
      where: accounts.map(account => ({ account_id: account.id, workspace_id: workspaceId })),
      select: { account_id: true, status: true },
    })
    const stagesBySiren = new Map<string, Set<string>>()
    const sourceBySiren = new Map<string, 'saisi' | 'missions'>()
    for (const account of accounts) {
      const siren = (account.siren ?? '').trim()
      const entered = account.relationship_memory?.relationStage
      const statuses = missions.filter(mission => mission.account_id === account.id).map(mission => mission.status)
      const stage = relationStageOf(entered, statuses)
      if (!siren || !stage) continue
      stagesBySiren.set(siren, (stagesBySiren.get(siren) ?? new Set()).add(stage))
      sourceBySiren.set(siren, stage === entered ? 'saisi' : 'missions')
    }
    const bySiren: RelationStagesBySirenResponse['bySiren'] = {}
    for (const [siren, stages] of stagesBySiren) {
      const parsed = relationshipStateSchema.safeParse([...stages][0])
      if (stages.size !== 1 || !parsed.success) continue
      bySiren[siren] = { relationStage: parsed.data, source: sourceBySiren.get(siren) ?? 'missions' }
    }
    return bySiren
  }

  /**
   * #3210 (LAU-FINAL-216, beta 28/09/2026) — « cette situation ressemble à
   * un cas que ton équipe a déjà réussi — ou échoué — pour telles raisons. »
   *
   * Deux sources, toutes deux bornées à l'ESPACE demandé (jamais de fuite
   * inter-workspace, PDF 2 §12) : les REX validés (cas gagnés, la mission a
   * eu lieu) et les opportunités `lost` (cas perdus, avec leur
   * `loss_reason`). La règle de similarité elle-même — quels axes comparer,
   * combien de cas rendre — vit dans `deriveSimilarCases`, testée seule.
   *
   * `null` = compte introuvable dans cet espace ; le contrôleur le traduit
   * en erreur plutôt que de comparer un compte à lui-même par accident.
   */
  async similarCases(
    workspaceId: string,
    accountId: string,
  ): Promise<{
    cases: SimilarCase[]
    examined: { won: number; lost: number }
    unavailableDimensions: ReadonlyArray<{ dimension: string; reason: string }>
    caseMemory: ReturnType<typeof deriveCaseMemory>
    targetKnown: { sector: boolean; size: boolean }
    unavailableSources: Array<{ source: string; reason: string }>
  } | null> {
    const target = await this.accounts.findOne({
      where: { id: accountId, workspace_id: workspaceId },
      select: {
        id: true,
        sector: true,
        employees: true,
        group_role: true,
        registry_country: true,
        relationship_memory: true,
      },
    })
    if (!target) return null

    const [rexRows, missions, lostProjects, targetProjects, wonProjects] = await Promise.all([
      this.rex.find({ where: { workspace_id: workspaceId } }),
      this.missions.find({
        where: { workspace_id: workspaceId },
        select: {
          id: true,
          label: true,
          account_id: true,
          opportunity_id: true,
          status: true,
          primary_domain_code: true,
          application_sector_codes: true,
        },
      }),
      this.projects.find({
        where: { workspace_id: workspaceId, stage: 'lost' },
        select: {
          id: true,
          label: true,
          account_id: true,
          loss_reason: true,
          closed_at: true,
          primary_domain_code: true,
          application_sector_codes: true,
          access_mode: true,
          offer: true,
          strategy: true,
          buying_model: true,
          organisation: true,
          first_detected_at: true,
        },
      }),
      // #3210.3 — la demande OUVERTE du compte cible : c'est elle qui porte
      // l'expertise, le périmètre, le niveau d'accès et l'offre à comparer.
      this.projects.find({ where: { workspace_id: workspaceId, account_id: accountId } }),
      // #3246.timing — les affaires GAGNÉES de l'espace : avec les perdues, la
      // base du cycle habituel (médiane des cycles clos datés).
      this.projects.find({
        where: { workspace_id: workspaceId, stage: 'won' },
        select: { id: true, first_detected_at: true, closed_at: true },
      }),
    ])
    // #3246.timing — le cycle HABITUEL de l'espace : médiane des cycles clos
    // datés (gagnés + perdus). Sous 3 cycles = `null`, le timing est non évaluable.
    const closedCycleDays = [...wonProjects, ...lostProjects]
      .map(project => observedCycleDays(project))
      .filter((days): days is number => days !== null && days >= 0)
    const medianCycleDays = medianClosedCycleDays(closedCycleDays)
    const missionById = new Map(missions.map(mission => [mission.id, mission]))
    // #4289.4 (#3246.5) — les statuts de mission par compte : le stade de relation lit le fait à défaut de saisie.
    const missionStatusesByAccount = new Map<string, string[]>()
    for (const mission of missions) {
      if (mission.account_id && mission.status) {
        missionStatusesByAccount.set(mission.account_id, [
          ...(missionStatusesByAccount.get(mission.account_id) ?? []),
          mission.status,
        ])
      }
    }
    const openTarget =
      targetProjects
        .filter(
          project =>
            project.account_id === accountId &&
            !project.archived_at &&
            project.stage !== 'won' &&
            project.stage !== 'lost',
        )
        .sort((a, b) => (b.updated_at?.getTime() ?? 0) - (a.updated_at?.getTime() ?? 0))[0] ?? null

    // Les opportunités reliées aux missions gagnées : d'où viennent le mode
    // d'accès et l'offre d'un cas gagné (une mission n'en porte pas).
    const linkedOpportunityIds = [
      ...new Set(missions.map(mission => mission.opportunity_id).filter((id): id is string => !!id)),
    ]
    const linkedOpportunities =
      linkedOpportunityIds.length > 0
        ? await this.projects.find({ where: linkedOpportunityIds.map(id => ({ id, workspace_id: workspaceId })) })
        : []
    const opportunityById = new Map(linkedOpportunities.map(project => [project.id, project]))

    const referencedAccountIds = new Set<string>()
    for (const row of rexRows) {
      const accId = row.account_id ?? missionById.get(row.mission_id)?.account_id ?? null
      if (accId) referencedAccountIds.add(accId)
    }
    for (const project of lostProjects) referencedAccountIds.add(project.account_id)

    const candidateAccounts = await this.accounts.find({
      where: [...referencedAccountIds].map(id => ({ id, workspace_id: workspaceId })),
      select: {
        id: true,
        company_name: true,
        sector: true,
        employees: true,
        group_role: true,
        registry_country: true,
        relationship_memory: true,
      },
    })
    const accountById = new Map(candidateAccounts.map(account => [account.id, account]))

    // #3210.1 — les partenaires (jamais les concurrents ni les lignes écartées)
    // de la cible et des comptes candidats, lus dans CET espace seulement.
    const partnerRows = await this.accountPartners.find({
      where: { workspace_id: workspaceId, dismissed_at: IsNull() },
      select: { account_id: true, name: true, relationship: true, dismissed_at: true },
    })
    const partnersByAccount = new Map<string, string[]>()
    for (const row of partnerRows) {
      if (row.relationship !== 'partner' || row.dismissed_at) continue
      partnersByAccount.set(row.account_id, [...(partnersByAccount.get(row.account_id) ?? []), row.name])
    }

    // #3210.1 (lot R17) — deux sources DÉJÀ EN BASE, au même patron que les
    // partenaires ci-dessus : la cible ET les candidats, jamais au-delà de CET
    // espace.
    const allAccountIds = [...referencedAccountIds, target.id]
    const [referenceRows, contactRows] = await Promise.all([
      // Une référence PUBLIABLE seulement (`TestimonialEntity.publishable`,
      // le même gate que l'écran de capitalisation) — jamais une ébauche.
      this.testimonials.find({
        where: allAccountIds.map(accountId => ({
          workspace_id: workspaceId,
          account_id: accountId,
          publishable: true,
        })),
        select: { account_id: true },
      }),
      this.contacts.find({
        where: allAccountIds.map(accountId => ({ workspace_id: workspaceId, account_id: accountId })),
        select: { id: true, account_id: true },
      }),
    ])
    const accountsWithReference = new Set(referenceRows.map(row => row.account_id).filter((id): id is string => !!id))
    const accountIdByContactId = new Map(
      contactRows
        .filter((row): row is ContactEntity & { account_id: string } => !!row.account_id)
        .map(row => [row.id, row.account_id]),
    )
    const contactIds = [...accountIdByContactId.keys()]
    const outreachRows =
      contactIds.length > 0
        ? await this.outreachMessages.find({
            where: contactIds.map(contactId => ({ contact_id: contactId })),
            select: { contact_id: true, channel: true },
          })
        : []
    const channelsByAccount = new Map<string, Set<string>>()
    for (const row of outreachRows) {
      const accountId = accountIdByContactId.get(row.contact_id)
      if (!accountId) continue
      const channels = channelsByAccount.get(accountId) ?? new Set<string>()
      channels.add(row.channel)
      channelsByAccount.set(accountId, channels)
    }

    // #3210.1 (lot M11) — les rendez-vous PASSÉS captés dans CET espace : un
    // fait binaire par compte, et le total qui dit si la source existe.
    const meetings = await this.meetingFacts(workspaceId, allAccountIds)

    const candidates: CaseCandidate[] = []
    for (const row of rexRows) {
      const accId = row.account_id ?? missionById.get(row.mission_id)?.account_id ?? null
      if (!accId) continue
      const account = accountById.get(accId)
      if (!account) continue
      const mission = missionById.get(row.mission_id)
      const opportunity = mission?.opportunity_id ? opportunityById.get(mission.opportunity_id) : undefined
      candidates.push({
        accountId: accId,
        accountLabel: account.company_name,
        sector: account.sector,
        employees: account.employees,
        groupRole: account.group_role,
        country: account.registry_country,
        domainCode: mission?.primary_domain_code ?? opportunity?.primary_domain_code ?? null,
        sectorCodes: mission?.application_sector_codes ?? opportunity?.application_sector_codes ?? null,
        accessMode: opportunity?.access_mode ?? null,
        offer: row.offer ?? opportunity?.offer ?? null,
        // #3246 (lot W9) — le REX d'abord, l'opportunité liée à la mission à défaut.
        strategy: row.strategy ?? opportunity?.strategy ?? null,
        buyingModel: row.buying_model ?? opportunity?.buying_model ?? null,
        organisation: row.organisation ?? opportunity?.organisation ?? null,
        // #3246.relation — le stade SAISI, jamais lu dans le texte libre.
        relationStage: relationStageOf(account.relationship_memory?.relationStage, missionStatusesByAccount.get(accId)),
        // #3246.timing — cycle constaté de l'opportunité liée à la mission, contre le cycle habituel.
        timing: timingOf(observedCycleDays(opportunity), medianCycleDays),
        partners: partnersByAccount.get(accId) ?? null,
        channels: channelsByAccount.get(accId) ? [...channelsByAccount.get(accId)!] : null,
        hasPublishableReference: accountsWithReference.has(accId),
        hasMeeting: meetings.accounts.has(accId),
        outcome: 'won',
        missionLabel: mission?.label ?? null,
        whatWorked: row.what_worked,
        whatFailed: row.what_failed,
        projectLabel: null,
        lossReason: null,
        closedAt: row.collected_at ? row.collected_at.toISOString().slice(0, 10) : null,
      })
    }
    for (const project of lostProjects) {
      const account = accountById.get(project.account_id)
      if (!account) continue
      candidates.push({
        accountId: project.account_id,
        accountLabel: account.company_name,
        sector: account.sector,
        employees: account.employees,
        groupRole: account.group_role,
        country: account.registry_country,
        domainCode: project.primary_domain_code ?? null,
        sectorCodes: project.application_sector_codes ?? null,
        accessMode: project.access_mode ?? null,
        offer: project.offer ?? null,
        strategy: project.strategy ?? null,
        buyingModel: project.buying_model ?? null,
        organisation: project.organisation ?? null,
        relationStage: relationStageOf(
          account.relationship_memory?.relationStage,
          missionStatusesByAccount.get(project.account_id),
        ),
        timing: timingOf(observedCycleDays(project), medianCycleDays),
        partners: partnersByAccount.get(project.account_id) ?? null,
        channels: channelsByAccount.get(project.account_id) ? [...channelsByAccount.get(project.account_id)!] : null,
        hasPublishableReference: accountsWithReference.has(project.account_id),
        hasMeeting: meetings.accounts.has(project.account_id),
        outcome: 'lost',
        missionLabel: null,
        whatWorked: null,
        whatFailed: null,
        projectLabel: project.label,
        lossReason: project.loss_reason,
        closedAt: project.closed_at ? project.closed_at.toISOString().slice(0, 10) : null,
      })
    }

    // #3246 — le PÉRIMÈTRE de la comparaison, rendu avec la liste : « aucun cas »
    // se dit alors avec ce qui a été regardé (le compte cible lui-même est exclu).
    const compared = candidates.filter(candidate => candidate.accountId !== target.id)
    const caseTarget = {
      accountId: target.id,
      sector: target.sector,
      employees: target.employees,
      groupRole: target.group_role,
      country: target.registry_country,
      domainCode: openTarget?.primary_domain_code ?? null,
      sectorCodes: openTarget?.application_sector_codes ?? null,
      accessMode: openTarget?.access_mode ?? null,
      offer: openTarget?.offer ?? null,
      // #3246 (lot W9) — stratégie et modèle d’achat saisis sur la demande ouverte.
      strategy: openTarget?.strategy ?? null,
      buyingModel: openTarget?.buying_model ?? null,
      organisation: openTarget?.organisation ?? null,
      // #3246.relation / #3246.timing — stade saisi ; âge de la demande ouverte contre le cycle habituel.
      relationStage: relationStageOf(
        target.relationship_memory?.relationStage,
        missionStatusesByAccount.get(target.id),
      ),
      timing: timingOf(openAgeDays(openTarget, new Date()), medianCycleDays),
      partners: partnersByAccount.get(target.id) ?? null,
      channels: channelsByAccount.get(target.id) ? [...channelsByAccount.get(target.id)!] : null,
      hasPublishableReference: accountsWithReference.has(target.id),
      hasMeeting: meetings.accounts.has(target.id),
    }
    return {
      examined: {
        won: compared.filter(candidate => candidate.outcome === 'won').length,
        lost: compared.filter(candidate => candidate.outcome === 'lost').length,
      },
      cases: deriveSimilarCases(caseTarget, candidates),
      // #3210.3 (lot R17) — NOMMÉES une fois par réponse, jamais une ligne par
      // cas (doctrine « on n'affiche pas ce qu'on n'a pas » dans une LISTE).
      // #3246 — depuis le 16/10, seules celles que CE compte ne permet pas d'évaluer.
      unavailableDimensions: similarityDimensionGaps({
        organisation: caseTarget.organisation,
        relationStage: caseTarget.relationStage,
        timing: caseTarget.timing,
        closedCycles: closedCycleDays.length,
      }),
      // #3210.1 (lot M11) — Market Memory agrégée PAR CAS, comptes de CET
      // espace seulement, sans un nom de client (GA-43).
      caseMemory: deriveCaseMemory(caseTarget, candidates),
      // #3246 (lot RAA 10/10) — ce que le compte cible RENSEIGNE (booléens, jamais la valeur) : sans
      // lui, « aucun cas du même secteur » (mesuré) et « secteur non renseigné » (non mesuré) se
      // confondaient, et le décompte « N gagnés / M perdus de même secteur » disparaissait.
      targetKnown: { sector: Boolean(target.sector?.trim()), size: Boolean(target.employees?.trim()) },
      // #3210.1 (lot M11) — une source qui n'a rien pu dire se NOMME.
      unavailableSources: meetingSourceGap(meetings.total),
    }
  }

  /**
   * #3210.1 (lot M11) — les comptes de `accountIds` qui ont au moins un
   * rendez-vous PASSÉ capté, et le total de rendez-vous de l'espace (`null`
   * = lecture impossible : jamais lu comme « aucun »). Ni sujet ni corps.
   */
  private async meetingFacts(
    workspaceId: string,
    accountIds: string[],
  ): Promise<{ accounts: Set<string>; total: number | null }> {
    if (!this.activities) return { accounts: new Set(), total: null }
    try {
      const [totalRows, accountRows] = await Promise.all([
        this.activities.manager.query<Array<{ count: string }>>(
          `SELECT COUNT(*) AS count FROM activities
            WHERE workspace_id = $1 AND kind = 'meeting' AND occurred_at <= now()`,
          [workspaceId],
        ),
        accountIds.length > 0
          ? this.activities.manager.query<Array<{ account_id: string }>>(
              `SELECT DISTINCT account_id FROM activities
                WHERE workspace_id = $1 AND kind = 'meeting' AND occurred_at <= now()
                  AND account_id = ANY($2::uuid[])`,
              [workspaceId, accountIds],
            )
          : Promise.resolve([]),
      ])
      return {
        accounts: new Set(accountRows.map(row => row.account_id)),
        total: Number(totalRows[0]?.count ?? 0),
      }
    } catch (error) {
      new Logger(CapitalisationService.name).warn('meeting facts unavailable', {
        error: error instanceof Error ? error.message : String(error),
      })
      return { accounts: new Set(), total: null }
    }
  }

  /** Le nom des comptes CITÉS, cherchés dans l'espace demandé et nulle part
   *  ailleurs. Un compte absent du résultat n'a pas de nom — il n'en reçoit pas
   *  un de remplissage. */
  private async accountLabels(workspaceId: string, ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map()
    const rows = await this.accounts.find({
      where: ids.map(id => ({ id, workspace_id: workspaceId })),
      select: { id: true, company_name: true },
    })
    return new Map(rows.map(row => [row.id, row.company_name]))
  }
}

/**
 * « REX en attente », à UN seul endroit.
 *
 * Une mission FINIE et sans retour : c'est la seule définition honnête. Une
 * mission en cours n'attend rien, une mission déjà débriefée non plus. La règle
 * était écrite deux fois — une par appelant — et deux copies d'une dérivation
 * divergent le jour où l'une des deux apprend quelque chose.
 */
function pendingFrom(missions: MissionEntity[], collected: { mission_id: string }[]): PendingRex[] {
  const withRex = new Set(collected.map(row => row.mission_id))
  return missions
    .filter(
      mission =>
        // #2424.2 — `completed` est FINI au même titre (`MISSION_STATUS_PHASE`,
        // `packages/contracts/src/schemas/status-transitions.ts`) : il en
        // manquait, une mission qui finit par ce statut ne demandait jamais
        // son REX.
        (mission.status === 'ended' || mission.status === 'terminated' || mission.status === 'completed') &&
        !withRex.has(mission.id),
    )
    .map(mission => ({
      mission_id: mission.id,
      label: mission.label ?? '',
      account_id: mission.account_id ?? null,
      ended_on: mission.ends_on ? new Date(mission.ends_on).toISOString() : null,
    }))
}

function toProofWire(row: ProofEntity): Proof {
  return {
    id: row.id,
    account_id: row.account_id ?? null,
    mission_id: row.mission_id ?? null,
    claim: row.claim,
    detail: row.detail ?? null,
    strength: row.strength as Proof['strength'],
    scope: row.scope as Proof['scope'],
    sector: row.sector ?? null,
    anonymised: Boolean(row.anonymised),
    created_at: toIso(row.created_at),
    // #1612.1 / #1638.1 — voir `createProof` : jamais `undefined` une fois
    // écrite, mais une ligne créée avant la colonne (ou un mock de test) reste
    // lisible sans elle.
    technologies: row.technologies ?? [],
    // #2124.49 à .55 — TOUJOURS rendus, `null` quand la valeur n'a pas été
    // posée : l'écran écrit « non mesuré », jamais « 0 » ni un tiret.
    problem: row.problem ?? null,
    result: row.result ?? null,
    expertise: row.expertise ?? [],
    citation_allowed: row.citation_allowed ?? null,
    source: (row.source as Proof['source']) ?? null,
    // #2424.6 — TOUJOURS rendu, `null` = pas encore classée.
    content_type: (row.content_type as ProofContentType | null) ?? null,
    // #2424.4 — la référence externe : canaux autorisés, durée accordée,
    // échéance qui en découle.
    allowed_channels: (row.allowed_channels as Proof['allowed_channels']) ?? [],
    validity_duration_months: row.validity_duration_months ?? null,
    valid_until: row.valid_until ? toIso(row.valid_until) : null,
    version: row.version ?? 1,
    field_provenance: row.field_provenance ?? {},
  }
}

/**
 * #2124.49 à .55 — la proposition, à UN seul endroit.
 *
 * Deux appelants la demandent (l'écran de validation, puis la validation
 * elle-même pour dater la provenance) ; deux copies d'une dérivation divergent
 * le jour où l'une des deux apprend quelque chose.
 */
function proposalFrom(
  mission: { label: string | null; role_title: string | null },
  need: { title: string | null; skills?: { term: string }[] } | null,
  rexRow: { summary: string | null; what_worked: string | null } | null,
): ProofFieldsProposal {
  return proposeProofFields({
    mission: { label: mission.label ?? null, role_title: mission.role_title ?? null },
    need: need ? { title: need.title ?? null, skills: (need.skills ?? []).map(skill => skill.term) } : null,
    rex: rexRow ? { summary: rexRow.summary ?? null, what_worked: rexRow.what_worked ?? null } : null,
  })
}

function toTestimonialWire(row: TestimonialEntity): Testimonial {
  return {
    id: row.id,
    account_id: row.account_id ?? null,
    author_name: row.author_name ?? null,
    author_title: row.author_title ?? null,
    quote: row.quote,
    consent_reference: row.consent_reference ?? null,
    publishable: Boolean(row.publishable),
    created_at: toIso(row.created_at),
  }
}

/** #3246 — une valeur hors vocabulaire fermé (ancienne ligne, base éditée à la main) sort `null`, jamais recopiée. */
function toStrategy(value: string | null | undefined): CaseStrategy | null {
  return CASE_STRATEGIES.find(code => code === value) ?? null
}

function toBuyingModel(value: string | null | undefined): CaseBuyingModel | null {
  return CASE_BUYING_MODELS.find(code => code === value) ?? null
}

function toOrganisation(value: string | null | undefined): CaseOrganisation | null {
  return CASE_ORGANISATIONS.find(code => code === value) ?? null
}

function toIso(value: Date | string | null | undefined): string {
  if (!value) return new Date(0).toISOString()
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

/** `{value, distinction}` ou `null` — jamais une affirmation sans son statut (DISTINCTIONS, #3272.2). */
function evidencedClaimOf(value: string | null, distinction: string | null): EvidencedClaim | null {
  if (!value || !distinction) return null
  return { value, distinction: distinction as EvidencedClaim['distinction'] }
}

function toLostDealRexWire(row: LostDealRexEntity): LostDealRex {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    project_id: row.project_id,
    account_id: row.account_id ?? null,
    perimeter: row.perimeter ?? null,
    need: row.need ?? null,
    people_involved: row.people_involved ?? null,
    real_decider: row.real_decider ?? null,
    sponsor: row.sponsor ?? null,
    route_used: row.route_used ?? null,
    proof_used: row.proof_used ?? null,
    angle_tried: row.angle_tried ?? null,
    angles_not_tried: row.angles_not_tried ?? [],
    last_action: evidencedClaimOf(row.last_action, row.last_action_distinction),
    declared_motif: (row.declared_motif as LostDealRex['declared_motif']) ?? null,
    declared_motif_note: evidencedClaimOf(row.declared_motif_note, row.declared_motif_distinction),
    suspected_motif: (row.suspected_motif as LostDealRex['suspected_motif']) ?? null,
    suspected_motif_note: evidencedClaimOf(row.suspected_motif_note, row.suspected_motif_distinction),
    competitor: row.competitor ?? null,
    timing: row.timing ?? null,
    cycle_days: row.cycle_days ?? null,
    procurement_friction: row.procurement_friction ?? null,
    consultant_gap: row.consultant_gap ?? null,
    economics: row.economics ?? null,
    what_team_knows_now: evidencedClaimOf(row.what_team_knows_now, row.what_team_knows_now_distinction),
    revisit_on: row.revisit_on ?? null,
    reuse_targets: (row.reuse_targets ?? []) as LostDealRex['reuse_targets'],
    created_by: row.created_by ?? '',
    created_at: toIso(row.created_at),
  }
}

function toLostDealRuleProposalWire(row: LostDealRuleProposalEntity): LostDealRuleProposal {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    domain: row.domain as LostDealRuleProposal['domain'],
    convergent_rex_ids: row.convergent_rex_ids,
    observation: row.observation,
    status: row.status as LostDealRuleProposal['status'],
    proposed_by: row.proposed_by ?? '',
    decided_by: row.decided_by ?? null,
    decided_at: row.decided_at ? toIso(row.decided_at) : null,
    created_at: toIso(row.created_at),
  }
}
