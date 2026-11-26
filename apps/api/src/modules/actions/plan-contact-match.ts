// #4521.1 — le rapprochement « quel contact du compte ce libellé nomme-t-il ? », UN seul endroit (GA-26) :
// le rattrapage back-office (qui écrit) et la lecture de la file (qui ne fait que montrer) disent la même chose.

export type BookEntry = { id: string; key: string }

/** Minuscules, sans accents, ponctuation en espaces : « Paul  DURAND, » ≡ « paul durand ». */
export function nameKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Le contact SANS AMBIGUÏTÉ d'une étape : l'unique contact du compte, sinon celui dont le NOM COMPLET (deux mots
 * au moins) figure dans le libellé. Plusieurs candidats, ou aucun : `null` — jamais un destinataire deviné.
 */
export function unambiguousContact(label: string, book: readonly BookEntry[]): string | null {
  if (book.length === 1) return book[0]?.id ?? null
  const haystack = ` ${nameKey(label)} `
  const named = book.filter(entry => entry.key.includes(' ') && haystack.includes(` ${entry.key} `))
  // « Jean Dupont » contenu dans « Jean Dupont Martin » : le nom le plus long est celui qui est cité.
  const longest = named.filter(entry => !named.some(other => other !== entry && other.key.includes(entry.key)))
  return longest.length === 1 ? (longest[0]?.id ?? null) : null
}
