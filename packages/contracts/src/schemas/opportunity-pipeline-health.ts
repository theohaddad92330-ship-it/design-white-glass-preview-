import { z } from 'zod'
import {
  evidenceGapSchema,
  opportunityFreshness,
  opportunityFreshnessSchema,
  opportunityStageDetail,
  OPPORTUNITY_STAGE_DETAILS,
  opportunityStageDetailSchema,
  TRIAGED_STAGES,
  type EvidenceGap,
  type OpportunityStageDetail,
} from './opportunity-ontology.js'
import { assertNeedSqlColumn } from './need-status.js'
import type { ProjectNeedStatus } from './project.js'

/**
 * #2324.40/43/44/46/47/48 — LE DIAGNOSTIC DE PIPE DU COMPILATEUR D'OPPORTUNITÉ.
 *
 * Mesuré le 18/09/2026 (registre `chat-opportunity-compiler`) : `get_pipeline`
 * (chat_tools.py) rend des SOMMES par étape, jamais un diagnostic — rien ne
 * répond à « qu'est-ce qui mérite du temps », « qu'est-ce qui devrait être
 * clôturé », « quel besoin n'a aucun profil ». Ce module ÉTEND l'ontologie
 * existante ({@link opportunityFreshness}, {@link TRIAGED_STAGES}) plutôt que
 * d'en refaire une (GA-26) — aucun score, aucune pondération, aucune probabilité de
 * signature : seulement des RAISONS NOMMÉES, contrôlables une par une.
 *
 * #2324.47 — obtenu SANS redirection obligatoire vers l'écran Pipe : ce calcul
 * est PUR, ce qui permet à un outil de conversation de le narrer directement,
 * sans jamais forcer un aller sur `/projects`.
 */

/**
 * #2324.44 — au-delà de combien de jours SANS mouvement de statut un besoin
 * `submitted`/`client_review` DÉJÀ positionné devient « profil sans retour ».
 * Deux semaines : le seuil bas de {@link OPPORTUNITY_FRESH_DAYS} (30j) serait
 * trop lent pour un client qui a REÇU un profil — c'est une attente de
 * RÉPONSE, pas de fraîcheur de signal.
 */
export const NEEDS_AWAITING_FEEDBACK_DAYS = 14

/**
 * GA-62 — les deux statuts qu'un besoin traverse une fois un profil DÉJÀ
 * soumis au client. Un sous-ensemble métier, pas une redéfinition de « besoin
 * ouvert » : {@link needStillOpenSql} (`need-status.ts`) reste la seule
 * réponse à cette question-là. Nommé ici pour que
 * `project-pipeline.service.ts` (`needs_awaiting_feedback`) n'ait plus à
 * recopier la liste à la main dans son SQL — c'est justement ce que la garde
 * `need-open-definition.spec.ts` refuse.
 */
export const NEEDS_AWAITING_FEEDBACK_STATUSES: readonly ProjectNeedStatus[] = ['submitted', 'client_review']

/**
 * Le MÊME sous-ensemble, en SQL — pour la requête qui ne peut pas charger un
 * besoin en mémoire pour le lui demander. Même garde de colonne que
 * {@link needStillOpenSql}.
 */
export function needsAwaitingFeedbackSql(column: string): string {
  assertNeedSqlColumn('needsAwaitingFeedbackSql', column)
  return `${column} IN (${NEEDS_AWAITING_FEEDBACK_STATUSES.map(status => `'${status}'`).join(', ')})`
}

export const PIPELINE_HEALTH_REASONS = [
  /** #2324.41 — ré-emploi direct d'`opportunityFreshness`, jamais recalculé. */
  'ageing',
  'stale',
  /** #2324.42 — ré-emploi du trivalent `has_next_action` (déjà là, project.ts). */
  'without_next_action',
  /** #2324.43 */
  'need_without_profile',
  /** #2324.44 */
  'profile_awaiting_feedback',
] as const
export const pipelineHealthReasonSchema = z.enum(PIPELINE_HEALTH_REASONS)
export type PipelineHealthReason = z.infer<typeof pipelineHealthReasonSchema>

