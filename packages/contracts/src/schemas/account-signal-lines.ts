import { z } from 'zod'
import { OFFER_CONTRACT_TYPES, normalizeContractType, offerOriginLabel } from './account-job-offers.js'
import { parseSignalDate, periodEndMs } from './signal-date.js'
import { scoreSearch, type ParsedSearch } from './signal-search.js'

/**
 * #4755 / #4756 / #4762 (lot 761, maquette validée par Louis le 31/10/2026) — L'ONGLET « SIGNAUX ET BESOINS »
 * D'UN COMPTE DEVIENT UN SEUL TABLEAU, alimenté par les quatre familles (analyse Bellum, CRM branché, base
 * commune, mémoire marché) et lu par UNE route : `GET /accounts/:id/signal-lines`.
 *
 * Ce que le contrat tient, et pourquoi :
 *  · UNE ligne = UN fait DATÉ. Une ligne sans date n'existe pas (doctrine « on n'affiche pas ce qu'on n'a pas »,
 *    Louis 20/09/2026) — `toSignalLineDate` rend `null`, la ligne est écartée AVANT d'atteindre l'écran.
 *    Lot 794 : une ligne dont la source porte seulement la date où on l'a VUE (`observedAt`) reste, en Historique, à
 *    l'année — on ne jette pas un fait parce que sa source ne l'a pas daté.
 *  · DEUX périodes, une seule frontière (GA-26) : `SIGNAL_LINE_CURRENT_DAYS`. « Actuel » < 180 j, « Historique »
 *    ≥ 180 j, mesuré sur la FIN de la période que la date porte (un fait daté « 2026-05 » n'est pas vieilli au
 *    1er mai) — la même horloge d'ÂGE que `periodEndMs`.
 *  · Les SOURCES NE SE NOMMENT PAS : aucun champ `source` dans une ligne. Le lien « voir l'offre / l'avis » reste
 *    (`url`), il ne nomme pas qui l'a trouvé. EXCEPTION (Louis 01/11/2026, #5010.1) : le SITE D'EMPLOI PUBLIC d'une
 *    offre (`origin`, hôte de l'URL sur liste fermée) se nomme ; nos FOURNISSEURS ne se nomment JAMAIS.
 *  · Aucune probabilité, aucun score. Une issue (`won` / `lost` / `none`) n'existe que sur un fait CLOS.
 *  · Aucune borne d'âge ni coupe : la route rend TOUT, l'écran pagine (« voir plus »).
 *  · Doublons fusionnés (`mergeSignalLineCandidates`) : des offres de la même équipe ou au même intitulé, le même
 *    mois = UNE ligne dépliable (`merged`) ; le même sujet lu dans plusieurs familles = UNE ligne.
 */

/** La frontière Actuel / Historique, en jours. UN seul endroit (GA-26). */
export const SIGNAL_LINE_CURRENT_DAYS = 180

const MS_PER_DAY = 86_400_000

export const SIGNAL_LINE_TYPES = [
  'recrutement',
  'projet',
  'marche_public',
  'annonce_legale',
  'equipe',
  'affaire',
  'besoin_passe',
  /** Lot 767 — un FAIT descriptif sur l'entreprise (identité légale, effectif, forme sociale, gérants) : pas un besoin. */
  'fait',
  /** Lot 775 — un parcours individuel observé sur le marché chez ce compte, SANS identité (« Mission observée »). Jamais un besoin du compte. */
  'mission_observee',
] as const
export type SignalLineType = (typeof SIGNAL_LINE_TYPES)[number]

const NEED_LINE_TYPES: ReadonlySet<SignalLineType> = new Set([
  'recrutement',
  'projet',
  'marche_public',
  'affaire',
  'besoin_passe',
])

/**
 * Lot 767 — UN seul endroit (GA-26) pour dire « besoin » ou « fait » : une ligne est un BESOIN si elle est
 * recrutement, marché public, projet, affaire ou besoin passé. Annonces légales, événements d'équipe et faits
 * restent visibles mais ne se comptent jamais comme des besoins.
 */
export function isNeedLineType(type: SignalLineType): boolean {
  return NEED_LINE_TYPES.has(type)
}

export const SIGNAL_LINE_PERIODS = ['now', 'past'] as const
export type SignalLinePeriod = (typeof SIGNAL_LINE_PERIODS)[number]

