import type { ContactStatus } from './contact.js'
import { summarizeContactRelation, type RelationActivityInput } from './contact-relation-summary.js'

/**
 * Théo B C5.R2 / C1.N2 (décision Louis 22/10/2026) — le badge « Échange engagé » / « À contacter »,
 * DÉRIVÉ de l'historique d'échanges, à côté du statut DÉCLARÉ (`contacts.user_status`). Si les deux
 * existent, la déclaration humaine gagne : « une correction humaine gagne toujours ».
 *
 * « Échange » a UNE définition (GA-26) : `summarizeContactRelation` — une ligne entrante, une réunion
 * tenue, ou un appel abouti. Un e-mail parti sans réponse est une tentative, pas un échange.
 * `new` est la valeur par défaut de la colonne, pas une déclaration.
 */
export type DerivedContactRelation = 'engaged' | 'to_contact'

export type ContactRelationBadge = {
  derived: DerivedContactRelation
  /** Le statut posé par un humain ; `null` tant que le défaut `new` n'a pas été changé. */
  declared: Exclude<ContactStatus, 'new'> | null
  /** Ce que l'écran montre : la déclaration si elle existe, sinon le dérivé. */
  shown:
    | { source: 'declared'; status: Exclude<ContactStatus, 'new'> }
    | { source: 'derived'; relation: DerivedContactRelation }
}

export function deriveContactRelationBadge(input: {
  activities: readonly RelationActivityInput[]
  declaredStatus: ContactStatus | null | undefined
  now: Date
}): ContactRelationBadge {
  const summary = summarizeContactRelation({
    activities: input.activities,
    planItems: [],
    repliesReadable: false,
    now: input.now,
  })
  const derived: DerivedContactRelation = summary.lastExchange ? 'engaged' : 'to_contact'
  const declared = input.declaredStatus && input.declaredStatus !== 'new' ? input.declaredStatus : null
  return {
    derived,
    declared,
    shown: declared ? { source: 'declared', status: declared } : { source: 'derived', relation: derived },
  }
}