/**
 * Une ligne d'entrée minimale — ce qu'une requête SQL sur `opportunities`
 * jointe à `tasks`/`project_needs`/`submissions` peut fournir sans recalculer
 * l'existant. Chaque champ trivalent reste `| undefined` : « non mesuré »
 * n'est jamais « mesuré à zéro » (GA-18/19).
 */
export const pipelineHealthRowSchema = z.object({
  id: z.string(),
  stage: z.string(),
  /** `'signal'` déclenche le NO-GO #2324.48. */
  kind: z.string().nullish(),
  owner_id: z.string().nullish(),
  has_next_action: z.boolean().nullish(),
  /**
   * Le dernier mouvement connu de la ligne — utilisé comme proxy du
   * « dernier fait » qu'exige {@link opportunityFreshness}. Ce N'EST PAS
   * un nouveau concept : à défaut d'un journal d'activité par opportunité,
   * c'est la meilleure date déjà portée par la ligne (`stage_entered_at`,
   * project.ts). Documenté ici pour que personne ne le prenne pour une date
   * de FAIT sourcé au sens de l'ontologie.
   */
  stage_entered_at: z.string().nullish(),
  needs_total: z.number().int().min(0).nullish(),
  needs_without_profile: z.number().int().min(0).nullish(),
  needs_awaiting_feedback: z.number().int().min(0).nullish(),
  /**
   * #2324.20/21/23 — le statut du besoin le PLUS AVANCÉ rattaché à cette
   * opportunité (`project_needs.status`, déjà là — {@link opportunityStageDetail}
   * le traduit). `null`/absent = aucun besoin rattaché, jamais un défaut deviné.
   */
  most_advanced_need_status: z.string().nullish(),
  /**
   * #2325.13 — les manques DÉJÀ nommés par `projectEvidence` (opportunity-
   * ontology.ts), calculés par l'APPELANT SQL à partir des colonnes qu'il lit
   * déjà sur `opportunities` — jamais recalculés ici (GA-26). `undefined`/
   * `null` = l'appelant n'a pas fourni cette lecture pour cette ligne : non
   * mesuré, jamais deviné (GA-18/19). Un tableau VIDE (aucun manque) est une
   * lecture positive à part entière, distincte de l'absence.
   */
  evidence_gaps: z.array(evidenceGapSchema).nullish(),
})
export type PipelineHealthRow = z.infer<typeof pipelineHealthRowSchema>

export type PipelineHealthItem = {
  id: string
  stage: string
  freshness: z.infer<typeof opportunityFreshnessSchema>
  /** Jamais vide pour un item de `needsAttention` — c'est CE QUI justifie sa présence. */
  reasons: PipelineHealthReason[]
  /** #2324.20/21/23 — voir {@link opportunityStageDetail}. `null` = pas d'affinage applicable. */
  stageDetail: OpportunityStageDetail | null
  /** #2325.13 — voir {@link PipelineHealthRow.evidence_gaps}. `null` = non fourni par l'appelant. */
  evidenceGaps: EvidenceGap[] | null
}

/**
 * #2170.3 (tranché sans Louis, 25-26/09/2026) — DÉPLACÉES DANS `opportunity-
 * ontology.ts`, D'OÙ `projectReadRowSchema` PEUT LES LIRE.
 *
 * `OPPORTUNITY_STAGE_DETAILS` / `opportunityStageDetailSchema` /
 * `OpportunityStageDetail` / `opportunityStageDetail` vivaient ici. La carte
 * du Kanban (#2170.3) a besoin d'exposer ce même affinage sur `ProjectReadRow`
 * — et `opportunity-ontology.ts` (qui PORTE ce type) ne peut pas les importer
 * d'ici sans un cycle, puisque CE fichier importe déjà `opportunity-ontology.js`
 * (voir les imports en tête de fichier). Déplacer était l'option qui ne
 * duplique rien (GA-26) : l'ontologie est leur vraie maison, cette ré-export
 * est ce qui garde les imports existants (ce fichier, son test) inchangés.
 */
export { OPPORTUNITY_STAGE_DETAILS, opportunityStageDetailSchema, opportunityStageDetail, type OpportunityStageDetail }

