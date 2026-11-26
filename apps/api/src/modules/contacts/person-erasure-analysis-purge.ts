import { normalizeFullName, normalizeLinkedinUrl } from './contact-identity'

/**
 * #2297.51 — L'ORGANIGRAMME PURGÉ TOUT DE SUITE (décision Louis du 19/09/2026).
 *
 * Jusqu'ici, l'effacement d'une personne laissait son nom dans le dossier déjà
 * calculé du compte (`accounts.raw_analysis`) jusqu'au prochain rejeu. C'était
 * un écart nommé de la doctrine de l'effacement ; il est levé : l'effacement
 * retire la personne du dossier, dans la même transaction, sans relancer
 * d'analyse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN PARCOURS COMPLET, ET PAS UNE LISTE DE CLÉS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le relevé des écrivains de `raw_analysis` qui stockent des personnes (git
 * grep du 19/09/2026) en compte au moins dix : le registre (`executives`,
 * `c_level`, `beneficial_owners` — prénom et nom SÉPARÉS), les contacts
 * classés (`contacts`), l'organigramme hérité du modèle (`org.organigramme`,
 * `org.decisionChain`, `org.stakeholderMap`, `org.approach_order` — des noms
 * dans des CHAÎNES), le graphe typé (`org.orgGraph` : `people`, puis des liens
 * par identifiant — arêtes, comité, chemin, point de départ), le plan
 * (`user_plan_actions`, par `contact_id`), et la prose (synthèses). Une liste
 * de clés se périme au premier écrivain ajouté, et une clé oubliée est un nom
 * conservé contre la loi. Le parcours lit TOUT le blob, et la règle ne dépend
 * que de ce qui désigne la personne.
 *
 * CE QUI LA DÉSIGNE, et rien de plus large :
 *   - un OBJET qui la porte : un champ de nom (ou prénom + nom) égal à l'un de
 *     ses noms COMPLETS, toutes graphies et tous ordres (`normalizeFullName`,
 *     la règle de `contactIdentityKeys`) ; ou son adresse, son profil, son
 *     identifiant fournisseur, l'identifiant d'une de ses fiches ;
 *   - un objet qui la RELIE (`personId`, `fromId`, `toId`, `contactId`… égal à
 *     l'identifiant d'un objet qui la porte) — une arête qui touche une
 *     personne effacée n'a plus de sens, et son identifiant la désigne ;
 *   - une CHAÎNE qui contient son nom complet, son adresse ou son profil.
 *
 * CE QU'ON EN FAIT :
 *   - dans une LISTE, l'élément part (une entrée de liste qui la nomme est une
 *     entrée sur elle : un acteur, un contact d'entité, un pas d'approche) ;
 *   - dans un objet, la propriété part quand elle n'est QUE elle (un nom, un
 *     identifiant, un objet qui la porte) ; une prose qui la cite garde son
 *     texte, son nom remplacé par `[…]`.
 *
 * ⚠️ Ce qui n'est PAS repéré, NOMMÉ : un prénom ou un nom SEUL (« Mme Perrin »,
 * « Claire a confirmé ») — le chercher effacerait toutes les Claire du compte,
 * la même limite que la mémoire de Laura. Et un homonyme complet DANS LE MÊME
 * COMPTE est retiré avec elle, la même portée que sa clé de nom.
 *
 * Pur : le dossier reçu n'est pas modifié, une copie est rendue.
 */
export type ErasedPersonIdentity = {
  fullNames: readonly (string | null | undefined)[]
  emails: readonly (string | null | undefined)[]
  linkedinUrls: readonly (string | null | undefined)[]
  apolloIds: readonly (string | null | undefined)[]
  /** Les identifiants de SES fiches (`contacts.id`). */
  contactIds: readonly string[]
}

const REDACTED = '[…]'

const NAME_FIELDS = ['fullName', 'full_name', 'name', 'displayName', 'contactName', 'contact_name', 'personName']
const FIRST_NAME_FIELDS = ['first_name', 'firstName', 'prenom']
const LAST_NAME_FIELDS = ['last_name', 'lastName', 'nom']
const EMAIL_FIELDS = ['email', 'emailAddress', 'email_address']
const LINKEDIN_FIELDS = ['linkedinUrl', 'linkedin_url', 'linkedin']
const APOLLO_FIELDS = ['apolloId', 'apollo_id']
const CONTACT_ID_FIELDS = ['contactId', 'contact_id']
/** Les champs par lesquels un objet en RELIE un autre (graphe, comité, chemin,
 *  pierre tombale d'organigramme). */
const RELATION_FIELDS = [
  'personId',
  'person_id',
  'fromId',
  'toId',
  'contactId',
  'contact_id',
  'sourceId',
  'managerId',
  'reportsToId',
]

const REMOVE = Symbol('remove')

type Matcher = {
  /** Noms normalisés (ordre écrit ET tokens triés). */
  names: Set<string>
  /** Suites de tokens cherchées dans la prose. */
  sequences: string[]
  emails: Set<string>
  linkedins: Set<string>
  apolloIds: Set<string>
  contactIds: Set<string>
}

