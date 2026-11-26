/**
 * #3530 — la casse d'AFFICHAGE d'un nom d'entreprise dans un message prêt à
 * envoyer. Les registres officiels donnent « CENTRE HOSPITALIER DE
 * VALENCIENNES » ; un commercial écrit « Centre Hospitalier de Valenciennes ».
 *
 * Seul un nom ENTIÈREMENT en capitales est retouché : un nom en casse mixte
 * (« Doctolib », « OVHcloud ») est déjà le nom usuel, on n'y touche pas. Les
 * sigles restent en capitales : un mot de 3 lettres ou moins, ou sans voyelle
 * (« BNP », « LVMH », « IBM »), est un sigle. Les accents perdus par la source
 * ne se devinent pas — on ne les réinvente pas.
 */
const SMALL_WORDS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'en', 'au', 'aux', 'sur', 'sous', 'd', 'l'])

function isAcronym(word: string): boolean {
  return word.length <= 3 || !/[AEIOUYÀ-Ü]/.test(word)
}

export function displayCompanyName(raw: string): string {
  const name = raw.trim()
  if (!name) return ''
  const letters = name.replace(/[^\p{L}]/gu, '')
  if (letters !== letters.toUpperCase() || letters === letters.toLowerCase()) return name
  let first = true
  return name.replace(/\p{L}+/gu, word => {
    const lower = word.toLowerCase()
    const isFirst = first
    first = false
    if (SMALL_WORDS.has(lower)) return isFirst ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower
    if (isAcronym(word)) return word
    return lower.charAt(0).toUpperCase() + lower.slice(1)
  })
}