/** L'issue d'un fait CLOS. `none` = clos sans suite (annulé, abandonné) — jamais « perdu » deviné. */
export const SIGNAL_LINE_OUTCOMES = ['won', 'lost', 'none'] as const
export type SignalLineOutcome = (typeof SIGNAL_LINE_OUTCOMES)[number]

/**
 * Lot 771 — la SOURCE générique d'une ligne : un libellé de famille, jamais un domaine ni un fournisseur. Absente
 * = « Analyse ». Les natures de presse / de site ne se devinent pas : elles n'ont pas de valeur ici.
 */
export const SIGNAL_LINE_ORIGINS = ['offre', 'marche', 'annonce', 'crm', 'memoire', 'analyse'] as const
export type SignalLineOrigin = (typeof SIGNAL_LINE_ORIGINS)[number]

const datePrecisionSchema = z.enum(['day', 'month', 'year'])

const mergedSignalLineSchema = z
  .object({
    title: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    url: z.string().nullable(),
    /** #5005.1 — la ville du poste quand la source la porte ; absent = inconnue, jamais devinée. */
    location: z.string().min(1).optional(),
    /** #5010.1 — le site d'emploi public d'origine (liste fermée), absent si l'hôte n'est pas connu. */
    origin: z.string().min(1).optional(),
    /** #5000.1 — le contrat DÉCLARÉ par cette offre ; absent = non déclaré (jamais déduit du titre). */
    contract_type: z.enum(OFFER_CONTRACT_TYPES).optional(),
  })
  .strict()

export const accountSignalLineSchema = z
  .object({
    id: z.string().min(1),
    /** Début de la période que la source a datée (`YYYY-MM-DD`) ; `date_precision` dit ce qu'elle vaut vraiment. */
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    date_precision: datePrecisionSchema,
    period: z.enum(SIGNAL_LINE_PERIODS),
    type: z.enum(SIGNAL_LINE_TYPES),
    /** Lot 771 — d'où la ligne vient, en mot générique (Offre d'emploi, Marché public, CRM…). Absent = analyse. */
    origin_kind: z.enum(SIGNAL_LINE_ORIGINS).optional(),
    /**
     * Lot 773 — l'entité du GROUPE qui porte ce besoin de base commune, quand elle diffère du compte (« Base commune ·
     * Martin Sud »). Absente = le besoin est celui du compte lui-même. Un nom d'entreprise, jamais un fournisseur.
     */
    entity: z.string().min(1).optional(),
    title: z.string().min(1),
    detail: z.string().nullable(),
    /** Le lien public du fait (« voir l'offre / l'avis / lire ») ; `null` = aucun lien vérifiable. */
    url: z.string().nullable(),
    /**
     * #5010.1 (Louis 01/11/2026) — le SITE D'EMPLOI PUBLIC d'où vient l'offre (Indeed, Welcome to the Jungle, France
     * Travail, LinkedIn…), lu sur l'hôte de `url` dans une liste fermée (`offerOriginLabel`). Absent = hôte inconnu.
     * Ce n'est JAMAIS le fournisseur qui nous l'a rendue : aucun champ `source`.
     */
    origin: z.string().min(1).optional(),
    /** #5000.1 — le type de contrat DÉCLARÉ par l'offre (CDI, CDD…), normalisé ; absent = non déclaré, jamais lu dans le titre. */
    contract_type: z.enum(OFFER_CONTRACT_TYPES).optional(),
    /** Les lignes regroupées sous celle-ci (offres de la même équipe, même mois). Absent = aucune. */
    merged: z.array(mergedSignalLineSchema).optional(),
    outcome: z.enum(SIGNAL_LINE_OUTCOMES).optional(),
    /** TJM observé, en euros par jour, quand la source le porte. Absent = inconnu, jamais 0. */
    tjm_eur: z.number().positive().optional(),
    technologies: z.array(z.string().min(1)).optional(),
    /** Ce que le fait dit des personnes concernées : noms cités, rôles, lieu. Lu par « À contacter ». */
    people_hints: z
      .object({
        names: z.array(z.string().min(1)),
        roles: z.array(z.string().min(1)),
        location: z.string().nullable(),
      })
      .strict(),
    /** Le projet possible né de ce fait (« Confirmer / Écarter »), en Actuel seulement. */
    lead_id: z.string().min(1).optional(),
    /** Les contacts du compte que la source rattache NOMMÉMENT au fait (l'interlocuteur de l'époque). */
    contact_ids: z.array(z.string().min(1)).optional(),
  })
  .strict()
