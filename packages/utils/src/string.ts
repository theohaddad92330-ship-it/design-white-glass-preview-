/** Capitalize the first letter of a string */
export function capitalize(text: string): string {
  if (!text) return text
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Truncate with ellipsis at a word boundary (default 140 chars)
 */
export function truncate(text: string, max = 140): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max + 1).replace(/\s\S*$/, '')
  return cut.replace(/[\s.,;:!-]+$/u, '') + '…'
}

/**
 * Pads a number with leading zeros to ensure the resulting string has the specified length.
 */
export function leftPad(d: number, length: number): string {
  let result = d.toString(10)
  while (result.length < length) {
    result = '0' + result
  }
  return result
}

/**
 * Get the initials of a string
 * @param text - The text to get the initials of
 * @returns The initials of the text, or "?" if empty
 */
export function getInitials(text: string): string {
  if (!text?.trim()) return '?'
  return text
    .trim()
    .split(' ')
    .filter(word => word.length > 0)
    .map(word => word[0])
    .join('')
}

/**
 * Get the full name of a person
 * @param firstName - The first name of the person
 * @param lastName - The last name of the person
 * @returns The full name of the person, or an empty string if both are empty
 */
export function getFullName(firstName: string, lastName: string): string {
  const first = firstName?.trim()
  const last = lastName?.trim()

  if (first && last) return `${first} ${last}`
  if (first) return first
  if (last) return last
  return ''
}

/**
 * Coerce an unknown scalar to a string, returning null for nullish or empty values.
 * Useful at JSON deserialisation boundaries where a number/string union must land
 * in a `text` column.
 */
export function coerceToString(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  return typeof value === 'string' ? value : String(value)
}

/**
 * Identifiant de personne du graphe d'organisation : `p-{slug du nom complet}`.
 *
 * Le graphe typé et les contacts vivent dans deux mondes d'identifiants ; ce slug
 * est la SEULE clé commune (l'assembleur IA le synthétise depuis le nom). Il vit
 * ici, dans le paquet partagé, parce que trois consommateurs en dépendent — la
 * carte d'influence, le chemin recommandé et le jeu de données de démonstration —
 * et que deux normalisations qui divergent d'un caractère font disparaître les
 * traits de la carte sans aucune erreur.
 *
 * Les caractères hors [a-z0-9] (accents compris) deviennent un séparateur : c'est
 * volontairement identique au comportement de l'assembleur, pas une jolie
 * translittération. « Dr Émilie Chartier » → `p-dr-milie-chartier`.
 */
export function orgPersonSlug(fullName: string | null | undefined): string {
  const slug = (fullName ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `p-${slug || 'p'}`
}
