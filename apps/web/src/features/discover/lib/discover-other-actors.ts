import type { DiscoverEntityType, DiscoverSkillIntermediary } from '@bellum/contracts'
import type { DiscoverCandidate } from './discover-types'

/**
 * #4746.2 (lot P, Louis 31/10) — « Autres acteurs » : tout ce qui n'est PAS un client final (ESN, cabinet, intérim,
 * partenaire, site d'annonces). Une liste, deux onglets : « Comptes » ne montre que des clients finaux.
 *
 * La nature vient de l'IA (`actorKind`, même classement qu'`actorType`, GA-26). Une réponse d'avant ce déploiement ne
 * porte que les drapeaux historiques (#2265.14 / #3757) : on les lit en repli, sans rien deviner de plus.
 */
export const OTHER_ACTOR_KINDS = ['esn', 'recruiter', 'interim', 'partner', 'adsite'] as const
export type OtherActorKind = (typeof OTHER_ACTOR_KINDS)[number]

export function isOtherActorKind(value: unknown): value is OtherActorKind {
  return typeof value === 'string' && (OTHER_ACTOR_KINDS as readonly string[]).includes(value)
}

/** La pastille de ce candidat, ou `null` : un client final et une nature non prouvée restent dans « Comptes » (GA-18/19). */
export function otherActorKindOf(
  candidate: Pick<DiscoverCandidate, 'actorKind' | 'isDeclaredPartner' | 'isEsnPeer' | 'isIntermediary'>,
): OtherActorKind | null {
  if (candidate.actorKind) return candidate.actorKind
  if (candidate.isDeclaredPartner === true) return 'partner'
  if (candidate.isEsnPeer === true) return 'esn'
  if (candidate.isIntermediary === true) return 'recruiter'
  return null
}

export const isOtherActor = (candidate: Parameters<typeof otherActorKindOf>[0]): boolean =>
  otherActorKindOf(candidate) !== null

/**
 * #4746.2 — l'ancien filtre `entityType` quitte « Tous les filtres » : une URL / un préréglage / une recherche
 * enregistrée qui le porte ouvre l'onglet et les pastilles qui lui correspondent. `all` et `client` : « Comptes ».
 */
export function otherKindsForEntityType(entityType: DiscoverEntityType): readonly OtherActorKind[] | null {
  return entityType === 'esn' ? ['esn', 'partner'] : null
}

export interface OtherActorRow {
  id: string
  name: string
  kind: OtherActorKind
  /** Lot T — pourquoi cette ESN est ici quand son NAF ne le dit pas ; `null` = rien à dire (jamais deviné). */
  esnRecognition?: 'referential' | 'offers' | null
  city: string | null
  /** `null` = non mesuré (jamais « 0 », GA-18/19). */
  offerCount: number | null
  latestTitle: string | null
  latestUrl: string | null
  latestDate: string | null
}

const INTERMEDIARY_KIND: Record<DiscoverSkillIntermediary['kind'], OtherActorKind> = {
  recruiter: 'recruiter',
  esn: 'esn',
}

/** Les lignes du tableau compact : les candidats déjà reçus ET les cabinets/ESN de la recherche par compétence. */
export function otherActorRows(
  candidates: readonly DiscoverCandidate[],
  intermediaries: readonly DiscoverSkillIntermediary[] = [],
): OtherActorRow[] {
  const rows = new Map<string, OtherActorRow>()
  for (const candidate of candidates) {
    const kind = otherActorKindOf(candidate)
    if (!kind) continue
    const evidence = candidate.skillEvidence
    rows.set(candidate.siren, {
      id: candidate.siren,
      name: candidate.name,
      kind,
      esnRecognition: kind === 'esn' ? (candidate.esnRecognition ?? null) : null,
      city: candidate.city || null,
      offerCount: evidence ? evidence.offerCount : null,
      latestTitle: evidence?.latestOffer.title ?? null,
      latestUrl: evidence?.latestOffer.url ?? null,
      latestDate: evidence?.latestOffer.date ?? null,
    })
  }
  for (const item of intermediaries) {
    if (rows.has(item.siren)) continue
    rows.set(item.siren, {
      id: item.siren,
      name: item.name,
      kind: INTERMEDIARY_KIND[item.kind],
      esnRecognition: null,
      city: item.city ?? null,
      offerCount: item.skillEvidence.offerCount,
      latestTitle: item.skillEvidence.latestOffer.title,
      latestUrl: item.skillEvidence.latestOffer.url,
      latestDate: item.skillEvidence.latestOffer.date,
    })
  }
  return [...rows.values()]
}

/**
 * #4814 / #4419.5 — un lieu COUPÉ en route (« Lille, Hauts-de- ») redevient le nom complet d'une région connue.
 * Seul un tiret final (signe certain d'une coupe) et un préfixe de région connu complètent : rien n'est deviné ailleurs.
 */
const REGION_NAMES = [
  'Hauts-de-France',
  'Île-de-France',
  'Provence-Alpes-Côte d’Azur',
  'Auvergne-Rhône-Alpes',
  'Bourgogne-Franche-Comté',
  'Pays de la Loire',
  'Nouvelle-Aquitaine',
  'Centre-Val de Loire',
  'Grand Est',
] as const

export function completePlace(place: string | null | undefined): string | null {
  const text = (place ?? '').trim()
  if (!text) return null
  if (!/[-‐–]$/.test(text)) return text
  const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").toLowerCase()
  const last = text.split(/,\s*/).pop() ?? text
  const match = REGION_NAMES.find(region => fold(region).startsWith(fold(last)))
  if (!match) return text
  return text.slice(0, text.length - last.length) + match
}
