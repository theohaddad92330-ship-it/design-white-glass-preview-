import { maturityOfStage, stagesOfMaturity, type MaturityLevel } from '../maturity-tabs'
import type { AccountNeedsRow } from '@bellum/contracts'
import { matchesFlexibleQuery } from '@bellum/contracts'

/**
 * « Besoins » — vue portefeuille de ce dont chaque compte a besoin.
 *
 * Pure derivation over what the analysis ALREADY produced (`GET /accounts/needs`) :
 * aucune donnée inventée, aucun appel IA. Quatre sources, par ordre de force de
 * preuve décroissante :
 *
 *  - `pain`      → `raw_analysis.pains[]` — le besoin explicite, avec l'offre ESN
 *                  qui y répond (`esn_offer`) et son urgence.
 *  - `challenge` → `it_challenges[]` — le chantier IT identifié (sévérité + horizon).
 *  - `program`   → `raw_analysis.program_names[]` — le projet nommé, souvent budgété.
 *  - `implication` → `it_implications_for_esn` — la lecture ESN de l'activité, en
 *                  dernier recours : c'est une déduction, pas un fait sourcé.
 *
 * Les lignes legacy peuvent porter les clés en camelCase (écrites par l'IA avant
 * la normalisation snake_case à la persistence) — chaque lecture accepte les deux.
 *
 * Le modèle ne porte AUCUN libellé : il expose des `kind` / `urgency` typés, que
 * les vues traduisent via le namespace i18n `needs` (FR + EN).
 */

export type NeedKind = 'pain' | 'challenge' | 'program' | 'signal' | 'implication'

/**
 * Les natures qui sont un BESOIN. `signal` en est exclu à dessein : un signal
 * d'achat est un fait daté et sourcé qui annonce peut-être un besoin — le
 * compter comme tel gonflerait « N besoins identifiés » avec des nouvelles de
 * presse. Le graphe les tient ensemble (§6), les compteurs les séparent.
 */
export const NEED_KINDS = ['pain', 'challenge', 'program', 'implication'] as const

export function isNeedKind(kind: NeedKind): boolean {
  return (NEED_KINDS as readonly NeedKind[]).includes(kind)
}

/**
 * Le STADE d'une entrée dans la progression fait → projet → demande (p42-43).
 *
 * L'écran présentait quatre onglets — Besoins exprimés, Chantiers IT, Projets,
 * Signaux d'achat — qui sont en réalité quatre POSITIONS sur une seule chaîne de
 * preuve. Rangées côte à côte, elles laissaient croire à quatre familles
 * indépendantes, et la même donnée réapparaissait d'un onglet à l'autre sans
 * qu'aucune progression ne soit lisible.
 *
 * La conversion est déterministe et sans perte : chaque nature a exactement une
 * position, et aucune n'en gagne au passage. Un signal reste un fait daté ; un
 * chantier reste une interprétation ; seul un besoin EXPRIMÉ atteint « demande
 * confirmée », parce que lui seul repose sur une parole.
 */
export type NeedStage = 'signal' | 'plausible' | 'qualified' | 'confirmed'

/** Ordre de la progression, du moins au plus engageant. */
export const NEED_STAGES = ['signal', 'plausible', 'qualified', 'confirmed'] as const

const STAGE_BY_KIND: Record<NeedKind, NeedStage> = {
  // Un fait daté et sourcé. Il annonce peut-être un besoin ; il n'en est pas un.
  signal: 'signal',
  // Une interprétation qui relie plusieurs faits — un chantier lu dans les
  // actualités, une implication déduite du contexte.
  challenge: 'plausible',
  implication: 'plausible',
  // Un projet NOMMÉ : le périmètre existe, il est cité.
  program: 'qualified',
  // Quelqu'un l'a dit. C'est la seule nature qui repose sur une parole, et donc
  // la seule qui mérite le mot « besoin ».
  pain: 'confirmed',
}

