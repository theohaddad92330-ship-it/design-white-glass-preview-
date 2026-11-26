import { z } from 'zod'

/**
 * ÉPOPÉE #2880 — LE CROISEMENT EXPERTISE ↔ FONDEMENT/PREUVE (lot V33, 28/09).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER, APRÈS NEUF LOTS SANS LUI
 * ─────────────────────────────────────────────────────────────────────────────
 * Le questionnaire (`credibilite-preuves.ts`) pose depuis les lots nuit-14 à
 * g10 cinq questions À UNE DIMENSION : « quelles expertises reposent sur une
 * référence client / une expérience personnelle / un partenaire / un vivier /
 * une simple volonté ». Chaque réponse est un ENSEMBLE plat d'expertises sur
 * `esn_profiles`. Ce qui manquait (#2039.9/.12/.13/.14), constaté neuf fois :
 * une LIGNE par couple (expertise, fondement), avec SES métadonnées — l'objet
 * source qui le prouve (compte, consultant, mission, document), un état, la
 * confidentialité d'une référence. Décision Louis (28/09, lot V33) : une table
 * neuve, `expertise_groundings` — c'est ce fichier qui en porte le vocabulaire
 * (GA-26 : les contraintes SQL, le service et l'écran le lisent ici).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS ÉTATS, ET CE QUI LES PRODUIT
 * ─────────────────────────────────────────────────────────────────────────────
 *   · `proven`   (prouvé)    — un OBJET source vérifiable est rattaché. Jamais
 *                              sans lui : le schéma d'écriture ET la contrainte
 *                              SQL le refusent (« jamais prouvé inventé »).
 *   · `declared` (déclaré)   — l'utilisateur l'a dit, rien ne le prouve encore.
 *                              C'est l'état de toute réponse plate projetée.
 *   · `to_prove` (à prouver) — l'utilisateur dit lui-même qu'il n'a pas de
 *                              preuve (« simple volonté de développement »),
 *                              ou le choisit explicitement.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'EXISTANT EST LU, JAMAIS MIGRÉ (décision 2)
 * ─────────────────────────────────────────────────────────────────────────────
 * {@link projectExpertiseGroundings} lit les cinq colonnes plates TELLES
 * QUELLES et en projette des fondements SANS identifiant (`id: null`) : rien
 * n'est écrit tant que l'utilisateur ne touche pas la ligne. Une ligne
 * stockée pour la même paire (expertise, fondement) gagne toujours — c'est une
 * correction humaine — et une ligne ARCHIVÉE éteint la projection de sa paire
 * (on archive, on ne supprime pas).
 */

// ── Les fondements : EXACTEMENT ceux que pose déjà `credibilite-preuves.ts` ──

export const EXPERTISE_GROUNDING_KINDS = [
  /** #2039.2 — une référence client. */
  'client_reference',
  /** #2039.3 — une expérience personnelle. */
  'personal_experience',
  /** #2039.4 — un partenaire. */
  'partner',
  /** #2039.5 — un vivier disponible. */
  'talent_pool',
  /** #2039.6 — une simple volonté de développement. */
  'development_intent',
] as const
export const expertiseGroundingKindSchema = z.enum(EXPERTISE_GROUNDING_KINDS)
export type ExpertiseGroundingKind = z.infer<typeof expertiseGroundingKindSchema>

/** La colonne plate de `esn_profiles` que chaque fondement relit (projection). */
export const EXPERTISE_GROUNDING_ANSWER_KEYS = {
  client_reference: 'expertise_client_reference',
  personal_experience: 'expertise_personal_experience',
  partner: 'expertise_partner',
  talent_pool: 'expertise_talent_pool',
  development_intent: 'expertise_no_concrete_proof',
} as const satisfies Record<ExpertiseGroundingKind, string>

export const EXPERTISE_GROUNDING_STATES = ['proven', 'declared', 'to_prove'] as const
export const expertiseGroundingStateSchema = z.enum(EXPERTISE_GROUNDING_STATES)
export type ExpertiseGroundingState = z.infer<typeof expertiseGroundingStateSchema>