/**
 * L'ORDRE de progression des statuts qu'`opportunityStageDetail`
 * (`opportunity-ontology.ts`) sait traduire, du moins avancé au plus avancé —
 * ce qu'attend le `ORDER BY CASE` juste plus bas, à UN seul endroit (GA-26).
 *
 * ⚠️ #2942 — `interview` et `negotiation` (#2152.9/.10) rejoignent la liste
 * APRÈS `client_review` : `NEED_STATUS_ORDER` (`need-status.ts`) les place
 * entre `client_review` et `won`, et un besoin dans l'un de ces deux statuts a
 * avancé plus loin que « en validation client », jamais moins.
 */
const NEED_STATUS_PROGRESS_ORDER = [
  'to_qualify',
  'qualified',
  'to_match',
  'matching',
  'shortlist_ready',
  'submitted',
  'client_review',
  'interview',
  'negotiation',
] as const

/**
 * #2170.3 (tranché sans Louis) — LE BESOIN LE PLUS AVANCÉ D'UN PROJET, EN SQL,
 * à UN seul endroit (GA-26).
 *
 * `project-pipeline.service.ts` portait déjà cette sous-requête pour
 * `pipelineHealth` (le diagnostic agrégé) ; `projects.service.ts` en a
 * désormais besoin pour afficher {@link opportunityStageDetail} sur CHAQUE
 * carte du Kanban (#2170.3 — le stade « Profils recherchés » demandé par
 * l'épopée #2949, rendu SANS rouvrir `PIPELINE_STAGES`, figé en nombre et en
 * ordre par un arbitrage antérieur — voir le docblock d'`OPPORTUNITY_STAGE_DETAILS`
 * ci-dessus). Une troisième copie à la main aurait divergé au premier statut
 * ajouté à `PROJECT_NEED_STATUSES` ; celle-ci ne peut plus.
 *
 * `projectIdColumn` est une expression de colonne SQL (`o.id`), jamais une
 * valeur utilisateur — {@link assertNeedSqlColumn} refuse ce qui n'en a pas
 * la forme.
 */
export function mostAdvancedNeedStatusSql(projectIdColumn: string): string {
  assertNeedSqlColumn('mostAdvancedNeedStatusSql', projectIdColumn)
  const statusList = NEED_STATUS_PROGRESS_ORDER.map(status => `'${status}'`).join(', ')
  const caseWhen = NEED_STATUS_PROGRESS_ORDER.map((status, index) => `WHEN '${status}' THEN ${index + 1}`).join(
    '\n                ',
  )
  return `(
    SELECT n.status FROM project_needs n
     WHERE n.project_id = ${projectIdColumn} AND n.archived_at IS NULL
       AND n.status IN (${statusList})
     ORDER BY CASE n.status
                ${caseWhen}
                ELSE 0
              END DESC
     LIMIT 1
  )`
}

export type PipelineHealth = {
  /** #2324.40 — l'union de toutes les raisons, chacune NOMMÉE sur son item. */
  needsAttention: PipelineHealthItem[]
  /** #2324.46 — un SOUS-ENSEMBLE de `needsAttention` : stale ET sans prochaine
   *  action. Une RECOMMANDATION — rien ici ne clôture quoi que ce soit. */
  recommendedToClose: PipelineHealthItem[]
  /** #2324.48 — le compte de ce que le NO-GO a retiré. Jamais silencieux :
   *  un chiffre à 0 est une vraie réponse, une absence de clé ne l'aurait pas été. */
  excludedUnapprovedSignals: number
  /** #2325.1/.15/.17-.26 — au plus {@link MAX_PRIORITY_DEALS}, classées par
   *  {@link priorityScore} (jamais par montant, date de création ou seul stage
   *  — voir son commentaire). Champ ADDITIF : `needsAttention` et
   *  `recommendedToClose` ne changent pas de forme ni de volume pour ça. */
  priorityDeals: PriorityDeal[]
  /** #2325.16 — au plus {@link MAX_DEALS_TO_WATCH}, le sous-ensemble le plus
   *  méritant de `recommendedToClose` (même règle stale+sans action), classé
   *  par le même score. Un DOUBLON enrichi de `recommendedToClose`, pas une
   *  deuxième dérivation : mêmes candidats, mêmes raisons. */
  dealsToWatch: PriorityDeal[]
}

