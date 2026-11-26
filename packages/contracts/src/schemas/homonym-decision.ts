// ── LA décision d'homonymie, une seule pour tous les faits d'un compte ────────
// LUDB.5 / LUDOVIC-C LC.1 l'ont posée pour les CONTACTS (domaine de l'e-mail vs
// domaine du compte, marque). LUDOVIC-D LC.2 — la fiche STILL (manutention,
// still.fr/still.de) affichait aussi dans ses ANGLES et ses ACTUS « Still Waters
// Farm », « Stillwater OK », « Still Austin Whiskey ». La même décision vit donc
// ici, dans le paquet partagé, et l'API (`contact-employer.ts`, collecte des
// signaux et des angles) comme le web (veille, plan) la lisent — jamais une
// seconde. Pur, sans I/O. Une absence (pas de domaine, pas d'URL) ne rejette
// jamais : on n'écarte que ce qu'on SAIT être un autre.

function hostOf(value: string | null | undefined): string {
  let raw = (value ?? '').trim().toLowerCase()
  if (!raw) return ''
  if (raw.includes('@')) raw = raw.slice(raw.lastIndexOf('@') + 1)
  raw = raw.replace(/^[a-z]+:\/\//, '')
  raw = (raw.split('/')[0] ?? '').split(':')[0] ?? ''
  return raw.replace(/^www\./, '').replace(/^\.+|\.+$/g, '')
}

export function accountDomainsFrom(website: string | null | undefined, groupDomains: readonly string[] = []): string[] {
  const domains: string[] = []
  for (const candidate of [website, ...groupDomains]) {
    const host = hostOf(candidate)
    if (host && !domains.includes(host)) domains.push(host)
  }
  return domains
}

/** Le domaine (d'un e-mail, d'une URL) est HORS du compte et de son groupe. Inconnu ⇒ `false`. */
export function isHomonymEmail(email: string | null | undefined, accountDomains: readonly string[]): boolean {
  const candidate = hostOf(email)
  const known = accountDomains.map(hostOf).filter(Boolean)
  if (!candidate || known.length === 0) return false
  return !known.some(domain => candidate === domain || candidate.endsWith(`.${domain}`))
}

const SECOND_LEVEL_SUFFIXES = new Set(['co', 'com', 'org', 'net', 'gov', 'ac', 'gouv'])

/** La MARQUE d'un domaine : « still » pour still.fr, mail.still.de, still.co.nz ; « stillfront » pour stillfront.com. */
function brandLabelOf(host: string): string {
  const labels = host.split('.').filter(Boolean)
  if (labels.length < 2) return labels[0] ?? ''
  labels.pop()
  const last = labels[labels.length - 1] ?? ''
  if (labels.length >= 2 && SECOND_LEVEL_SUFFIXES.has(last)) labels.pop()
  return labels[labels.length - 1] ?? ''
}

function brandsOf(accountDomains: readonly string[]): Set<string> {
  return new Set(accountDomains.map(domain => brandLabelOf(hostOf(domain))).filter(Boolean))
}

/**
 * CEDRIC-FIX C.2 — les formes sous lesquelles une MARQUE désigne la même maison : entière, sans
 * suffixe de groupe (« safrangroup » → « safran »), et sa tête avant le premier tiret
 * (« safran-aircraft-engines » → « safran »). Jamais un simple préfixe : « stillfront » ne
 * devient pas « still ».
 */
function brandForms(brand: string): string[] {
  const forms = new Set<string>()
  if (!brand) return []
  forms.add(brand)
  const withoutSuffix = brand.replace(/-?(group|groupe|holding|holdings)$/, '')
  if (withoutSuffix.length >= 4) forms.add(withoutSuffix)
  const head = (withoutSuffix || brand).split('-')[0] ?? ''
  if (head.length >= 4) forms.add(head)
  return [...forms]
}

/**
 * LC.1 — CERTAINEMENT un autre : domaine hors du compte ET marque différente (stillfront.com sur
 * STILL). La même marque sur un autre pays (still.de, still.co.nz) n'est pas « certaine ».
 */
export function isCertainHomonymHost(value: string | null | undefined, accountDomains: readonly string[]): boolean {
  // C.2 — la marque du compte ET celle de sa maison mère : un grand groupe écrit ses e-mails sur
  // le domaine du GROUPE, pas sur celui de l'entité.
  const brands = new Set(accountDomains.flatMap(domain => brandForms(brandLabelOf(hostOf(domain)))))
  if (brands.size === 0) return false
  return (
    isHomonymEmail(value, accountDomains) && !brandForms(brandLabelOf(hostOf(value))).some(form => brands.has(form))
  )
}

type HomonymCandidateRow = {
  id: string
  email: string | null | undefined
  source: string | null | undefined
  identity_confirmed_at?: Date | string | null
  excluded_at?: Date | string | null
}

/** Une main humaine a apporté ou confirmé ce contact : la règle ne le touche jamais. */
const HUMAN_SOURCES = new Set(['manual', 'crm', 'import'])

/**
 * LC.1 — les contacts DÉJÀ au dossier à ARCHIVER (certainement ceux d'un homonyme). Une correction
 * humaine gagne toujours : identité confirmée, source manuelle/CRM/import, ou déjà écarté ⇒ jamais
 * retouché. Partagée API (geste, script) ET écran (LC.1b) — GA-26.
 */
export function selectHomonymsToArchive(
  rows: readonly HomonymCandidateRow[],
  accountDomains: readonly string[],
): string[] {
  return rows
    .filter(
      row => !row.identity_confirmed_at && !row.excluded_at && !HUMAN_SOURCES.has((row.source ?? '').toLowerCase()),
    )
    .filter(row => isCertainHomonymHost(row.email, accountDomains))
    .map(row => row.id)
}

/**
 * LUDOVIC-E LC.1b — le dossier porte-t-il, MAINTENANT, un homonyme certain à archiver ? La date de
 * collecte seule ne suffit pas : « Agrandir la recherche » la rafraîchit sans retirer ce qui était déjà là.
 */
export function hasPendingHomonyms(rows: readonly HomonymCandidateRow[], accountDomains: readonly string[]): boolean {
  return selectHomonymsToArchive(rows, accountDomains).length > 0
}

// ── LC.2 — les FAITS (actus, signaux, angles) ─────────────────────────────────

/** Une marque trop courte (« ag », « bp ») se retrouve partout : jamais un indice. */
const BRAND_MIN = 4

export const HOMONYM_FACT_REASON = 'homonyme : le fait désigne une autre entité que le compte'

type HomonymFactInput = { text: string | null | undefined; url?: string | null | undefined }

function fold(value: string | null | undefined): string {
  return (value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function tokensOf(value: string | null | undefined): string[] {
  return fold(value).match(/[a-z0-9]+/g) ?? []
}

/** L'URL est le site PROPRE d'une autre entité dont le nom commence comme le compte (stillwatersfarm.com). */
function foreignOwnSiteBrand(url: string | null | undefined, accountDomains: readonly string[]): string | null {
  if (!isCertainHomonymHost(url, accountDomains)) return null
  const brand = brandLabelOf(hostOf(url))
  return [...brandsOf(accountDomains)].some(own => own.length >= BRAND_MIN && brand.startsWith(own)) ? brand : null
}

/** Les mots du texte dont la suite collée est la marque étrangère : « Still Waters Farm » pour stillwatersfarm. */
function foreignNameIn(text: string | null | undefined, foreignBrand: string): string[] | null {
  const tokens = tokensOf(text)
  for (let start = 0; start < tokens.length; start += 1) {
    let glued = ''
    for (let end = start; end < tokens.length && glued.length < foreignBrand.length; end += 1) {
      glued += tokens[end]
      if (glued === foreignBrand && end > start) return tokens.slice(start, end + 1)
    }
  }
  return null
}

function containsSequence(tokens: readonly string[], sequence: readonly string[]): boolean {
  for (let i = 0; i + sequence.length <= tokens.length; i += 1) {
    if (sequence.every((word, j) => tokens[i + j] === word)) return true
  }
  return false
}

type HomonymFactLens = {
  /** La raison si le fait désigne CERTAINEMENT une autre entité, sinon `null`. */
  reasonFor(fact: HomonymFactInput): string | null
}

/**
 * LUDOVIC-D LC.2 — la lecture d'homonymie des FAITS d'un compte. Trois preuves, aucune sur une
 * ressemblance seule :
 * 1. la source est le site propre d'une autre entité dont le nom commence comme le compte
 *    (`isCertainHomonymHost` + marque préfixée : stillwatersfarm.com, stillaustin.com) ;
 * 2. le texte nomme un mot COLLÉ à la marque (« Stillwater », « Stillfront ») et ne nomme
 *    jamais le compte seul ni son domaine ;
 * 3. le texte cite le nom de l'autre entité appris d'un fait prouvé par (1) dans `evidence`
 *    (« Still Waters Farm ») — c'est ce qui rattrape un ANGLE, qui n'a pas d'URL.
 * Sans domaine de compte, la lentille ne dit jamais « homonyme ».
 */
export function homonymFactLens(
  accountDomains: readonly string[],
  evidence: readonly HomonymFactInput[] = [],
): HomonymFactLens {
  const brands = [...brandsOf(accountDomains)].filter(brand => brand.length >= BRAND_MIN)
  const hosts = accountDomains.map(hostOf).filter(Boolean)
  const foreignNames: string[][] = []
  for (const fact of evidence) {
    const foreign = foreignOwnSiteBrand(fact.url, accountDomains)
    const name = foreign ? foreignNameIn(fact.text, foreign) : null
    if (name) foreignNames.push(name)
  }
  return {
    reasonFor(fact) {
      if (brands.length === 0) return null
      if (foreignOwnSiteBrand(fact.url, accountDomains)) return HOMONYM_FACT_REASON
      const tokens = tokensOf(fact.text)
      if (foreignNames.some(name => containsSequence(tokens, name))) return HOMONYM_FACT_REASON
      const folded = fold(fact.text)
      const namesAccount = tokens.some(token => brands.includes(token)) || hosts.some(host => folded.includes(host))
      const gluedToBrand = tokens.some(token => brands.some(brand => token !== brand && token.startsWith(brand)))
      return gluedToBrand && !namesAccount ? HOMONYM_FACT_REASON : null
    },
  }
}

type LensSignal = { id: string | null; label: string; source_url: string | null }

/** Un signal DÉCLARÉ par un humain (#2634.1, `declared-…`) : une correction humaine gagne, jamais masqué. */
function isHumanSignal(signal: LensSignal): boolean {
  return (signal.id ?? '').startsWith('declared-')
}

/** La lentille d'un compte, apprise de SES signaux (lus par `readRecentSignals`). */
export function homonymLensForAccount(
  website: string | null | undefined,
  signals: readonly LensSignal[],
): HomonymFactLens {
  return homonymFactLens(
    accountDomainsFrom(website),
    signals.map(signal => ({ text: signal.label, url: signal.source_url })),
  )
}

/**
 * LUDOVIC-D LC.2 — À LA LECTURE, pour l'EXISTANT : un signal d'homonyme déjà stocké n'est pas
 * affiché (veille, Mes cibles, Laura). Masqué, jamais supprimé : le blob reste tel quel, et un
 * signal déclaré par un humain n'est jamais masqué.
 */
export function withoutHomonymSignals<T extends LensSignal>(
  signals: readonly T[],
  website: string | null | undefined,
): T[] {
  const lens = homonymLensForAccount(website, signals)
  return signals.filter(
    signal => isHumanSignal(signal) || lens.reasonFor({ text: signal.label, url: signal.source_url }) === null,
  )
}
