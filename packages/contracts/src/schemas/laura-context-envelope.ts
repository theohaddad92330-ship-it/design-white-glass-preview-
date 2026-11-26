import { z } from 'zod'

/**
 * #2147.9/.10 (épopée #2785) — L'ENVELOPPE DE CONTEXTE TRANSPORTABLE entre
 * Laura et les surfaces qu'elle ouvre.
 *
 * Trois nuits précédentes ont décliné de poser ce contrat sans un SECOND
 * appelant réel (« le poser sans le brancher serait du code juste que
 * personne n'appelle », CLAUDE.md) — les sept continuités listées par #2147
 * (.11 à .16, .18) existaient déjà, chacune sous SA PROPRE forme de
 * paramètres d'URL (`discoverSearch`, `buildAnalyzeSearch`,
 * `campaign-prefill`…), et les recopier dans un objet générique aurait
 * dupliqué une dérivation qui vit déjà à un seul endroit chacune (GA-26).
 *
 * Ce fichier livre le CONTRAT MANQUANT sans toucher à AUCUNE des sept
 * dérivations existantes : un type UNIQUE qui NOMME les champs qu'une
 * continuité PEUT transporter. Vingt champs nommés (le ticket en demande
 * dix-huit au minimum), TOUS optionnels : une continuité n'en porte jamais
 * qu'une poignée (#2147 dit « carte de suivi », jamais « objet universel »).
 * Un champ absent reste `null`, jamais deviné depuis un autre.
 *
 * Branché à deux appelants réels (`return-to-conversation.ts` +
 * `Discover.tsx`) : la continuité Découvrir → Analyser (#2147.12, « compte
 * et raison ») encode l'enveloppe sur le lien qu'elle construit déjà ; le
 * chrome commun à tout écran client (`ReturnToConversationBanner`) la
 * décode et affiche la raison, quelle que soit la continuité qui l'a posée.
 */

export const LAURA_CONTEXT_SURFACES = ['laura', 'discover', 'analyze', 'account', 'sequence', 'mission'] as const
export type LauraContextSurface = (typeof LAURA_CONTEXT_SURFACES)[number]

const trimmedString = (max: number) => z.string().trim().min(1).max(max)
const trimmedStringArray = (max: number) => z.array(trimmedString(max)).nullable()

export const lauraContextEnvelopeSchema = z.object({
  /** La surface QUI a composé cette enveloppe. */
  sourceSurface: z.enum(LAURA_CONTEXT_SURFACES).nullable(),
  /** La surface OUVERTE par cette enveloppe. */
  targetSurface: z.enum(LAURA_CONTEXT_SURFACES).nullable(),
  /** #2147.16 — le fil source, même vocabulaire que `?from=chat:<id>`. */
  conversationId: trimmedString(200).nullable(),
  /** #2147.13 — le compte visé (id interne ou SIREN selon l'origine). */
  accountId: trimmedString(200).nullable(),
  /** Le nom du compte, quand la continuité le porte (jamais recalculé). */
  company: trimmedString(200).nullable(),
  /** #2147.12 — le « pourquoi » le plus fort dont la continuité dispose. */
  reason: trimmedString(240).nullable(),
  /** L'origine tracée d'une suggestion (#2147.12, `discover:<siren>`). */
  suggestionId: trimmedString(200).nullable(),
  /** #2147.13 — le périmètre exact du run analysé. */
  scopeMode: trimmedString(100).nullable(),
  /** #2147.14 — les contacts visés par une séquence. */
  contactIds: trimmedStringArray(200),
  /** #2147.14 — l'objectif annoncé de la séquence. */
  objective: trimmedString(200).nullable(),
  /** #2147.14 — le persona ciblé. */
  persona: trimmedString(200).nullable(),
  /** #2147.14 — le ton demandé. */
  tone: trimmedString(100).nullable(),
  /** #2147.14 — la relation avec le contact. */
  relation: trimmedString(100).nullable(),
  /** #2147.15 — la mission concernée. */
  missionId: trimmedString(200).nullable(),
  /** #2147.15 — le nom du client de la mission. */
  clientName: trimmedString(200).nullable(),
  /** #2147.15 — le nom du consultant de la mission. */
  consultantName: trimmedString(200).nullable(),
  /** #2147.15 — l'échéance annoncée. */
  dueDate: trimmedString(100).nullable(),
  /** #2147.11 — les secteurs annoncés par Laura. */
  sectors: trimmedStringArray(100),
  /** #2147.11 — les secteurs explicitement exclus. */
  excludeSectors: trimmedStringArray(100),
  /** L'horodatage de composition — jamais celui de lecture. */
  generatedAt: z.string().datetime().nullable(),
})
export type LauraContextEnvelope = z.infer<typeof lauraContextEnvelopeSchema>

/** Les vingt champs, tous absents — la base de toute enveloppe créée. */
export const EMPTY_LAURA_CONTEXT_ENVELOPE: LauraContextEnvelope = {
  sourceSurface: null,
  targetSurface: null,
  conversationId: null,
  accountId: null,
  company: null,
  reason: null,
  suggestionId: null,
  scopeMode: null,
  contactIds: null,
  objective: null,
  persona: null,
  tone: null,
  relation: null,
  missionId: null,
  clientName: null,
  consultantName: null,
  dueDate: null,
  sectors: null,
  excludeSectors: null,
  generatedAt: null,
}

/**
 * Compose une enveloppe : seuls les champs FOURNIS s'écartent de `null`,
 * jamais un champ deviné depuis un autre. Lève si un champ fourni est
 * invalide (chaîne vide, date malformée…) — un appelant qui se trompe le
 * découvre à l'écriture, pas au décodage silencieux d'un lecteur distant.
 */
export function createLauraContextEnvelope(fields: Partial<LauraContextEnvelope>): LauraContextEnvelope {
  return lauraContextEnvelopeSchema.parse({ ...EMPTY_LAURA_CONTEXT_ENVELOPE, ...fields })
}

/**
 * Compacte l'enveloppe (retire les champs `null`/vides) puis l'encode pour
 * voyager en paramètre d'URL. Chaîne VIDE quand rien ne dépasse le défaut —
 * jamais un `ctx={}` qui laisserait croire à un contexte transporté.
 */
export function encodeLauraContextEnvelope(envelope: LauraContextEnvelope): string {
  const compact: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(envelope)) {
    if (value === null) continue
    if (Array.isArray(value) && value.length === 0) continue
    compact[key] = value
  }
  if (Object.keys(compact).length === 0) return ''
  return encodeURIComponent(JSON.stringify(compact))
}

/**
 * L'inverse de {@link encodeLauraContextEnvelope}, tolérant : une valeur
 * malformée (JSON invalide, champ hors vocabulaire) rend `null` plutôt qu'une
 * exception — un lien altéré à la main ne doit jamais faire planter l'écran
 * d'arrivée, il perd seulement son contexte.
 */
export function decodeLauraContextEnvelope(raw: unknown): LauraContextEnvelope | null {
  if (typeof raw !== 'string' || raw.length === 0) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(decodeURIComponent(raw))
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const result = lauraContextEnvelopeSchema.safeParse({ ...EMPTY_LAURA_CONTEXT_ENVELOPE, ...parsed })
  return result.success ? result.data : null
}
