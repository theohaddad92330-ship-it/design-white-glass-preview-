import { z } from 'zod'

/**
 * #4996 (lot L5) — pré-assignation des contacts d'un compte groupe selon les zones de l'équipe.
 *
 * Le périmètre SUGGÈRE, il ne bloque pas (c76) et n'écrit jamais seul (Q2) : un aperçu figé par empreinte,
 * puis un clic. On ne retire jamais un contact à quelqu'un : seuls les contacts SANS porteur bougent.
 */

/**
 * Une zone active d'un membre. Une zone d'ENTITÉ couvre les contacts de cette entité ; une zone de BU (#4996.4)
 * couvre, dans le sélecteur, les contacts d'un compte rattaché à cette BU ; le texte libre est neutre. Seules les
 * zones d'entité alimentent la répartition automatique.
 */
export interface DistributionScope {
  user_id: string
  entity_id: string | null
  business_unit_id?: string | null
  label: string
}

export interface DistributionContact {
  id: string
  entity_id: string | null
  assigned_to: string | null
}

export interface DistributionPlan {
  assignments: { contact_id: string; user_id: string }[]
  /** Contacts libres laissés tels quels : sans entité, sans zone, ou deux candidats. */
  unchanged: string[]
}

/** Contacts libres → membre dont la zone couvre l'entité, à condition qu'il n'y en ait qu'UN. */
export function planScopeDistribution(
  contacts: readonly DistributionContact[],
  scopes: readonly DistributionScope[],
): DistributionPlan {
  const coverage = new Map<string, Set<string>>()
  for (const s of scopes) {
    if (s.entity_id === null) continue
    const set = coverage.get(s.entity_id) ?? new Set<string>()
    set.add(s.user_id)
    coverage.set(s.entity_id, set)
  }
  const plan: DistributionPlan = { assignments: [], unchanged: [] }
  for (const c of contacts) {
    if (c.assigned_to !== null) continue
    const candidates = c.entity_id === null ? undefined : coverage.get(c.entity_id)
    if (candidates?.size === 1) plan.assignments.push({ contact_id: c.id, user_id: [...candidates][0] })
    else plan.unchanged.push(c.id)
  }
  return plan
}

export interface AssigneeCandidate {
  user_id: string
  name: string
  /** Libellés des zones qui couvrent l'entité du contact (« couvre BNP Paribas CIB »). */
  covers: string[]
}

/**
 * Ordre du sélecteur de porteur : les membres qui couvrent le contact d'abord, alphabétique ; personne n'est caché.
 * Couvrir = une zone sur l'entité du contact OU (#4996.4) une zone sur la BU de son compte : l'union des deux.
 */
export function orderAssigneeCandidates(
  members: readonly { user_id: string; name: string }[],
  scopes: readonly DistributionScope[],
  entityId: string | null,
  businessUnitId: string | null = null,
): AssigneeCandidate[] {
  const covering = (s: DistributionScope) =>
    (entityId !== null && s.entity_id === entityId) ||
    (businessUnitId !== null && (s.business_unit_id ?? null) === businessUnitId)
  const candidates = members.map(m => ({
    user_id: m.user_id,
    name: m.name,
    covers: scopes.filter(s => s.user_id === m.user_id && covering(s)).map(s => s.label),
  }))
  return candidates.sort((a, b) => {
    const rank = Number(b.covers.length > 0) - Number(a.covers.length > 0)
    return rank !== 0 ? rank : a.name.localeCompare(b.name, 'fr')
  })
}

export const assigneeCandidatesResponseSchema = z.object({
  items: z.array(z.object({ user_id: z.string(), name: z.string(), covers: z.array(z.string()) })),
})

export const distributeApplyRequestSchema = z.object({ fingerprint: z.string().min(8).max(128) })
export type DistributeApplyRequest = z.infer<typeof distributeApplyRequestSchema>

export interface DistributePreviewResponse {
  /** Empreinte de l'aperçu : l'apply la redonne, un état changé entre-temps est refusé. */
  fingerprint: string
  groups: { user_id: string; name: string | null; labels: string[]; count: number }[]
  unchanged_count: number
}

export interface DistributeApplyResponse {
  applied: number
}