export type AccountSignalLine = z.infer<typeof accountSignalLineSchema>

export const accountSignalLinesSchema = z
  .object({
    lines: z.array(accountSignalLineSchema),
    /** La dernière vérification des signaux du compte ; `null` = jamais datée. */
    verified_at: z.string().nullable(),
    /** Affaires ouvertes du pipe (hors projets possibles) — elles vivent dans l'onglet Opportunités. */
    open_deals: z.number().int().nonnegative(),
  })
  .strict()
export type AccountSignalLines = z.infer<typeof accountSignalLinesSchema>

/**
 * Lot 764 (31/10/2026) — L'HISTORIQUE DE TOUT L'ESPACE au même niveau que l'onglet d'un compte : la MÊME lecture
 * (`AccountSignalLinesService`, mêmes familles, même fusion, même frontière de période), servie pour tous les
 * comptes visibles du lecteur en un nombre CONSTANT de requêtes (`GET /accounts/signal-history`).
 *
 *  · Seules les lignes `past` voyagent : c'est l'Historique ; l'Actuel reste l'affaire de l'onglet du compte.
 *  · Un compte sans aucune ligne passée n'est PAS dans la liste (dans une liste, une absence ne fait aucune ligne).
 *  · Comme les lignes, aucun champ ne nomme la source.
 */
/**
 * Lot 768 — une personne que l'Historique peut proposer sur un besoin passé : le MINIMUM que lit
 * `proposeContactsForSignal` (nom, poste, lieu) et l'état de l'e-mail (vérifié oui/non) — jamais l'adresse
 * elle-même, jamais un critère protégé. Écartés et masqués ne voyagent pas.
 */
export const historyContactSchema = z
  .object({
    id: z.string().min(1),
    full_name: z.string().min(1),
    title: z.string().nullable(),
    /** Le lieu de travail lu à la collecte (texte libre) ; `null` = non lu. */
    location: z.string().nullable(),
    /** Pays / ville / employeur lus à la collecte ; `null` = non lu. */
    place: z
      .object({ country: z.string().nullable(), city: z.string().nullable(), organization: z.string().nullable() })
      .nullable(),
    email_verified: z.boolean(),
  })
  .strict()
export type HistoryContact = z.infer<typeof historyContactSchema>

export const workspaceSignalHistoryAccountSchema = z
  .object({
    account_id: z.string().min(1),
    company_name: z.string().min(1),
    /** Secteur du compte ; `null` = non renseigné, jamais un repli inventé. */
    sector: z.string().nullable(),
    logo_url: z.string().nullable(),
    website: z.string().nullable(),
    /** Lot 769 — le siège du compte (ville) ; sert de lieu aux lignes qui n'en portent pas. `null` = inconnu. */
    headquarters: z.string().nullable().optional(),
    /** Lot 772 — l'adresse du compte (code postal, ville) : dernier recours pour la zone d'un besoin sans lieu. `null` = inconnue. */
    address: z.string().nullable().optional(),
    lines: z.array(accountSignalLineSchema.extend({ period: z.literal('past') }).strict()).min(1),
    /**
     * Lot 768 — les contacts proposables du compte, lus en UNE requête pour tous les comptes listés (jamais une
     * par compte), dans le même périmètre de business unit que les comptes. Absent / vide = aucun contact connu.
     */
    contacts: z.array(historyContactSchema).optional(),
  })
  .strict()
export type WorkspaceSignalHistoryAccount = z.infer<typeof workspaceSignalHistoryAccountSchema>

export const workspaceSignalHistorySchema = z
  .object({
    accounts: z.array(workspaceSignalHistoryAccountSchema),
    /** Lot 785 — absent d'une réponse non paginée (ancienne API) : l'écran la lit alors comme complète. */
    page: z.lazy(() => workspaceSignalHistoryPageSchema).optional(),
  })
  .strict()