export function needStage(kind: NeedKind): NeedStage {
  return STAGE_BY_KIND[kind]
}

/** Rang de tri : la progression se lit du plus engageant au moins engageant. */
export const STAGE_RANK: Record<NeedStage, number> = {
  confirmed: 3,
  qualified: 2,
  plausible: 1,
  signal: 0,
}

/** Urgence normalisée. `unknown` = non renseignée par l'IA (jamais devinée). */
export type NeedUrgency = 'high' | 'medium' | 'low' | 'unknown'

export type NeedItem = {
  id: string
  kind: NeedKind
  /** Le besoin, en une ligne — ce que le commercial lit dans le tableau. */
  label: string
  /** Impact business / description / budget selon la source. */
  detail: string | null
  /** L'offre ESN qui répond au besoin, quand l'IA l'a rattachée. */
  offer: string | null
  /** Horizon (`timeframe`) quand la source en porte un. */
  timeframe: string | null
  urgency: NeedUrgency
}

export type AccountNeeds = {
  accountId: string
  companyName: string
  sector: string | null
  score: number | null
  updatedAt: string | null
  needs: NeedItem[]
  /** Urgence la plus forte du compte — pilote le tri et le badge de ligne. */
  topUrgency: NeedUrgency
  /** Les offres ESN distinctes rattachées aux besoins du compte. */
  offers: string[]
}

type NeedsStats = {
  accounts: number
  needs: number
  /** Besoins marqués urgents par l'IA — c'est la pile « à traiter en priorité ». */
  urgentNeeds: number
  /** Signaux d'achat détectés — comptés à part des besoins (§6, 5ᵉ nature). */
  buyingSignals: number
  /** Comptes dont aucun besoin ne porte d'offre ESN → à enrichir. */
  accountsWithoutOffer: number
}

/** Besoins montrés directement sur la ligne du compte — au-delà, on compte. */
const PREVIEW_NEEDS_LIMIT = 3

const URGENCY_RANK: Record<NeedUrgency, number> = { high: 3, medium: 2, low: 1, unknown: 0 }

export function buildAccountNeeds(rows: AccountNeedsRow[]): AccountNeeds[] {
  return rows
    .map(toAccountNeeds)
    .filter(entry => entry.needs.length > 0)
    .sort(compareAccounts)
}

function toAccountNeeds(row: AccountNeedsRow): AccountNeeds {
  const needs = [
    ...(row.pains ?? []).map((pain, i) => painNeed(row.account_id, pain, i)),
    ...(row.it_challenges ?? []).map((challenge, i) => challengeNeed(row.account_id, challenge, i)),
    ...(row.programs ?? []).map((program, i) => programNeed(row.account_id, program, i)),
    ...(row.signals ?? []).map((signal, i) => signalNeed(row.account_id, signal as Loose, i)),
    implicationNeed(row.account_id, row.it_implications, row.angles),
  ].filter((need): need is NeedItem => need !== null)

  const deduped = dedupeByLabel(needs).sort(compareNeeds)

  return {
    accountId: row.account_id,
    companyName: row.company_name,
    sector: nullableText(row.sector),
    score: typeof row.score === 'number' ? row.score : null,
    updatedAt: row.updated_at ?? null,
    needs: deduped,
    topUrgency: deduped[0]?.urgency ?? 'unknown',
    offers: distinctOffers(deduped),
  }
}

type Loose = Record<string, unknown>

function painNeed(accountId: string, pain: Loose, index: number): NeedItem | null {
  const label = nullableText(read(pain, 'pain'))
  if (!label) return null
  return {
    id: `${accountId}:pain:${index}`,
    kind: 'pain',
    label,
    detail: nullableText(read(pain, 'business_impact', 'businessImpact')),
    offer: nullableText(read(pain, 'esn_offer', 'esnOffer')),
    timeframe: null,
    urgency: normalizeUrgency(read(pain, 'urgency')),
  }
}

