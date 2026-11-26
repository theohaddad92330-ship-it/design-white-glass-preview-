/**
 * #2899 / #2443.10 / #2278.9 — L'ANONYMISATION D'UN TOUR DE LAURA, AVANT STOCKAGE.
 *
 * Décision Louis (11/10/2026) : l'échantillonnage de conversations de production pour les
 * évals est OPT-IN PAR ESPACE, anonymisé AVANT stockage, et le CORPS de messages jamais.
 *
 * Ce module est PUR (aucun accès base, aucun réseau). Il rend le texte anonymisé, ou `null`
 * quand le tour ne doit PAS être échantillonné du tout :
 *  · trop long ({@link MAX_SAMPLED_TURN_CHARS}) — un tour de cette taille est presque toujours
 *    un message collé pour relecture, c'est-à-dire un CORPS ;
 *  · qui a la forme d'un message rédigé (formule d'appel ou de politesse) — idem ;
 *  · vide.
 *
 * Pour le reste, on sur-masque plutôt que de sous-masquer : coordonnées, identifiants légaux,
 * liens, et tout mot capitalisé hors début de phrase (nom de personne, d'entreprise, de ville).
 * ⚠️ Limite assumée : un nom SEUL en début de phrase (« Dupont a répondu ») n'est pas reconnu
 * sans contexte — le masque exige un second mot capitalisé.
 */

/** Au-delà, le tour ressemble à un message collé : jamais échantillonné. */
export const MAX_SAMPLED_TURN_CHARS = 500

/**
 * #2958.98 (DEC-4036 Q5) — la borne d'un CORPS versé sous l'exception nommée
 * (`eval-message-body-access.ts`) : la même que la lecture d'un fil par Laura, et que
 * `chat_eval_samples_text_length_check` (migration `ChatEvalSampleBodyException`).
 */
export const MAX_EVAL_MESSAGE_BODY_CHARS = 4000

const KEPT_ACRONYMS = new Set([
  'ESN',
  'DSI',
  'DAF',
  'DRH',
  'RH',
  'CRM',
  'ERP',
  'IA',
  'CV',
  'TJM',
  'RFP',
  'AO',
  'SIREN',
  'SIRET',
  'LinkedIn',
  'PME',
  'ETI',
  'CA',
  'KPI',
  'API',
  'SaaS',
  'CTO',
  'CEO',
  'COMEX',
  'BU',
  'FR',
  'EN',
])

const MESSAGE_SHAPE =
  /^\s*(bonjour|bonsoir|madame|monsieur|cher|chère|hello|dear)\b|\b(cordialement|bien à vous|best regards|kind regards|sincerely)\b/im

function maskIdentifiers(text: string): string {
  return text
    .replace(/https?:\/\/\S+|www\.\S+/gi, '[lien]')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[e-mail]')
    .replace(/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g, '[iban]')
    .replace(/(?:\+|00)?\d(?:[\s.()-]?\d){8,13}/g, match => {
      const digits = match.replace(/\D/g, '')
      return digits.length === 9 || digits.length === 14 ? '[identifiant]' : '[téléphone]'
    })
}

const CAPITALISED = /^[A-ZÀ-ÖØ-Þ][\p{L}'’-]*$/u

function isNameToken(token: string): boolean {
  return CAPITALISED.test(token) && !KEPT_ACRONYMS.has(token) && !/^[A-ZÀ-ÖØ-Þ]{2,}$/u.test(token)
}

function maskProperNouns(text: string): string {
  const tokens = text.split(/(\s+)/)
  let sentenceStart = true
  const out = [...tokens]
  for (let i = 0; i < tokens.length; i += 2) {
    const token = tokens[i] ?? ''
    const bare = token.replace(/^[("«]+|[),;:.!?"»]+$/g, '')
    const next = (tokens[i + 2] ?? '').replace(/^[("«]+|[),;:.!?"»]+$/g, '')
    if (bare && isNameToken(bare) && (!sentenceStart || isNameToken(next))) {
      out[i] = token.replace(bare, '[nom]')
    } else if (/^[A-ZÀ-ÖØ-Þ]{2,}$/u.test(bare) && !KEPT_ACRONYMS.has(bare) && !sentenceStart) {
      out[i] = token.replace(bare, '[nom]')
    }
    sentenceStart = /[.!?]$/.test(token) || /\n/.test(tokens[i + 1] ?? '')
  }
  return out.join('').replace(/(\[nom\]\s+)+\[nom\]/g, '[nom]')
}

export function anonymizeForEvalSample(text: string, opts: { allowMessageBody?: boolean } = {}): string | null {
  const trimmed = text.trim()
  // #2958.98 — sous l'exception nommée SEULEMENT, un corps de message est versé (masqué
  // comme le reste) ; sans elle, la forme d'un message et la longueur d'un corps refusent.
  const allowBody = opts.allowMessageBody === true
  if (!trimmed || trimmed.length > (allowBody ? MAX_EVAL_MESSAGE_BODY_CHARS : MAX_SAMPLED_TURN_CHARS)) return null
  if (!allowBody && MESSAGE_SHAPE.test(trimmed)) return null
  return maskProperNouns(maskIdentifiers(trimmed))
}
