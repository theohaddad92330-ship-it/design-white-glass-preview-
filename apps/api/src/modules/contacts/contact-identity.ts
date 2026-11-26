/**
 * Contact identity — the ONE place that decides "are these two rows the same
 * human?".
 *
 * Every dedup path used `full_name.trim().toLowerCase()` and nothing else. That
 * key is blind to accents, so "Sébastien Chauffray" (web search) and "Sebastien
 * Chauffray" (Apollo) both landed on the same account as separate contacts —
 * visible to the user in the contacts table. It is equally blind to the
 * hyphen/space split of compound first names, to Pappers' "NOM Prénom" ordering,
 * and it ignores the identifiers that are actually unambiguous: the email, the
 * LinkedIn profile URL and the phone number (#2380.45).
 *
 * Mirrors `apps/ia/app/services/text_norm.py::normalize_name` (NFKD → strip
 * combining marks → lowercase → collapse whitespace) so the Python pipeline and
 * the Node persistence agree byte-for-byte on what a duplicate is.
 */

/**
 * NFKD, strip diacritics, lowercase, punctuation → space, collapse whitespace.
 *
 * `"Jean-Pierre D'Arcy"` → `"jean pierre d arcy"`.
 */
// Unicode has no decomposition for these, so NFKD leaves them intact and
// "Lœuvre" would never match "Loeuvre". All of them occur in French/Nordic names.
const LIGATURES: ReadonlyArray<readonly [RegExp, string]> = [
  [/œ/gi, 'oe'],
  [/æ/gi, 'ae'],
  [/ø/gi, 'o'],
  [/ß/g, 'ss'],
  [/đ/gi, 'd'],
  [/ł/gi, 'l'],
]

export function normalizeFullName(raw: string | null | undefined): string {
  if (!raw) return ''
  let value = String(raw)
  for (const [pattern, replacement] of LIGATURES) value = value.replace(pattern, replacement)
  return (
    value
      .normalize('NFKD')
      // Combining marks left behind by NFKD (the accent of "é", the cedilla of "ç").
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      // Anything that is not a letter or digit separates tokens. Covers hyphens,
      // apostrophes (straight AND typographic), dots, commas.
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .replace(/\s+/g, ' ')
  )
}

/**
 * How many diacritics a spelling still carries.
 *
 * NFKD splits "é" into "e" + U+0301; counting the combining marks left over
 * measures how much of the original orthography survived. Used ONLY to compare
 * two spellings of the same name — never to produce one.
 */
function diacriticCount(value: string): number {
  return (value.normalize('NFKD').match(/[̀-ͯ]/g) ?? []).length
}

/**
 * Choose between two observed spellings of the SAME person's name.
 *
 * The production incident this exists for: the dedup merge ranked survivors by
 * how many columns were filled and never looked at the name itself, so the row
 * carrying "Sébastien Chauffray" was deleted and the one carrying "Sebastien
 * Chauffray" survived. Same for {@link mergeSeedInto}, which simply kept
 * whichever spelling had been stored first.
 *
 * The rule is an ORDERING over values that already exist, never a rewrite:
 * de-accenting is lossy and one-way, so between two spellings that normalise to
 * the same key the one with more diacritics is the one closer to the source.
 * Ties keep the incumbent — casing ("BOMMARITO" vs "Bommarito") is a different
 * axis and guessing it would be inventing data.
 *
 * If the two names do NOT normalise to the same key they are not spelling
 * variants but different people, and the incumbent is kept untouched.
 */
export function pickRicherName(current: string | null | undefined, candidate: string | null | undefined): string {
  const a = (current ?? '').trim()
  const b = (candidate ?? '').trim()
  if (!b) return a
  if (!a) return b
  // Never swap one human's name for another's, whatever the accent count.
  if (normalizeFullName(a) !== normalizeFullName(b)) return a
  return diacriticCount(b) > diacriticCount(a) ? b : a
}

/**
 * Canonical LinkedIn profile identity: protocol, `www.`/`fr.` subdomain, query
 * string, trailing slash and case all stripped. Two sources citing the same
 * profile produce the same string.
 */