function challengeNeed(accountId: string, challenge: Loose, index: number): NeedItem | null {
  const label = nullableText(read(challenge, 'title'))
  if (!label) return null
  return {
    id: `${accountId}:challenge:${index}`,
    kind: 'challenge',
    label,
    detail: nullableText(read(challenge, 'description')),
    offer: null,
    timeframe: nullableText(read(challenge, 'timeframe')),
    // `severity` de l'IA est l'axe d'urgence des chantiers IT (critique/haute/…).
    urgency: normalizeUrgency(read(challenge, 'severity')),
  }
}

function programNeed(accountId: string, program: Loose, index: number): NeedItem | null {
  const label = nullableText(read(program, 'name'))
  if (!label) return null
  const budget = nullableText(read(program, 'budget'))
  const description = nullableText(read(program, 'description'))
  return {
    id: `${accountId}:program:${index}`,
    kind: 'program',
    label,
    detail: [budget, description].filter(Boolean).join(' · ') || null,
    offer: null,
    timeframe: null,
    urgency: 'unknown',
  }
}

/**
 * Signal d'achat (`recent_signals[]`) — la 5ᵉ nature (§6). Le libellé voyage
 * sous quatre clés selon l'âge de la ligne ; le détail réunit ce que la source
 * dit VRAIMENT (l'implication commerciale écrite par l'IA), la source et la
 * date, sans jamais rien compléter. Aucune urgence : un signal n'en porte pas,
 * et en déduire une serait l'inventer.
 */
function signalNeed(accountId: string, signal: Loose, index: number): NeedItem | null {
  const label = nullableText(read(signal, 'title', 'label', 'description', 'signal'))
  if (!label) return null
  const implication = nullableText(read(signal, 'salesImplication', 'sales_implication'))
  const source = nullableText(read(signal, 'source'))
  const date = nullableText(read(signal, 'date'))
  return {
    id: `${accountId}:signal:${index}`,
    kind: 'signal',
    label,
    detail: [implication, [source, date].filter(Boolean).join(' · ') || null].filter(Boolean).join(' — ') || null,
    offer: null,
    timeframe: null,
    urgency: 'unknown',
  }
}

/**
 * `it_implications_for_esn` est une phrase libre, pas une liste : elle devient un
 * seul item, rattaché à la première offre d'un angle d'attaque quand il y en a
 * une (le lien besoin → offre est ce qui rend la ligne actionnable).
 */
function implicationNeed(
  accountId: string,
  implications: string | null,
  angles: AccountNeedsRow['angles'],
): NeedItem | null {
  const label = nullableText(implications)
  if (!label) return null
  const offer = (angles ?? []).map(angle => nullableText(read(angle as Loose, 'offer'))).find(Boolean) ?? null
  return {
    id: `${accountId}:implication`,
    kind: 'implication',
    label,
    detail: null,
    offer,
    timeframe: null,
    urgency: 'unknown',
  }
}

/** Le même besoin remonte parfois en `pain` ET en `it_challenge` — on garde le
 *  premier (tri par force de preuve), en récupérant l'offre du doublon. */
function dedupeByLabel(needs: NeedItem[]): NeedItem[] {
  const byKey = new Map<string, NeedItem>()
  for (const need of needs) {
    const key = need.label.toLowerCase().replace(/\s+/g, ' ').trim()
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, need)
      continue
    }
    if (!existing.offer && need.offer) byKey.set(key, { ...existing, offer: need.offer })
  }
  return [...byKey.values()]
}

function distinctOffers(needs: NeedItem[]): string[] {
  const seen = new Set<string>()
  for (const need of needs) {
    if (need.offer) seen.add(need.offer)
  }
  return [...seen]
}

export function buildNeedsStats(entries: AccountNeeds[]): NeedsStats {
  const all = entries.flatMap(entry => entry.needs)
  return {
    accounts: entries.length,
    // Les signaux d'achat ne sont PAS des besoins : ils ont leur propre compteur.
    needs: all.filter(need => isNeedKind(need.kind)).length,
    urgentNeeds: all.filter(need => isNeedKind(need.kind) && isUrgent(need)).length,
    buyingSignals: all.filter(need => need.kind === 'signal').length,
    accountsWithoutOffer: entries.filter(entry => entry.offers.length === 0).length,
  }
}

