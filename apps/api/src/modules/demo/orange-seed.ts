import { COMMERCIAL_BRIEF_BY_EXTENSION_COMPANY } from './commercial-brief-seed'
import { parseCompteCsvRows } from './compte-csv-parser'
import { ORANGE_CONSULTANTS_CSV } from './data/orange-consultants.generated'
import { DEMO_ORANGE_COMPANY, routeOrangeRows } from './orange-csv-mapping'

/** Le relevé Orange, lu et routé UNE fois par processus (même patron que `bpce-seed.ts`). */
export const ORANGE_ROWS = parseCompteCsvRows(ORANGE_CONSULTANTS_CSV)

/**
 * Le dossier de compte (12/10/2026, `data/commercial-briefs/orange.json`) enrichit le relevé : coordonnées du groupe
 * Orange, décideurs en tête, personnes que le relevé ne porte pas.
 */
export const ORANGE_SEED = routeOrangeRows(ORANGE_ROWS, COMMERCIAL_BRIEF_BY_EXTENSION_COMPANY[DEMO_ORANGE_COMPANY])
