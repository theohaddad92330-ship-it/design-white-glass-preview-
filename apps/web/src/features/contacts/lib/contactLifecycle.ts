import { computeContactLifecycleState, type ContactLifecycleState } from '@bellum/contracts'
import type { GlobalContact } from '@/features/contacts/hooks/useContacts'

/** Adapt a listing row (snake_case) to the contracts lifecycle input shape. */
function toLifecycleInput(c: GlobalContact) {
  return {
    fullName: c.full_name,
    title: c.title,
    entity: c.entity,
    role: c.decision_role,
    email: c.email,
    phone: c.phone,
    linkedinUrl: c.linkedin_url,
    source: c.source,
  }
}

/** The lifecycle state of a saved contact (détecté → actionnable), via the
 *  single canonical `computeContactLifecycleState` (Théo p.16).
 *
 *  Sert UNIQUEMENT à afficher le badge d'une ligne déjà chargée. Les COMPTEURS
 *  (pastilles + bandeau KPI) ne se dérivent plus des contacts chargés : ils
 *  viennent de l'agrégat serveur `lifecycleTally` de `GET /contacts`, sans quoi
 *  une page de 25 ferait annoncer "25" à côté d'un total de 210. */
export function contactLifecycleState(c: GlobalContact): ContactLifecycleState {
  return computeContactLifecycleState(toLifecycleInput(c))
}
