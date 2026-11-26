import { z } from 'zod'

/**
 * Provenance par champ — le garde-fou anti-écrasement du CRM natif.
 *
 * Le problème est propre à Bellum et n'existe dans aucun CRM classique : le
 * pipeline d'analyse RÉÉCRIT les fiches à chaque run. Sans arbitre, un
 * commercial qui corrige « Groupe TF1 » en « TF1 PUB » voit sa correction
 * disparaître à la prochaine actualisation, sans message et sans trace. Il ne
 * recommence pas deux fois : il arrête de corriger, et la base pourrit.
 *
 * L'arbitre est une hiérarchie de sources, pas une horloge. « Le plus récent
 * gagne » est le défaut le plus tentant et le pire : le pipeline tourne toutes
 * les nuits, l'humain une fois par mois — le plus récent est donc TOUJOURS la
 * machine.
 *
 *   human > connector > pipeline > model
 *
 * - `human`     — quelqu'un l'a tapé dans Bellum. Fait foi sur tout le reste.
 * - `connector` — lu dans un outil que le client tient à jour (CRM, ERP, agenda).
 * - `pipeline`  — calculé par nos services déterministes (registre, scrape, Apollo).
 * - `model`     — proposé par un modèle. La source la plus faible, toujours.
 *
 * Deuxième règle, indépendante de la première : **un blanc n'écrase jamais une
 * valeur**. Un fournisseur qui ne trouve rien renvoie `null` ; laisser ce `null`
 * atterrir efface un e-mail que quelqu'un avait mis dix minutes à trouver. Seul
 * un humain peut vider un champ, parce que lui seul peut vouloir dire « c'est
 * faux, enlève-le ».
 */

/**
 * Les sources possibles d'une valeur de champ, de la plus forte à la plus faible.
 *
 * ⚠️⚠️ `inferred` — RENVERSEMENT DATÉ du 11/10/2026 (décision Louis, épopée
 * #4016 lot L4, `c95_estimation_badgee` au registre). « JAMAIS de donnée
 * fictive » interdisait jusque-là toute valeur DÉDUITE ; Louis a tranché :
 * l'IA a le droit d'ESTIMER (un e-mail selon le motif de l'entreprise, un
 * rattachement selon les intitulés…), à trois conditions qui ne se négocient
 * pas :
 *
 *  1. la valeur est TOUJOURS badgée « estimé » à l'écran (`EstimatedBadge`,
 *     une seule primitive, GA-26) — une estimation non badgée reste interdite ;
 *  2. elle n'est JAMAIS une preuve ({@link isEvidenceSource}) : elle ne pose
 *     pas `email_verified`, n'étaye aucune relation, n'entre dans aucun chemin
 *     recommandé ;
 *  3. elle est la source la PLUS FAIBLE : elle remplit un trou, n'écrase jamais
 *     une valeur humaine, connectée, calculée ou proposée — et cède devant
 *     toutes ({@link decideFieldWrite}).
 *
 * GA-08 : ajoutée EN FIN de liste, jamais au milieu.
 */
export const FIELD_SOURCES = ['human', 'connector', 'pipeline', 'model', 'inferred'] as const
export const fieldSourceSchema = z.enum(FIELD_SOURCES)
export type FieldSource = z.infer<typeof fieldSourceSchema>

/** La provenance d'une valeur ESTIMÉE — le seul nom à importer (GA-26). */
export const ESTIMATED_FIELD_SOURCE = 'inferred' as const satisfies FieldSource

/**
 * Les sources qui ont OBSERVÉ leur valeur — {@link FIELD_SOURCES} sans
 * `inferred`. C'est la liste des tables où une estimation n'a AUCUNE place :
 * la finance (dépenses, factures fournisseur, décaissements), les retours de
 * mission, les faits d'accès et les actions du plan. Leurs contraintes SQL
 * restent sur ces quatre valeurs (GA-12 les compare à CETTE liste) : la base
 * dit NON à une estimation qui s'y glisserait. Écrite en littéral pour que
 * GA-12 la lise ; `provenance.test.ts` prouve qu'elle n'est que la différence.
 */
