import { z } from 'zod'
import type { EntityResolution } from './entity-resolution.js'

/* ------------------------------------------------------------------ */
/*  #2284.67-.69 (tranche 2) — LA CORRECTION D'IDENTITÉ DE L'ESPACE.  */
/*                                                                    */
/*  Le verdict calculé (`raw_analysis.entity_resolution`) reste le    */
/*  calcul : il n'est JAMAIS réécrit. La décision humaine vit dans    */
/*  `entity_resolution_corrections` (une ligne par geste, jamais      */
/*  mise à jour ni supprimée — on archive) et se SUPERPOSE à la       */
/*  lecture par `applyEntityResolutionCorrections`.                   */
/*                                                                    */
/*  - .67 une correction humaine gagne toujours, QUELLE QUE SOIT SA   */
/*    DATE : un calcul relancé après elle ne la remplace pas ;        */
/*  - .68 versionnée : la plus haute version gagne, les autres        */
/*    restent lisibles (l'historique de qui a tranché quoi) ;         */
/*  - .69 scopée à l'espace : les espaces sont des ESN concurrentes,  */
/*    la décision de l'un n'est jamais la vérité d'un autre.          */
/* ------------------------------------------------------------------ */

/** Deux décisions, pas quatre : l'état calculé n'entre pas dans la table. */
export const ENTITY_RESOLUTION_CORRECTION_DECISIONS = ['confirmed', 'rejected'] as const
const entityResolutionCorrectionDecisionSchema = z.enum(ENTITY_RESOLUTION_CORRECTION_DECISIONS)

/** Le geste envoyé par la carte « Entité résolue ». L'espace et l'auteur
 *  viennent du JETON, jamais du corps : `z.object` les jette. */
export const entityResolutionCorrectionRequestSchema = z.object({
  decision: entityResolutionCorrectionDecisionSchema,
  /** L'entreprise visée — un candidat de la question, ou l'entité résolue. */
  target_name: z.string().trim().min(1).max(300),
  /** Sa clé forte quand elle en a une. Neuf chiffres, rien d'autre. */
  target_siren: z
    .string()
    .regex(/^\d{9}$/)
    .nullable()
    .optional(),
  /** La raison, quand la personne a pris la peine de l'écrire. Jamais exigée. */
  note: z.string().trim().max(500).nullable().optional(),
})
export type EntityResolutionCorrectionRequest = z.infer<typeof entityResolutionCorrectionRequestSchema>

/** Une version de la correction, telle que l'API la rend. */
export const entityResolutionCorrectionSchema = z.object({
  version: z.number().int().min(1),
  decision: entityResolutionCorrectionDecisionSchema,
  target_name: z.string().min(1),
  target_siren: z.string().nullable(),
  note: z.string().nullable(),
  decided_at: z.string(),
})
export type EntityResolutionCorrection = z.infer<typeof entityResolutionCorrectionSchema>

type Target = { readonly name: string; readonly siren?: string | null | undefined }

