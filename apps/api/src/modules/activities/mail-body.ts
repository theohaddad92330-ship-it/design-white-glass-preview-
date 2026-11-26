import { ACTIVITY_BODY_MAX_LENGTH } from '@bellum/contracts'

/**
 * Le CORPS d'un message, ramené à du texte lisible et borné.
 *
 * Arbitrage Louis du 16/08 : le corps est désormais STOCKÉ intégralement, alors
 * que tout le socle exécutif avait été écrit pour ne jamais le lire. Le
 * revirement est assumé — sans corps, « prépare une relance dans le ton du
 * dernier échange » est impossible, et l'historique disparaît le jour où l'ESN
 * change de messagerie. Ce qui ne change PAS : le copilote ne remonte jamais de
 * corps. Stocker et exposer sont deux décisions distinctes, et seule la seconde
 * fait sortir le texte de chez nous.
 *
 * Deux règles dans ce fichier :
 *
 *  - **On préfère toujours `text/plain`.** Convertir du HTML est une perte ;
 *    quand le fournisseur donne les deux, prendre le HTML serait s'infliger la
 *    perte pour rien.
 *  - **Une coupe se DIT.** Un corps tronqué en silence se lit comme un message
 *    qui s'arrêtait là — donc comme un interlocuteur brusque, ou comme une
 *    demande sans sa question.
 */

type NormalizedBody = { text: string | null; truncated: boolean }

const EMPTY: NormalizedBody = { text: null, truncated: false }

/**
 * Transforme un corps HTML en texte.
 *
 * Volontairement simple, et sans dépendance : on retire ce qui n'est jamais du
 * contenu (`script`, `style`, `head`), on remplace par des sauts de ligne les
 * balises qui en produisent visuellement, on décode les entités les plus
 * courantes. Un rendu parfait n'est pas l'objectif — le texte sert à relire un
 * échange et à nourrir une relance, pas à réafficher la mise en page.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)\s*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Normalise un corps, quelle que soit sa forme d'origine.
 *
 * Une chaîne vide ou blanche rend `null` et non `''` : « pas de corps » et
 * « corps vide » se distinguent à l'écran (un appel n'a pas de corps ; un
 * message vide en a un, vide), et `''` se lirait comme le second alors qu'il est
 * presque toujours le premier.
 */
export function normalizeMailBody(input: {
  plain?: string | null
  html?: string | null
  maxLength?: number
}): NormalizedBody {
  const max = input.maxLength ?? ACTIVITY_BODY_MAX_LENGTH
  const plain = input.plain?.trim()
  const raw = plain && plain.length > 0 ? plain : input.html ? htmlToText(input.html) : ''
  if (!raw) return EMPTY
  if (raw.length <= max) return { text: raw, truncated: false }
  return { text: raw.slice(0, max), truncated: true }
}

/**
 * Décode une partie Gmail (base64url) en texte.
 *
 * Rend `null` plutôt que de lever : une partie illisible ne doit pas faire
 * échouer la capture du message entier, et encore moins celle du lot.
 */
export function decodeBase64Url(data: string | null | undefined): string | null {
  if (!data) return null
  try {
    const text = Buffer.from(data, 'base64url').toString('utf8')
    return text.length > 0 ? text : null
  } catch {
    return null
  }
}