export type WorkspaceSignalHistory = z.infer<typeof workspaceSignalHistorySchema>

/** Un fait brut, avant date, période et fusion. Ce que chaque famille produit côté API. */
export type SignalLineCandidate = {
  /** Clé stable dans sa famille (« crm-deal:hubspot:42 ») — jamais un index de rendu. */
  key: string
  type: SignalLineType
  origin?: SignalLineOrigin
  /** Lot 773 — l'entité du groupe qui porte le besoin, quand elle diffère du compte. */
  entity?: string | null
  /** La date telle que la source l'a donnée (ISO, « 2026-07 », « mars 2025 »…). Illisible ⇒ aucune ligne. */
  rawDate: string | Date | null | undefined
  /**
   * Lot 794 (Louis 04/11/2026, « ne jamais la jeter ») — quand la source n'a PAS daté le fait, le jour où la source a
   * été VUE (chargée). La ligne n'est plus écartée : elle reste en Historique (`past`), à la précision de l'ANNÉE — une
   * observation réelle, jamais présentée comme la date du fait ni comme « Actuel ». La date du fait gagne toujours.
   */
  observedAt?: string | Date | null
  title: string | null | undefined
  detail?: string | null
  url?: string | null
  /** #5010 — le job board déjà collecté sur l'offre ; il ne sert qu'à nommer le site, sur liste fermée. */
  board?: string | null
  outcome?: SignalLineOutcome
  tjmEur?: number | null
  technologies?: readonly string[]
  names?: readonly (string | null | undefined)[]
  roles?: readonly (string | null | undefined)[]
  location?: string | null
  /** #5000.1 — le contrat tel que l'offre le DÉCLARE (« CDI », « permanent »…) ; absent = non déclaré. */
  contractType?: string | null
  /** L'équipe que l'offre nomme, quand elle la nomme : deux offres de la même équipe le même mois fusionnent. */
  team?: string | null
  leadId?: string | null
  contactIds?: readonly (string | null | undefined)[]
}

type LineDate = { date: string; precision: 'day' | 'month' | 'year'; endMs: number }

const pad = (value: number) => String(value).padStart(2, '0')

/**
 * La date d'une ligne, à la précision que la source porte vraiment. `null` = illisible, ou relative à une
 * ancre qu'on ne connaît pas (« il y a 3 jours ») : aucune ligne, jamais une date devinée.
 */
export function toSignalLineDate(raw: string | Date | null | undefined): LineDate | null {
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null
    const iso = raw.toISOString().slice(0, 10)
    return { date: iso, precision: 'day', endMs: Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate()) }
  }
  const value = parseSignalDate(raw)
  switch (value.kind) {
    case 'day':
      return {
        date: `${value.year}-${pad(value.month)}-${pad(value.day)}`,
        precision: 'day',
        endMs: Date.UTC(value.year, value.month - 1, value.day),
      }
    case 'month':
      return {
        date: `${value.year}-${pad(value.month)}-01`,
        precision: 'month',
        endMs: periodEndMs(value.year, value.month),
      }
    case 'year':
      return { date: `${value.year}-01-01`, precision: 'year', endMs: periodEndMs(value.year) }
    case 'range':
      return { date: `${value.to}-01-01`, precision: 'year', endMs: periodEndMs(value.to) }
    default:
      return null
  }
}

/** Actuel ou Historique : la FIN de la période datée contre `SIGNAL_LINE_CURRENT_DAYS`. */
export function signalLinePeriod(endMs: number, now: Date): SignalLinePeriod {
  return now.getTime() - endMs < SIGNAL_LINE_CURRENT_DAYS * MS_PER_DAY ? 'now' : 'past'
}

const STOP = new Set(['des', 'les', 'pour', 'and', 'the', 'sur', 'aux', 'une', 'avec', 'dans', 'chez', 'h/f', 'f/h'])

function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function words(value: string, exclude: ReadonlySet<string> = new Set()): Set<string> {
  return new Set(
    fold(value)
      .split(/[^a-z0-9]+/)
      .filter(word => word.length >= 3 && !STOP.has(word) && !exclude.has(word)),
  )
}

function similarity(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  if (left.size === 0 || right.size === 0) return 0
  let shared = 0
  for (const word of left) if (right.has(word)) shared += 1
  return shared / (left.size + right.size - shared)
}