function sortedTokens(normalized: string): string {
  return normalized.split(' ').sort().join(' ')
}

function buildMatcher(person: ErasedPersonIdentity): Matcher {
  const names = new Set<string>()
  const sequences = new Set<string>()
  for (const raw of person.fullNames) {
    // Un nom d'un seul mot n'est pas une identité (même règle que
    // `contactIdentityKeys` et que la mémoire de Laura).
    if ((raw ?? '').trim().split(/\s+/).filter(Boolean).length < 2) continue
    const normalized = normalizeFullName(raw)
    const tokens = normalized.split(' ').filter(Boolean)
    if (tokens.length < 2) continue
    names.add(normalized)
    names.add(sortedTokens(normalized))
    sequences.add(tokens.join(' '))
    sequences.add([...tokens].reverse().join(' '))
    sequences.add([tokens[tokens.length - 1], ...tokens.slice(0, -1)].join(' '))
  }
  const clean = (values: readonly (string | null | undefined)[]) =>
    new Set(values.map(value => (value ?? '').trim().toLowerCase()).filter(Boolean))
  return {
    names,
    sequences: [...sequences],
    emails: new Set([...clean(person.emails)].filter(email => email.includes('@'))),
    linkedins: new Set(person.linkedinUrls.map(url => normalizeLinkedinUrl(url)).filter(Boolean)),
    apolloIds: clean(person.apolloIds),
    contactIds: new Set(person.contactIds),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringField(record: Record<string, unknown>, fields: readonly string[]): string[] {
  return fields.map(field => record[field]).filter((value): value is string => typeof value === 'string')
}

function isName(value: string, matcher: Matcher): boolean {
  const normalized = normalizeFullName(value)
  return normalized.includes(' ') && (matcher.names.has(normalized) || matcher.names.has(sortedTokens(normalized)))
}

/** Cet objet PORTE-t-il la personne (son nom complet, ou une clé forte) ? */
function carriesPerson(record: Record<string, unknown>, matcher: Matcher): boolean {
  if (stringField(record, NAME_FIELDS).some(name => isName(name, matcher))) return true
  const first = stringField(record, FIRST_NAME_FIELDS)[0]
  const last = stringField(record, LAST_NAME_FIELDS)[0]
  if (first && last && isName(`${first} ${last}`, matcher)) return true
  if (stringField(record, EMAIL_FIELDS).some(email => matcher.emails.has(email.trim().toLowerCase()))) return true
  if (stringField(record, LINKEDIN_FIELDS).some(url => matcher.linkedins.has(normalizeLinkedinUrl(url)))) return true
  if (stringField(record, APOLLO_FIELDS).some(id => matcher.apolloIds.has(id.trim().toLowerCase()))) return true
  return stringField(record, CONTACT_ID_FIELDS).some(id => matcher.contactIds.has(id))
}

/** Premier passage : les identifiants des objets qui la portent (un nœud du
 *  graphe, une ligne du registre) — ce par quoi les AUTRES objets la relient. */
function collectIds(node: unknown, matcher: Matcher, ids: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectIds(item, matcher, ids)
    return
  }
  if (!isRecord(node)) return
  if (carriesPerson(node, matcher) && typeof node['id'] === 'string') ids.add(node['id'])
  for (const value of Object.values(node)) collectIds(value, matcher, ids)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * La prose, son nom retiré. La recherche se fait sur la forme NORMALISÉE
 * (accents, casse, tirets, ordre « NOM Prénom ») ; le remplacement, sur le
 * texte d'origine, grâce à la correspondance caractère par caractère.
 */
function redactNames(text: string, matcher: Matcher): string {
  const whole = ` ${normalizeFullName(text)} `
  const present = matcher.sequences.filter(sequence => whole.includes(` ${sequence} `))
  if (present.length === 0) return text

  let normalized = ''
  const origin: number[] = []
  const chars = Array.from(text)
  let offset = 0
  const starts: number[] = []
  for (const char of chars) {
    starts.push(offset)
    offset += char.length
  }
  chars.forEach((char, index) => {
    // Un accent déjà décomposé (texte en NFD) appartient à la lettre d'avant :
    // ce n'est pas un séparateur.
    if (/^\p{M}$/u.test(char)) return
    const piece = normalizeFullName(char) || ' '
    if (piece === ' ' && (normalized.length === 0 || normalized.endsWith(' '))) return
    for (const letter of piece) {
      normalized += letter
      origin.push(index)
    }
  })

  const spans: Array<[number, number]> = []
  for (const sequence of present) {
    let from = 0
    for (;;) {
      const at = normalized.indexOf(sequence, from)
      if (at < 0) break
      const end = at + sequence.length
      const boundedLeft = at === 0 || normalized[at - 1] === ' '
      const boundedRight = end === normalized.length || normalized[end] === ' '
      if (boundedLeft && boundedRight) {
        const first = origin[at] as number
        const last = origin[end - 1] as number
        spans.push([starts[first] as number, (starts[last] as number) + (chars[last] as string).length])
      }
      from = at + 1
    }
  }
  spans.sort((a, b) => a[0] - b[0])
  let out = ''
  let cursor = 0
  for (const [start, end] of spans) {
    if (start < cursor) continue
    out += text.slice(cursor, start) + REDACTED
    cursor = end
  }
  return out + text.slice(cursor)
}

function redactStrongKeys(text: string, matcher: Matcher): string {
  let out = text
  for (const email of matcher.emails) out = out.replace(new RegExp(escapeRegExp(email), 'gi'), REDACTED)
  for (const profile of matcher.linkedins) {
    const path = escapeRegExp(profile.replace(/^linkedin\.com/, ''))
    out = out.replace(
      new RegExp(`(?:https?://)?(?:[a-z0-9-]+\\.)?linkedin\\.com${path}(?=$|[/?#\\s"'<>)])[^\\s"'<>)]*`, 'gi'),
      REDACTED,
    )
  }
  return out
}

/** Une clé qui porte un IDENTIFIANT (`id`, `personId`, `memberIds`, `contact_id`…). */
const REFERENCE_KEY = /(^id$|Id$|_id$|Ids$|_ids$)/

function cleanString(
  text: string,
  inList: boolean,
  key: string | null,
  matcher: Matcher,
  ids: ReadonlySet<string>,
): string | typeof REMOVE {
  if (matcher.contactIds.has(text)) return REMOVE
  // L'identifiant d'un nœud qui la porte ne compte que là où la clé DIT
  // « identifiant » : un nœud nommé « 1 » ne doit pas emporter tous les « 1 »
  // du dossier (un niveau, un rang).
  if (key !== null && REFERENCE_KEY.test(key) && ids.has(text)) return REMOVE
  if (isName(text, matcher)) return REMOVE
  if (matcher.emails.has(text.trim().toLowerCase())) return REMOVE
  if (matcher.linkedins.size > 0 && matcher.linkedins.has(normalizeLinkedinUrl(text))) return REMOVE
  const redacted = redactStrongKeys(redactNames(text, matcher), matcher)
  if (redacted === text) return text
  return inList ? REMOVE : redacted
}

function clean(
  node: unknown,
  inList: boolean,
  key: string | null,
  matcher: Matcher,
  ids: ReadonlySet<string>,
): unknown {
  if (typeof node === 'string') return cleanString(node, inList, key, matcher, ids)
  if (Array.isArray(node)) {
    return node.map(item => clean(item, true, key, matcher, ids)).filter(item => item !== REMOVE)
  }
  if (!isRecord(node)) return node
  if (carriesPerson(node, matcher)) return REMOVE
  const relatesToHer = RELATION_FIELDS.some(field => {
    const value = node[field]
    return typeof value === 'string' && (ids.has(value) || matcher.contactIds.has(value))
  })
  if (relatesToHer) return REMOVE
  const out: Record<string, unknown> = {}
  for (const [property, value] of Object.entries(node)) {
    // Un index par personne (`{ "Claire Perrin": … }`) : la clé la nomme.
    if (isName(property, matcher)) continue
    const cleaned = clean(value, false, property, matcher, ids)
    if (cleaned !== REMOVE) out[property] = cleaned
  }
  return out
}

/**
 * #2297.51 — retire la personne effacée de ce dossier (voir l'en-tête). Rend
 * une copie, et `changed` pour que l'appelant n'écrive rien quand elle n'y
 * figurait pas.
 */
export function purgePersonFromAnalysis<T>(value: T, person: ErasedPersonIdentity): { value: T; changed: boolean } {
  const matcher = buildMatcher(person)
  const ids = new Set<string>()
  collectIds(value, matcher, ids)
  const cleaned = clean(value, false, null, matcher, ids)
  const result = (cleaned === REMOVE ? null : cleaned) as T
  return { value: result, changed: JSON.stringify(result) !== JSON.stringify(value) }
}

/**
 * #2297.51 — LES IDENTIFIANTS DE GRAPHE QUI LA PORTENT dans un ou plusieurs
 * dossiers (typiquement `raw_analysis` et `previous_raw_analysis`) : le nœud
 * `orgGraph.people[].id` qui EST elle. C'est le MÊME identifiant que
 * `object_id` d'une correction `person` du ledger `org_graph_corrections`, et
 * l'un des deux bouts d'un lien `from|type|to` pour une correction `edge` —
 * ce ledger est une table À PART, jamais parcourue par `purgePersonFromAnalysis`
 * ci-dessus, et c'est pour ELLE que cette fonction existe
 * (`person-erasure-corrections-purge.ts`).
 *
 * Inclut aussi `person.contactIds` : une correction posée avant que le graphe
 * n'existe encore (ou saisie par un chemin qui a désigné l'objet par
 * `contact_id`) reste retrouvable.
 */
export function erasedPersonGraphNodeIds(values: readonly unknown[], person: ErasedPersonIdentity): Set<string> {
  const matcher = buildMatcher(person)
  const ids = new Set<string>(person.contactIds)
  for (const value of values) collectIds(value, matcher, ids)
  return ids
}
