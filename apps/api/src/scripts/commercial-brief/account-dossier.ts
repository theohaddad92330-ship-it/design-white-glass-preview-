import type { CommercialBrief } from '@bellum/contracts'

/**
 * CŒUR PARTAGÉ des convertisseurs de DOSSIERS DE COMPTE (15/10/2026).
 *
 * Le dossier Orange (12/10) avait son convertisseur ; Théo en a déposé quatre autres le 15/10 (Crédit Agricole, VINCI,
 * Enedis, Safran), chacun d'une forme différente. Plutôt que quatre copies, ce module tient ce qui vaut pour TOUS : la
 * lecture du CSV, la règle « une clé source est mappée OU écartée avec sa raison » (jamais ignorée en silence), le
 * nettoyage du texte (ESN prospect jamais nommée, base interne et fournisseurs jamais nommés), les personnes (seules les
 * adresses du domaine du groupe sont semées, la liste noire du CRM est respectée), la section des sources. Chaque compte
 * n'écrit plus que son MAPPING (`dossiers/<compte>.ts`).
 *
 * Décisions tranchées (Louis, 15/10/2026, brief « 4 dossiers ») : rien d'inventé ; « non trouvé » et niveaux de confiance
 * recopiés tels quels ; coordonnées professionnelles en clair ; l'ESN prospect de la démo (Soluxan, MK4 Technova, Experis,
 * JEMS) est neutralisée comme OneSide/Alpineo — une phrase qui la nomme n'est pas affichée, sa stratégie est écartée.
 */

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json }
export type JsonObject = { [key: string]: Json }
type Cell = string | number | boolean | null
type Section = CommercialBrief['sections'][number]
type Person = CommercialBrief['people'][number]
type PersonRole = NonNullable<Person['role']>
type CoverageLine = { sheet: string; field: string; rows: number; note: string }

export type DossierConversion = {
  brief: CommercialBrief
  coverage: CoverageLine[]
  skipped: Record<string, number>
  anomalies: string[]
}

/* ------------------------------------------------------------------ */
/* Lecture CSV                                                          */
/* ------------------------------------------------------------------ */

/** CSV `;` avec guillemets doubles, BOM toléré. Une ligne vide est ignorée. */
export function parseSemicolonCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const source = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        field += '"'
        i += 1
      } else if (char === '"') quoted = false
      else field += char
    } else if (char === '"') quoted = true
    else if (char === ';') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1
      row.push(field)
      field = ''
      if (row.some(cell => cell.length > 0)) rows.push(row)
      row = []
    } else field += char
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    if (row.some(cell => cell.length > 0)) rows.push(row)
  }
  const header = rows[0]
  if (!header) throw new Error('CSV vide')
  return rows.slice(1).map(cells => Object.fromEntries(header.map((name, i) => [name.trim(), (cells[i] ?? '').trim()])))
}

/* ------------------------------------------------------------------ */
/* Aides                                                                */
/* ------------------------------------------------------------------ */

const NBSP = '\u00a0'

/** Minuscules, sans accent, ponctuation → espace : la clé de dédoublonnage des noms. */
export const norm = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** 4.88 → « 4,88 » ; 25000 → « 25 000 » (espace insécable). */
export const frNumber = (value: number): string => {
  const [integer = '', decimals] = String(value).split('.')
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)
  return decimals ? `${grouped},${decimals}` : grouped
}

export const joinParts = (parts: readonly (string | false | null | undefined)[], separator: string): string =>
  parts.filter((part): part is string => typeof part === 'string' && part.trim().length > 0).join(separator)

/** `https:/www.linkedin.com/…` (une barre perdue dans l'export) → `https://www.linkedin.com/…`. */
export const fixUrl = (value: string): string => value.replace(/^(https?):\/(?!\/)/i, '$1://')

