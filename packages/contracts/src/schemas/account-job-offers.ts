/**
 * Louis 30/10/2026 — sur la fiche d'un compte, chercher les offres d'un AUTRE métier que ceux du profil,
 * puis en afficher plus, 5 par 5, jusqu'à 50. Réglages UNIQUES (GA-26) : l'API, l'écran et le moteur IA
 * (`ACCOUNT_OFFER_SEARCH_MAX`, `apps/ia/.../job_aggregators.py`) portent la même borne.
 */

/** Offres montrées à chaque « Afficher plus ». */
export const ACCOUNT_JOB_OFFERS_STEP = 5
/** Offres rendues au plus par une recherche. */
export const ACCOUNT_JOB_OFFERS_MAX = 50
/** Longueur maximale du métier saisi. */
export const ACCOUNT_JOB_OFFER_TERM_MAX = 80

/**
 * #5000.1 — UN type de contrat normalisé, partagé fiche compte / Découvrir. Pris SEULEMENT sur le contrat
 * DÉCLARÉ par l'annonce, jamais déduit du titre. Ajout seulement : `CDI` garde son sens.
 */
export const OFFER_CONTRACT_TYPES = ['CDI', 'CDD', 'intérim', 'freelance', 'autre', 'non précisé'] as const
export type OfferContractType = (typeof OFFER_CONTRACT_TYPES)[number]

/** #5000.1 — le libellé brut d'une source (Adzuna `permanent`, France Travail « Libéral »…) lu en type normalisé. */
export function normalizeContractType(raw: unknown): OfferContractType {
  const label = typeof raw === 'string' ? fold(raw.trim()) : ''
  if (!label) return 'non précisé'
  // Un libellé ambigu (Adzuna `contract`) n'est jamais deviné : il tombe en `autre`.
  if (label === 'cdi' || /\b(permanent|duree indeterminee)\b/.test(label)) return 'CDI'
  if (label === 'cdd' || /\b(duree determinee)\b/.test(label)) return 'CDD'
  if (/\b(interim|mis|travail temporaire)\b/.test(label)) return 'intérim'
  if (/\b(freelance|independant|liberal|portage)\b/.test(label)) return 'freelance'
  if (/non precise|inconnu|unknown/.test(label)) return 'non précisé'
  return 'autre'
}

/**
 * #5010.1 — site d'origine de l'annonce = hôte de l'URL de l'offre sur une LISTE FERMÉE ; hôte hors liste =
 * `null` (rien). JAMAIS le champ `source` : c'est le fournisseur, il ne se montre jamais.
 */
const ORIGIN_HOSTS: ReadonlyArray<readonly [string, string]> = [
  ['linkedin.com', 'LinkedIn'],
  ['francetravail.fr', 'France Travail'],
  ['pole-emploi.fr', 'France Travail'],
  ['indeed.com', 'Indeed'],
  ['indeed.fr', 'Indeed'],
  ['welcometothejungle.com', 'Welcome to the Jungle'],
  ['apec.fr', 'APEC'],
  ['hellowork.com', 'HelloWork'],
  ['monster.fr', 'Monster'],
  ['glassdoor.fr', 'Glassdoor'],
  ['glassdoor.com', 'Glassdoor'],
]

/** Le job board que la collecte a DÉJÀ rangé sur l'offre (`board`), replié (casse, accents, séparateurs) → site. */
const ORIGIN_BOARDS: Readonly<Record<string, string>> = {
  linkedin: 'LinkedIn',
  francetravail: 'France Travail',
  poleemploi: 'France Travail',
  indeed: 'Indeed',
  welcometothejungle: 'Welcome to the Jungle',
  wttj: 'Welcome to the Jungle',
  apec: 'APEC',
  hellowork: 'HelloWork',
  monster: 'Monster',
  glassdoor: 'Glassdoor',
}

/**
 * Site de publication : l'hôte de l'URL d'abord ; à défaut (lien d'agrégateur, URL absente) le job board déjà
 * collecté, sur la MÊME liste fermée. Inconnu = `null` : jamais un libellé deviné.
 */
export function offerOriginLabel(url: string | null | undefined, board?: string | null): string | null {
  const fromHost = hostOrigin(url)
  if (fromHost) return fromHost
  if (!board) return null
  const key = board
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
  return ORIGIN_BOARDS[key] ?? null
}

function hostOrigin(url: string | null | undefined): string | null {
  if (!url) return null
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
  const hit = ORIGIN_HOSTS.find(([domain]) => under(host, domain) || under(host, demoMirror(domain)))
  return hit ? hit[1] : null
}

function under(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`)
}

/**
 * Salle de démonstration : la donnée y est fictive, donc ses liens vivent sur le domaine réservé `.example`
 * (RFC 2606 — garde `demo-hiring-sources-coverage`). Le miroir de démonstration d'un site de la liste fermée
 * (`welcometothejungle.com` → `welcometothejungle.example`) porte donc le MÊME libellé : l'écran de démo nomme
 * le site (craft rule n°9) sans qu'aucune URL réelle entre dans le semis. Hors de la liste, `.example` ne donne
 * rien non plus : le domaine réservé n'ouvre pas la liste, il la recopie.
 */
function demoMirror(domain: string): string {
  return domain.replace(/\.[a-z]+$/, '.example')
}

/** Une offre d'emploi du compte. Aucun fournisseur nommé. */
export type AccountJobOffer = {
  title: string
  employer: string | null
  city: string | null
  url: string | null
  publishedAt: string | null
  /** #5000.1 — type normalisé ; `non précisé` quand l'annonce ne déclare rien. */
  contractType: OfferContractType
  /** #5010.1 — site d'origine (liste fermée), `null` si l'hôte n'est pas connu. */
  origin: string | null
}

/**
 * La réponse de `GET /accounts/:id/job-offers?term=`. `searched: false` = la recherche n'a pas pu partir
 * (source non branchée, quota du jour) : l'écran le DIT, il n'affiche jamais « aucune offre ».
 */
export type AccountJobOffers = {
  term: string
  searched: boolean
  offers: AccountJobOffer[]
}

const STAGE_RE = /\b(stage|stagiaire|internship|intern)\b/i

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/** Une offre brute (moteur IA ou `raw_analysis.it_job_signals`) lue en `AccountJobOffer`, `null` si illisible ou stage. */
export function toAccountJobOffer(raw: unknown): AccountJobOffer | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const title = text(row.title)
  if (!title) return null
  const rawContract = text(row.contractType) ?? text(row.contract_type)
  // #4044 — une offre de stage n'est jamais un signal.
  if (STAGE_RE.test(title) || (rawContract && STAGE_RE.test(rawContract))) return null
  const url = text(row.url)
  return {
    title,
    employer: text(row.company),
    city: text(row.city) ?? text(row.location),
    url,
    publishedAt: text(row.date),
    contractType: normalizeContractType(rawContract),
    origin: offerOriginLabel(url, text(row.board)),
  }
}

/**
 * Salle de démonstration : les offres DÉJÀ semées du dossier (`raw_analysis.it_job_signals`) dont l'intitulé
 * contient le métier saisi — aucune collecte, aucune offre inventée.
 */
export function demoAccountJobOffers(itJobSignals: unknown, term: string): AccountJobOffers {
  const wanted = fold(term.trim())
  const offers = (Array.isArray(itJobSignals) ? itJobSignals : [])
    .map(toAccountJobOffer)
    .filter((o): o is AccountJobOffer => o !== null && (!wanted || fold(o.title).includes(wanted)))
    .slice(0, ACCOUNT_JOB_OFFERS_MAX)
  return { term: term.trim(), searched: true, offers }
}