/** Deux intitulés « proches » : assez de mots en commun pour être le même poste ou le même sujet. */
const NEAR_TITLE = 0.6
/** Lot 767 — deux FAITS du même jour et du même type : une description d'entreprise redite se reconnaît à moins. */
const NEAR_FACT = 0.5

export type MergeSignalLineOptions = {
  /** Le nom du compte : ses mots sont retirés avant de comparer deux intitulés (« SEMA FRANCE est active… »). */
  companyName?: string | null
}

function clean(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed === '' ? null : trimmed
}

function uniq(values: readonly (string | null | undefined)[] | undefined): string[] {
  const out: string[] = []
  for (const value of values ?? []) {
    const text = clean(value)
    if (text && !out.some(existing => existing.toLowerCase() === text.toLowerCase())) out.push(text)
  }
  return out
}

type Dated = {
  candidate: SignalLineCandidate
  title: string
  at: LineDate
  words: Set<string>
  /** Lot 794 — daté par l'observation de la source seulement : Historique, jamais Actuel. */
  observedOnly?: true
}

/** Lot 794 — la date d'observation, ramenée à son année (elle ne date pas le fait). */
function observedYear(raw: string | Date | null | undefined): LineDate | null {
  const seen = toSignalLineDate(raw)
  if (!seen) return null
  const year = Number(seen.date.slice(0, 4))
  return { date: `${year}-01-01`, precision: 'year', endMs: periodEndMs(year) }
}

/**
 * Les faits bruts des quatre familles → les lignes du tableau. Pur : aucune lecture, aucune horloge implicite.
 *
 *  1. un fait sans intitulé ou sans date lisible ne fait AUCUNE ligne — sauf une date d'OBSERVATION (`observedAt`,
 *     lot 794) : la ligne reste alors en Historique, à l'année ;
 *  2. le MÊME sujet (intitulé proche, même mois) lu dans plusieurs familles = UNE ligne, qui garde
 *     le lien, l'issue, le TJM, le projet possible et les indices de personnes de chacune ;
 *  3. des offres de la même équipe (ou au même intitulé), le même mois = UNE ligne, les autres dans `merged` ;
 *  4. les plus récentes d'abord. Aucune coupe.
 */
export function mergeSignalLineCandidates(
  candidates: readonly SignalLineCandidate[],
  now: Date,
  options: MergeSignalLineOptions = {},
): AccountSignalLine[] {
  const company = words(options.companyName ?? '')
  const dated: Dated[] = []
  for (const candidate of candidates) {
    const title = clean(candidate.title)
    const factual = toSignalLineDate(candidate.rawDate)
    const at = factual ?? observedYear(candidate.observedAt)
    if (!title || !at) continue
    dated.push({
      candidate,
      title,
      at,
      words: words(title, company),
      ...(factual ? {} : { observedOnly: true as const }),
    })
  }
  dated.sort((left, right) => right.at.endMs - left.at.endMs || left.candidate.key.localeCompare(right.candidate.key))

  const lines: AccountSignalLine[] = []
  const heads: Dated[] = []
  // Lot 772 — une fusion ne traverse jamais les mois : on ne compare une ligne qu'aux têtes de SON mois (même rang
  // d'insertion, donc même résultat), au lieu de toutes les têtes du compte (quadratique sur un compte à milliers de lignes).
  const headsByMonth = new Map<string, number[]>()
  for (const item of dated) {
    const month = item.at.date.slice(0, 7)
    let sameMonth = headsByMonth.get(month)
    if (!sameMonth) {
      sameMonth = []
      headsByMonth.set(month, sameMonth)
    }
    const found = sameMonth.find(position => {
      const head = heads[position]!
      // Lot 767 — deux FAITS ne fusionnent que le MÊME jour (deux changements de dirigeant ne sont pas un).
      if (!isNeedLineType(item.candidate.type) && !isNeedLineType(head.candidate.type) && !sameDay(head, item))
        return false
      if (head.title.toLowerCase() === item.title.toLowerCase()) return true
      if (similarity(head.words, item.words) >= NEAR_TITLE) return true
      if (
        !isNeedLineType(item.candidate.type) &&
        head.candidate.type === item.candidate.type &&
        sameDay(head, item) &&
        similarity(head.words, item.words) >= NEAR_FACT
      ) {
        return true
      }
      const team = clean(item.candidate.team)?.toLowerCase()
      return (
        item.candidate.type === 'recrutement' &&
        head.candidate.type === 'recrutement' &&
        Boolean(team) &&
        clean(head.candidate.team)?.toLowerCase() === team
      )
    })
    const index = found ?? -1
    if (index === -1) {
      sameMonth.push(heads.length)
      heads.push(item)
      lines.push(toLine(item, now))
      continue
    }
    const line = lines[index]!
    absorb(line, item, item.candidate.type === 'recrutement' && line.type === 'recrutement')
  }
  return foldIntoSummaries(lines, heads)
}

