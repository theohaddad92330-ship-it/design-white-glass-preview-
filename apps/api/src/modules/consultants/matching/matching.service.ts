import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { ACCOUNT_FACTS_READER, type AccountFactsReader } from '../../account-facts/module-tokens'
import { clientHistoryFactsFor } from './axes'

import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import {
  applicationSectorNamesFr,
  consentState,
  deriveStaffing,
  EXCLUSION_SEVERITY,
  markClientHistory,
  MATCH_AXIS_WEIGHTS,
  MATCH_DEFAULT_THRESHOLD,
  normaliseMatchWeights,
  preferenceWarnings,
  redactFinance,
  REMOTE_PREFERENCES,
  type AssignmentWindow,
  type ClientHistoryEntry,
  type ExclusionReason,
  type FeedbackAxis,
  type FeedbackVerdict,
  type MatchCandidate,
  type MatchNeed,
  type MatchResult,
  type MatchRun,
  type MatchWeights,
  type RemotePreference,
} from '@bellum/contracts'
import {
  MatchRunEntity,
  MatchRunEntryEntity,
  MatchWeightVersionEntity,
} from '../../../database/entities/match-run.entity'
import { SubmissionFeedbackEntity } from '../../../database/entities/submission-feedback.entity'
import { evaluateCandidate, rankMatches } from './engine'
import { needFeedbackLearnings, type NeedFeedbackLearning } from './need-feedback-learnings'
import { assertCriteriaUnchanged, nextBestMoveOptions } from './next-best-move'
import { prefilter } from './prefilter'
import { diffRuns, type PreviousRunSnapshot, type RunChanges } from './run-changes'
import { skillsFromStack } from './skills-from-stack'
import { buildSkillProof } from './skill-proof'
import { asDay } from '../../../common/day'
import { unconfirmedInterruptionMissionIds } from '../../../common/mission-interruptions'

const NIL_UUID = '00000000-0000-0000-0000-000000000000'

/**
 * Le matching d'un besoin contre le vivier, journalisé (PDF 4 §5, §7, §13).
 *
 * Le service ne calcule rien : il CHARGE ce que le moteur attend, l'appelle, et
 * conserve la trace. La séparation est ce qui rend le classement testable sans
 * base — et c'est le classement, pas la requête SQL, qui doit être irréprochable.
 *
 * Trois lectures qui n'étaient branchées nulle part le sont enfin, et ce sont
 * les trois défauts que ce chantier corrige :
 *
 *  - les compétences viennent de `consultant_skills` (typées, avec leur niveau
 *    et leur SOURCE), pas de la liste libre `consultants.stack` (sauf, #4433.8, pour un profil SANS aucune ligne
 *    typée : la liste est alors lue en « déclaré »). C'est la même
 *    famille de défaut que les trois trouvés en recette le 20/08 : une lecture
 *    branchée sur une autre table que l'écriture.
 *  - le besoin vient de `project_needs.skills[]` (typé, avec son caractère
 *    éliminatoire), pas du libellé libre d'une opportunité. La liste existait,
 *    saisie par un recruteur, et le moteur la recomposait par extraction de
 *    mots-clés.
 *  - la disponibilité vient des AFFECTATIONS (`deriveStaffing`), pas du champ
 *    saisi. L'écran Vivier affichait déjà les deux côte à côte.
 *
 * Aucun crédit n'est débité : le matching interne est le geste qu'on veut voir
 * répété, et le facturer le tuerait.
 */
