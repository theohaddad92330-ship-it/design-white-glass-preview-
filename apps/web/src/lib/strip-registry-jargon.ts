/**
 * #4994 — « NAF 92.3B, SIREN 341902898 » s'affichait dans « Lectures du dossier » : du jargon de registre,
 * posé par les DONNÉES (prose du modèle / champ registre), que personne n'a besoin de lire.
 *
 * Fonction pure, à l'AFFICHAGE : elle retire les codes NAF bruts (rév. 1 et 2), les SIREN/SIRET et les
 * séparateurs orphelins qu'ils laissent. Un code suivi de son libellé entre parenthèses garde le libellé seul.
 * Texte vide au retour = rien à afficher (l'appelant ne rend aucune ligne).
 *
 * Limite : un code NU sans mot « NAF » devant (« 64.19 Z ») n'est pas reconnu — trop d'ambiguïté avec un nombre.
 */

const NAF_CODE = String.raw`\d{2}\.\d{2}\s?[A-Z]?|\d{2}\.\d[A-Z]`
const NAF_WITH_LABEL = new RegExp(
  String.raw`\(?\bNAF\s*(?:rév\.?\s*\d\s*)?:?\s*(?:${NAF_CODE})\s*\(([^()]+)\)\)?`,
  'gi',
)
const NAF_BARE = new RegExp(String.raw`\(?\bNAF\s*(?:rév\.?\s*\d\s*)?:?\s*(?:${NAF_CODE})\b\)?`, 'gi')
const REGISTRY_ID = /\bSIR(?:EN|ET)\s*:?\s*\d{3}[\s.]?\d{3}[\s.]?\d{3}(?:[\s.]?\d{5})?\b/gi
const NAF_NO_SPACE = /\b\d{2}\.\d{2}[A-Z]\b/g

const SEPARATORS = String.raw`[,;·|]`

export function stripRegistryJargon(text: string): string {
  if (!text) return ''
  const stripped = text
    .replace(NAF_WITH_LABEL, '$1')
    .replace(NAF_BARE, '')
    .replace(REGISTRY_ID, '')
    .replace(NAF_NO_SPACE, '')
  if (stripped === text) return text
  return stripped
    .replace(/\(\s*\)/g, '')
    .replace(new RegExp(String.raw`(${SEPARATORS}\s*){2,}`, 'g'), '$1')
    .replace(new RegExp(String.raw`^[\s,;·|]+|[\s,;·|]+$`, 'g'), '')
    .replace(/\s+([,;])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * #4994 — même filtre appliqué à TOUTES les chaînes d'une donnée de lecture (listes, objets imbriqués) :
 * « Lectures du dossier » rend ces textes dans une dizaine de sections, un seul passage à l'entrée les couvre.
 * Une chaîne vidée par le filtre devient `''` (l'appelant ne rend aucune ligne). Hors chaînes : inchangé, même référence
 * si rien n'a bougé.
 */
export function stripRegistryJargonDeep<T>(value: T): T {
  if (typeof value === 'string') return stripRegistryJargon(value) as T
  if (Array.isArray(value)) {
    let changed = false
    const next = value.map(item => {
      const stripped = stripRegistryJargonDeep(item)
      if (stripped !== item) changed = true
      return stripped
    })
    return (changed ? next : value) as T
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    let changed = false
    const next: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const stripped = stripRegistryJargonDeep(item)
      if (stripped !== item) changed = true
      next[key] = stripped
    }
    return (changed ? next : value) as T
  }
  return value
}