function normalizedName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Même entreprise ? Par SIREN quand la correction en porte un (clé forte),
 *  sinon par nom normalisé EXACT — jamais un préfixe ni une proximité (#2284.61). */
function sameTarget(correction: Target, other: Target): boolean {
  if (correction.siren) return correction.siren === other.siren
  return normalizedName(correction.name) === normalizedName(other.name)
}

function resolvedTargets(resolution: EntityResolution): Target[] {
  const siren = resolution.identifiers['siren'] ?? null
  return [resolution.legal_name, resolution.commercial_name]
    .filter((name): name is string => Boolean(name))
    .map(name => ({ name, siren }))
}

function describesResolution(resolution: EntityResolution, target: Target): boolean {
  if (resolution.canonical_id === null) return false
  if (target.siren) return target.siren === (resolution.identifiers['siren'] ?? null)
  return resolvedTargets(resolution).some(candidate => sameTarget(target, candidate))
}

function withSource(resolution: EntityResolution): EntityResolution['sources'] {
  return resolution.sources.includes('workspace_correction')
    ? resolution.sources
    : [...resolution.sources, 'workspace_correction']
}

/**
 * Superpose les corrections de l'espace au verdict calculé.
 *
 * Rend le verdict INTACT (même référence) sans correction, `null` sur un dossier
 * antérieur à #2284. Ne mute jamais son entrée (#2284.69).
 */
export function applyEntityResolutionCorrections(
  resolution: EntityResolution | null,
  corrections: readonly EntityResolutionCorrection[],
): EntityResolution | null {
  if (!resolution || corrections.length === 0) return resolution

  // #2284.68 — l'ordre qui fait foi est la VERSION, pas l'ordre de la réponse.
  let confirmed: EntityResolutionCorrection | null = null
  const rejected: EntityResolutionCorrection[] = []
  for (const correction of [...corrections].sort((a, b) => a.version - b.version)) {
    const target = { name: correction.target_name, siren: correction.target_siren }
    if (correction.decision === 'confirmed') {
      confirmed = correction
      const stillRejected = rejected.filter(r => !sameTarget({ name: r.target_name, siren: r.target_siren }, target))
      rejected.splice(0, rejected.length, ...stillRejected)
    } else {
      rejected.push(correction)
      if (confirmed && sameTarget(target, { name: confirmed.target_name, siren: confirmed.target_siren })) {
        confirmed = null
      }
    }
  }

  if (confirmed) {
    const target = { name: confirmed.target_name, siren: confirmed.target_siren }
    // Une décision humaine n'est pas probable, elle est prise : aucune confiance
    // chiffrée ne l'accompagne (doctrine « aucune probabilité »).
    if (describesResolution(resolution, target)) {
      return {
        ...resolution,
        state: 'manual_override',
        confidence: null,
        question: null,
        sources: withSource(resolution),
      }
    }
    // Un AUTRE candidat : rien de l'entité calculée n'est recopié sur lui —
    // ni son type, ni sa mère, ni ses filiales (#2284.70, ne jamais mélanger).
    const candidate = resolution.question?.candidates.find(c => sameTarget(target, c))
    const siren = confirmed.target_siren ?? candidate?.siren ?? null
    return {
      ...resolution,
      state: 'manual_override',
      kind: null,
      canonical_id: siren ? `FR-SIREN-${siren}` : null,
      legal_name: confirmed.target_name,
      identifiers: siren ? { siren } : {},
      naf_code: null,
      naf_label: null,
      location: candidate?.city ?? null,
      parent_names: [],
      children_count: null,
      sources: siren ? ['workspace_correction', 'legal_identifier'] : ['workspace_correction'],
      confidence: null,
      reasons: [],
      question: null,
      resolved_at: confirmed.decided_at,
    }
  }

  if (rejected.length === 0) return resolution
  const isRejected = (candidate: Target) =>
    rejected.some(r => sameTarget({ name: r.target_name, siren: r.target_siren }, candidate))

  const remaining = resolution.question?.candidates.filter(candidate => !isRejected(candidate)) ?? null
  const question = remaining && remaining.length > 0 ? { candidates: remaining } : null

  if (resolvedTargets(resolution).some(isRejected) && resolution.canonical_id !== null) {
    // « Ce n'est pas celle-ci » sur l'entité résolue : elle redevient inconnue,
    // et n'y laisse rien (ni type, ni mère, ni filiales, ni identifiant).
    return {
      ...resolution,
      state: 'unresolved',
      kind: null,
      canonical_id: null,
      legal_name: null,
      identifiers: {},
      naf_code: null,
      naf_label: null,
      location: null,
      parent_names: [],
      children_count: null,
      sources: withSource(resolution),
      confidence: null,
      question,
    }
  }

  if (resolution.state === 'ambiguous') {
    // Une ambiguïté exige au moins deux candidats nommés : un seul restant n'est
    // plus une question, mais il n'est pas CONFIRMÉ pour autant.
    return {
      ...resolution,
      state: (remaining?.length ?? 0) >= 2 ? 'ambiguous' : 'unresolved',
      sources: withSource(resolution),
      question,
    }
  }
  return resolution
}