/** #AM.59 — les critères d'un besoin lu dans un TEXTE (jamais écrit) : ce que le texte dit, rien d'autre. */
type DraftNeedCriteria = {
  role: string
  skills: Array<{ term: string; required?: boolean; level?: string | null }>
  seniority?: string | null
  location?: string | null
  startOn?: string | null
  targetRateCents?: number | null
  contractKind?: string | null
  environment?: string[]
  accountName?: string | null
  accountSector?: string | null
}

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name)

  constructor(
    @InjectRepository(MatchRunEntity) private readonly runs: Repository<MatchRunEntity>,
    @InjectRepository(MatchRunEntryEntity) private readonly entries: Repository<MatchRunEntryEntity>,
    @InjectRepository(MatchWeightVersionEntity) private readonly weightVersions: Repository<MatchWeightVersionEntity>,
    @InjectRepository(SubmissionFeedbackEntity) private readonly feedback: Repository<SubmissionFeedbackEntity>,
    // #4072.6 — le lecteur UNIQUE des faits du compte (#4069.1), jamais un second.
    @Optional() @Inject(ACCOUNT_FACTS_READER) private readonly accountFacts?: AccountFactsReader,
  ) {}

  /** Combien de lignes de détail on conserve par exécution. Au-delà, `truncated`. */
  private static readonly JOURNAL_MAX_ENTRIES = 500

  async matchNeed(
    needId: string,
    workspaceId: string | null,
    userId: string,
    options: { canReadFinance: boolean; now?: Date },
  ): Promise<MatchRun | null> {
    const need = await this.loadNeed(needId, workspaceId)
    if (!need) return null
    const { weights, threshold, versionId } = await this.weightsFor(workspaceId)
    const candidates = await this.loadCandidates(workspaceId, userId, need)
    return this.execute({
      need,
      candidates,
      weights,
      threshold,
      versionId,
      workspaceId,
      userId,
      direction: 'need_to_pool',
      canReadFinance: options.canReadFinance,
      now: options.now ?? new Date(),
    })
  }

  /**
   * #AM.59 (#4059) — comparer les profils à un besoin COLLÉ, SANS créer le besoin dans le pipe : les critères viennent du
   * texte (proposition de `compile_need`, jamais écrite), le calcul se fait EN MÉMOIRE et rien n'est journalisé
   * (`persist: false`) — ni besoin, ni run, ni lignes. « Créer le besoin » reste un geste séparé. Aucune exigence que le
   * texte ne porte pas n'est inventée : TJM, date, contrat absents restent `null` (l'axe sort du calcul, il ne vaut pas 0).
   */
  async matchDraftNeed(
    draft: DraftNeedCriteria,
    workspaceId: string | null,
    userId: string,
    options: { canReadFinance: boolean; now?: Date },
  ): Promise<MatchRun> {
    const need: MatchNeed = {
      needId: null,
      role: draft.role,
      accountName: draft.accountName ?? null,
      accountSector: draft.accountSector ?? null,
      projectSectors: [],
      skills: draft.skills.map(skill => ({
        term: skill.term,
        label: skill.term,
        required: skill.required !== false,
        level: skill.level ?? null,
      })),
      minYears: yearsFromText(draft.seniority ?? null),
      seniorityBand: bandFromText(draft.seniority ?? null),
      environment: draft.environment ?? [],
      languages: [],
      clearances: [],
      location: draft.location ?? null,
      remote: null,
      startOn: draft.startOn ?? null,
      targetRateCents: draft.targetRateCents ?? null,
      contractKind: draft.contractKind ?? null,
    }
    const { weights, threshold, versionId } = await this.weightsFor(workspaceId)
    const candidates = await this.loadCandidates(workspaceId, userId, need)
    return this.execute({
      need,
      candidates,
      weights,
      threshold,
      versionId,
      workspaceId,
      userId,
      direction: 'need_to_pool',
      canReadFinance: options.canReadFinance,
      now: options.now ?? new Date(),
      persist: false,
    })
  }

  /**
   * #4059.1-.3 — le classement ET ce qu'il change par rapport au DERNIER classement
   * journalisé de ce besoin (CV ajouté, exigence modifiée). Le précédent est lu
   * AVANT l'exécution : `execute` journalise le nouveau. `changes: null` = premier
   * classement de ce besoin, rien à comparer.
   */
  async matchNeedWithChanges(
    needId: string,
    workspaceId: string | null,
    userId: string,
    options: { canReadFinance: boolean; now?: Date },
  ): Promise<{ run: MatchRun; changes: RunChanges | null } | null> {
    const previous = await this.previousRunSnapshot(needId, workspaceId)
    const run = await this.matchNeed(needId, workspaceId, userId, options)
    if (!run) return null
    const changes = diffRuns(previous, {
      runId: run.runId,
      truncated: run.truncated,
      need: run.need,
      ordered: [...run.recommended, ...run.borderline, ...run.notEvaluable, ...run.excluded].map(result => ({
        consultantId: result.consultantId,
        bucket: result.bucket,
        exclusions: result.exclusions.map(exclusion => exclusion.reason),
      })),
    })
    return { run, changes }
  }

  /** Le dernier classement journalisé d'un besoin — `null` si aucun, ou illisible (jamais deviné). */
  private async previousRunSnapshot(needId: string, workspaceId: string | null): Promise<PreviousRunSnapshot | null> {
    try {
      const last = await this.runs.findOne({
        where: { need_id: needId, direction: 'need_to_pool', workspace_id: workspaceId ?? IsNull() },
        order: { created_at: 'DESC' },
      })
      if (!last?.criteria) return null
      const rows = await this.entries.find({ where: { run_id: last.id }, order: { rank: 'ASC' } })
      return {
        runId: last.id,
        createdAt: last.created_at.toISOString(),
        truncated: last.truncated,
        criteria: last.criteria as MatchNeed,
        entries: rows.flatMap(row =>
          row.consultant_id
            ? [
                {
                  consultantId: row.consultant_id,
                  rank: row.rank,
                  bucket: row.bucket,
                  exclusions: (Array.isArray(row.exclusions) ? (row.exclusions as { reason?: string }[]) : []).flatMap(
                    exclusion => (exclusion?.reason ? [exclusion.reason] : []),
                  ),
                },
              ]
            : [],
        ),
      }
    } catch (error) {
      this.logger.warn('Classement précédent illisible — pas de comparaison', { error, tags: { needId } })
      return null
    }
  }

  /**
   * La pondération de l'espace, ou celle par défaut.
   *
   * Une lecture en échec retombe sur les poids par défaut plutôt que d'empêcher
   * le matching : perdre un réglage dégrade un classement, ne pas classer du tout
   * arrête le travail.
   */
  async weightsFor(
    workspaceId: string | null,
  ): Promise<{ weights: MatchWeights; threshold: number; versionId: string | null }> {
    try {
      const row = await this.weightVersions
        .createQueryBuilder('v')
        .where(workspaceId ? 'v.workspace_id = :workspaceId' : 'v.workspace_id IS NULL', { workspaceId })
        .orderBy('v.created_at', 'DESC')
        .limit(1)
        .getOne()
      if (!row) return { weights: { ...MATCH_AXIS_WEIGHTS }, threshold: MATCH_DEFAULT_THRESHOLD, versionId: null }
      return {
        weights: normaliseMatchWeights(row.weights),
        threshold: row.threshold ?? MATCH_DEFAULT_THRESHOLD,
        versionId: row.id,
      }
    } catch (error) {
      this.logger.error('Lecture de la pondération de matching impossible', { error })
      return { weights: { ...MATCH_AXIS_WEIGHTS }, threshold: MATCH_DEFAULT_THRESHOLD, versionId: null }
    }
  }

  /** Une NOUVELLE version de pondération. On n'écrase jamais : le §14.2 exige
   *  qu'un changement soit daté et réversible, et une ligne écrasée n'est ni l'un
   *  ni l'autre. */
  async saveWeights(
    workspaceId: string | null,
    userId: string,
    input: { weights: Partial<Record<string, number>>; threshold: number },
  ): Promise<{ weights: MatchWeights; threshold: number }> {
    const weights = normaliseMatchWeights(input.weights)
    const threshold = Math.max(0, Math.min(100, Math.round(input.threshold)))
    await this.weightVersions.save(
      this.weightVersions.create({ workspace_id: workspaceId, weights, threshold, created_by: userId }),
    )
    return { weights, threshold }
  }

  async listWeightVersions(workspaceId: string | null): Promise<MatchWeightVersionEntity[]> {
    return this.weightVersions
      .createQueryBuilder('v')
      .where(workspaceId ? 'v.workspace_id = :workspaceId' : 'v.workspace_id IS NULL', { workspaceId })
      .orderBy('v.created_at', 'DESC')
      .limit(20)
      .getMany()
  }

  /**
   * Le classement, les quatre blocs, et la trace.
   *
   * L'écriture du journal est BEST-EFFORT : elle vient après le calcul et ne peut
   * pas l'empêcher. Un journal qui ferait échouer un matching transformerait une
   * obligation de traçabilité en panne d'usage — c'est la même discipline que la
   * mesure de coût, qui observe sans retarder.
   */
  private async execute(input: {
    need: MatchNeed
    candidates: MatchCandidate[]
    weights: MatchWeights
    threshold: number
    versionId: string | null
    workspaceId: string | null
    userId: string
    direction: 'need_to_pool' | 'talent_to_needs'
    canReadFinance: boolean
    now: Date
    /** #AM.59 — `false` : calcul EN MÉMOIRE, aucune ligne de run écrite (besoin non créé). Défaut : journalisé. */
    persist?: boolean
  }): Promise<MatchRun> {
    const { need, weights, threshold, now } = input
    const { kept, dropped } = prefilter(need, input.candidates)
    const evaluated = rankMatches(need, kept, {
      weights,
      threshold,
      canReadFinance: input.canReadFinance,
      now,
    })

    // Les profils écartés par le pré-filtrage entrent AVEC leur motif : le §4.1
    // n'admet aucun écart silencieux, même pour une raison de performance.
    //
    // ⚠️ Les deux zéros ne sont PAS des notes : ce profil n'a jamais vu les treize
    // axes. Le contrat ne les accepte pas nullables, et `axes: []` est ce qui
    // permet de le savoir — c'est cette liste vide que l'écran lit pour écrire
    // « non mesuré » plutôt que « 0 ». Ne jamais dériver un verdict de ces deux
    // champs sans regarder `axes` d'abord.
    const prefiltered: MatchResult[] = dropped.map(verdict => ({
      consultantId: verdict.consultantId,
      axes: [],
      correspondenceScore: 0,
      pushableScore: 0,
      bucket: 'excluded' as const,
      // La NATURE vient de la table du contrat et n'est pas recopiée : un
      // réglage vit à un seul endroit. Les trois motifs du pré-filtrage sont
      // bloquants aujourd'hui — le jour où l'un ne l'est plus, ce chemin le
      // saura, là où un `'blocking'` écrit à la main aurait divergé en silence.
      exclusions: [{ reason: verdict.reason, severity: EXCLUSION_SEVERITY[verdict.reason], detail: verdict.detail }],
      skills: [],
      gaps: [],
      adjacency: [],
      questionsToValidate: [],
      flags: [],
      // Écarté avant les treize axes : jamais évalué, jamais fabriqué.
      targetedCvVersion: null,
    }))

    const all = [...evaluated, ...prefiltered]
    const counts = new Map<ExclusionReason, number>()
    for (const result of all) {
      for (const exclusion of result.exclusions) {
        counts.set(exclusion.reason, (counts.get(exclusion.reason) ?? 0) + 1)
      }
    }

    const run: MatchRun = {
      runId: crypto.randomUUID(),
      need,
      weights,
      threshold,
      evaluatedCount: evaluated.length,
      prefilteredCount: dropped.length,
      truncated: evaluated.length > MatchingService.JOURNAL_MAX_ENTRIES,
      recommended: evaluated.filter(result => result.bucket === 'recommended'),
      borderline: evaluated.filter(result => result.bucket === 'borderline'),
      excluded: [...evaluated.filter(result => result.bucket === 'excluded'), ...prefiltered],
      notEvaluable: evaluated.filter(result => result.bucket === 'not_evaluable'),
      exclusionCounts: [...counts.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
      identities: [
        ...(await this.identitiesFor(
          all.map(result => result.consultantId),
          input.workspaceId,
          input.userId,
          { canReadFinance: input.canReadFinance },
        )),
      ].map(([consultantId, identity]) => ({
        consultantId,
        fullName: identity.fullName,
        title: identity.title,
        dailyRateCents: identity.dailyRateCents,
        availableFrom: identity.availableFrom,
        location: identity.location,
        // #2176.55 — la clé n'existe que sous `finance:read`.
        finance: identity.finance,
      })),
      // #2331.5 / #2331.7 — jamais un plateau vide sur un vrai zéro résultat.
      nextBestMove: nextBestMoveOptions({
        recommended: evaluated.filter(result => result.bucket === 'recommended'),
        borderline: evaluated.filter(result => result.bucket === 'borderline'),
        exclusionCounts: [...counts.entries()].map(([reason, count]) => ({ reason, count })),
        notEvaluable: evaluated.filter(result => result.bucket === 'not_evaluable'),
      }),
      // #2178.33/.34 — ce que les refus client déjà enregistrés SUR CE BESOIN
      // disent, par axe. Ne réordonne rien ci-dessus : un signal nommé, lu à
      // côté du classement (voir need-feedback-learnings.ts).
      feedbackLearnings: await this.feedbackLearningsFor(need.needId, input.workspaceId),
      createdAt: now.toISOString(),
    }
    // #2331.4 — NO-GO : ce classement n'a jamais réécrit le besoin qu'on lui a donné.
    assertCriteriaUnchanged(need, run.need)

    if (input.persist !== false) await this.journal(run, input)
    return run
  }

  private async journal(
    run: MatchRun,
    input: {
      workspaceId: string | null
      userId: string
      direction: 'need_to_pool' | 'talent_to_needs'
      versionId: string | null
      candidates: MatchCandidate[]
    },
  ): Promise<void> {
    try {
      await this.runs.save(
        this.runs.create({
          id: run.runId,
          workspace_id: input.workspaceId,
          user_id: input.userId,
          need_id: run.need.needId,
          consultant_id: input.direction === 'talent_to_needs' ? (input.candidates[0]?.consultantId ?? null) : null,
          direction: input.direction,
          criteria: run.need,
          weights: run.weights,
          weights_version_id: input.versionId,
          threshold: run.threshold,
          evaluated_count: run.evaluatedCount,
          prefiltered_count: run.prefilteredCount,
          truncated: run.truncated,
          exclusion_counts: run.exclusionCounts,
        }),
      )
      const ordered = [...run.recommended, ...run.borderline, ...run.notEvaluable, ...run.excluded].slice(
        0,
        MatchingService.JOURNAL_MAX_ENTRIES,
      )
      if (ordered.length > 0) {
        await this.entries.save(
          ordered.map((result, index) =>
            this.entries.create({
              run_id: run.runId,
              consultant_id: result.consultantId,
              need_id: run.need.needId,
              rank: index + 1,
              correspondence_score: result.correspondenceScore,
              pushable_score: result.pushableScore,
              bucket: result.bucket,
              axes: result.axes,
              exclusions: result.exclusions,
            }),
          ),
        )
      }
    } catch (error) {
      // Journal en échec : le classement reste juste, la trace manque. On le DIT
      // bruyamment plutôt que de faire tomber le geste de l'utilisateur.
      this.logger.error('Journal de matching non écrit', { error, tags: { runId: run.runId } })
    }
  }

  /* ---------------------------------------------------------------- */
  /* Chargements                                                       */
  /* ---------------------------------------------------------------- */

  async loadNeed(needId: string, workspaceId: string | null): Promise<MatchNeed | null> {
    const rows = await this.runs.manager.query<
      {
        id: string
        title: string
        skills: { term: string; required?: boolean; level?: string | null }[] | null
        seniority: string | null
        start_on: string | Date | null
        target_tjm_cents: string | null
        location: string | null
        contract_kind: string | null
        languages: { code: string; level: string | null }[] | null
        clearances: string[] | null
        stack: string[] | null
        status: string
        account_id: string | null
        project_id: string | null
        account_name: string | null
        account_sector: string | null
        project_sectors: string[] | null
      }[]
    >(
      `SELECT n.id, n.title, n.skills, n.seniority, n.start_on, n.target_tjm_cents, n.location,
              n.contract_kind, n.languages, n.clearances, n.stack, n.status,
              a.id AS account_id, n.project_id AS project_id, a.company_name AS account_name, a.sector AS account_sector,
              -- Le secteur de la DEMANDE (addendum Stelya §4.1). Lu sur le projet
              -- et jamais recopié du compte : c'est exactement l'erreur que le
              -- retour bêta dénonce.
              o.application_sector_codes AS project_sectors
         -- #2558.1 — un besoin existe sans projet : la jointure au projet est
         -- FACULTATIVE (le secteur de la demande devient alors simplement
         -- inconnu, il ne se recopie pas du compte), et le compte se rejoint
         -- par n.account_id — sinon un besoin sans projet n'aurait plus ni
         -- compte ni nom sur l'écran de rapprochement.
         FROM project_needs n
         LEFT JOIN opportunities o ON o.id = n.project_id
         LEFT JOIN accounts a ON a.id = n.account_id
        WHERE n.id = $1
          AND ($2::uuid IS NULL OR n.workspace_id = $2 OR o.workspace_id = $2 OR a.workspace_id = $2)
        LIMIT 1`,
      [needId, workspaceId],
    )
    const row = rows[0]
    if (!row) return null
    const clientHistory = await this.clientFactsFor(workspaceId, row.account_id)
    return {
      needId: row.id,
      role: row.title,
      accountName: row.account_name,
      // #2551.1 — l'id, pas seulement le nom : voir le commentaire du contrat.
      accountId: row.account_id,
      // #4346 — le projet du besoin, pour relier un rapprochement à « Ajouter à un besoin ».
      ...(row.project_id ? { projectId: row.project_id } : {}),
      ...(clientHistory ? { clientHistory } : {}),
      accountSector: row.account_sector,
      // Les LIBELLÉS, pas les codes : l'axe compare du texte à l'expérience
      // déclarée d'un consultant, qui est du texte libre.
      projectSectors: applicationSectorNamesFr(row.project_sectors ?? []),
      skills: (row.skills ?? []).map(skill => ({
        term: skill.term,
        // Un besoin ne porte qu'un terme : le libellé affiché est ce terme,
        // écrit tel que le recruteur l'a tapé.
        label: skill.term,
        required: skill.required !== false,
        level: skill.level ?? null,
      })),
      minYears: yearsFromText(row.seniority),
      seniorityBand: bandFromText(row.seniority),
      environment: row.stack ?? [],
      languages: row.languages ?? [],
      clearances: row.clearances ?? [],
      location: row.location,
      remote: null,
      startOn: asDay(row.start_on),
      targetRateCents: row.target_tjm_cents === null ? null : Number(row.target_tjm_cents),
      contractKind: row.contract_kind,
    }
  }

  /**
   * #4072.6 — ce que l'espace sait de CE client, par le lecteur unique. Les
   * natures retenues (affaires, missions, besoins) ne sont jamais des documents
   * personnels : le demandeur n'a donc pas à être connu ici. Lecture en échec ⇒
   * `undefined` : l'axe sort du dénominateur, il ne devine rien.
   */
  private async clientFactsFor(workspaceId: string | null, accountId: string | null) {
    if (!this.accountFacts || !workspaceId || !accountId) return undefined
    try {
      const read = await this.accountFacts.forAccount({ workspaceId, userId: NIL_UUID, accountId })
      const facts = clientHistoryFactsFor(read?.facts ?? [])
      return facts.length > 0 ? facts : undefined
    } catch (error) {
      this.logger.warn('historique chez ce client illisible', { error })
      return undefined
    }
  }

  /**
   * Le vivier, prêt pour le moteur.
   *
   * Quatre lectures groupées plutôt qu'une par profil : sur trois mille talents,
   * une requête par personne rendrait l'écran inutilisable, et un matching lent
   * est un matching qu'on ne relance pas.
   */
  async loadCandidates(
    workspaceId: string | null,
    userId: string,
    need: MatchNeed,
    only?: string[],
  ): Promise<MatchCandidate[]> {
    const manager = this.runs.manager
    const consultants = await manager.query<
      {
        id: string
        seniority: string
        availability: string
        available_from: string | Date | null
        availability_checked_at: Date | null
        stack: string[] | null
        contract_type: string
        tjm: number | null
        sectors: string[] | null
        zones: string[] | null
        mobility_zones: string[] | null
        remote_preference: string | null
        wanted_sectors: string[] | null
        refused_sectors: string[] | null
        refused_technologies: string[] | null
        wanted_contract_kinds: string[] | null
        references: string[] | null
        languages: { code: string; level: string | null }[] | null
        clearances: string[] | null
        consent_given_at: Date | null
        consent_expires_at: Date | null
        consent_basis: string | null
      }[]
    >(
      // `references` est un mot RÉSERVÉ en Postgres : en SQL brut il doit être
      // cité, sinon la requête entière est un échec de syntaxe. TypeORM cite
      // les identifiants tout seul, ce qui rend l'erreur invisible partout
      // ailleurs dans le dépôt.
      `SELECT c.id, c.seniority, c.availability, c.available_from, c.availability_checked_at, c.stack,
              c.contract_type, c.tjm, c.sectors, c.zones, c.mobility_zones, c.remote_preference,
              c.wanted_sectors, c.refused_sectors, c.refused_technologies, c.wanted_contract_kinds,
              c."references", c.languages, c.clearances,
              c.consent_given_at, c.consent_expires_at, c.consent_basis
         FROM consultants c
        WHERE c.archived_at IS NULL
          AND ($1::uuid IS NULL OR c.workspace_id = $1 OR (c.workspace_id IS NULL AND c.user_id = $2))
          AND ($1::uuid IS NOT NULL OR c.user_id = $2)
          -- Le cast est répété À CHAQUE emploi du paramètre. Postgres déduit
          -- le type d'un $n de son contexte : ANY($3) seul n'en a aucun, il
          -- retombe sur du texte, et le même $3 reçoit alors deux types dans
          -- une seule requête — que le serveur refuse ENTIÈREMENT.
          AND ($3::uuid[] IS NULL OR c.id = ANY($3::uuid[]))`,
      [workspaceId, userId, only ?? null],
    )
    if (consultants.length === 0) return []
    const ids = consultants.map(row => row.id)

    const skills = await manager.query<
      {
        consultant_id: string
        skill: string
        raw_label: string | null
        level: string
        source: string
        inferred: boolean | null
        source_project: string | null
        certification: boolean | null
        validated_level: string | null
        client_feedback: string | null
        experience_entreprise: string | null
        experience_role: string | null
        experience_client_masked: boolean | null
      }[]
    >(
      // #2328.25 (épopée #2793) — la preuve NOMMÉE d'une compétence : l'expérience
      // source (jointe pour son entreprise/rôle), puis les preuves de
      // `consultant_skills` posées par ce même chantier. Sans ce LEFT JOIN, une
      // compétence prouvée par une mission n'a RIEN à citer devant un client —
      // « du code juste, calculé, testé, que personne n'appelle » (CLAUDE.md).
      `SELECT cs.consultant_id, cs.skill, cs.raw_label, cs.level, cs.source, cs.inferred,
              cs.source_project, cs.certification, cs.validated_level, cs.client_feedback,
              ce.entreprise AS experience_entreprise, ce.role AS experience_role,
              ce.client_masked AS experience_client_masked
         FROM consultant_skills cs
         LEFT JOIN consultant_experiences ce ON ce.id = cs.source_experience_id
        WHERE cs.consultant_id = ANY($1)`,
      [ids],
    )
    const assignments = await manager.query<
      {
        consultant_id: string
        load_percent: number
        starts_on: string | Date
        ends_on: string | Date | null
        mission_id: string
      }[]
    >(
      `SELECT consultant_id, load_percent, starts_on, ends_on, mission_id
         FROM mission_assignments WHERE consultant_id = ANY($1)`,
      [ids],
    )
    // #3068 — même NO-GO qu'ailleurs : une interruption non confirmée ne doit
    // pas faire remonter quelqu'un « disponible » dans le matching.
    const unconfirmed = await unconfirmedInterruptionMissionIds(
      manager,
      assignments.map(row => row.mission_id),
    )
    const history = await this.clientHistoryFor(need.needId, workspaceId)
    const onMission = await this.onMissionAtClient(need.needId, ids)
    const activeElsewhere = await this.activeSubmissions(ids, need.needId)
    const targetedCvVersions = await this.targetedCvVersionsFor(need.needId, ids)

    const now = new Date()
    const skillsByConsultant = new Map<string, MatchCandidate['skills']>()
    for (const row of skills) {
      const list = skillsByConsultant.get(row.consultant_id) ?? []
      list.push({
        term: row.skill,
        // Le libellé ÉCRIT s'affiche ; le canonique sert au rapprochement.
        label: row.raw_label ?? row.skill,
        level: row.level,
        source: (['mission', 'interview', 'cv', 'declared'].includes(row.source) ? row.source : 'declared') as
          'mission' | 'interview' | 'cv' | 'declared',
        proof: buildSkillProof({
          // Le LEFT JOIN ne rend une ligne `ce.*` que si `source_experience_id`
          // pointait vers une expérience qui existe ENCORE — un lien vers une
          // ligne effacée ne doit jamais citer une preuve qu'on ne peut plus lire.
          experienceLinked:
            row.experience_entreprise !== null || row.experience_role !== null || row.experience_client_masked !== null,
          sourceProject: row.source_project,
          experienceEntreprise: row.experience_entreprise,
          experienceRole: row.experience_role,
          experienceClientMasked: row.experience_client_masked === true,
          certification: row.certification === true,
          validatedLevel: row.validated_level,
          clientFeedback: row.client_feedback,
        }),
        inferred: row.inferred === true,
      })
      skillsByConsultant.set(row.consultant_id, list)
    }
    const assignmentsByConsultant = new Map<string, AssignmentWindow[]>()
    for (const row of assignments) {
      const list = assignmentsByConsultant.get(row.consultant_id) ?? []
      // Les bornes sont des colonnes `date` : `pg` en rend des objets en SQL
      // brut, et `deriveStaffing` les COMPARE à un `YYYY-MM-DD`. Comparer un
      // objet à une chaîne rend « Tue Sep 15 2026 … » > « 2026-09-15 » : la
      // personne passait pour libre alors qu'elle est en mission.
      list.push({
        loadPercent: row.load_percent,
        startsOn: asDay(row.starts_on) ?? '',
        endsOn: asDay(row.ends_on),
        interruptionUnconfirmed: unconfirmed.has(row.mission_id),
      })
      assignmentsByConsultant.set(row.consultant_id, list)
    }

    return consultants.map(row => {
      const staffing = deriveStaffing(assignmentsByConsultant.get(row.id) ?? [], now)
      const mark = markClientHistory(row.id, history)
      const consent = {
        givenAt: row.consent_given_at ? row.consent_given_at.toISOString() : null,
        expiresAt: row.consent_expires_at ? row.consent_expires_at.toISOString() : null,
        basis: row.consent_basis,
        // `restrictions` n'entre dans aucun calcul de `consentState` (validité
        // temporelle uniquement) : sans valeur lue ici, `null` reste juste.
        restrictions: null,
      }
      const warnings = preferenceWarnings(
        {
          zones: row.mobility_zones,
          // La colonne est du `text` libre ; `TalentMobility.remote` est une
          // ÉNUMÉRATION. Une valeur hors énumération redevient `null`, c'est-à-
          // dire « on n'a pas demandé » — jamais un drapeau levé sur une
          // réponse que personne n'a donnée.
          remote: readRemotePreference(row.remote_preference),
          travel: null,
          relocation: null,
          // #2948 (#2329.19/.22/.23) — non lus ici : `preferenceWarnings` n'en
          // fait rien aujourd'hui (aucun drapeau de fréquence/international).
          siteFrequency: null,
          international: null,
          restrictions: null,
        },
        {
          // #2336.12/.13 — jusqu'ici lues en base (`consultants.service.ts`) mais
          // remises à `[]` ICI : la préférence RÉELLE du consultant n'atteignait
          // jamais le moteur de matching, donc jamais aucun drapeau.
          wantedSectors: row.wanted_sectors ?? [],
          refusedSectors: row.refused_sectors ?? [],
          refusedTechnologies: row.refused_technologies ?? [],
          wantedContractKinds: row.wanted_contract_kinds ?? [],
        },
        {
          sector: need.accountSector,
          zone: need.location,
          technologies: need.skills.map(skill => skill.term),
          contractKind: need.contractKind,
        },
      )
      return {
        consultantId: row.id,
        // #4433.8 — sans AUCUNE ligne typée, la liste libre de la fiche est lue (déclarée) : « non évaluable » seulement si la donnée manque vraiment.
        skills: skillsByConsultant.get(row.id) ?? skillsFromStack(row.stack),
        yearsExperience: null,
        seniorityBand: row.seniority,
        sectors: row.sectors ?? [],
        // L'environnement PRATIQUÉ : les références de mission et les
        // compétences prouvées en mission. Pas la liste déclarée — c'est la
        // différence entre « connaît » et « a fait ».
        environment: [
          ...(row.references ?? []),
          ...(skillsByConsultant.get(row.id) ?? [])
            .filter(skill => skill.source === 'mission')
            .map(skill => skill.label),
        ],
        languages: row.languages ?? [],
        clearances: row.clearances ?? [],
        zones: [...(row.zones ?? []), ...(row.mobility_zones ?? [])],
        remote: readRemote(row.remote_preference),
        contractKind: row.contract_type,
        dailyRateCents: row.tjm === null ? null : Math.round(row.tjm * 100),
        freeFrom: staffing.freeFrom ?? asDay(row.available_from),
        derivedAvailability: staffing.availability,
        declaredAvailability: row.availability,
        availabilityCheckedAt: row.availability_checked_at ? row.availability_checked_at.toISOString() : null,
        consentState: consentState(consent, now),
        clientHistoryFlag: mark?.flag ?? null,
        clientHistoryReason: mark?.reason ?? null,
        // ⚠️ `mark.at` était le SEUL champ du marqueur laissé derrière. La
        // conséquence était invisible : le tiroir du besoin affichait « déjà
        // refusé chez ce client » sans jamais dire QUAND, là où le panneau du
        // vivier le disait depuis le début. Deux écrans, le même fait, deux
        // lectures — et c'est celui d'ici qui sert à décider.
        clientHistoryAt: mark?.at ?? null,
        clientHistoryRecoverable: mark?.recoverable ?? false,
        onMissionAtClient: onMission.has(row.id),
        activeSubmissionsElsewhere: activeElsewhere.get(row.id) ?? 0,
        preferenceWarnings: warnings.map(warning => warning.detail),
        targetedCvVersion: targetedCvVersions.get(row.id) ?? null,
      }
    })
  }

  /**
   * #2176.3 — la SOURCE « versions ciblées » : une version de CV déjà
   * préparée pour CE besoin (`cv_versions.need_id`), pas une compétence de
   * plus. La plus RÉCENTE par consultant fait foi — plusieurs versions
   * ciblées sur le même besoin peuvent exister (une reprise après refus),
   * jamais la première.
   */
  private async targetedCvVersionsFor(
    needId: string | null,
    consultantIds: string[],
  ): Promise<Map<string, { versionId: string; generatedAt: string; highlightedSkills: string[] }>> {
    if (!needId || consultantIds.length === 0) return new Map()
    try {
      const rows = await this.runs.manager.query<
        {
          consultant_id: string
          id: string
          generated_at: Date | string
          highlighted_skills: string[] | null
        }[]
      >(
        `SELECT DISTINCT ON (consultant_id) consultant_id, id, generated_at, highlighted_skills
           FROM cv_versions
          WHERE need_id = $1 AND consultant_id = ANY($2)
          ORDER BY consultant_id, generated_at DESC`,
        [needId, consultantIds],
      )
      return new Map(
        rows.map(row => [
          row.consultant_id,
          {
            versionId: row.id,
            generatedAt: row.generated_at instanceof Date ? row.generated_at.toISOString() : row.generated_at,
            highlightedSkills: row.highlighted_skills ?? [],
          },
        ]),
      )
    } catch (error) {
      // Perdre cette preuve dégrade la carte (un bandeau de moins) ; la faire
      // tomber empêcherait tout le classement — même discipline que
      // `clientHistoryFor`.
      this.logger.error('Versions de CV ciblées illisibles', { error })
      return new Map()
    }
  }

  /** Les passages antérieurs du vivier chez le CLIENT de ce besoin (§7.2). */
  private async clientHistoryFor(needId: string | null, workspaceId: string | null): Promise<ClientHistoryEntry[]> {
    if (!needId) return []
    try {
      const rows = await this.runs.manager.query<
        { consultant_id: string; stage: string; outcome_reason: string | null; closed_at: Date | string | null }[]
      >(
        // #2558.1 — le compte du besoin se lit sur le BESOIN. La sous-requête
        // repassait par son projet ; sur un besoin de régie sans projet elle
        // ne rendait rien, et l'historique client sortait vide sans le dire.
        `SELECT s.consultant_id, s.stage, s.outcome_reason, s.closed_at
           FROM submissions s
           JOIN opportunities o ON o.id = s.project_id
          WHERE o.account_id = (
                  SELECT n2.account_id FROM project_needs n2
                   WHERE n2.id = $1)
            AND ($2::uuid IS NULL OR s.workspace_id = $2)
          ORDER BY s.closed_at DESC NULLS LAST
          LIMIT 2000`,
        [needId, workspaceId],
      )
      return rows.map(row => ({
        consultantId: row.consultant_id,
        stage: row.stage,
        outcomeReason: row.outcome_reason,
        closedAt: row.closed_at instanceof Date ? row.closed_at.toISOString() : (row.closed_at ?? null),
      }))
    } catch (error) {
      // Perdre le drapeau dégrade l'écran ; le faire tomber empêcherait tout
      // matching. On dégrade.
      this.logger.error('Historique client illisible', { error })
      return []
    }
  }

  /** Qui est DÉJÀ en mission chez ce client — le débauchage interne (§16.2). */
  private async onMissionAtClient(needId: string | null, ids: string[]): Promise<Set<string>> {
    if (!needId || ids.length === 0) return new Set()
    try {
      const rows = await this.runs.manager.query<{ consultant_id: string }[]>(
        `SELECT DISTINCT ma.consultant_id
           FROM mission_assignments ma
           JOIN missions m ON m.id = ma.mission_id
           JOIN opportunities o ON o.id = m.opportunity_id
          -- #2558.1 — même raison : le compte du besoin est sur le besoin.
          WHERE o.account_id = (
                  SELECT n2.account_id FROM project_needs n2
                   WHERE n2.id = $1)
            AND ma.consultant_id = ANY($2)
            AND (ma.ends_on IS NULL OR ma.ends_on >= CURRENT_DATE)`,
        [needId, ids],
      )
      return new Set(rows.map(row => row.consultant_id))
    } catch (error) {
      this.logger.error('Missions en cours chez ce client illisibles', { error })
      return new Set()
    }
  }

  /** Les positionnements en cours AILLEURS — drapeau orange, jamais un refus. */
  private async activeSubmissions(ids: string[], needId: string | null): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map()
    try {
      const rows = await this.runs.manager.query<{ consultant_id: string; count: string }[]>(
        `SELECT consultant_id, COUNT(*)::text AS count
           FROM submissions
          WHERE consultant_id = ANY($1)
            AND stage IN ('shortlisted', 'submitted', 'interview')
            AND ($2::uuid IS NULL OR need_id IS DISTINCT FROM $2)
          GROUP BY consultant_id`,
        [ids, needId],
      )
      return new Map(rows.map(row => [row.consultant_id, Number(row.count)]))
    } catch (error) {
      this.logger.error('Positionnements en cours illisibles', { error })
      return new Map()
    }
  }

  /**
   * Rejouer un classement pour quelques profils, à partir des critères FIGÉS.
   *
   * C'est ce qui permet de construire une shortlist sans faire confiance aux
   * scores que le navigateur renvoie : le serveur recalcule avec la pondération
   * du run, et deux exécutions identiques rendant le même résultat, la valeur
   * obtenue est exactement celle qui était affichée.
   */
  async replay(
    runId: string,
    consultantIds: string[],
    workspaceId: string | null,
    userId: string,
    canReadFinance: boolean,
  ): Promise<{ run: MatchRunEntity; need: MatchNeed; results: MatchResult[] } | null> {
    const run = await this.runs
      .createQueryBuilder('r')
      .where('r.id = :runId', { runId })
      .andWhere(workspaceId ? 'r.workspace_id = :workspaceId' : 'r.workspace_id IS NULL', { workspaceId })
      .getOne()
    if (!run) return null
    const need = run.criteria as MatchNeed
    const candidates = await this.loadCandidates(workspaceId, userId, need, consultantIds)
    const results = candidates.map(candidate =>
      evaluateCandidate(need, candidate, {
        weights: run.weights as Record<string, number>,
        threshold: run.threshold,
        canReadFinance,
        now: run.created_at,
      }),
    )
    return { run, need, results }
  }

  /**
   * Le projet porteur d'un besoin, et le consentement d'un talent.
   *
   * Deux lectures groupées parce que le modal de positionnement a besoin des
   * deux au même moment, et qu'un aller-retour de plus pour une phrase à
   * afficher se paie sur un écran qui doit s'ouvrir tout de suite.
   */
  async submissionContext(
    needId: string,
    consultantId: string,
    workspaceId: string | null,
  ): Promise<{
    projectId: string | null
    consentExpiresAt: string | null
    availabilityCheckedAt: string | null
    // #2329.35-.38 (épopée #2948) — `null` = jamais demandé POUR CE COMPTE,
    // distinct de l'absence de consentement global (`consentExpiresAt`).
    accountConsent: { canRepresent: boolean | null; restrictions: string | null } | null
    // #2948 (#2329.45-.51) — trois axes de plus de l'accord à 7 conditions.
    positioningAgreement: { tjmValidatedAt: string | null; cvValidatedAt: string | null; otherProcessesKnown: boolean }
  } | null> {
    const rows = await this.runs.manager.query<
      {
        project_id: string | null
        consent_expires_at: Date | null
        availability_checked_at: Date | null
        account_id: string | null
        can_represent: boolean | null
        restrictions: string | null
        tjm_validated_at: Date | null
        cv_validated_at: Date | null
        process_other_interviews: string | null
      }[]
    >(
      // #2558.1 — un besoin existe sans projet : le besoin devait rester
      // TROUVABLE ici, sinon l'écran dirait « ce besoin est introuvable dans
      // cet espace » alors qu'il est sous les yeux de l'appelant. Le projet
      // rendu peut donc être `null` ; c'est l'appelant qui décide quoi en dire.
      `SELECT n.project_id, c.consent_expires_at, c.availability_checked_at, n.account_id,
              cac.can_represent, cac.restrictions,
              c.tjm_validated_at, c.cv_validated_at, c.process_other_interviews
         FROM project_needs n
         LEFT JOIN opportunities o ON o.id = n.project_id
         LEFT JOIN accounts a ON a.id = n.account_id
         JOIN consultants c ON c.id = $2
         LEFT JOIN consultant_account_consent cac
           ON cac.consultant_id = c.id AND cac.account_id = n.account_id
        WHERE n.id = $1
          AND ($3::uuid IS NULL OR n.workspace_id = $3 OR o.workspace_id = $3 OR a.workspace_id = $3)
        LIMIT 1`,
      [needId, consultantId, workspaceId],
    )
    const row = rows[0]
    if (!row) return null
    return {
      projectId: row.project_id,
      consentExpiresAt: row.consent_expires_at ? row.consent_expires_at.toISOString() : null,
      availabilityCheckedAt: row.availability_checked_at ? row.availability_checked_at.toISOString() : null,
      accountConsent: row.account_id ? { canRepresent: row.can_represent, restrictions: row.restrictions } : null,
      positioningAgreement: {
        tjmValidatedAt: row.tjm_validated_at ? row.tjm_validated_at.toISOString() : null,
        cvValidatedAt: row.cv_validated_at ? row.cv_validated_at.toISOString() : null,
        otherProcessesKnown: row.process_other_interviews !== null,
      },
    }
  }

  /**
   * Le destinataire d'un push (§12.1) : le contact DU BESOIN, sinon rien.
   *
   * Le PDF prévoit un repli sur « le contact de facturation ». Cette notion
   * n'existe pas dans le dépôt : aucune colonne ne distingue un contact
   * facturation d'un autre, et prendre « un contact du compte » à la place
   * enverrait le dossier d'un candidat à la mauvaise personne chez un client —
   * ce qui se répare mal. On rend donc `null`, et l'écran demande.
   */
  async pushRecipient(
    needId: string,
    workspaceId: string | null,
  ): Promise<{ contactId: string; email: string | null; fullName: string } | null> {
    const rows = await this.runs.manager.query<{ id: string; email: string | null; full_name: string }[]>(
      `SELECT c.id, c.email, c.full_name
         -- #2558.1 — jointure FACULTATIVE au projet : le destinataire d'un
         -- push est le contact DU BESOIN, il n'a jamais rien dû au projet.
         FROM project_needs n
         LEFT JOIN opportunities o ON o.id = n.project_id
         JOIN contacts c ON c.id = n.contact_id
        WHERE n.id = $1
          AND ($2::uuid IS NULL OR n.workspace_id = $2 OR o.workspace_id = $2)
        LIMIT 1`,
      [needId, workspaceId],
    )
    const row = rows[0]
    if (!row) return null
    return { contactId: row.id, email: row.email, fullName: row.full_name }
  }

  /** D21 — le TJM part-il dans le message client ? Éteint par défaut. */
  async showsRateInClientMessage(workspaceId: string | null): Promise<boolean> {
    if (!workspaceId) return false
    try {
      const rows = await this.runs.manager.query<{ show_rate_in_client_message: boolean }[]>(
        `SELECT show_rate_in_client_message FROM workspaces WHERE id = $1 LIMIT 1`,
        [workspaceId],
      )
      return rows[0]?.show_rate_in_client_message === true
    } catch (error) {
      // Lecture impossible : on n'annonce PAS de tarif. Le repli d'un réglage
      // qui fait sortir un montant vers un client doit être le silence.
      this.logger.error("Réglage d'affichage du TJM illisible", { error })
      return false
    }
  }

  /**
   * Les positionnements NOTÉS de l'espace, pour la calibration (§14).
   *
   * Seuls ceux qui portent un score entrent dans la mesure : un positionnement
   * créé à la main, sans matching, ne dit rien de la qualité du score, et
   * l'inclure ferait baisser un taux sans raison.
   */
  async scoredSubmissions(workspaceId: string | null): Promise<{ pushable: number; reachedInterview: boolean }[]> {
    try {
      const rows = await this.runs.manager.query<{ pushable_score: number; reached: boolean }[]>(
        `SELECT s.pushable_score,
                (s.stage IN ('interview', 'accepted') OR EXISTS (SELECT 1 FROM interviews i WHERE i.submission_id = s.id)) AS reached
           FROM submissions s
          WHERE s.pushable_score IS NOT NULL
            AND ($1::uuid IS NULL OR s.workspace_id = $1)
          LIMIT 5000`,
        [workspaceId],
      )
      return rows.map(row => ({ pushable: row.pushable_score, reachedInterview: row.reached === true }))
    } catch (error) {
      this.logger.error('Positionnements notés illisibles', { error })
      return []
    }
  }

  /** Le score poussable au moment du positionnement — la matière de la calibration. */
  async stampPushableScore(submissionId: string, pushable: number): Promise<void> {
    try {
      await this.runs.manager.query(`UPDATE submissions SET pushable_score = $2 WHERE id = $1`, [
        submissionId,
        pushable,
      ])
    } catch (error) {
      // Le positionnement est fait ; sans ce score la calibration sera moins
      // riche. Faire échouer le geste pour une métrique serait l'inverse de la
      // discipline du dépôt.
      this.logger.error('Score poussable non conservé sur le positionnement', { error })
    }
  }

  /**
   * Le nom et le titre de quelques profils.
   *
   * Séparés du moteur À DESSEIN : le classement ne reçoit jamais l'identité, et
   * l'appelant la rattache après coup pour l'afficher. C'est ce qui rend la
   * garde GA-06 tenable plutôt que déclarative.
   */
  async identitiesFor(
    ids: string[],
    workspaceId: string | null,
    userId: string,
    options: { canReadFinance?: boolean } = {},
  ): Promise<
    Map<
      string,
      {
        fullName: string
        title: string | null
        dailyRateCents: number | null
        availableFrom: string | null
        location: string | null
        finance: { costCents: number | null; marginCents: number | null } | null
      }
    >
  > {
    if (ids.length === 0) return new Map()
    // #2176.55 — le coût n'est LU que sous `finance:read` : sans le droit, la
    // colonne ne quitte même pas la base.
    const financeColumns = options.canReadFinance ? ', c.engagement_kind, c.cost_rate_cents, c.purchase_tjm_cents' : ''
    const rows = await this.runs.manager.query<
      {
        id: string
        full_name: string
        title: string | null
        tjm: number | null
        available_from: string | null
        location: string | null
        engagement_kind?: string | null
        cost_rate_cents?: string | number | null
        purchase_tjm_cents?: string | number | null
      }[]
    >(
      `SELECT c.id, c.full_name, c.title, c.tjm, c.available_from, c.location${financeColumns}
         FROM consultants c
        WHERE c.id = ANY($1)
          AND ($2::uuid IS NULL OR c.workspace_id = $2 OR (c.workspace_id IS NULL AND c.user_id = $3))
          AND ($2::uuid IS NOT NULL OR c.user_id = $3)`,
      [ids, workspaceId, userId],
    )
    return new Map(
      rows.map(row => [
        row.id,
        {
          fullName: row.full_name,
          title: row.title,
          dailyRateCents: row.tjm === null ? null : Math.round(row.tjm * 100),
          // #2176.53 — les CONDITIONS du comparateur (D48 : le TJM se lit sans
          // condition, comme sur la fiche du vivier ; disponibilité et lieu
          // suivent la même règle).
          availableFrom: row.available_from,
          location: row.location,
          // #2176.55 — `redactFinance` : la clé reste PRÉSENTE, `null` sans `finance:read`.
          finance: redactFinance({ margin: costMarginOf(row) }, options.canReadFinance === true).margin,
        },
      ]),
    )
  }

  /**
   * #2178.33/.34 — les refus client DÉJÀ enregistrés sur ce besoin, par axe.
   *
   * `needId === null` (un rapprochement lancé hors d'un besoin typé, si ça
   * arrive un jour) → `[]` : rien à charger, jamais une requête dans le vide.
   * `feedback` traverse `submissions` (JOIN sur `need_id`) parce que
   * `submission_feedback` ne porte pas le besoin directement — c'est le
   * positionnement qui le sait.
   */
  private async feedbackLearningsFor(
    needId: string | null,
    workspaceId: string | null,
  ): Promise<NeedFeedbackLearning[]> {
    if (!needId) return []
    const rows = await this.feedback.manager.query<Record<FeedbackAxis, FeedbackVerdict>[]>(
      `SELECT f.technical, f.experience, f.communication, f.price, f.seniority, f.context,
              f.availability, f.location, f.timing, f.other, f.personality
         FROM submission_feedback f
         JOIN submissions s ON s.id = f.submission_id
        WHERE s.need_id = $1
          AND ($2::uuid IS NULL OR s.workspace_id = $2)`,
      [needId, workspaceId],
    )
    return needFeedbackLearnings(rows)
  }

  /**
   * Le document d'EXPLICATION d'un classement (§13, art. 86).
   *
   * Il est RECALCULÉ à partir des critères et des poids figés dans le journal,
   * pas relu depuis un cache : deux exécutions identiques rendant le même
   * classement, le recalcul est fidèle par construction, et il reste juste même
   * pour un profil que la borne du journal n'avait pas retenu.
   *
   * Il ne contient JAMAIS la donnée d'un autre candidat — c'est le critère
   * d'acceptation du ticket, et la raison d'être du document : il peut être remis
   * à la personne concernée.
   */
  async explain(
    runId: string,
    consultantId: string,
    workspaceId: string | null,
    userId: string,
    canReadFinance: boolean,
  ): Promise<{ run: MatchRunEntity; need: MatchNeed; result: MatchResult } | null> {
    const run = await this.runs
      .createQueryBuilder('r')
      .where('r.id = :runId', { runId })
      .andWhere(workspaceId ? 'r.workspace_id = :workspaceId' : 'r.workspace_id IS NULL', { workspaceId })
      .getOne()
    if (!run) return null
    const need = run.criteria as MatchNeed
    const [candidate] = await this.loadCandidates(workspaceId, userId, need, [consultantId])
    if (!candidate) return null
    const result = evaluateCandidate(need, candidate, {
      weights: run.weights as Record<string, number>,
      threshold: run.threshold,
      canReadFinance,
      now: run.created_at,
    })
    return { run, need, result }
  }
}