const COUNT_WORDS =
  'un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|cinquante|soixante|cent'
const OFFER_SUMMARY = new RegExp(`^\\s*(\\d+|${COUNT_WORDS})\\b[^.]{0,40}?\\boffres?\\b`, 'i')

/**
 * #5005.1 (recette prod 01/11 — Wavestone « Vingt offres récentes couvrent… ») — une ligne-RÉSUMÉ de recrutement
 * (« N offres… ») qui répétait son propre texte en « ligne regroupée » LISTE les postes du mois : les autres lignes
 * de recrutement du même mois s'y rangent (intitulé, ville), au lieu de rester éparses.
 */
function foldIntoSummaries(lines: AccountSignalLine[], heads: readonly Dated[]): AccountSignalLine[] {
  const absorbed = new Set<number>()
  lines.forEach((line, index) => {
    if (line.type !== 'recrutement' || !OFFER_SUMMARY.test(line.title)) return
    const month = line.date.slice(0, 7)
    heads.forEach((head, other) => {
      if (other === index || absorbed.has(other) || absorbed.has(index)) return
      const candidateLine = lines[other]!
      if (candidateLine.type !== 'recrutement' || candidateLine.date.slice(0, 7) !== month) return
      if (OFFER_SUMMARY.test(candidateLine.title)) return
      line.merged = [...(line.merged ?? []), mergedRow(head), ...(candidateLine.merged ?? [])]
      absorbed.add(other)
    })
  })
  return lines.filter((_, index) => !absorbed.has(index))
}

/**
 * Lot 773 — REGROUPEMENT D'AFFICHAGE des reformulations : « TotalEnergies a annoncé… Pangea 5 », « Signature d'un contrat
 * pour… Pangea 5 », « Signature du contrat Pangea 5 avec Dell » sont le MÊME fait lu dans trois phrases. Même type, même
 * mois, et au moins deux termes RARES (noms propres, chiffres) en commun, couvrant {@link REFORMULATION_OVERLAP} du plus
 * court des deux ⇒ une ligne (la plus récente) portant ses `members`. Rien n'est supprimé ni écrit : l'API garde chaque
 * ligne, seul l'écran les replie. Les offres d'emploi n'entrent pas ici (la fusion par intitulé / équipe décide).
 */
export const REFORMULATION_OVERLAP = 0.6
const REFORMULATION_MIN_SHARED = 2

export type SignalLineGroup = { line: AccountSignalLine; members: AccountSignalLine[] }

function rareTerms(title: string, exclude: ReadonlySet<string>): Set<string> {
  const terms = new Set<string>()
  const tokens = title.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  tokens.forEach((token, index) => {
    const key = fold(token)
    if (exclude.has(key)) return
    const digit = /\d/.test(token)
    const proper = index > 0 && /^\p{Lu}/u.test(token) && token.length >= 2
    if (digit || proper) terms.add(key)
  })
  return terms
}

function sameFact(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  let shared = 0
  for (const term of left) if (right.has(term)) shared += 1
  return shared >= REFORMULATION_MIN_SHARED && shared / Math.min(left.size, right.size) >= REFORMULATION_OVERLAP
}

export function groupSignalReformulations(
  lines: readonly AccountSignalLine[],
  options: MergeSignalLineOptions = {},
): SignalLineGroup[] {
  const company = words(options.companyName ?? '')
  const groups: Array<SignalLineGroup & { terms: Set<string> }> = []
  for (const line of lines) {
    const terms = line.type === 'recrutement' ? new Set<string>() : rareTerms(line.title, company)
    const month = line.date.slice(0, 7)
    const home = groups.find(
      group => group.line.type === line.type && group.line.date.slice(0, 7) === month && sameFact(group.terms, terms),
    )
    if (home) home.members.push(line)
    else groups.push({ line, members: [line], terms })
  }
  return groups.map(({ line, members }) => ({ line, members }))
}