export function normalizeLinkedinUrl(raw: string | null | undefined): string {
  if (!raw) return ''
  const trimmed = String(raw).trim().toLowerCase()
  if (!trimmed) return ''
  return trimmed
    .replace(/^https?:\/\//, '')
    .replace(/^[a-z0-9-]+\.linkedin\.com/, 'linkedin.com')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
}

/**
 * Canonical phone identity — digits only, country code resolved.
 *
 * #2380.45 — Pappers cite un numéro local ("01 02 03 04 05"), Apollo/Dropcontact
 * le même en international ("+33102030405") : sans normalisation, le même
 * humain porte deux numéros et jamais ne se fusionne dessus. Un dix-chiffres
 * commençant par 0 est traité comme un national FRANÇAIS et reçoit le préfixe
 * `+33` — c'est la seule reconstruction faite, jamais un numéro DEVINÉ à partir
 * de rien. Un numéro déjà international garde SON indicatif, jamais remplacé
 * par +33 : on ne sait pas d'où il vient.
 *
 * Sous huit chiffres, `''` : trop court pour être un numéro, ce serait publier
 * une clé qui collisionne avec un extrait de standard ou un fragment de saisie.
 */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return ''
  const trimmed = String(raw).trim()
  if (!trimmed) return ''
  const hasPlus = trimmed.trimStart().startsWith('+')
  const digits = trimmed.replace(/[^0-9]/g, '')
  if (digits.length < 8) return ''
  if (!hasPlus && digits.length === 10 && digits.startsWith('0')) return `+33${digits.slice(1)}`
  return hasPlus ? `+${digits}` : digits
}

type ContactIdentityInput = {
  fullName?: string | null
  email?: string | null
  linkedinUrl?: string | null
  phone?: string | null
  /** Apollo person id. Present on every People-Search hit, and the only
   *  identifier that survives the search tier obfuscating the last name. */
  apolloId?: string | null
}

/**
 * Every key under which this contact should be recognised, strongest first.
 *
 * Two contacts are the same human when they share ANY key. Keys are namespaced
 * (`apollo:` / `email:` / `li:` / `tel:` / `name:`) so a name can never
 * accidentally collide with an email. Returns `[]` when the contact carries no usable
 * identifier at all — such a row is never merged into anything.
 */
export function contactIdentityKeys(c: ContactIdentityInput): string[] {
  const keys: string[] = []

  const apolloId = (c.apolloId ?? '').trim().toLowerCase()
  if (apolloId) keys.push(`apollo:${apolloId}`)

  const email = (c.email ?? '').trim().toLowerCase()
  if (email.includes('@')) keys.push(`email:${email}`)

  const linkedin = normalizeLinkedinUrl(c.linkedinUrl)
  if (linkedin) keys.push(`li:${linkedin}`)

  const phone = normalizePhone(c.phone)
  if (phone) keys.push(`tel:${phone}`)

  const name = normalizeFullName(c.fullName)
  // A LONE first name is not an identity — Apollo's search tier obfuscates the
  // last name, so publishing `name:severine` would merge every Séverine of the
  // account into one row. With an Apollo id in hand we already have a stronger,
  // exact key, so the ambiguous one is simply not published. A real (multi-token)
  // name is still keyed: it is what matches the Pappers / web row for the same
  // person, which carries no Apollo id.
  // Counted on the RAW name like `isIdentifiablePerson` does: "Jean-François"
  // normalises to two tokens but is one first name.
  const nameIsLoneToken = (c.fullName ?? '').trim().split(/\s+/).filter(Boolean).length < 2
  if (name && !(apolloId && nameIsLoneToken)) {
    keys.push(`name:${name}`)
    // Sorted tokens catch the source-ordering flip: Pappers assembles
    // `nom + prenom` ("DUPONT Jean") where Apollo emits "Jean Dupont". Only
    // added as an EXTRA key — it never removes the exact-order match, and two
    // people whose names are anagrams of each other's word order are rare
    // enough that collapsing them beats showing the same person twice.
    const sorted = name.split(' ').sort().join(' ')
    if (sorted !== name) keys.push(`name:${sorted}`)
  }

  return keys
}

/**
 * Is this seed a person we can actually point at?
 *
 * Production carries rows whose entire name is "Frederic", "Gerard", "Gaelle",
 * "Jerome", "Sebastien" — a source emitted a first name with no surname. Such a
 * row identifies nobody, and it cannot be repaired later: merging "Sebastien"
 * into "Sebastien Chauffray" is a GUESS, and two Sébastiens in one company is
 * ordinary, so that guess destroys data when it is wrong. The only safe moment
 * to act is before the row exists.
 *
 * A single token is accepted when an email, a LinkedIn URL or an APOLLO PERSON ID
 * backs it — those are unambiguous identities, and the thin name is then merely a
 * display label.
 *
 * The Apollo id matters because Apollo's People-Search tier returns `first_name`
 * plus an obfuscated last name (`"Mo***y"`): every hit of a 1379-people account
 * arrives as a lone first name. Without the id in this rule the guard rejected
 * the entire Apollo yield and accounts kept only their registry mandataires. With
 * it, a People-Match by id reveals the real name, email and LinkedIn — so the row
 * is resolvable, which is exactly what "identifiable" means here.
 *
 * Token counting is deliberately on whitespace, not on the normalised key:
 * "Jean-François" normalises to two tokens but is one first name. Splitting on
 * whitespace errs toward KEEPING the row, which is the direction we want when
 * in doubt.
 */
