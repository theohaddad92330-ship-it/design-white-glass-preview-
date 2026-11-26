/**
 * « Je n'ai pas pu transmettre » se dit UNE fois — même sans mémoire de process.
 *
 * Le correctif du 22/08 marque la session dans un `Set` en mémoire pour que le
 * tour suivant reçoive « déjà signalé ». Ce `Set` vit dans le process, et le
 * site tourne en serverless : deux tours d'une même conversation peuvent
 * atterrir sur deux instances. La garantie tient donc quand l'instance est
 * chaude, et tombe exactement quand elle ne l'est pas — c'est-à-dire de façon
 * imprévisible, ce qui est la pire forme de garantie.
 *
 * La conversation, elle, fait l'aller-retour à chaque tour. Elle est donc la
 * seule mémoire fiable disponible sans base : si Laura a DÉJÀ dit qu'elle
 * n'arrivait pas à transmettre, c'est écrit dans ses propres messages.
 *
 * ⚠️ On cherche des tournures, pas un marqueur : le texte est produit par un
 * modèle et ne sera jamais identique deux fois. Un faux positif fait taire une
 * annonce d'échec, un faux négatif la répète — et c'est la répétition que le
 * ticket corrige, donc le doute profite au silence.
 */

/** Tournures par lesquelles un échec de transmission a déjà été annoncé. */
const FAILURE_PHRASES = [
  'pas pu transmettre',
  "n'arrive pas à transmettre",
  'pas réussi à transmettre',
  'impossible de transmettre',
  'could not pass',
  'unable to pass',
  "couldn't get your request through",
]

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/**
 * L'échec a-t-il déjà été annoncé dans cette conversation ?
 *
 * `inProcess` est la mémoire rapide (le `Set` du routeur) ; l'historique est le
 * repli qui la remplace quand l'instance a changé. L'un ou l'autre suffit.
 */
export function handoffFailureAlreadyTold(
  messages: readonly { role: string; content: unknown }[],
  inProcess = false,
): boolean {
  if (inProcess) return true
  const needles = FAILURE_PHRASES.map(normalize)
  return messages.some(message => {
    if (message.role !== 'assistant') return false
    const text = typeof message.content === 'string' ? message.content : ''
    const haystack = normalize(text)
    return needles.some(needle => haystack.includes(needle))
  })
}