/**
 * Lot 771 — « le même jour » : deux dates égales, OU l'une ne porte que le mois (ou l'année) et l'autre tombe dedans.
 * « 2026-05 » et « 2026-05-12 » dit le même événement lu à deux précisions ; deux JOURS différents restent deux faits.
 */
function sameDay(left: Dated, right: Dated): boolean {
  if (left.at.date === right.at.date) return true
  const coarse = (at: LineDate) => at.precision !== 'day'
  if (!coarse(left.at) && !coarse(right.at)) return false
  const length = Math.min(
    ...[left.at, right.at].map(at => (at.precision === 'year' ? 4 : at.precision === 'month' ? 7 : 10)),
  )
  return left.at.date.slice(0, length) === right.at.date.slice(0, length)
}

function toLine(item: Dated, now: Date): AccountSignalLine {
  const { candidate } = item
  const line: AccountSignalLine = {
    id: candidate.key,
    date: item.at.date,
    date_precision: item.at.precision,
    period: item.observedOnly ? 'past' : signalLinePeriod(item.at.endMs, now),
    type: candidate.type,
    ...(candidate.origin ? { origin_kind: candidate.origin } : {}),
    ...(clean(candidate.entity) ? { entity: clean(candidate.entity)! } : {}),
    title: item.title,
    detail: clean(candidate.detail),
    url: clean(candidate.url),
    people_hints: {
      names: uniq(candidate.names),
      roles: uniq(candidate.roles),
      location: clean(candidate.location),
    },
  }
  const origin = candidate.type === 'recrutement' ? offerOriginLabel(line.url, candidate.board) : null
  if (origin) line.origin = origin
  const contract = declaredContract(candidate)
  if (contract) line.contract_type = contract
  if (candidate.outcome) line.outcome = candidate.outcome
  if (typeof candidate.tjmEur === 'number' && Number.isFinite(candidate.tjmEur) && candidate.tjmEur > 0) {
    line.tjm_eur = candidate.tjmEur
  }
  const technologies = uniq(candidate.technologies)
  if (technologies.length > 0) line.technologies = technologies
  const leadId = clean(candidate.leadId)
  if (leadId) line.lead_id = leadId
  const contactIds = uniq(candidate.contactIds)
  if (contactIds.length > 0) line.contact_ids = contactIds
  return line
}

/** #5000.1 — le contrat d'une OFFRE, lu sur ce que l'annonce déclare ; vide ou « non précisé » ⇒ rien. */
function declaredContract(candidate: SignalLineCandidate): NonNullable<AccountSignalLine['contract_type']> | undefined {
  if (candidate.type !== 'recrutement' || !clean(candidate.contractType)) return undefined
  const contract = normalizeContractType(candidate.contractType)
  return contract === 'non précisé' ? undefined : contract
}

/** #5005.1 — un doublon qui répète la ligne mère (même intitulé, même lieu connu) n'est pas un poste de plus. */
function repeatsHead(line: AccountSignalLine, item: Dated): boolean {
  if (item.title.toLowerCase() !== line.title.toLowerCase()) return false
  const place = clean(item.candidate.location)?.toLowerCase()
  const headPlace = line.people_hints.location?.toLowerCase()
  return item.at.date === line.date || !place || !headPlace || place === headPlace
}

function mergedRow(item: Dated): NonNullable<AccountSignalLine['merged']>[number] {
  const url = clean(item.candidate.url)
  const location = clean(item.candidate.location)
  const origin = offerOriginLabel(url, item.candidate.board)
  const contract = declaredContract(item.candidate)
  return {
    title: item.title,
    date: item.at.date,
    url,
    ...(location ? { location } : {}),
    ...(origin ? { origin } : {}),
    ...(contract ? { contract_type: contract } : {}),
  }
}