export function isIdentifiablePerson(c: ContactIdentityInput): boolean {
  const name = (c.fullName ?? '').trim()
  // Nothing to display is not a contact, whatever identifier backs it.
  if (!normalizeFullName(name)) return false

  const email = (c.email ?? '').trim()
  if (email.includes('@')) return true
  if (normalizeLinkedinUrl(c.linkedinUrl)) return true
  if ((c.apolloId ?? '').trim()) return true

  return name.split(/\s+/).filter(Boolean).length >= 2
}

/**
 * Choose between an existing stored value and a newly-arrived one.
 *
 * `bulkInsert` used to drop the whole incoming row when the name already
 * existed, so whichever source landed FIRST owned `title` / `linkedin_url`
 * forever. Pappers runs before Apollo, so a contact kept the legal registry role
 * ("Président du conseil d'administration") and lost the operational title, the
 * LinkedIn URL and the photo Apollo had for them.
 *
 * Rule: a non-empty value beats an empty one; between two non-empty values the
 * more specific (longer) one wins, ignoring placeholder dashes.
 */
export function pickRicher(current: string | null | undefined, candidate: string | null | undefined): string | null {
  const a = (current ?? '').trim()
  const b = (candidate ?? '').trim()
  // "-" and "—" are placeholders some sources emit for "unknown".
  const meaningful = (v: string): boolean => v.length > 0 && !/^[-—–]+$/.test(v)

  if (!meaningful(a) && !meaningful(b)) return null
  if (!meaningful(a)) return b
  if (!meaningful(b)) return a
  return b.length > a.length ? b : a
}

/**
 * Le nom porte-t-il une identité COMPLÈTE, c'est-à-dire un patronyme ?
 *
 * Différent de {@link isIdentifiablePerson}, et la nuance décide de l'ordre de
 * la liste. Cette fonction-là répond à « peut-on stocker cette ligne sans
 * risquer de confondre deux personnes ? » — un identifiant Apollo suffit. Celle
 * -ci répond à « le commercial peut-il s'en servir ? », et la réponse est non
 * quand il ne lit qu'un prénom.
 *
 * Mesuré sur un run réel (Société Générale, 10/08/2026) : les DOUZE contacts les
 * mieux classés du dossier étaient des prénoms seuls — « Willy — Chief
 * Information Officer », « Vlad — CISO ». L'offre de recherche Apollo masque le
 * nom de famille (`"Mo***y"`), et rien dans le classement ne le voyait : un
 * prénom seul avec un beau titre marquait autant qu'une fiche complète, et
 * passait donc devant.
 *
 * Le découpage se fait sur les espaces, comme dans `isIdentifiablePerson` :
 * « Jean-François » est un seul prénom. Une adresse professionnelle vaut
 * identité complète — elle porte presque toujours le patronyme et permet, elle,
 * d'écrire à quelqu'un.
 */
export function hasCompleteIdentity(c: ContactIdentityInput): boolean {
  const name = (c.fullName ?? '').trim()
  if (!name) return false
  if (name.split(/\s+/).filter(Boolean).length >= 2) return true
  return (c.email ?? '').trim().includes('@')
}

/** La forme minimale que le tri lit d'une fiche. */
type SortableContact = { full_name?: string | null; email?: string | null; priority?: number | null }

/**
 * Ordonne une liste de contacts : d'abord ceux dont on peut se servir.
 *
 * STABLE et conservateur : rien n'est retiré, seul l'ordre change. À complétude
 * d'identité égale, l'ordre d'entrée est préservé — c'est déjà celui de la
 * priorité assignée par la classification, et le tri n'a pas à en juger.
 *
 * Volontairement PAS un filtre. Un prénom seul accompagné d'un titre reste une
 * piste — savoir qu'un directeur des systèmes d'information existe a de la
 * valeur même sans son nom. Ce n'est simplement pas ce qu'on montre en premier.
 */
export function sortByUsableIdentity<T extends SortableContact>(rows: readonly T[]): T[] {
  return [...rows]
    .map((row, index) => ({ row, index, usable: hasCompleteIdentity({ fullName: row.full_name, email: row.email }) }))
    .sort((a, b) => (a.usable === b.usable ? a.index - b.index : a.usable ? -1 : 1))
    .map(entry => entry.row)
}
