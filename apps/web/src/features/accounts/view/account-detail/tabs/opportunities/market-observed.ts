import type { AccountMarketContext } from '@bellum/contracts'
import { MARKET_MEMORY_MIN_PATHS, isResidualRoleFamily } from '@bellum/contracts'

/** Ce qu'on montre au plus de chaque liste : un coup d'œil, le détail vit dans l'onglet Écosystème. */
const SHOWN = 5

export type ObservedOnMarket = {
  stack: Array<{ techno: string; persons: number }>
  families: string[]
  esn: Array<{ name: string; persons: number }>
  /** Personnes passées par une ESN et aujourd'hui chez le compte : un comptage ; `null` = non mesuré (jamais « 0 »). */
  exEsn: number | null
}

/**
 * Lot 773 (f) — ce que `MarketMemoryService` sait déjà d'un compte, à lire d'un coup d'œil sous « Observé sur le
 * marché » : technos les plus vues, familles de rôles, ESN présentes avec leur nombre de parcours, ex-ESN. AGRÉGATS
 * seulement (GA-352 : aucune identité, aucune date). Chaque entrée sous le seuil de {@link MARKET_MEMORY_MIN_PATHS}
 * parcours n'est pas affichée ; tout est vide ⇒ `null` (la phrase des parcours suffit, jamais une liste vide).
 */
export function observedOnMarket(context: AccountMarketContext | null | undefined): ObservedOnMarket | null {
  if (!context) return null
  const enough = (persons: number) => persons >= MARKET_MEMORY_MIN_PATHS
  const byPersons = <T extends { persons: number }>(a: T, b: T) => b.persons - a.persons
  const stack = (context.observed_stack_detail ?? [])
    .filter(entry => enough(entry.persons))
    .sort(byPersons)
    .slice(0, SHOWN)
    .map(entry => ({ techno: entry.techno, persons: entry.persons }))
  const families = (context.role_families ?? [])
    .filter(entry => !isResidualRoleFamily(entry.family) && enough(entry.persons))
    .sort(byPersons)
    .slice(0, SHOWN)
    .map(entry => entry.family)
  const esn = (context.esn_observed_detail ?? [])
    .filter(entry => enough(entry.persons))
    .sort(byPersons)
    .slice(0, SHOWN)
    .map(entry => ({ name: entry.esnName, persons: entry.persons }))
  const exEsn = context.ex_esn_present !== undefined && enough(context.ex_esn_present) ? context.ex_esn_present : null
  if (stack.length === 0 && families.length === 0 && esn.length === 0 && exEsn === null) return null
  return { stack, families, esn, exEsn }
}