export const cellText = (value: string | undefined | null): string | undefined => {
  const trimmed = (value ?? '').trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export const column = (key: string, label: string): { key: string; label: string } => ({ key, label })

const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Lit un objet JSON ; lève s'il n'en est pas un (une forme inattendue ne se devine pas). */
export function asObject(value: Json | undefined, where: string): JsonObject {
  if (!isObject(value)) throw new Error(`${where} : objet attendu`)
  return value
}

/** Lit une liste d'objets JSON ; lève sinon. */
export function asObjects(value: Json | undefined, where: string): JsonObject[] {
  if (!Array.isArray(value)) throw new Error(`${where} : liste attendue`)
  return value.map((item, index) => asObject(item, `${where}[${index}]`))
}

/** Lit une chaîne JSON ; lève sinon. */
export function asString(value: Json | undefined, where: string): string {
  if (typeof value !== 'string') throw new Error(`${where} : texte attendu`)
  return value
}

/** Lit une liste de paires `[libellé, nombre]` (séries des graphiques). */
export function asPairs(value: Json | undefined, where: string): { label: string; value: number }[] {
  if (!Array.isArray(value)) throw new Error(`${where} : liste de paires attendue`)
  return value.map((pair, index) => {
    if (!Array.isArray(pair) || typeof pair[0] !== 'string' || typeof pair[1] !== 'number')
      throw new Error(`${where}[${index}] : paire [libellé, nombre] attendue`)
    return { label: pair[0], value: pair[1] }
  })
}

/* ------------------------------------------------------------------ */
/* Texte affiché : ESN prospect, base interne, fournisseurs              */
/* ------------------------------------------------------------------ */

/**
 * Réécritures des noms INTERNES : la base s'appelle « base interne », jamais par son nom de code ; un identifiant de
 * compte interne ne se lit pas ; un fournisseur de données ne se nomme jamais (doctrine). L'ordre compte : le plus
 * précis d'abord.
 */
const INTERNAL_REWRITES: readonly (readonly [RegExp, string])[] = [
  // Balises de mise en forme de la page HTML du pack, restées dans un texte : jamais affichées telles quelles.
  [/<\/?(?:b|strong|i|em|span|br)\b[^>]*>/gi, ''],
  [/\(ORION (\d{2}\/\d{2}\/\d{4})\)/g, '(relevé du $1)'],
  [/BELLUM MARKET MEMORY(?: v\d+(?:\.\d+)*[a-z]?)?/gi, 'base interne de l’espace'],
  [/faits ORION\/DataForge|ORION\/DataForge/gi, 'faits de marché'],
  [/\b(?:fichiers?|base|données) ORION(?: V\d+)?\b/gi, 'base interne'],
  [/\bORION(?: V\d+)?\b/g, 'base interne'],
  [/\bCRM Belloum\b/gi, 'CRM interne'],
  [/\bbase BELLUM\b/gi, 'base interne'],
  [/\s*\(?\bBM-[AN]-[\w-]+\)?/g, ''],
  [/\bPappers\b/g, 'registre des entreprises'],
  [/\bsociete\.com\b/gi, 'annuaire d’entreprises'],
]

/** Ce qui ne se lit JAMAIS à l'écran, après réécriture : la phrase qui le porte est retirée. */
export const FORBIDDEN_INTERNAL =
  /market\s*memory|\borion\b|dataforge|belloum|\bbellum|\bBM-[AN]-|pappers|societe\.com|\bapollo\b|firecrawl|theirstack|lusha|kaspr|dropcontact/i

/**
 * Les ABRÉVIATIONS de confiance des packs (`nt`, `fich`, `li`) → le libellé que leur page de projection affiche (même
 * table que `build_page_*.py` du pack). Les autres niveaux (`fort`, `moyen`, `faible`…) sont recopiés tels quels.
 */
const CONFIDENCE_ABBREVIATIONS: Readonly<Record<string, string>> = {
  nt: 'non trouvé',
  fich: 'documents de compte',
  li: 'LinkedIn, non confirmé',
}

export const confidenceLabel = (value: Json | undefined): Cell =>
  typeof value === 'string' ? (CONFIDENCE_ABBREVIATIONS[value] ?? (value.trim() || null)) : null

/** Coupe un paragraphe en phrases (point, point d'exclamation ou d'interrogation suivi d'une majuscule ou d'un chiffre). */
const splitSentences = (text: string): string[] =>
  text.split(/(?<=[.!?…])\s+(?=[A-ZÀ-ÖØ-Þ«"(0-9])/).filter(sentence => sentence.trim().length > 0)

/** Le début d'une phrase qui reprend la précédente (pronom, alternative) : elle ne tient pas seule. */
const CONTINUATION = /^(?:Il|Elle|Ils|Elles|Cela|Ceci|Celui-ci|Celle-ci|Sinon|Si oui|Si non|Dans ce cas)\b/

type DossierTextRules = {
  /** L'ESN prospect de la démo ET son interlocuteur : la phrase qui les nomme n'est jamais affichée. */
  prospect: RegExp
}

/**
 * Le contexte d'UNE conversion : ce qui est écarté (et pourquoi), ce qui est couvert, les anomalies de la source, et la
 * comptabilité des clés de premier niveau du dossier (une clé non traitée fait échouer).
 */
export class DossierContext {
  readonly skipped: Record<string, number> = {}
  readonly anomalies: string[] = []
  readonly coverage: CoverageLine[] = []
  private readonly consumed = new Set<string>()

  constructor(readonly rules: DossierTextRules) {}

  skip(reason: string, n = 1): void {
    if (n <= 0) return
    this.skipped[reason] = (this.skipped[reason] ?? 0) + n
  }

  cover(sheet: string, field: string, rows: number, note = ''): void {
    this.coverage.push({ sheet, field, rows, note })
  }

  /** Une clé de premier niveau LUE. Absente = erreur : elle ne se devine pas. */
  take(account: JsonObject, key: string): Json {
    if (!(key in account)) throw new Error(`dossier : « ${key} » absent`)
    this.consumed.add(key)
    return account[key] as Json
  }

  /** Une clé de premier niveau ÉCARTÉE, avec sa raison (comptée au README). */
  drop(account: JsonObject, key: string, reason: string): void {
    if (!(key in account)) throw new Error(`dossier : « ${key} » absent (écartée sans exister)`)
    this.consumed.add(key)
    this.skip(`clé « ${key} » : ${reason}`)
  }

  assertAllConsumed(account: JsonObject): void {
    const missing = Object.keys(account).filter(key => !this.consumed.has(key))
    if (missing.length > 0)
      throw new Error(
        `dossier : clé(s) ni mappée(s) ni écartée(s) : ${missing.join(', ')} — ajouter une case ou une raison`,
      )
  }

  /**
   * Le texte tel qu'il s'affiche : noms internes réécrits, puis chaque PHRASE qui nomme l'ESN prospect (ou son
   * interlocuteur) ou une source interne restante est retirée — et comptée. Rend '' si plus rien ne reste.
   */
  text(value: string): string {
    const rewritten = INTERNAL_REWRITES.reduce(
      (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
      value,
    )
    const paragraphs = rewritten.split(/\n+/).map(paragraph => {
      // Une phrase qui ne fait que POURSUIVRE une phrase retirée (« Il occupe le build. », « Sinon, … ») part avec elle :
      // seule, elle parlerait de quelqu'un que l'écran ne nomme plus.
      let previousDropped = false
      return splitSentences(paragraph.trim())
        .filter(sentence => {
          if (this.rules.prospect.test(sentence)) {
            this.skip('phrase qui nomme l’ESN prospect de la démo ou son interlocuteur : non affichée')
            previousDropped = true
            return false
          }
          if (FORBIDDEN_INTERNAL.test(sentence)) {
            this.skip('phrase qui nomme une source interne : non affichée')
            previousDropped = true
            return false
          }
          if (previousDropped && CONTINUATION.test(sentence)) {
            this.skip('phrase qui poursuit une phrase non affichée : non affichée')
            return false
          }
          previousDropped = false
          return true
        })
        .join(' ')
    })
    return paragraphs
      .filter(paragraph => paragraph.length > 0)
      .join('\n')
      .trim()
  }

  /** `text()` qui rend `null` au lieu d'une chaîne vide (cellule de section). */
  cell(value: Json | undefined): Cell {
    if (value === undefined || value === null) return null
    if (typeof value === 'number' || typeof value === 'boolean') return value
    if (typeof value === 'string') {
      const out = this.text(value)
      return out.length > 0 ? out : null
    }
    if (Array.isArray(value) && value.every(item => typeof item === 'string' || typeof item === 'number')) {
      const out = this.text(value.map(String).join(' · '))
      return out.length > 0 ? out : null
    }
    throw new Error(`cellule : forme non prévue ${JSON.stringify(value).slice(0, 80)}`)
  }
}

/* ------------------------------------------------------------------ */
/* Sections                                                             */
/* ------------------------------------------------------------------ */

type SectionColumn = {
  /** Clé de l'élément source. */
  from: string
  /** Clé de la colonne dans le brief. */
  key: string
  label: string
  /** Mise en forme propre à la colonne (par défaut : `ctx.cell`). */
  as?: (value: Json | undefined, item: JsonObject) => Cell
}

/**
 * Une liste d'objets du dossier → une section du brief. Chaque clé d'élément est une colonne OU écartée avec sa raison
 * (`dropped`) ; une clé inconnue fait échouer. Une cellule vide reste `null` (jamais 0, jamais devinée).
 */
export function listSection(
  ctx: DossierContext,
  spec: {
    key: string
    title: string
    /** Le nom de l'encart source, pour le README. */
    sheet: string
    items: readonly JsonObject[]
    columns: readonly SectionColumn[]
    dropped?: Readonly<Record<string, string>>
    note?: string
    /** Garde un élément (par défaut : tous). Un élément retiré se compte avec la raison donnée. */
    keep?: { test: (item: JsonObject) => boolean; reason: string }
  },
): Section {
  const known = new Set([...spec.columns.map(c => c.from), ...Object.keys(spec.dropped ?? {})])
  const rows: Record<string, Cell>[] = []
  for (const [index, item] of spec.items.entries()) {
    const unknown = Object.keys(item).filter(key => !known.has(key))
    if (unknown.length > 0)
      throw new Error(`${spec.sheet}[${index}] : clé(s) ni lue(s) ni écartée(s) : ${unknown.join(', ')}`)
    if (spec.keep && !spec.keep.test(item)) {
      ctx.skip(`${spec.sheet} : ${spec.keep.reason}`)
      continue
    }
    for (const [key, reason] of Object.entries(spec.dropped ?? {})) {
      if (key in item) ctx.skip(`${spec.sheet}.${key} : ${reason}`)
    }
    const row: Record<string, Cell> = {}
    for (const col of spec.columns) {
      const raw = item[col.from]
      row[col.key] = col.as ? col.as(raw, item) : ctx.cell(raw === '' ? null : raw)
    }
    // Une ligne dont toutes les cellules ont disparu (phrases écartées) ne s'affiche pas vide.
    if (Object.values(row).every(value => value === null)) {
      ctx.skip(`${spec.sheet} : ligne vide après retrait des phrases non affichables`)
      continue
    }
    rows.push(row)
  }
  ctx.cover(spec.sheet, `sections[${spec.key}]`, rows.length, spec.note ?? '')
  return { key: spec.key, title: spec.title, columns: spec.columns.map(c => column(c.key, c.label)), rows }
}

/** Les domaines dont un lien ne s'affiche pas (fournisseurs de données) : la source reste, le lien part. */
const PROVIDER_URL = /pappers\.fr|societe\.com|apollo\.io|lusha|kaspr|dropcontact|theirstack/i

/** `sources.csv` (source ; url ; date_consultation) → section SOURCES. */
export function sourcesSection(ctx: DossierContext, rows: readonly Record<string, string>[]): Section {
  const out: Record<string, Cell>[] = []
  for (const row of rows) {
    const unknown = Object.keys(row).filter(key => !['source', 'url', 'date_consultation'].includes(key))
    if (unknown.length > 0) throw new Error(`sources.csv : colonne(s) inconnue(s) ${unknown.join(', ')}`)
    // L'export de NOTRE CRM (nos actions commerciales sur le compte) n'est pas une source sur le compte : non affiché.
    if (/\bCRM\b|actions commerciales/i.test(row['source'] ?? '')) {
      ctx.skip('source qui est NOTRE CRM (notre activité commerciale) : non affichée')
      continue
    }
    const source = ctx.text(row['source'] ?? '')
    if (!source) continue
    const url = cellText(row['url'])
    let link: string | null = url && /^https?:\/\//.test(url) ? url : null
    if (link && PROVIDER_URL.test(link)) {
      ctx.skip('lien de source vers un fournisseur de données : retiré (la source reste nommée)')
      link = null
    }
    out.push({ source, url: link, date_consultation: cellText(row['date_consultation']) ?? null })
  }
  ctx.cover('sources.csv', 'sections[sources]', out.length, 'lien et date de consultation de chaque source')
  return {
    key: 'sources',
    title: 'SOURCES',
    columns: [column('source', 'SOURCE'), column('url', 'LIEN'), column('date_consultation', 'CONSULTÉ LE')],
    rows: out,
  }
}

/* ------------------------------------------------------------------ */
/* Personnes                                                            */
/* ------------------------------------------------------------------ */

/** Boîtes de webmail grand public : comptées à part (adresse personnelle, jamais semée). */
const WEBMAIL_DOMAIN =
  /@(?:gmail|googlemail|yahoo|hotmail|outlook|live|msn|icloud|me|free|wanadoo|orange|sfr|neuf|laposte|aol|gmx|proton|protonmail)\.[a-z.]+$/i

const splitEmails = (value: string | undefined): string[] =>
  (value ?? '')
    .split(/[|,;]/)
    .map(email => email.trim())
    .filter(Boolean)

const PHONE = /^\+?[\d\s.()-]{8,}$/

/** Les colonnes d'un CSV de contacts, par compte. Toute colonne est lue, écartée (`dropped`) ou déclarée lue (`read`). */
export type PeopleSpec = {
  sheet: string
  name: string
  function?: string
  entity?: string
  city?: string
  /** Colonne des adresses ANNONCÉES du groupe : une adresse hors domaine y fait échouer. */
  groupEmails?: string
  /** Colonne des autres adresses : seules celles du domaine du groupe sont reprises. */
  otherEmails?: string
  mobile?: string
  phone?: string
  linkedin?: string
  groupDomain: RegExp
  /** Drapeau « ne pas contacter » du CRM : la personne n'est PAS semée (consigne du dossier). */
  blacklist?: string
  role: (row: Record<string, string>) => PersonRole
  hook: (row: Record<string, string>) => (string | undefined)[]
  /** Colonnes écartées, avec leur raison. */
  dropped: Readonly<Record<string, string>>
  /** Colonnes lues par `role` / `hook`. */
  read: readonly string[]
  reliability?: string
}

export function convertDossierPeople(
  ctx: DossierContext,
  rows: readonly Record<string, string>[],
  spec: PeopleSpec,
): { people: Person[]; withGroupEmail: number; withMobile: number } {
  const mapped = [
    spec.name,
    spec.function,
    spec.entity,
    spec.city,
    spec.groupEmails,
    spec.otherEmails,
    spec.mobile,
    spec.phone,
    spec.linkedin,
    spec.blacklist,
    ...spec.read,
    ...Object.keys(spec.dropped),
  ].filter((key): key is string => Boolean(key))
  const known = new Set(mapped)
  const header = Object.keys(rows[0] ?? {})
  const unknown = header.filter(key => !known.has(key))
  if (unknown.length > 0) throw new Error(`${spec.sheet} : colonne(s) ni lue(s) ni écartée(s) : ${unknown.join(', ')}`)

  const people: Person[] = []
  let withGroupEmail = 0
  let withMobile = 0
  for (const row of rows) {
    const name = cellText(row[spec.name])
    if (!name) throw new Error(`${spec.sheet} : contact sans nom`)
    for (const [key, reason] of Object.entries(spec.dropped)) {
      if (cellText(row[key])) ctx.skip(`${spec.sheet}.${key} : ${reason}`)
    }
    if (spec.blacklist && /^oui$/i.test(row[spec.blacklist] ?? '')) {
      ctx.skip('contact marqué « blacklist » au CRM : non semé')
      continue
    }

    const groupEmails = spec.groupEmails ? splitEmails(row[spec.groupEmails]) : []
    for (const email of groupEmails) {
      if (!spec.groupDomain.test(email)) throw new Error(`« ${name} » : « ${email} » n'est pas une adresse du groupe`)
    }
    for (const other of spec.otherEmails ? splitEmails(row[spec.otherEmails]) : []) {
      if (spec.groupDomain.test(other)) groupEmails.push(other)
      else if (WEBMAIL_DOMAIN.test(other)) ctx.skip('adresse personnelle (webmail) : non reprise')
      else ctx.skip('adresse d’un employeur tiers ou d’un domaine personnel : non reprise')
    }
    // Une adresse qui ne porte AUCUN morceau du nom de la personne est celle de quelqu'un d'autre (erreur de saisie du
    // fichier, ex. Enedis : une adresse « damien.… » sur la fiche de « Gautier … ») : jamais semée sur la mauvaise fiche.
    const nameTokens = norm(name)
      .split(' ')
      .filter(token => token.length >= 3)
    const matching = [...new Set(groupEmails)].filter(address => {
      const local = norm(address.split('@')[0] ?? '').replace(/ /g, '')
      if (nameTokens.length === 0 || nameTokens.some(token => local.includes(token))) return true
      ctx.skip('adresse qui ne porte pas le nom de la personne (erreur du fichier) : non reprise')
      ctx.anomalies.push(`« ${name} » : l’adresse « ${address} » ne porte pas son nom, non reprise`)
      return false
    })
    const email = matching.join(' | ')
    if (email) withGroupEmail += 1

    const phoneOf = (key: string | undefined): string | undefined => {
      const value = key ? cellText(row[key]) : undefined
      if (value && !PHONE.test(value)) {
        ctx.skip('téléphone : valeur qui n’est pas un numéro')
        return undefined
      }
      return value
    }
    const mobile = phoneOf(spec.mobile)
    const phone = phoneOf(spec.phone)
    if (mobile) withMobile += 1

    const fn = spec.function ? cellText(row[spec.function]) : undefined
    const entity = spec.entity ? cellText(row[spec.entity]) : undefined
    const city = spec.city ? cellText(row[spec.city]) : undefined
    const linkedin = spec.linkedin ? cellText(row[spec.linkedin]) : undefined
    const hook = ctx.text(joinParts(spec.hook(row), ' · '))
    people.push({
      name,
      ...(fn ? { function: ctx.text(fn) || fn } : {}),
      ...(entity ? { entity } : {}),
      ...(city ? { city } : {}),
      ...(email ? { email } : {}),
      ...(mobile ? { mobile } : {}),
      ...(phone && phone !== mobile ? { phone } : {}),
      ...(linkedin ? { linkedin: fixUrl(linkedin) } : {}),
      ...(hook ? { hook } : {}),
      role: spec.role(row),
      reliability: spec.reliability ?? 'issu des fichiers',
    })
  }
  ctx.cover(
    spec.sheet,
    'people',
    people.length,
    'ordre du fichier conservé ; seules les adresses du domaine du groupe sont reprises',
  )
  return { people, withGroupEmail, withMobile }
}

const ROLE_ORDER: Record<PersonRole, number> = { decision_maker: 0, manager: 1, contact: 2, external: 3, alumni: 4 }

const hasCoordinates = (person: Person): boolean => Boolean(person.email || person.mobile || person.phone)

/** Décideurs d'abord, à rôle égal les joignables, puis l'ordre du fichier ; un nom n'apparaît qu'une fois. */
export function rankPeople(ctx: DossierContext, people: readonly Person[]): Person[] {
  const seen = new Set<string>()
  const unique: Person[] = []
  for (const person of people) {
    const key = norm(person.name)
    if (seen.has(key)) {
      ctx.skip('personne en double dans le fichier (même nom) : une seule fiche')
      continue
    }
    seen.add(key)
    unique.push(person)
  }
  return (
    unique
      .map((person, index) => ({ person, index }))
      // Louis 16/10/2026 : à rôle égal, la personne joignable avant celle sans coordonnée, puis l'ordre du fichier.
      .sort(
        (a, b) =>
          ROLE_ORDER[a.person.role ?? 'contact'] - ROLE_ORDER[b.person.role ?? 'contact'] ||
          Number(hasCoordinates(b.person)) - Number(hasCoordinates(a.person)) ||
          a.index - b.index,
      )
      .map(({ person }) => person)
  )
}

/**
 * Les personnes citées par le DOSSIER (dirigeants publics, décideurs) : une personne déjà au CSV prend le rôle de
 * décideur ; une personne absente est ajoutée SANS coordonnée, avec la source qui la cite — jamais une adresse devinée.
 */
export function addCitedPeople(
  ctx: DossierContext,
  people: Person[],
  cited: readonly { name: string; function?: string; entity?: string; hook: string; reliability?: string }[],
  where: string,
): void {
  const byName = new Map(people.map(person => [norm(person.name), person]))
  let added = 0
  for (const entry of cited) {
    const found = byName.get(norm(entry.name))
    if (found) {
      found.role = 'decision_maker'
      continue
    }
    const person: Person = {
      name: entry.name,
      ...(entry.function ? { function: ctx.text(entry.function) || entry.function } : {}),
      ...(entry.entity ? { entity: entry.entity } : {}),
      hook: ctx.text(entry.hook) || 'Cité dans le dossier du compte',
      role: 'decision_maker',
      ...(entry.reliability ? { reliability: entry.reliability } : {}),
    }
    people.push(person)
    byName.set(norm(entry.name), person)
    added += 1
  }
  ctx.cover(where, 'people (role=decision_maker)', cited.length, `${added} ajoutée(s) sans coordonnée, absentes du CSV`)
}

/* ------------------------------------------------------------------ */
/* Garde-fous et contrôle final                                         */
/* ------------------------------------------------------------------ */

/** Une limite NOTE INTERNE de l'équipe (RGPD, données internes, base) : pas un garde-fou commercial, jamais affichée. */
const INTERNAL_LIMIT = /RGPD|base légale|données personnelles|Bellum|Belloum|interne[s]? Bellum|comparables?/i

/** Les limites du dossier → garde-fous : le point est la première proposition, le détail la limite entière. */
export function limitsToGuardrails(ctx: DossierContext, limits: readonly string[]): CommercialBrief['guardrails'] {
  const out: CommercialBrief['guardrails'] = []
  for (const limit of limits) {
    if (INTERNAL_LIMIT.test(limit)) {
      ctx.skip('limite du dossier qui est une note interne de l’équipe (RGPD, base, données internes) : non affichée')
      continue
    }
    // Une limite qui parle de l'ESN prospect (ses statuts, sa démo) ne concerne pas le compte : écartée entière.
    if (ctx.rules.prospect.test(limit)) {
      ctx.skip('limite du dossier qui porte sur l’ESN prospect, pas sur le compte : non affichée')
      continue
    }
    const detail = ctx.text(limit)
    if (!detail) continue
    // Le point est ce qui précède « : » quand la limite en porte un, sinon sa première phrase courte (« Accès web
    // limité. »), sinon « Limite du dossier » — jamais une phrase coupée au milieu d'une initiale (« O. Biton »).
    const colon = detail.indexOf(' : ')
    const first = splitSentences(detail)[0]?.trim() ?? ''
    const head =
      colon > 0
        ? detail.slice(0, colon).trim()
        : first.length < detail.length && !/\b[A-Z]\.$/.test(first)
          ? first.replace(/\.$/, '')
          : ''
    out.push({ point: head.length > 0 && head.length <= 90 ? head : 'Limite du dossier', detail })
  }
  ctx.cover(
    'limites',
    'guardrails',
    out.length,
    'limites du dossier recopiées ; les notes internes de l’équipe sont écartées',
  )
  return out
}

/**
 * Contrôle final : aucun nom interne, aucun fournisseur, aucune ESN prospect ne se lit dans le brief (les noms et
 * coordonnées des personnes sont des faits recopiés : ils ne sont pas relus ici).
 */
export function assertDisplayable(brief: CommercialBrief, rules: DossierTextRules): void {
  const visible = JSON.stringify({
    ...brief,
    people: brief.people.map(({ name: _name, email: _email, linkedin: _linkedin, ...rest }) => rest),
  })
  const internal = FORBIDDEN_INTERNAL.exec(visible)
  if (internal) throw new Error(`Un nom interne se lirait à l’écran : « ${internal[0]} »`)
  const prospect = rules.prospect.exec(visible)
  if (prospect) throw new Error(`L’ESN prospect se lirait à l’écran : « ${prospect[0]} »`)
}
