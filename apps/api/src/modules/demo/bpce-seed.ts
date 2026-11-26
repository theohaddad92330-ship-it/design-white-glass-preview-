import { routeBpceRows } from './bpce-csv-mapping'
import { parseCompteCsvRows } from './compte-csv-parser'
import { BPCE_COMPTE_COMPLET_CSV } from './data/bpce-compte-complet.generated'

/**
 * Le CSV BPCE, lu et routé UNE fois par processus : le dossier
 * (`demo-dataset.ts`), son graphe d'organisation (`demo-org-graphs.ts`) et les
 * écritures du semis (`bpce-csv-complement.ts`) lisent le même résultat.
 */
export const BPCE_ROWS = parseCompteCsvRows(BPCE_COMPTE_COMPLET_CSV)
export const BPCE_SEED = routeBpceRows(BPCE_ROWS)
