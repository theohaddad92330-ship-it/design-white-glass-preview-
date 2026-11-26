import type { MessageStyleTemplate } from '@bellum/contracts'

/**
 * #2204.65 (épopée #2947) — l'apprentissage du style à QUATRE niveaux, résolu au moment de générer.
 *
 * Un style porte une portée (`scope`, #2369.6) ; jusqu'ici le composer ne pouvait qu'en CHOISIR un par son identifiant.
 * Sans choix explicite, le style le plus PROCHE de la situation s'applique : le fil (« campagne », c74), puis
 * l'équipe, puis la personne, puis l'espace. Un style d'un autre fil / d'une autre équipe / d'une autre personne ne
 * s'applique jamais (pas de fuite entre portées). Fonction PURE : le service lit, ici on décide.
 */
export type MessageStyleScopeTarget = {
  objective: string
  channel: MessageStyleTemplate['channel']
  /** Absente : la persona du style ne filtre pas. */
  persona?: string
  userId: string
  businessUnitId?: string | null
  conversationId?: string | null
}

/** Plus petit = plus proche = gagne. */
const SCOPE_RANK: Record<MessageStyleTemplate['scope'], number> = {
  conversation: 0,
  business_unit: 1,
  user: 2,
  workspace: 3,
}

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()

function appliesTo(template: MessageStyleTemplate, target: MessageStyleScopeTarget): boolean {
  if (template.status !== 'active' || template.channel !== target.channel) return false
  if (!same(template.objective, target.objective)) return false
  if (target.persona && !same(template.persona, target.persona)) return false
  switch (template.scope) {
    case 'conversation':
      return Boolean(target.conversationId) && template.conversationId === target.conversationId
    case 'business_unit':
      return Boolean(target.businessUnitId) && template.businessUnitId === target.businessUnitId
    case 'user':
      return template.ownerId === target.userId
    case 'workspace':
      return true
    default:
      return false
  }
}

export function pickTemplateByScope(
  templates: readonly MessageStyleTemplate[],
  target: MessageStyleScopeTarget,
): MessageStyleTemplate | null {
  const candidates = templates.filter(template => appliesTo(template, target))
  if (candidates.length === 0) return null
  return (
    [...candidates].sort(
      (a, b) =>
        SCOPE_RANK[a.scope] - SCOPE_RANK[b.scope] || b.version - a.version || b.updatedAt.localeCompare(a.updatedAt),
    )[0] ?? null
  )
}
