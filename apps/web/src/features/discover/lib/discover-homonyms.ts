import { normalizeCompanyNameKey } from '@bellum/contracts'

/**
 * #3819.11 / #3901.9 — deux entreprises de la réponse au même nom (normalisé, `normalizeCompanyNameKey`,
 * UN seul endroit — GA-26) mais de SIREN différents : on NOMME l'ambiguïté, on n'en choisit jamais une.
 * Une société sans homonyme n'a AUCUNE entrée (une absence ne fait aucune ligne).
 */
export function homonymSirensBySiren(rows: readonly { siren: string; name: string }[]): Map<string, string[]> {
  const byName = new Map<string, Set<string>>()
  for (const row of rows) {
    const key = normalizeCompanyNameKey(row.name)
    if (!key) continue
    const sirens = byName.get(key) ?? new Set<string>()
    sirens.add(row.siren)
    byName.set(key, sirens)
  }
  const result = new Map<string, string[]>()
  for (const sirens of byName.values()) {
    if (sirens.size < 2) continue
    for (const siren of sirens)
      result.set(
        siren,
        [...sirens].filter(other => other !== siren),
      )
  }
  return result
}

/**
 * #3819.11 / #3901.9 (18/10, décision Louis) — deux sociétés privées au même nom et aucune source
 * pour départager : le signal ambigu est MASQUÉ sur les deux (aucune ligne), jamais rattaché au
 * hasard. `signalsSearched` retombe à `false` : « sans signal » serait le « 0 » d'une non-mesure.
 * Le reste de la fiche (identité, score) est inchangé ; une société sans homonyme n'est pas touchée.
 */
export function maskHomonymSignals<
  T extends { siren: string; name: string; signals: unknown[]; signalsSearched?: boolean },
>(rows: readonly T[]): T[] {
  const homonyms = homonymSirensBySiren(rows)
  return rows.map(row =>
    homonyms.has(row.siren) && row.signals.length > 0 ? { ...row, signals: [], signalsSearched: false } : row,
  )
}