export const EVIDENCE_FIELD_SOURCES = ['human', 'connector', 'pipeline', 'model'] as const
export const evidenceFieldSourceSchema = z.enum(EVIDENCE_FIELD_SOURCES)
export type EvidenceFieldSource = z.infer<typeof evidenceFieldSourceSchema>

/** Rang d'autorité — plus grand = plus fort. Jamais recalculé ailleurs. */
const SOURCE_RANK: Readonly<Record<FieldSource, number>> = {
  human: 4,
  connector: 3,
  pipeline: 2,
  model: 1,
  inferred: 0,
}

/** L'autorité d'une source, pour comparer deux écritures concurrentes. */
export function fieldSourceRank(source: FieldSource): number {
  return SOURCE_RANK[source]
}

/**
 * Cette source a-t-elle OBSERVÉ la valeur ? Faux pour une estimation, et pour
 * elle seule : une valeur `inferred` ne prouve rien, ne se compte jamais comme
 * vérifiée et ne doit jamais être citée comme une preuve (#4016 L4).
 */
export function isEvidenceSource(source: FieldSource | null | undefined): boolean {
  return source != null && source !== ESTIMATED_FIELD_SOURCE
}

/**
 * Provenance PAR DÉFAUT d'une valeur dont personne n'a enregistré l'origine.
 *
 * Les lignes antérieures à la provenance ont presque toutes été écrites par le
 * pipeline d'analyse. Les traiter en `pipeline` donne le bon résultat dans les
 * deux sens : une correction humaine passe devant, une proposition de modèle
 * reste derrière. Les traiter en `human` (l'autre défaut plausible) gèlerait
 * toute la base historique ; en `model`, le pipeline pourrait tout réécrire.
 */
export const UNKNOWN_PROVENANCE_SOURCE: FieldSource = 'pipeline'

/** Les objets qui portent une provenance par champ. */
export const PROVENANCE_ENTITY_TYPES = ['account', 'contact', 'project', 'consultant', 'mission', 'submission'] as const
export const provenanceEntityTypeSchema = z.enum(PROVENANCE_ENTITY_TYPES)
export type ProvenanceEntityType = z.infer<typeof provenanceEntityTypeSchema>

/** Une ligne de provenance telle que l'API la rend. */
export const fieldProvenanceSchema = z.object({
  entityType: provenanceEntityTypeSchema,
  entityId: z.string().guid(),
  /** Nom du champ côté API (camelCase), pas le nom de colonne. */
  field: z.string().min(1),
  source: fieldSourceSchema,
  /** 0→1 quand la source sait se noter, `null` sinon. Jamais deviné. */
  confidence: z.number().min(0).max(1).nullable(),
  observedAt: z.string(),
  /** Qui a écrit, quand c'est un humain. `null` pour une source automatique. */
  actorId: z.string().guid().nullable(),
})
export type FieldProvenance = z.infer<typeof fieldProvenanceSchema>

/** Pourquoi une écriture a été acceptée ou refusée — affiché tel quel en debug
 *  et journalisé : « ça n'a pas bougé » doit toujours avoir une raison lisible. */
export const PROVENANCE_DECISION_REASONS = [
  'no_previous',
  'higher_or_equal_authority',
  'unchanged',
  'blank_never_overwrites',
  'lower_authority',
] as const
export type ProvenanceDecisionReason = (typeof PROVENANCE_DECISION_REASONS)[number]

export type ProvenanceDecision = {
  write: boolean
  reason: ProvenanceDecisionReason
}