function isUrgent(need: NeedItem): boolean {
  return need.urgency === 'high'
}

/**
 * « Confirmées » vs « à qualifier » — UNE définition, celle des badges.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT, MESURÉ EN PRODUCTION LE 03/09/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * Sur la carte de BlaBlaCar, à quarante pixels d'écart :
 *
 *   « 14 opportunités détectées : **7 confirmées**, 1 à qualifier »
 *   « **2 besoins confirmés** à traiter »
 *
 * Deux chiffres, le même mot, deux définitions. Et une troisième juste à côté :
 * les badges de chaque ligne (`StageBadge`) n'écrivent « Demande confirmée » que
 * sur les `pain` — on pouvait donc COMPTER deux badges verts sous une phrase qui
 * en annonçait sept.
 *
 * Ce décompte-ci retenait `pain` + `challenge` + `program` (« repose sur un fait
 * sourcé »). Les badges et le geste prioritaire retiennent `pain` seul, parce
 * que c'est la règle du modèle : « seul un besoin EXPRIMÉ atteint *demande
 * confirmée*, parce que lui seul repose sur une PAROLE ». Un chantier IT lu dans
 * la presse est sourcé, il n'est pas confirmé par le client.
 *
 * Les deux lectures se défendaient chacune chez elle ; côte à côte sur la même
 * carte, l'une des deux ment forcément. C'est `maturityOfStage` qui tranche
 * maintenant — la table que les onglets, les badges et le geste prioritaire
 * lisent déjà. Une dérivation vit à UN SEUL endroit (GA-26).
 *
 * ⚠️ Le décompte devient plus SÉVÈRE, et c'est le sens de la correction : il
 * annonçait plus de demandes confirmées qu'il n'y en avait, sur l'écran dont
 * tout le propos est de ne pas faire passer une déduction pour une parole.
 */
export function splitNeedsByConfidence(needs: NeedItem[]): { confirmed: number; toQualify: number } {
  // Les signaux sont exclus des deux colonnes : ce décompte parle de BESOINS
  // (« 11 opportunités détectées : 5 confirmées, 6 à qualifier », §7).
  const actual = needs.filter(need => isNeedKind(need.kind))
  const confirmed = actual.filter(need => maturityOfStage(needStage(need.kind)) === 'confirmed').length
  return { confirmed, toQualify: actual.length - confirmed }
}

/**
 * La ligne du compte montre les besoins les plus forts (déjà triés par urgence
 * puis par force de preuve) ; le reste ne devient visible qu'à l'ouverture du
 * détail — une ligne lisible vaut mieux qu'une ligne exhaustive tronquée.
 */
export function splitPreviewNeeds(entry: AccountNeeds): { preview: NeedItem[]; remaining: number } {
  return {
    preview: entry.needs.slice(0, PREVIEW_NEEDS_LIMIT),
    remaining: Math.max(0, entry.needs.length - PREVIEW_NEEDS_LIMIT),
  }
}

type NeedGroup = { kind: NeedKind; needs: NeedItem[] }

/** Détail du compte : les besoins regroupés par source, de la plus sourcée
 *  (`pain`) à la plus déduite (`implication`). Les groupes vides disparaissent. */
export function groupNeedsByKind(needs: NeedItem[]): NeedGroup[] {
  const kinds = Object.keys(KIND_RANK) as NeedKind[]
  return kinds
    .map(kind => ({ kind, needs: needs.filter(need => need.kind === kind) }))
    .filter(group => group.needs.length > 0)
}