/** D'où vient l'état : la réponse d'onboarding projetée, ou un geste de l'utilisateur. */
export const EXPERTISE_GROUNDING_STATE_SOURCES = ['onboarding_answer', 'user'] as const
export const expertiseGroundingStateSourceSchema = z.enum(EXPERTISE_GROUNDING_STATE_SOURCES)
export type ExpertiseGroundingStateSource = z.infer<typeof expertiseGroundingStateSourceSchema>

/** #2039.9/.12 — l'objet source qui prouve un fondement, quand il existe. */
export const EXPERTISE_GROUNDING_SOURCE_TYPES = ['account', 'consultant', 'mission', 'document'] as const
export const expertiseGroundingSourceTypeSchema = z.enum(EXPERTISE_GROUNDING_SOURCE_TYPES)
export type ExpertiseGroundingSourceType = z.infer<typeof expertiseGroundingSourceTypeSchema>

/**
 * #2039.13 — la restriction de confidentialité PAR RÉFÉRENCE client (jamais
 * sur un autre fondement). `null` = non renseignée, jamais « citable » deviné.
 */
export const EXPERTISE_REFERENCE_CONFIDENTIALITIES = ['citable', 'anonymizable', 'confidential'] as const
export const expertiseReferenceConfidentialitySchema = z.enum(EXPERTISE_REFERENCE_CONFIDENTIALITIES)
export type ExpertiseReferenceConfidentiality = z.infer<typeof expertiseReferenceConfidentialitySchema>

export const expertiseGroundingSchema = z.object({
  /** `null` = projeté depuis une réponse plate, rien n'est encore écrit. */
  id: z.string().nullable(),
  expertiseKey: z.string().min(1),
  kind: expertiseGroundingKindSchema,
  state: expertiseGroundingStateSchema,
  stateSource: expertiseGroundingStateSourceSchema,
  sourceType: expertiseGroundingSourceTypeSchema.nullable(),
  sourceId: z.string().nullable(),
  /** Le libellé de l'objet source, relu à la lecture (jamais stocké en double). */
  sourceLabel: z.string().nullable(),
  /** Précision libre de l'utilisateur (ex. « refonte du SI RH »). */
  label: z.string().nullable(),
  confidentiality: expertiseReferenceConfidentialitySchema.nullable(),
  archivedAt: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})
export type ExpertiseGrounding = z.infer<typeof expertiseGroundingSchema>

// ── Écriture ─────────────────────────────────────────────────────────────────

const LABEL_MAX = 200

type WriteRuleInput = {
  kind?: ExpertiseGroundingKind
  state?: ExpertiseGroundingState
  sourceType?: ExpertiseGroundingSourceType | null
  sourceId?: string | null
  confidentiality?: ExpertiseReferenceConfidentiality | null
}

/** La première règle d'écriture violée, `null` = aucune. Partagée par le schéma et le service. */
export function expertiseGroundingWriteViolation(value: WriteRuleInput): string | null {
  const hasSourceType = value.sourceType != null
  const hasSourceId = value.sourceId != null
  if (hasSourceType !== hasSourceId) return 'source_type_and_id_together'
  if (value.state === 'proven' && !hasSourceType) return 'proven_requires_source'
  if (value.kind !== undefined && value.kind !== 'client_reference' && value.confidentiality != null)
    return 'confidentiality_only_on_client_reference'
  return null
}

function checkWriteRules(value: WriteRuleInput, ctx: z.RefinementCtx): void {
  const violation = expertiseGroundingWriteViolation(value)
  if (violation) ctx.addIssue({ code: z.ZodIssueCode.custom, message: violation })
}

export const createExpertiseGroundingSchema = z
  .object({
    expertiseKey: z.string().trim().min(1).max(LABEL_MAX),
    kind: expertiseGroundingKindSchema,
    /** Sans état explicite : `declared` (jamais `proven` deviné). */
    state: expertiseGroundingStateSchema.default('declared'),
    sourceType: expertiseGroundingSourceTypeSchema.nullable().default(null),
    sourceId: z.string().guid().nullable().default(null),
    label: z.string().trim().max(LABEL_MAX).nullable().default(null),
    confidentiality: expertiseReferenceConfidentialitySchema.nullable().default(null),
  })
  .superRefine(checkWriteRules)