/**
 * #2264.39 (épopée #2921) — la CLÉ i18n de l'explication courte d'une
 * décision de correction, jamais une phrase en dur ici : la traduction vit à
 * UN seul endroit (`common:provenance.decisionReason.<reason>`, GA-26), et ce
 * fichier ne connaît que du français côté code (`packages/contracts` n'a pas
 * de dépendance i18n). Sans elle, `decideFieldWrite` rendait un enum qu'aucun
 * écran ne traduisait pour l'utilisateur qui conteste un fait — « corriger ou
 * maintenir » sans jamais dire brièvement pourquoi.
 */
export function provenanceDecisionReasonKey(reason: ProvenanceDecisionReason): string {
  return `provenance.decisionReason.${reason}`
}

/** Vrai pour `null`, `undefined`, une chaîne vide ou uniquement des espaces, et
 *  un tableau vide. Un `0` ou un `false` sont des VALEURS, pas des blancs. */
function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

/** Égalité de surface suffisante pour des champs de fiche (scalaires, tableaux
 *  de chaînes). Deux objets différents ne sont jamais déclarés identiques. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a === 'string' && typeof b === 'string') return a.trim() === b.trim()
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => sameValue(item, b[index]))
  }
  return false
}

/**
 * L'arbitre. Rend la décision d'écrire ou non UN champ, et sa raison.
 *
 * Pur et testé à part parce que c'est la règle qui protège la saisie de
 * l'utilisateur : la mettre dans un service la rendrait invérifiable et elle
 * finirait recopiée de travers dans le troisième writer.
 */
export function decideFieldWrite(input: {
  incomingValue: unknown
  incomingSource: FieldSource
  currentValue: unknown
  /** `null` = provenance inconnue → {@link UNKNOWN_PROVENANCE_SOURCE}. */
  currentSource: FieldSource | null
}): ProvenanceDecision {
  const { incomingValue, incomingSource, currentValue } = input
  const currentSource = input.currentSource ?? UNKNOWN_PROVENANCE_SOURCE

  // Le champ est vide côté base : il n'y a rien à protéger. Une source faible a
  // le droit de remplir un trou — c'est même tout ce qu'on lui demande.
  if (isBlank(currentValue)) {
    if (isBlank(incomingValue)) return { write: false, reason: 'unchanged' }
    return { write: true, reason: 'no_previous' }
  }

  // Un blanc n'écrase jamais une valeur — sauf un humain, qui est le seul à
  // pouvoir vouloir dire « cette information est fausse, retire-la ».
  if (isBlank(incomingValue)) {
    if (incomingSource === 'human') return { write: true, reason: 'higher_or_equal_authority' }
    return { write: false, reason: 'blank_never_overwrites' }
  }

  if (sameValue(incomingValue, currentValue)) return { write: false, reason: 'unchanged' }

  if (fieldSourceRank(incomingSource) >= fieldSourceRank(currentSource)) {
    return { write: true, reason: 'higher_or_equal_authority' }
  }
  return { write: false, reason: 'lower_authority' }
}

/**
 * Applique {@link decideFieldWrite} à un lot de champs et rend ce qu'il faut
 * réellement écrire, plus ce qui a été refusé et pourquoi.
 *
 * Les writers du pipeline passent par ici : un `UPDATE` direct sur une colonne
 * de fiche contourne la règle, et c'est exactement ce que le test de garde
 * `no-blind-record-writes.spec.ts` interdit.
 */
/**
 * Sérialisation d'une valeur pour le journal de provenance. Le journal doit
 * rester lisible dans dix ans, y compris si la colonne d'origine a changé de
 * type : on stocke du TEXTE, jamais du JSON typé. Un blanc devient `null` —
 * « le champ était vide » et « le champ valait la chaîne vide » sont la même
 * chose pour un lecteur humain.
 *
 * Partagée ici (et non dans `crm-core/provenance.service.ts`, qui l'hébergeait
 * jusqu'à l'intégration vague 24 du 23/09/2026) parce qu'un second module
 * (`capitalisation`) en a besoin pour journaliser ses propres écritures : la
 * dupliquer aurait fait diverger le format du journal entre deux modules, et
 * l'importer depuis `crm-core` aurait fait grimper le compteur GA-07
 * (service → service) — cette fonction est pure, sans dépendance NestJS,
 * donc sa vraie place est un contrat partagé, pas un module applicatif.
 */
