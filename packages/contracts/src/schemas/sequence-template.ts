import { z } from 'zod'
import { contentVisibilitySchema } from './shared-content.js'
import type { OutreachSequence } from './outreach-sequence.js'

/**
 * #3756 (épopée #3749) — la BIBLIOTHÈQUE de modèles de séquence d'un espace.
 *
 * Un modèle = une campagne déjà écrite par l'ESN : secteur, tier, étapes
 * (délai J+n, objet, corps avec variables). L'appliquer à un contact crée une
 * séquence MONO-contact étiquetée du nom du modèle (`campaign_label`, doctrine
 * c74) — jamais une audience multi-contacts. Le copilote PRÉPARE, le commercial
 * envoie : rien ici n'envoie.
 */

export const SEQUENCE_TIER_LABELS = ['A', 'B', 'C'] as const
const sequenceTierLabelSchema = z.enum(SEQUENCE_TIER_LABELS)

/** Les variables que le moteur sait résoudre. Une autre BLOQUE l'étape. */
export const SEQUENCE_VARIABLES = ['firstName', 'lastName', 'companyName', 'signature', 'jobTitle'] as const
type SequenceVariable = (typeof SEQUENCE_VARIABLES)[number]

const VARIABLE_LABEL_FR: Record<SequenceVariable, string> = {
  firstName: 'Prénom',
  lastName: 'Nom',
  companyName: 'Société',
  signature: 'Signature',
  jobTitle: 'Fonction',
}

export const sequenceBlockedVariableSchema = z.object({
  variable: z.string(),
  reason: z.enum(['missing', 'unknown']),
  message: z.string(),
})
export type SequenceBlockedVariable = z.infer<typeof sequenceBlockedVariableSchema>

type ResolveResult = { ok: true; text: string } | { ok: false; blocked: SequenceBlockedVariable[] }

const VARIABLE_PATTERN = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g

/**
 * #3756.3 — résout `{{variable}}` dans un texte. FONCTION PURE.
 *
 * Une variable sans valeur (absente, vide, blanche) ou inconnue BLOQUE : on
 * rend la liste nommée (« Prénom manquant : {{firstName}} »), jamais un texte
 * à moitié résolu, jamais une valeur devinée. Les valeurs insérées ne sont pas
 * relues (un `{{x}}` dans un nom reste littéral, il n'est pas réinterprété).
 */
export function resolveSequenceVariables(
  template: string,
  values: Partial<Record<SequenceVariable, string | null | undefined>>,
): ResolveResult {
  const blocked: SequenceBlockedVariable[] = []
  const seen = new Set<string>()
  const text = template.replace(VARIABLE_PATTERN, (_whole, name: string) => {
    const known = (SEQUENCE_VARIABLES as readonly string[]).includes(name)
    if (!known) {
      if (!seen.has(name)) {
        seen.add(name)
        blocked.push({ variable: name, reason: 'unknown', message: `Variable inconnue : {{${name}}}` })
      }
      return ''
    }
    const value = values[name as SequenceVariable]?.trim()
    if (value) return value
    if (!seen.has(name)) {
      seen.add(name)
      blocked.push({
        variable: name,
        reason: 'missing',
        message: `${VARIABLE_LABEL_FR[name as SequenceVariable]} manquant : {{${name}}}`,
      })
    }
    return ''
  })
  return blocked.length > 0 ? { ok: false, blocked } : { ok: true, text }
}

export const sequenceTemplateStepSchema = z.object({
  position: z.number().int().min(0),
  delay_days: z.number().int().min(0),
  subject: z.string(),
  body: z.string(),
})
export type SequenceTemplateStep = z.infer<typeof sequenceTemplateStepSchema>

/** #4426.7 — un script d'appel de la campagne : lu, jamais envoyé ni daté. */
export const sequenceCallScriptSchema = z.object({
  position: z.number().int().min(0),
  title: z.string(),
  body: z.string(),
})
export type SequenceCallScript = z.infer<typeof sequenceCallScriptSchema>