export type CreateExpertiseGroundingInput = z.infer<typeof createExpertiseGroundingSchema>
/** Ce que l'écran envoie : les champs par défaut peuvent être omis. */
export type CreateExpertiseGroundingRequest = z.input<typeof createExpertiseGroundingSchema>

/**
 * Mise à jour d'une ligne STOCKÉE. `kind`/`expertiseKey` ne changent pas (une
 * autre paire est une autre ligne). Les règles croisées (« prouvé » exige une
 * source, confidentialité seulement sur une référence client) sont revérifiées
 * par le service sur la ligne FUSIONNÉE, et par la contrainte SQL.
 */
export const updateExpertiseGroundingSchema = z
  .object({
    state: expertiseGroundingStateSchema.optional(),
    sourceType: expertiseGroundingSourceTypeSchema.nullable().optional(),
    sourceId: z.string().guid().nullable().optional(),
    label: z.string().trim().max(LABEL_MAX).nullable().optional(),
    confidentiality: expertiseReferenceConfidentialitySchema.nullable().optional(),
  })
  .refine(value => Object.values(value).some(v => v !== undefined), { message: 'empty_update' })
export type UpdateExpertiseGroundingInput = z.infer<typeof updateExpertiseGroundingSchema>

// ── Projection de l'existant (décision 2) ────────────────────────────────────

function pairKey(expertiseKey: string, kind: ExpertiseGroundingKind): string {
  return `${kind}\u0000${expertiseKey}`
}

/**
 * Fusionne les lignes STOCKÉES et la projection des réponses plates. Retourne
 * les fondements ACTIFS (non archivés) : stockés d'abord (ordre reçu), puis
 * projetés dans l'ordre des fondements, puis des réponses.
 */
export function projectExpertiseGroundings(
  answers: Readonly<Record<string, unknown>>,
  storedRows: readonly ExpertiseGrounding[],
): ExpertiseGrounding[] {
  const taken = new Set(storedRows.map(row => pairKey(row.expertiseKey, row.kind)))
  const projected: ExpertiseGrounding[] = []
  for (const kind of EXPERTISE_GROUNDING_KINDS) {
    const raw = answers[EXPERTISE_GROUNDING_ANSWER_KEYS[kind]]
    if (!Array.isArray(raw)) continue
    for (const value of raw) {
      if (typeof value !== 'string' || value.trim().length === 0) continue
      const key = pairKey(value, kind)
      if (taken.has(key)) continue
      taken.add(key)
      projected.push({
        id: null,
        expertiseKey: value,
        kind,
        state: kind === 'development_intent' ? 'to_prove' : 'declared',
        stateSource: 'onboarding_answer',
        sourceType: null,
        sourceId: null,
        sourceLabel: null,
        label: null,
        confidentiality: null,
        archivedAt: null,
        createdAt: null,
        updatedAt: null,
      })
    }
  }
  return [...storedRows.filter(row => row.archivedAt === null), ...projected]
}

// ── L'audit à trois états (#2039.14) ─────────────────────────────────────────

/**
 * #2039.14 — « vous savez le faire » / « vous avez une preuve » / « vous
 * pouvez le vendre maintenant ». Trois AXES séparés, chacun établi, non
 * établi, ou NOMMÉ non évaluable avec sa raison — jamais un « 0 », jamais un
 * score agrégé (GA-18/GA-19, « un score n'est jamais nu »).
 *
 * Calcul DÉTERMINISTE sur les fondements : aucun appel au modèle, donc aucune
 * calibration à risquer (le blocage cité par les lots précédents tenait au
 * prompt `bellum_profiler.py` ; l'audit à 3 états n'en a pas besoin — tranché
 * sans Louis, lot V33).
 */
export const EXPERTISE_AUDIT_AXIS_STATUSES = ['established', 'not_established', 'not_evaluable'] as const
export type ExpertiseAuditAxisStatus = (typeof EXPERTISE_AUDIT_AXIS_STATUSES)[number]

