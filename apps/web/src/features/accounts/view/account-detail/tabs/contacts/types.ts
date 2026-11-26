import type { Contact } from '@bellum/contracts'

export type GroupMode = 'entity' | 'persona'

export type ContactGroup = {
  entity: string
  contacts: Contact[]
  /** Recette 21/10 A.1 — le groupe « à qualifier » s'ouvre REPLIÉ (rien n'est retiré). */
  collapsedByDefault?: boolean
}