export function serializeAuditValue(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value.trim() === '' ? null : value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString()
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

/**
 * #2403.38 (épopée #2995) — une suggestion de Laura, calculée à `computedAt`,
 * est-elle PÉRIMÉE parce qu'un humain a corrigé le fait sous-jacent depuis ?
 *
 * « Une correction humaine gagne toujours, quelle que soit sa date »
 * (`CLAUDE.md` § Doctrine) : la source de vérité est `record_field_audit`
 * (journal append-only, `source='human'`), jamais un signal deviné. Quatre
 * audits indépendants (25-28/09) avaient cherché un champ NOMMÉ
 * (`lastCorrectedAt`) et conclu à une absence — la piste retenue ici est
 * différente : ce que `record_field_audit` porte DÉJÀ (`MAX(created_at) WHERE
 * source='human'`, lu par `ProvenanceService.lastHumanCorrectionAt`) EST cette
 * réponse, sans qu'aucune colonne neuve ne l'authored.
 *
 * `lastHumanCorrectionAt=null` (aucune correction humaine connue sur cette
 * fiche — l'immense majorité des cas) ⇒ `false`, TOUJOURS : une absence de
 * preuve n'est jamais une preuve de péremption.
 */
export function isStaleSinceHumanCorrection(
  computedAt: Date | string,
  lastHumanCorrectionAt: Date | string | null,
): boolean {
  if (lastHumanCorrectionAt === null) return false
  const computed = new Date(computedAt).getTime()
  const corrected = new Date(lastHumanCorrectionAt).getTime()
  if (!Number.isFinite(computed) || !Number.isFinite(corrected)) return false
  return corrected > computed
}

export function applyFieldUpdates<T extends Record<string, unknown>>(input: {
  incoming: Partial<T>
  incomingSource: FieldSource
  current: T
  currentSources: Partial<Record<keyof T & string, FieldSource>>
}): {
  accepted: Partial<T>
  rejected: { field: string; reason: ProvenanceDecisionReason }[]
} {
  const accepted: Partial<T> = {}
  const rejected: { field: string; reason: ProvenanceDecisionReason }[] = []

  for (const [field, incomingValue] of Object.entries(input.incoming)) {
    const decision = decideFieldWrite({
      incomingValue,
      incomingSource: input.incomingSource,
      currentValue: input.current[field],
      currentSource: input.currentSources[field as keyof T & string] ?? null,
    })
    if (decision.write) {
      accepted[field as keyof T] = incomingValue as T[keyof T]
    } else if (decision.reason !== 'unchanged') {
      rejected.push({ field, reason: decision.reason })
    }
  }

  return { accepted, rejected }
}

/**
 * #4051 — « Importé le <date> depuis <source> » : la trace qu'une fiche est arrivée par un import.
 * `file` = le NOM du fichier déposé ; `tool` = le nom de l'outil branché du client — jamais un fournisseur à nous.
 */
export const RECORD_IMPORT_SOURCE_KINDS = ['file', 'tool'] as const
export type RecordImportSourceKind = (typeof RECORD_IMPORT_SOURCE_KINDS)[number]

/** Les objets dont l'historique porte la trace d'import. */
export const RECORD_IMPORT_ENTITY_TYPES = ['account', 'contact', 'consultant'] as const
export type RecordImportEntityType = (typeof RECORD_IMPORT_ENTITY_TYPES)[number]

export type RecordImportMark = {
  importedAt: string
  sourceKind: RecordImportSourceKind
  sourceLabel: string
}