// ── #2325 — LA PRIORISATION DU PIPE : « QUELLES AFFAIRES MÉRITENT MON TEMPS ». ──
//
// Chantier `chat-lot3` (registre `.claude/notes/registre-2026-09-20-chat-lot3.md`,
// #2325.1-.31). ÉTEND `pipelineHealth` (#2324) au lieu d'en refaire une lecture du
// pipe (GA-26) : les candidats sont EXACTEMENT ceux de `needsAttention`, jamais
// une deuxième requête ni un deuxième filtre métier.
//
// Volontairement absent de ce fichier : le bornage du VOLUME par taille
// d'équipe/temps disponible/staffing (#2325.27/.28/.31). Ce pipeline ne porte
// aucun agrégat d'équipe — l'ajouter changerait la FORME de l'appelant
// (`ProjectPipelineService`), pas seulement ce calcul pur. Laissé `retenu` au
// registre, avec la raison précise plutôt qu'un renvoi vague à « plus tard ».

/**
 * #2325.6-.10/.12/.14 — LES SEPT AXES DU RAPPORT.
 *
 * Chacun est soit MESURÉ (une étiquette dérivée d'une donnée qui existe déjà
 * ailleurs dans ce module, jamais recalculée), soit explicitement NON MESURÉ —
 * jamais deviné, jamais lu comme un zéro (« un score n'est jamais nu : ses
 * axes, et ce qui n'a pas pu être évalué est nommé »). Quatre des sept
 * (réalité du besoin, accès, capacité à répondre, économie) n'ont AUCUNE
 * source dans ce pipeline aujourd'hui : ils restent nommés à
 * `{ measured: false }`, jamais retirés — les retirer serait le même défaut
 * que de les afficher à zéro.
 */
export const PIPE_PRIORITY_AXES = [
  'needReality',
  'timing',
  'access',
  'capacityToRespond',
  'decisionAwaited',
  'economics',
  'risk',
  // #2325.11/.13 — AJOUTÉS À LA FIN (GA-08 : un enum ne perd jamais de valeur
  // et n'en insère jamais au milieu).
  'ageing',
  'confidence',
] as const
export const pipePriorityAxisSchema = z.enum(PIPE_PRIORITY_AXES)
export type PipePriorityAxis = z.infer<typeof pipePriorityAxisSchema>

export type PipePriorityAxisReading = { measured: true; label: string } | { measured: false }

/**
 * #2325.20-.25 — LES SIX DÉCISIONS NOMMÉES, jamais un septième générique.
 * #2325.26 — « relancer le client » n'apparaît PAS dans cette liste : un
 * `z.enum` exhaustif ne peut pas la produire, et {@link pickDecision} n'a pas
 * de branche par défaut qui y ressemble.
 */
export const PIPE_PRIORITY_DECISIONS = [
  'validate_budget',
  'confirm_must_have',
  'get_shortlist_feedback',
  'secure_consultant',
  'schedule_interview',
  'decide_to_close',
] as const
export const pipePriorityDecisionSchema = z.enum(PIPE_PRIORITY_DECISIONS)
export type PipePriorityDecision = z.infer<typeof pipePriorityDecisionSchema>

/**
 * #2325.17-.19 — CE QU'UNE AFFAIRE PRIORITAIRE PORTE : une décision NOMMÉE, un
 * owner (celui déjà connu sur la ligne — jamais assigné ici), et une date
 * RECOMMANDÉE de relance. `recommendedBy` est une RECOMMANDATION dérivée de la
 * fraîcheur, pas une échéance mesurée : ce pipeline n'en garde aucune, et en
 * inventer une serait la donnée fictive que la doctrine interdit.
 */
export type PriorityDeal = {
  id: string
  stage: string
  axes: Record<PipePriorityAxis, PipePriorityAxisReading>
  decision: PipePriorityDecision
  /** `null` = aucun owner connu sur la ligne — jamais un owner deviné. */
  owner: string | null
  /** ISO `AAAA-MM-DD` — une RECOMMANDATION de relance, pas un fait mesuré. */
  recommendedBy: string
}

const MAX_PRIORITY_DEALS = 5 // #2325.15
const MAX_DEALS_TO_WATCH = 3 // #2325.16

type Freshness = z.infer<typeof opportunityFreshnessSchema>

const FRESHNESS_WEIGHT: Record<Freshness, number> = { fresh: 0, ageing: 1, stale: 2 }

