/**
 * #219.6 (#3231, lot X50) — la déclaration MANUELLE de filiales d'un compte.
 *
 * `accounts.subsidiaries` ne se remplissait que par l'analyse : sur un compte dont
 * l'analyse n'en a rapporté aucune, Laura ne pouvait pas distinguer une filiale
 * d'un client externe. Le commercial les déclare maintenant sur la fiche, en texte
 * (une correction humaine ordinaire : provenance « saisi à la main », que
 * l'analyse suivante ne réécrit pas). Ce module est PUR : il convertit la saisie
 * en liste et la liste en saisie, sans jamais deviner un nom.
 */

const MAX_NAMES = 30
const MAX_NAME_LENGTH = 200

/** La saisie (virgule, point-virgule, retour à la ligne) → les noms, dédoublonnés. */
export function parseDeclaredSubsidiaries(input: unknown): string[] {
  if (typeof input !== 'string') return []
  const seen = new Set<string>()
  const names: string[] = []
  for (const part of input.split(/[,;\n]/)) {
    const name = part.trim()
    const key = name.toLowerCase()
    if (!name || name.length > MAX_NAME_LENGTH || seen.has(key)) continue
    seen.add(key)
    names.push(name)
    if (names.length === MAX_NAMES) break
  }
  return names
}

/** La liste stockée (`unknown[]` au contrat : texte ou objet nommé) → la saisie, ou `null`. */
export function joinSubsidiaryNames(subsidiaries: unknown): string | null {
  if (!Array.isArray(subsidiaries)) return null
  const names = subsidiaries
    .map(item => {
      if (typeof item === 'string') return item.trim()
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>
        const named = record['name'] ?? record['legal_name']
        return typeof named === 'string' ? named.trim() : ''
      }
      return ''
    })
    .filter(name => name.length > 0)
  return names.length > 0 ? names.join(', ') : null
}
