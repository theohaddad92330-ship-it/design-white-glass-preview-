/**
 * #3434 — quel candidat du registre juge-t-on « trop large » ? Pas le seul rang 0 :
 * « Michelin » rend plusieurs entités, et le rang 0 peut être une filiale ou un
 * homonyme PME. On prend, parmi celles dont le nom correspond à la demande, celle
 * dont l'effectif publié est le plus grand (jamais un effectif deviné : absent = non mesuré).
 */
import { isScopeSelectionEmpty, type AnalysisScopeSelection, type CompanySuggestion } from '@bellum/contracts'

type ScopeSuggestion = Pick<
  CompanySuggestion,
  'name' | 'size_class' | 'headcount_label' | 'employees_min' | 'employees_max'
>

const GE_FLOOR = 5000

/** Premier nombre d'un libellé, espaces fines ou insécables des milliers comprises. */
const OPEN_NUMBER = new RegExp('\\d[\\d\\s\\u00a0\\u202f]*')

const normalise = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Le plancher d'effectif PUBLIÉ du candidat, `null` si rien n'est mesuré. */
export function headcountFloorOf(suggestion: Omit<ScopeSuggestion, 'name'> | { name?: string }): number | null {
  const s = suggestion as Partial<ScopeSuggestion>
  const floors: number[] = []
  if ((s.size_class ?? '').trim().toUpperCase() === 'GE') floors.push(GE_FLOOR)
  if (typeof s.employees_min === 'number' && Number.isFinite(s.employees_min)) floors.push(s.employees_min)
  // Tranche ouverte comprise (« 10 000 salariés et plus ») : le PREMIER nombre est le plancher.
  const first = OPEN_NUMBER.exec(s.headcount_label ?? '')?.[0]
  const fromLabel = first ? Number(first.replace(/\D/g, '')) : NaN
  if (Number.isFinite(fromLabel)) floors.push(fromLabel)
  return floors.length ? Math.max(...floors) : null
}

export function pickScopeCandidate<T extends ScopeSuggestion>(query: string, suggestions: readonly T[]): T | null {
  if (!suggestions.length) return null
  const tokens = normalise(query).split(' ').filter(Boolean)
  const matching = suggestions.filter(s => {
    const name = ` ${normalise(s.name ?? '')} `
    return tokens.length > 0 && tokens.every(token => name.includes(` ${token}`))
  })
  const pool = matching.length ? matching : [suggestions[0] as T]
  return pool.reduce((best, s) => ((headcountFloorOf(s) ?? -1) > (headcountFloorOf(best) ?? -1) ? s : best))
}

const NAMED_SCOPE = /\s[—–-]\s|[():]|\b(direction|programme|filiale|division|business unit|entit[ée]s?|site)\b/i

/** « Michelin — direction Data/IA France » : le périmètre est déjà dit, la garde se tait. */
export function companyNamesScope(company: string): boolean {
  return NAMED_SCOPE.test(company)
}

/** #3434.3 — le dernier run de ce dossier portait-il le groupe entier (ou aucun périmètre lisible) ? */
export async function lastRunIsUnscoped(
  runs: {
    getLastRunScope(
      accountId: string,
    ): Promise<{ scopeMode: string | null; scopeSelection: AnalysisScopeSelection | null } | null>
  },
  accountId: string,
): Promise<boolean> {
  const scope = await runs.getLastRunScope(accountId)
  if (!scope) return true
  return (scope.scopeMode === null || scope.scopeMode === 'groupe') && isScopeSelectionEmpty(scope.scopeSelection)
}
