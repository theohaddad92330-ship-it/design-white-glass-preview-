/**
 * #3457 — « la dictée vocale insère le texte en double ». Le fournisseur de
 * transcription rend parfois, sur un enregistrement court, la MÊME phrase
 * deux fois de suite (« Bonjour, comment allez-vous ? Bonjour, comment
 * allez-vous ? ») : le texte doublé entrait tel quel dans la bulle envoyée.
 *
 * Règle, volontairement étroite : le transcrit ENTIER est `k` copies
 * (2 à 4) d'une même suite d'au moins `MIN_UNIT_WORDS` mots, comparées sans
 * casse ni ponctuation. Plus court (« non non », « oui oui oui »), c'est une
 * insistance voulue — on n'y touche pas. Une phrase qui en reprend une autre
 * en la prolongeant n'est pas une copie. Rien n'est inventé : on retire un
 * doublon, on n'ajoute aucun mot.
 */
const MIN_UNIT_WORDS = 3
const MAX_COPIES = 4

const canonical = (word: string): string => word.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

export function collapseRepeatedTranscript(text: string): { text: string; copies: number } {
  // Une ponctuation isolée (« ? ») n'est pas un mot : elle reste dans le texte rendu, hors de la comparaison.
  const tokens = text.match(/\S+/g) ?? []
  const wordAt: number[] = []
  const canon: string[] = []
  tokens.forEach((token, index) => {
    const word = canonical(token)
    if (word) {
      wordAt.push(index)
      canon.push(word)
    }
  })
  for (let copies = MAX_COPIES; copies >= 2; copies -= 1) {
    if (canon.length % copies !== 0) continue
    const unit = canon.length / copies
    if (unit < MIN_UNIT_WORDS) continue
    const repeated = canon.every((word, index) => word === canon[index % unit])
    if (!repeated) continue
    // Le premier exemplaire s'arrête avant le premier mot du second (la ponctuation qui le suit lui appartient).
    const end = wordAt[unit] ?? tokens.length
    return { text: tokens.slice(0, end).join(' '), copies }
  }
  return { text, copies: 1 }
}
