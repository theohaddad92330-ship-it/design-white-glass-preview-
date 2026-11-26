import type { CommercialLifecycle } from './account.js'

// Théo A comptes-liste.R4 — les 3 statuts de relation affichés (Client · En ouverture · À ouvrir).
export type RelationStatus = 'client' | 'opening' | 'to_open'

// Hors priorité / En veille : état secondaire filtrable, jamais un 4ᵉ statut.
export type RelationSecondary = 'out_of_priority' | 'on_hold'

type RelationView = { primary: RelationStatus; secondary: RelationSecondary | null }

/**
 * Correspondance écrite 7 → 3 (Louis 22/10, rien perdu — la colonne `commercial_status` garde ses 7 valeurs,
 * seule la LECTURE change) :
 *  customer → Client · opening → En ouverture · inbox / watching / opportunity → À ouvrir ·
 *  archived → À ouvrir + « Hors priorité » · dormant → À ouvrir + « En veille ».
 */
export const RELATION_STATUS_OF_LIFECYCLE: Record<CommercialLifecycle, RelationView> = {
  customer: { primary: 'client', secondary: null },
  opening: { primary: 'opening', secondary: null },
  inbox: { primary: 'to_open', secondary: null },
  watching: { primary: 'to_open', secondary: null },
  opportunity: { primary: 'to_open', secondary: null },
  archived: { primary: 'to_open', secondary: 'out_of_priority' },
  dormant: { primary: 'to_open', secondary: 'on_hold' },
}

export function relationStatusOf(status: CommercialLifecycle | undefined): RelationView {
  return RELATION_STATUS_OF_LIFECYCLE[status ?? 'inbox']
}