/**
 * Filtre par STADE de la progression (plus par nature), et ordonne les besoins
 * d'un compte du plus engageant au moins engageant.
 *
 * L'ordre compte autant que le filtre : sur un compte qui porte à la fois une
 * demande confirmée et trois signaux, c'est la demande qu'il faut lire en
 * premier — c'est la seule sur laquelle quelqu'un s'est exprimé.
 */
/**
 * #1330 (3/7) — le filtre porte un NIVEAU DE MATURITÉ, plus une étape.
 *
 * Cinq onglets dont trois se ressemblaient (« projets qualifiés », « projets
 * plausibles », « signaux ») demandaient de choisir avant de comprendre. Les
 * quatre étapes du contrat ne bougent pas — elles portent des définitions que
 * le produit tient ailleurs — mais elles se regroupent en trois niveaux.
 */
export function filterAccountNeeds(
  entries: AccountNeeds[],
  level: MaturityLevel | 'all',
  query: string,
): AccountNeeds[] {
  const needle = query.trim()
  const retenues = level === 'all' ? null : stagesOfMaturity(level)
  return entries
    .map(entry => {
      const needs = entry.needs
        .filter(need => {
          if (retenues && !retenues.includes(needStage(need.kind))) return false
          if (!needle) return true
          return matchesQuery(entry, need, needle)
        })
        .sort((a, b) => STAGE_RANK[needStage(b.kind)] - STAGE_RANK[needStage(a.kind)])
      return { ...entry, needs }
    })
    .filter(entry => entry.needs.length > 0)
}

// #4400.1 — la recherche est SOUPLE (préfixe, accents, pluriel, abréviations, ET) : un seul normaliseur, celui de Découvrir.
function matchesQuery(entry: AccountNeeds, need: NeedItem, needle: string): boolean {
  const text = [entry.companyName, entry.sector, need.label, need.detail, need.offer]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
  return matchesFlexibleQuery(needle, text)
}

function compareAccounts(a: AccountNeeds, b: AccountNeeds): number {
  const byUrgency = URGENCY_RANK[b.topUrgency] - URGENCY_RANK[a.topUrgency]
  if (byUrgency !== 0) return byUrgency
  const byScore = (b.score ?? -1) - (a.score ?? -1)
  if (byScore !== 0) return byScore
  // #4340 — à pertinence égale, la DATE (la plus récente d'abord, sans date en
  // dernier) ; le nom ne départage plus qu'un ex æquo exact, pour un ordre stable.
  const byDate = (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
  if (byDate !== 0) return byDate
  return a.companyName.localeCompare(b.companyName, 'fr')
}

// Ordre de lecture : du besoin le plus sourcé au plus déduit ; le signal se
// range entre les deux — c'est un fait établi, mais pas un besoin exprimé.
const KIND_RANK: Record<NeedKind, number> = { pain: 0, challenge: 1, program: 2, signal: 3, implication: 4 }

function compareNeeds(a: NeedItem, b: NeedItem): number {
  const byUrgency = URGENCY_RANK[b.urgency] - URGENCY_RANK[a.urgency]
  if (byUrgency !== 0) return byUrgency
  return KIND_RANK[a.kind] - KIND_RANK[b.kind]
}

/** Première clé présente parmi les alias (snake_case canonique, camelCase legacy). */
function read(source: Loose, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = source?.[key]
    if (value !== undefined && value !== null) return value
  }
  return null
}

function nullableText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * L'IA écrit l'urgence en français ou en anglais selon le prompt
 * (`critique`/`haute`/`élevée`/`high`…). Tout ce qui n'est pas reconnu reste
 * `unknown` — on n'invente pas une urgence absente.
 */
export function normalizeUrgency(value: unknown): NeedUrgency {
  const text = nullableText(value)?.toLowerCase()
  if (!text) return 'unknown'
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (/(critique|critical|haute|high|elevee|eleve|urgent)/.test(normalized)) return 'high'
  if (/(moyenne|medium|moderee|modere|normale)/.test(normalized)) return 'medium'
  if (/(faible|low|basse|mineure)/.test(normalized)) return 'low'
  return 'unknown'
}
