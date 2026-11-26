/**
 * #2437.15 (épopée #2863) — PSEUDO-LOCALE : détecter les chaînes NON
 * traduites (contournent i18n) et les chaînes TRONQUÉES (débordent une UI
 * dimensionnée pour l'anglais).
 *
 * La technique : transformer chaque texte réel en une variante qui reste
 * lisible mais ne peut être confondue avec du FR/EN réel — accents étendus
 * + bornes visibles + longueur gonflée d'environ 40 % (une langue plus
 * longue que l'anglais est la cause la plus fréquente de débordement en
 * recette). Un texte codé en dur dans un composant (jamais passé par `t()`)
 * reste alors visible À L'ŒIL parmi les bornes ⟦…⟧ : c'est le signal qu'une
 * pseudo-locale QA détecte et qu'aucun test de parité de CLÉS ne peut voir
 * (`parity.test.ts` compare des clés, jamais un rendu).
 *
 * `{{placeholder}}` et les balises `<tag>…</tag>` de `react-i18next` (Trans)
 * restent BYTE-IDENTIQUES : les transformer casserait l'interpolation ou le
 * composant qu'elles portent, ce que cet outil doit détecter, pas provoquer.
 */

const PRESERVED = /(\{\{\s*[\w.]+\s*\}\}|<\/?[a-zA-Z][\w-]*\s*\/?>)/

const ACCENT_MAP: Record<string, string> = {
  a: 'ȧ',
  A: 'Ȧ',
  e: 'ė',
  E: 'Ė',
  i: 'ı',
  I: 'İ',
  o: 'ō',
  O: 'Ō',
  u: 'ū',
  U: 'Ū',
  c: 'ç',
  C: 'Ç',
  n: 'ñ',
  N: 'Ñ',
  s: 'š',
  S: 'Š',
  y: 'ý',
  Y: 'Ý',
}

function stress(segment: string): string {
  return [...segment].map(char => ACCENT_MAP[char] ?? char).join('')
}

const START = '⟦'
const END = '⟧'
const PAD_CHAR = '~'

/**
 * Transforme UNE valeur de traduction. Pure et déterministe : même entrée,
 * même sortie — la QA (ci-dessous) et un futur outil de capture visuelle
 * peuvent s'y fier sans la rejouer.
 *
 * Une chaîne vide ou blanche ressort inchangée : l'envelopper ne détecterait
 * rien (rien à tronquer, rien à confondre avec du texte réel) et casserait
 * des mises en page qui testent `=== ''` ailleurs dans le produit.
 */
export function pseudoLocalize(value: string): string {
  if (value.trim() === '') return value
  const parts = value.split(PRESERVED)
  const stressed = parts.map((part, index) => (index % 2 === 1 ? part : stress(part))).join('')
  const padding = PAD_CHAR.repeat(Math.ceil(value.length * 0.4))
  return `${START}${stressed}${padding}${END}`
}

/** Les tokens `{{var}}` d'une valeur, dans l'ordre — pour vérifier qu'une
 *  transformation ne les a ni perdus ni réordonnés. */
export function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{\{\s*[\w.]+\s*\}\}/g)].map(match => match[0])
}
