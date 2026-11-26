import { z } from 'zod'
import type { AccountFact, AccountFactKind } from './account-facts.js'
import { CLIENT_TOOLS, supplierNamesIn } from './tool-naming.js'

/**
 * #4073.1 — LES FAITS DU COMPTE DANS UN EXPORT.
 *
 * Décision Louis 12/10 : un export (CSV de liste, de compte) porte les faits
 * du socle (#4069), DATÉS et TYPÉS, jamais leur provenance. Six colonnes, une
 * par nature : dernier recrutement, dernier besoin, dernier signal, affaire
 * gagnée, affaire perdue, mission. Chaque cellule = « date — libellé » du fait
 * le plus RÉCENT de sa nature.
 *
 *  - **Absent ⇒ cellule VIDE** : ni « 0 », ni tiret (gardes GA-18 / GA-19).
 *  - **Une date illisible écarte le fait** : jamais une date devinée.
 *  - **#4073.2 — aucun nom de source ni de système** : le contrat des faits
 *    n'a pas de champ de provenance, mais un LIBELLÉ est du texte libre
 *    (« vu chez … »). Un libellé qui nomme un fournisseur ou un outil branché
 *    ne sort pas : la cellule garde sa date, la nature et la date se disent,
 *    la source jamais.
 */
export const ACCOUNT_FACTS_EXPORT_COLUMNS = [
  'lastHiring',
  'lastNeed',
  'lastSignal',
  'dealWon',
  'dealLost',
  'mission',
] as const
export type AccountFactsExportColumn = (typeof ACCOUNT_FACTS_EXPORT_COLUMNS)[number]
export type AccountFactsExportCells = Record<AccountFactsExportColumn, string>

const KIND_COLUMN: Partial<Record<AccountFactKind, AccountFactsExportColumn>> = {
  hiring: 'lastHiring',
  need: 'lastNeed',
  signal: 'lastSignal',
  deal_won: 'dealWon',
  deal_lost: 'dealLost',
  mission: 'mission',
}

const CLIENT_TOOL_PATTERNS = CLIENT_TOOLS.flatMap(tool => tool.names).map(
  name => new RegExp(`(?<![\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu'),
)

function namesASystem(text: string): boolean {
  return supplierNamesIn(text).length > 0 || CLIENT_TOOL_PATTERNS.some(pattern => pattern.test(text))
}

/** `Number.NaN` si illisible. */
const timeOf = (date: string): number => Date.parse(date)

export function emptyAccountFactsExportCells(): AccountFactsExportCells {
  return { lastHiring: '', lastNeed: '', lastSignal: '', dealWon: '', dealLost: '', mission: '' }
}

/** Les cellules d'UN compte, depuis ses faits (l'ordre reçu est sans importance). */
export function accountFactsExportCells(facts: readonly AccountFact[]): AccountFactsExportCells {
  const latest = new Map<AccountFactsExportColumn, AccountFact>()
  for (const fact of facts) {
    const column = KIND_COLUMN[fact.kind]
    if (!column || !Number.isFinite(timeOf(fact.date))) continue
    const current = latest.get(column)
    if (!current || timeOf(fact.date) > timeOf(current.date)) latest.set(column, fact)
  }
  const cells = emptyAccountFactsExportCells()
  for (const [column, fact] of latest) {
    const day = new Date(timeOf(fact.date)).toISOString().slice(0, 10)
    cells[column] = namesASystem(fact.label) ? day : `${day} — ${fact.label}`
  }
  return cells
}

/** Borne : une liste cible en prod tient largement sous 500 comptes. */
export const ACCOUNT_FACTS_EXPORT_MAX_ACCOUNTS = 500

export const accountFactsExportRequestSchema = z
  .object({ accountIds: z.array(z.string().guid()).max(ACCOUNT_FACTS_EXPORT_MAX_ACCOUNTS) })
  .strict()
export type AccountFactsExportRequest = z.infer<typeof accountFactsExportRequestSchema>

/** `cells` par identifiant de compte ; un compte absent de l'espace n'a pas d'entrée. */
export const accountFactsExportResponseSchema = z
  .object({
    cells: z.record(
      z.string(),
      z
        .object({
          lastHiring: z.string(),
          lastNeed: z.string(),
          lastSignal: z.string(),
          dealWon: z.string(),
          dealLost: z.string(),
          mission: z.string(),
        })
        .strict(),
    ),
  })
  .strict()
export type AccountFactsExportResponse = z.infer<typeof accountFactsExportResponseSchema>