/** « 5 ans min », « 5+ ans » → 5. Rien d'autre n'est deviné. */
/**
 * #2176.55 — le coût d'un profil selon sa NATURE (même règle que la colonne
 * coût du vivier, `talent.service.ts`) : coût chargé d'un salarié, TJM d'achat
 * sinon — jamais les deux. La marge = TJM − coût, `null` dès qu'un des deux
 * manque : une absence ne devient jamais un 0.
 */
function costMarginOf(row: {
  tjm: number | null
  engagement_kind?: string | null
  cost_rate_cents?: string | number | null
  purchase_tjm_cents?: string | number | null
}): { costCents: number | null; marginCents: number | null } {
  const raw = row.engagement_kind === 'salarie' ? row.cost_rate_cents : row.purchase_tjm_cents
  const costCents = raw === null || raw === undefined ? null : Number(raw)
  const rateCents = row.tjm === null ? null : Math.round(row.tjm * 100)
  return { costCents, marginCents: costCents === null || rateCents === null ? null : rateCents - costCents }
}

function yearsFromText(raw: string | null): number | null {
  if (!raw) return null
  const match = /(\d{1,2})\s*(?:\+)?\s*an/i.exec(raw)
  if (!match) return null
  const years = Number(match[1])
  return Number.isFinite(years) ? years : null
}