/**
 * #2325.2/.3/.4 — LE SCORE NE LIT NI MONTANT, NI DATE DE CRÉATION, NI LE SEUL
 * STAGE : `PipelineHealthItem` ne porte aucun de ces trois champs — la porte
 * est fermée au niveau du TYPE, pas seulement de la formule ci-dessous. Seuls
 * la fraîcheur (un PROXY de timing, pas une date brute) et le NOMBRE de
 * raisons concrètes entrent dans le calcul.
 */
function priorityScore(item: PipelineHealthItem): number {
  return FRESHNESS_WEIGHT[item.freshness] * 10 + item.reasons.length
}

/** #2325.20-.26 — jamais "relancer" : un enum fermé, un défaut nommé qui n'y
 *  ressemble pas. */
function pickDecision(item: PipelineHealthItem): PipePriorityDecision {
  if (item.reasons.includes('stale') && item.reasons.includes('without_next_action')) return 'decide_to_close'
  if (item.stageDetail === 'interview') return 'schedule_interview'
  if (item.stageDetail === 'profiles_prepared') return 'get_shortlist_feedback'
  if (item.stageDetail === 'profiles_wanted') return 'confirm_must_have'
  if (item.reasons.includes('need_without_profile')) return 'secure_consultant'
  // Rien de plus précis à dire : confirmer le budget est la question la plus
  // en amont — jamais une relance générique.
  return 'validate_budget'
}

const RECOMMENDED_OFFSET_DAYS: Record<Freshness, number> = { stale: 1, ageing: 3, fresh: 7 }

function recommendedByDate(item: PipelineHealthItem, now: Date): string {
  const date = new Date(now.getTime())
  date.setUTCDate(date.getUTCDate() + RECOMMENDED_OFFSET_DAYS[item.freshness])
  return date.toISOString().slice(0, 10)
}

function axesFor(item: PipelineHealthItem): Record<PipePriorityAxis, PipePriorityAxisReading> {
  return {
    // #2325.6/.8/.9/.12 — pas de source dans ce pipeline aujourd'hui : NOMMÉS,
    // jamais devinés (GA-18/19).
    needReality: { measured: false },
    access: { measured: false },
    capacityToRespond: { measured: false },
    economics: { measured: false },
    // #2325.7 — la fraîcheur EST le proxy de timing déjà retenu par #2324.41.
    timing: { measured: true, label: item.freshness },
    // #2325.10 — dérivé du même affinage que #2324.20/21/23, jamais recalculé.
    decisionAwaited: item.stageDetail ? { measured: true, label: item.stageDetail } : { measured: false },
    // #2325.14 — les raisons DÉJÀ nommées par #2324 SONT le risque : les
    // réutiliser (GA-26) plutôt qu'en inventer une deuxième liste.
    risk: { measured: true, label: item.reasons.join(', ') },
    // #2325.11 — VIEILLISSEMENT. Distinct de `timing` dans son INTENTION
    // (« depuis quand ça traîne » plutôt que « y a-t-il urgence ») mais ce
    // pipeline ne porte qu'UNE SEULE date par opportunité (`stage_entered_at`,
    // déjà le proxy du dernier fait ET du temps dans le stage — commentaire de
    // {@link PipelineHealthRow}). Les deux axes partagent donc la même valeur
    // mesurée tant qu'un second horodatage (deadline déclarée, dernier fait
    // distinct de l'entrée en stage) n'existe pas dans ce pipeline — GA-26
    // interdit un second calcul qui ferait semblant de lire autre chose que ce
    // qui est réellement là. Le jour où une deadline ou une date d'activité
    // distincte existe, SEUL cet axe doit la lire.
    ageing: { measured: true, label: item.freshness },
    // #2325.13 — CONFIANCE. Agrège les `evidenceGaps` déjà nommés par
    // `projectEvidence` (opportunity-ontology.ts), fournis par l'appelant SQL
    // — jamais recalculés ici (GA-26). `null` = non fourni : non mesuré,
    // jamais deviné. Un tableau vide est un signal POSITIF mesuré, jamais
    // confondu avec l'absence de mesure.
    confidence:
      item.evidenceGaps === null
        ? { measured: false }
        : { measured: true, label: item.evidenceGaps.length === 0 ? 'complete' : item.evidenceGaps.join(', ') },
  }
}

