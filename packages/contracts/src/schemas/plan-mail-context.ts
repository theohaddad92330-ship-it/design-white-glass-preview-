/**
 * #4521 — ce qu'une carte e-mail issue du plan doit montrer SANS lire la consigne : qui (le contact résolu par
 * son nom) et pourquoi (le signal cité). Un seul lecteur pour l'API (qui porte ces champs sur l'item) et pour
 * l'onglet Plan (`selectPlanSteps`, #4415) — GA-26 : le nom ne se rapproche pas de deux façons.
 */

/** Casse, accents, rôle entre parenthèses et espaces ne distinguent pas deux écritures d'un même nom. */
function nameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\([^)]*\)/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function findContactByName<T extends { full_name: string | null }>(
  contacts: readonly T[],
  recipient: string,
): T | null {
  const exact = contacts.find(c => c.full_name === recipient)
  if (exact) return exact
  const key = nameKey(recipient)
  return key ? (contacts.find(c => nameKey(c.full_name ?? '') === key) ?? null) : null
}

function textKey(text: string): string {
  return ` ${text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `
}

/**
 * Le contact dont le NOM COMPLET (deux mots au moins) figure dans la consigne — pour les étapes écrites avant que
 * `contact_id` soit résolu à la création. Le nom le plus long gagne (« Paul Durand » dans « Paul Durand Martin ») ;
 * plusieurs noms distincts cités, un prénom seul ou aucun nom : `null` — jamais un destinataire deviné.
 */
export function findContactNamedIn<T extends { full_name: string | null }>(
  contacts: readonly T[],
  text: string | null | undefined,
): T | null {
  if (!text) return null
  const haystack = textKey(text)
  const named = contacts
    .map(contact => ({ contact, key: textKey(contact.full_name ?? '').trim() }))
    .filter(entry => entry.key.includes(' ') && haystack.includes(` ${entry.key} `))
  const longest = named.filter(entry => !named.some(other => other !== entry && other.key.includes(entry.key)))
  return longest.length === 1 ? (longest[0]?.contact ?? null) : null
}

const SIGNAL_PATTERN = /signal(?:\s+factuel)?\s+(?:du|de la|de l['’]|des|de|d['’])\s*([^()]+?)\s*\(([^)]{2,})\)/i
const FROM_TO = /^(.+?\d.*?)\s+(?:à|->|→)\s+(.+?\d.*)$/

/**
 * Le signal cité par la consigne du plan (« …en s'appuyant sur le signal factuel du repli de CA (72,4 M€ à 69,1 M€) »)
 * en UNE ligne : « Repli de CA : 72,4 M€ → 69,1 M€ ». `null` quand la consigne n'en cite pas, ou sans détail
 * entre parenthèses : on ne fabrique pas un signal.
 */
export function readPlanSignal(text: string | null | undefined): string | null {
  const match = text ? SIGNAL_PATTERN.exec(text) : null
  if (!match) return null
  const subject = match[1]?.trim() ?? ''
  const detail = match[2]?.trim() ?? ''
  if (!subject || !detail) return null
  const range = FROM_TO.exec(detail)
  const shown = range ? `${range[1]} → ${range[2]}` : detail
  return `${subject.charAt(0).toUpperCase()}${subject.slice(1)} : ${shown}`
}
