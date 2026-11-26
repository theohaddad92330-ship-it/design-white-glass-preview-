/**
 * Ce que la conversation transmet à l'espace, côté site — §11 P2,
 * « Conversation → workspace pré-configuré lors de la création de compte ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX GARANTIES, ET ELLES SONT STRUCTURELLES
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **Rien ne se crée sans le geste du visiteur.** Ce module ne fait qu'écrire
 *    une chaîne de requête. Aucun appel serveur, aucun espace esquissé, aucun
 *    lead créé en silence : s'il ne clique pas, rien n'a bougé.
 *
 * 2. **Aucune donnée personnelle ne voyage — et il le SAIT.** La liste est
 *    BLANCHE : ce qui n'y figure pas ne part pas, y compris les champs qu'on
 *    ajoutera dans six mois. Et ce qui est retenu est NOMMÉ (`withheld`), pour
 *    que le widget puisse l'écrire au visiteur avant qu'il clique. « On ne
 *    transmet rien de personnel » sans dire quoi ne se vérifie pas ; « ton
 *    prénom et ton besoin restent ici » se vérifie.
 *
 * Le décodeur vit dans `@bellum/contracts` (`decodeChatbotPrefill`), parce que
 * c'est l'APPLICATION qui relit le lien. Cette moitié-ci est recopiée plutôt
 * qu'importée — `@bellum/contracts` est une dépendance de développement du site
 * — et `contracts-parity.test.ts` confronte les deux : même liste blanche, même
 * motif de valeur, même paramètre, même encodage.
 */

/** Les huit axes de qualification. Ni `pain` (texte libre), ni `firstName`. */
export const PREFILL_FIELDS = [
  'companyType',
  'teamSize',
  'persona',
  'painFit',
  'tooling',
  'trigger',
  'decision',
  'horizon',
] as const

type PrefillField = (typeof PREFILL_FIELDS)[number]

/** Un seul paramètre, et nommé : le visiteur doit pouvoir regarder l'URL et
 *  voir ce qu'il emporte, sans le chercher entre huit paramètres. */
export const PREFILL_PARAM = 'bellum_ctx'

/** Une valeur transmissible est un CODE, jamais une phrase — un texte libre
 *  contient des noms. Bornée à 24 : la plus longue enum du barème en fait 15. */
const CODE = /^[a-z0-9][a-z0-9_+-]{0,23}$/

export type ChatPrefill = {
  fields: Record<string, string>
  /** Ce qu'on avait et qu'on garde ici — nommé, pour être dit au visiteur. */
  withheld: string[]
  /** La chaîne de requête à accrocher au lien, ou `''`. */
  query: string
}

function isPrefillField(key: string): key is PrefillField {
  return (PREFILL_FIELDS as readonly string[]).includes(key)
}

/**
 * Ce que la conversation peut transmettre, ce qu'elle retient, et le lien.
 *
 * L'entrée est typée « objet de clés inconnues » à dessein : ce module est la
 * frontière, et une frontière qui fait confiance à son appelant n'en est pas
 * une.
 */
export function buildPrefill(lead: Readonly<Record<string, unknown>>): ChatPrefill {
  const fields: Record<string, string> = {}
  const withheld: string[] = []

  for (const [key, value] of Object.entries(lead)) {
    if (value === undefined || value === null || value === '') continue
    if (!isPrefillField(key)) {
      withheld.push(key)
      continue
    }
    // Un champ de la liste blanche dont la valeur ne ressemble pas à un code est
    // écarté SANS être annoncé comme retenu : ce n'est pas une décision de
    // confidentialité, c'est une valeur qu'on ne sait pas lire.
    if (typeof value === 'string' && CODE.test(value)) fields[key] = value
  }

  const pairs = PREFILL_FIELDS.filter(field => fields[field]).map(field => `${field}:${fields[field]}`)
  return {
    fields,
    withheld,
    // Une chaîne vide et non un paramètre vide : `?bellum_ctx=` dans une URL se
    // lit comme un bug et invite à se demander ce qu'on a perdu.
    query: pairs.length ? `${PREFILL_PARAM}=${encodeURIComponent(pairs.join('~'))}` : '',
  }
}

/** Le lien d'inscription, avec le contexte accroché — ou le lien nu. */
export function withPrefill(url: string, prefill: ChatPrefill): string {
  if (!prefill.query) return url
  return `${url}${url.includes('?') ? '&' : '?'}${prefill.query}`
}