function toPriorityDeal(item: PipelineHealthItem, ownerId: string | null, now: Date): PriorityDeal {
  return {
    id: item.id,
    stage: item.stage,
    axes: axesFor(item),
    decision: pickDecision(item),
    owner: ownerId,
    recommendedBy: recommendedByDate(item, now),
  }
}

/**
 * #2324.48 — NO-GO. Un signal de recrutement (`kind === 'signal'`) n'est une
 * opportunité ACTIVE que si un humain l'a adopté des DEUX mains : un porteur
 * ET une prochaine action. L'un sans l'autre reste un signal — un `owner_id`
 * seul serait une affectation automatique sans geste, jamais une prise en main.
 */
function isUnapprovedSignal(row: PipelineHealthRow): boolean {
  if (row.kind !== 'signal') return false
  return !(row.owner_id && row.has_next_action === true)
}

export function pipelineHealth(rows: readonly PipelineHealthRow[], now: Date = new Date()): PipelineHealth {
  const needsAttention: PipelineHealthItem[] = []
  // #2325 — le même item, accompagné de l'owner de SA ligne (pour
  // `PriorityDeal.owner`, #2325.18) — jamais un second passage sur `rows`.
  const candidates: Array<{ item: PipelineHealthItem; ownerId: string | null }> = []
  let excludedUnapprovedSignals = 0

  for (const row of rows) {
    if (isUnapprovedSignal(row)) {
      excludedUnapprovedSignals++
      continue
    }
    // Hors jeu (won/lost/dormant) ou intake (detected/potential) : ni l'un ni
    // l'autre n'est un travail EN COURS qu'un commercial pilote aujourd'hui —
    // `TRIAGED_STAGES` est LIVE_STAGES PRIVÉ de l'intake (opportunity-ontology.ts).
    if (!(TRIAGED_STAGES as readonly string[]).includes(row.stage)) continue

    const freshness = opportunityFreshness(row.stage_entered_at, now)
    const reasons: PipelineHealthReason[] = []
    if (freshness === 'ageing') reasons.push('ageing')
    if (freshness === 'stale') reasons.push('stale')
    // `=== false` et non `!row.has_next_action` : `undefined`/`null` (non
    // mesuré) ne doit jamais se lire comme « sans action » (GA-18/19).
    if (row.has_next_action === false) reasons.push('without_next_action')
    if ((row.needs_without_profile ?? 0) > 0) reasons.push('need_without_profile')
    if ((row.needs_awaiting_feedback ?? 0) > 0) reasons.push('profile_awaiting_feedback')

    if (reasons.length === 0) continue
    const item: PipelineHealthItem = {
      id: row.id,
      stage: row.stage,
      freshness,
      reasons,
      stageDetail: opportunityStageDetail(row.stage, row.most_advanced_need_status),
      evidenceGaps: row.evidence_gaps ?? null,
    }
    needsAttention.push(item)
    candidates.push({ item, ownerId: row.owner_id ?? null })
  }

  const recommendedToClose = needsAttention.filter(
    item => item.reasons.includes('stale') && item.reasons.includes('without_next_action'),
  )

  // #2325.2/.3/.4 — classées par `priorityScore` (fraîcheur + nombre de
  // raisons), jamais par montant/date de création/seul stage ; tie-break sur
  // `id` pour un ordre déterministe indépendant de l'ordre d'entrée.
  const ranked = [...candidates].sort((a, b) => {
    const diff = priorityScore(b.item) - priorityScore(a.item)
    return diff !== 0 ? diff : a.item.id.localeCompare(b.item.id)
  })

  const priorityDeals = ranked.slice(0, MAX_PRIORITY_DEALS).map(c => toPriorityDeal(c.item, c.ownerId, now))

  const dealsToWatch = ranked
    .filter(c => c.item.reasons.includes('stale') && c.item.reasons.includes('without_next_action'))
    .slice(0, MAX_DEALS_TO_WATCH)
    .map(c => toPriorityDeal(c.item, c.ownerId, now))

  return { needsAttention, recommendedToClose, excludedUnapprovedSignals, priorityDeals, dealsToWatch }
}