export const sequenceTemplateSchema = z.object({
  id: z.string().guid(),
  name: z.string(),
  sector: z.string().nullable(),
  tier_label: sequenceTierLabelSchema.nullable(),
  steps: z.array(sequenceTemplateStepSchema),
  /** #4426.7 — les scripts d'appel importés avec la campagne (`[]` = aucun). */
  call_scripts: z.array(sequenceCallScriptSchema).default([]),
  created_at: z.string(),
  /** #4158.30 — partagé avec l'équipe ou personnel, son auteur et sa dernière mise à jour. */
  visibility: contentVisibilitySchema.default('team'),
  created_by: z.string().guid().nullable().default(null),
  updated_at: z.string().nullable().default(null),
})
export type SequenceTemplate = z.infer<typeof sequenceTemplateSchema>

/** Le fichier voyage en base64 dans un JSON (borné côté serveur). */
export const importSequenceLibraryRequestSchema = z.object({
  filename: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .regex(/\.(xlsx|csv)$/i, 'Un fichier .xlsx ou .csv est attendu.'),
  content_base64: z.string().min(1),
})
export type ImportSequenceLibraryRequest = z.infer<typeof importSequenceLibraryRequestSchema>

export const SEQUENCE_IMPORT_SKIP_REASONS = [
  'no_campaign',
  'no_body',
  'bad_delay',
  'bad_tier',
  'too_many_steps',
] as const

export const importSequenceLibraryResultSchema = z.object({
  templates: z.number().int(),
  steps: z.number().int(),
  /** #4426.7 — les scripts d'appel gardés (les lignes « Script : … » ne sont plus écartées). */
  scripts: z.number().int().default(0),
  /** Lignes écartées, comptées ET nommées (numéro de ligne dans le fichier). */
  skipped: z.array(
    z.object({
      line: z.number().int(),
      reason: z.enum(SEQUENCE_IMPORT_SKIP_REASONS),
      campaign: z.string().nullable(),
    }),
  ),
  /** #4426.7 — les `{{variables}}` hors du vocabulaire du produit : laissées telles quelles dans le texte, nommées ici. */
  unknown_variables: z.array(z.string()).default([]),
})
export type ImportSequenceLibraryResult = z.infer<typeof importSequenceLibraryResultSchema>

export const applySequenceTemplateRequestSchema = z.object({
  contact_id: z.string().guid(),
})
export type ApplySequenceTemplateRequest = z.infer<typeof applySequenceTemplateRequestSchema>

/** Borne d'une audience demandée en chat — une campagne relue à la main, pas un envoi de masse. */
export const SEQUENCE_AUDIENCE_MAX_CONTACTS = 25

/**
 * #3894.3 — c74 assoupli le 10/10/2026 par Louis : multi-contacts SUR DEMANDE
 * EXPLICITE. Le schéma dit NON à ce qui n'est pas une demande de plusieurs
 * personnes : moins de deux contacts distincts, ou l'attestation
 * `explicit_multi_contact` absente, ne crée aucune audience (le défaut reste
 * `applySequenceTemplateRequestSchema`, un contact).
 */
export const applySequenceTemplateAudienceRequestSchema = z.object({
  contact_ids: z
    .array(z.string().guid())
    .min(2)
    .max(SEQUENCE_AUDIENCE_MAX_CONTACTS)
    .refine(ids => new Set(ids).size === ids.length, 'Contacts en double'),
  explicit_multi_contact: z.literal(true),
  campaign_label: z.string().trim().min(1).max(120).optional(),
})
export type ApplySequenceTemplateAudienceRequest = z.infer<typeof applySequenceTemplateAudienceRequestSchema>

/** Une étape BLOQUÉE à l'application : sa position et les variables nommées. */
export const sequenceBlockedStepSchema = z.object({
  position: z.number().int(),
  blocked: z.array(sequenceBlockedVariableSchema),
})
export type SequenceBlockedStep = z.infer<typeof sequenceBlockedStepSchema>

/** #3894.3 — une ligne par contact demandé : sa séquence, ou la raison NOMMÉE du refus. */
export type ApplySequenceTemplateAudienceItem = {
  contact_id: string
  sequence: OutreachSequence | null
  blocked_steps: SequenceBlockedStep[]
  error: string | null
}

/** #3894.3 — N séquences mono-contact regroupées par la même étiquette. */
export type ApplySequenceTemplateAudienceResult = {
  campaign_label: string
  items: ApplySequenceTemplateAudienceItem[]
}

/** La séquence MONO-contact créée + les étapes que leurs variables bloquent. */
export type ApplySequenceTemplateResult = {
  sequence: OutreachSequence
  blocked_steps: SequenceBlockedStep[]
}