/** Une ligne absorbe un doublon : rien de ce que le doublon savait ne se perd. */
function absorb(line: AccountSignalLine, item: Dated, asMergedRow: boolean): void {
  const { candidate } = item
  const url = clean(candidate.url)
  if (asMergedRow && !repeatsHead(line, item)) {
    line.merged = [...(line.merged ?? []), mergedRow(item)]
  }
  if (!line.url && url) line.url = url
  if (!line.origin && candidate.type === 'recrutement' && line.type === 'recrutement') {
    const origin = offerOriginLabel(line.url, candidate.board)
    if (origin) line.origin = origin
  }
  if (!line.contract_type && line.type === 'recrutement') {
    const contract = declaredContract(candidate)
    if (contract) line.contract_type = contract
  }
  if (!line.origin_kind && candidate.origin) line.origin_kind = candidate.origin
  const detail = clean(candidate.detail)
  if (!line.detail) line.detail = detail
  else if (detail && detail.length > line.detail.length && isNeedLineType(line.type) === false) line.detail = detail
  if (!line.outcome && candidate.outcome) line.outcome = candidate.outcome
  if (line.tjm_eur === undefined && typeof candidate.tjmEur === 'number' && candidate.tjmEur > 0) {
    line.tjm_eur = candidate.tjmEur
  }
  const technologies = uniq([...(line.technologies ?? []), ...(candidate.technologies ?? [])])
  if (technologies.length > 0) line.technologies = technologies
  const leadId = clean(candidate.leadId)
  if (!line.lead_id && leadId) line.lead_id = leadId
  const contactIds = uniq([...(line.contact_ids ?? []), ...(candidate.contactIds ?? [])])
  if (contactIds.length > 0) line.contact_ids = contactIds
  line.people_hints = {
    names: uniq([...line.people_hints.names, ...(candidate.names ?? [])]),
    roles: uniq([...line.people_hints.roles, ...(candidate.roles ?? [])]),
    location: line.people_hints.location ?? clean(candidate.location),
  }
}

/**
 * Lot 785 (#5213) — L'Historique est servi PAR PAGES de comptes (une ligne d'écran = un compte) : l'import du pack
 * marché fait croître le volume, et tout l'historique en une réponse pesait ~3,8 Mo / ~10 s.
 *
 *  · `limit` (défaut 50, borné) + `offset` : l'ordre est celui de la liste (nom du compte) ;
 *  · `q` : la recherche texte est faite CÔTÉ SERVEUR avec la règle de l'écran (`signal-search.ts`, un seul module,
 *    GA-26) — un compte correspond quand un de ses besoins passés correspond ;
 *  · `.strict()` : un paramètre inconnu est REFUSÉ (400), jamais avalé en silence (Zod ignore sinon ce qu'il ne
 *    connaît pas : un `?search=` mal nommé rendrait l'historique entier sans rien dire).
 */
export const HISTORY_PAGE_SIZE = 50
export const HISTORY_PAGE_MAX = 200

export const workspaceSignalHistoryQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(HISTORY_PAGE_MAX).default(HISTORY_PAGE_SIZE),
    offset: z.coerce.number().int().min(0).default(0),
    q: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform(value => (value ? value : undefined)),
  })
  .strict()
export type WorkspaceSignalHistoryQuery = z.infer<typeof workspaceSignalHistoryQuerySchema>

/** Le positionnement de la page rendue — `total` = comptes de la MÊME requête (recherche comprise), pas de l'espace. */
export const workspaceSignalHistoryPageSchema = z
  .object({ total: z.number().int().min(0), offset: z.number().int().min(0), limit: z.number().int().min(1) })
  .strict()

/**
 * Un compte de l'Historique correspond à la recherche quand UN de ses besoins passés correspond : la même
 * lecture des champs que l'écran (titre > compétences > détail > nom du compte), le même score (`scoreSearch`).
 */
export function historyAccountMatchesSearch(
  account: Pick<WorkspaceSignalHistoryAccount, 'company_name' | 'lines'>,
  search: ParsedSearch,
): boolean {
  return account.lines.some(
    line =>
      scoreSearch(search, {
        title: line.title,
        skills: line.technologies ?? [],
        detail: [line.detail, ...(line.merged ?? []).map(row => row.title)].filter(Boolean).join(' '),
        account: account.company_name,
        dateMs: null,
      }) !== null,
  )
}