export const EXPERTISE_AUDIT_REASONS = [
  /** Aucun fondement déclaré pour cette expertise. */
  'no_grounding',
  /** Seule une « simple volonté de développement » est déclarée. */
  'development_intent_only',
  /** Un fondement concret est déclaré (référence, expérience, partenaire, vivier). */
  'concrete_grounding',
  /** Au moins un fondement est rattaché à un objet source. */
  'proven_grounding',
  /** Des fondements existent, aucun n'est rattaché à un objet source. */
  'no_proven_grounding',
  /** Preuve + vivier + au moins une preuve montrable. */
  'proof_and_capacity',
  /** Preuve établie, mais aucun vivier déclaré : la capacité n'est pas connue. */
  'capacity_unknown',
  /** Toutes les preuves sont confidentielles : rien de montrable. */
  'proof_confidential',
] as const
export type ExpertiseAuditReason = (typeof EXPERTISE_AUDIT_REASONS)[number]

export type ExpertiseAuditAxis = { status: ExpertiseAuditAxisStatus; reason: ExpertiseAuditReason }

export type ExpertiseCredibilityAuditEntry = {
  expertiseKey: string
  knowHow: ExpertiseAuditAxis
  proof: ExpertiseAuditAxis
  sellableNow: ExpertiseAuditAxis
}

function auditOne(expertiseKey: string, rows: readonly ExpertiseGrounding[]): ExpertiseCredibilityAuditEntry {
  if (rows.length === 0) {
    const axis: ExpertiseAuditAxis = { status: 'not_evaluable', reason: 'no_grounding' }
    return { expertiseKey, knowHow: axis, proof: axis, sellableNow: axis }
  }
  const concrete = rows.some(row => row.kind !== 'development_intent')
  const knowHow: ExpertiseAuditAxis = concrete
    ? { status: 'established', reason: 'concrete_grounding' }
    : { status: 'not_established', reason: 'development_intent_only' }
  const proven = rows.filter(row => row.state === 'proven')
  if (proven.length === 0) {
    const axis: ExpertiseAuditAxis = { status: 'not_established', reason: 'no_proven_grounding' }
    return { expertiseKey, knowHow, proof: axis, sellableNow: axis }
  }
  const proof: ExpertiseAuditAxis = { status: 'established', reason: 'proven_grounding' }
  const showable = proven.some(row => row.confidentiality !== 'confidential')
  let sellableNow: ExpertiseAuditAxis
  if (!showable) sellableNow = { status: 'not_established', reason: 'proof_confidential' }
  else if (!rows.some(row => row.kind === 'talent_pool'))
    sellableNow = { status: 'not_evaluable', reason: 'capacity_unknown' }
  else sellableNow = { status: 'established', reason: 'proof_and_capacity' }
  return { expertiseKey, knowHow, proof, sellableNow }
}

/**
 * Une entrée par expertise déclarée (ordre de `expertiseAreas`), puis une par
 * expertise citée seulement par un fondement. Les lignes archivées ne
 * comptent pas.
 */
export function buildExpertiseCredibilityAudit(
  expertiseAreas: readonly string[],
  groundings: readonly ExpertiseGrounding[],
): ExpertiseCredibilityAuditEntry[] {
  const active = groundings.filter(row => row.archivedAt === null)
  const keys: string[] = []
  for (const key of [...expertiseAreas, ...active.map(row => row.expertiseKey)]) {
    if (typeof key === 'string' && key.trim().length > 0 && !keys.includes(key)) keys.push(key)
  }
  return keys.map(key =>
    auditOne(
      key,
      active.filter(row => row.expertiseKey === key),
    ),
  )
}

// ── La réponse de lecture ────────────────────────────────────────────────────

/** Un objet source rattachable, proposé à l'écran (#2039.9/.12). */
export const expertiseGroundingSourceOptionSchema = z.object({
  type: expertiseGroundingSourceTypeSchema,
  id: z.string(),
  label: z.string(),
})
export type ExpertiseGroundingSourceOption = z.infer<typeof expertiseGroundingSourceOptionSchema>

export type ExpertiseGroundingsResponse = {
  groundings: ExpertiseGrounding[]
  audit: ExpertiseCredibilityAuditEntry[]
  sourceOptions: ExpertiseGroundingSourceOption[]
}