/** « senior », « confirmé » → la bande. Un texte non reconnu rend `null`. */
function bandFromText(raw: string | null): string | null {
  if (!raw) return null
  const value = raw.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (value.includes('junior') || value.includes('debutant')) return 'junior'
  if (value.includes('confirme')) return 'confirme'
  if (value.includes('senior')) return 'senior'
  if (value.includes('expert') || value.includes('architecte')) return 'expert'
  return null
}

/**
 * La préférence de distanciel TELLE QU'ELLE EST SAISIE, ramenée à l'énumération
 * du contrat.
 *
 * ⚠️ Deux vocabulaires cohabitent, et les confondre serait silencieux :
 * `preferenceWarnings` compare à `sur_site` / `full_remote` — les valeurs
 * ÉCRITES en base — pendant que `readRemote` ci-dessous traduit vers
 * `on_site` / `remote`, le vocabulaire du candidat de matching. Traduire ici
 * ferait taire les deux drapeaux de distanciel sans qu'un test ne bouge.
 *
 * Une valeur que l'énumération ne connaît pas rend `null` : « on n'a pas
 * demandé ». C'est déjà ce qui se passait, à ceci près que le compilateur ne
 * pouvait pas le savoir.
 */
function readRemotePreference(preference: string | null): RemotePreference | null {
  return REMOTE_PREFERENCES.find(known => known === preference) ?? null
}

function readRemote(preference: string | null): 'on_site' | 'hybrid' | 'remote' | null {
  switch (preference) {
    case 'sur_site':
      return 'on_site'
    case 'hybride':
      return 'hybrid'
    case 'full_remote':
      return 'remote'
    default:
      return null
  }
}
