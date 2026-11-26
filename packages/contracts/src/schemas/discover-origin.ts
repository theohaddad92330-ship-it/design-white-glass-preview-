import { z } from 'zod'
import { APPLICATION_SECTORS } from './application-sectors.js'
import { candidateZoneLabel } from './zone-tiers.js'

/**
 * #3819 (lot RBB, décision Louis 11/10/2026) — LES CRITÈRES DE DÉCOUVRIR SUIVENT LE COMPTE.
 *
 * Un compte ajouté depuis Découvrir garde SUR QUOI il a été sélectionné : les
 * critères que l'utilisateur avait RÉELLEMENT posés ET que le candidat
 * satisfaisait (secteur, zone, effectif, signal) — jamais un critère qu'il n'a
 * pas saisi, jamais un score ni une probabilité. La RAISON calculée (angle,
 * signal daté, facteurs) voyage à côté, dans `discover_origin_reason` (#3914).
 *
 * Persisté sur `accounts.discover_origin_criteria` (jsonb, migration
 * `1796438071493`), transmis au run comme hypothèse du vendeur (cadrage), et
 * réaffiché sur le dossier (« Sélectionné sur … »).
 *
 * Les valeurs sont des CODES (vocabulaire partagé `APPLICATION_SECTORS`,
 * tranches d'effectif, sources de signal), jamais des libellés : chaque
 * lecteur les traduit dans sa langue. La zone est un texte saisi (ville et/ou
 * département) : il n'a pas de code.
 */
export const DISCOVER_ORIGIN_SIGNAL_SOURCES = ['tender', 'award', 'hiring'] as const
type DiscoverOriginSignalSource = (typeof DISCOVER_ORIGIN_SIGNAL_SOURCES)[number]

export const discoverOriginCriteriaSchema = z
  .object({
    sectors: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
    zone: z.string().trim().min(1).max(120).optional(),
    headcount: z.array(z.string().trim().min(1).max(20)).max(10).optional(),
    signals: z.array(z.enum(DISCOVER_ORIGIN_SIGNAL_SOURCES)).max(DISCOVER_ORIGIN_SIGNAL_SOURCES.length).optional(),
    // #3819 (lot W-C 13/10) — la COMPÉTENCE cherchée (mot saisi en texte libre ou
    // technologie) que porte un signal du candidat. Texte saisi : pas de code.
    // Même colonne jsonb — aucune migration (sa CHECK ne vérifie que le type objet).
    skills: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
    // #4432.1 — la zone STRUCTURÉE, en libellés (« Toulouse », « Haute-Garonne », « Occitanie ») : elle
    // devient le PÉRIMÈTRE de l'analyse (`geoScopeFromOriginCriteria`), prérempli et modifiable au cadrage.
    // `zone` (texte) reste l'affichage « Sélectionné sur … ». Même colonne jsonb — aucune migration.
    zone_city: z.string().trim().min(1).max(120).optional(),
    zone_departments: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
    zone_regions: z.array(z.string().trim().min(1).max(60)).max(18).optional(),
    // #4642 — le CONTEXTE d'une conversation avec Laura (« Comptes où placer X ») : l'identifiant de la fiche du
    // talent, les offres que la carte a relevées (intitulé + date, tels qu'affichés) et la marque de provenance.
    // Il PRIORISE l'analyse (ces offres, ces interlocuteurs en tête, nommés), il ne RESTREINT jamais : même
    // colonne jsonb, aucune migration. `framed_by` seul ne fait pas un axe (voir `isDiscoverOriginCriteriaEmpty`).
    talent_id: z.string().guid().optional(),
    // #4642 — le NOM de la fiche, pour que le dossier dise « Cadré sur : Camille Fournier · … » (0 occurrence mesurée en prod).
    talent_name: z.string().trim().min(1).max(120).optional(),
    offers: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(160),
            date: z
              .string()
              .regex(/^\d{4}-\d{2}-\d{2}$/)
              .optional(),
            // #4646.2 — le LIEN de l'annonce, tel que la carte le portait : http(s) seulement, jamais inventé.
            url: z
              .string()
              .trim()
              .max(500)
              .regex(/^https?:\/\/\S+$/i)
              .optional(),
            // #4646 — le jour où Découvrir a MONTRÉ l'offre (« vue le 27/10 ») ; absent = on ne l'invente pas.
            seen: z
              .string()
              .regex(/^\d{4}-\d{2}-\d{2}$/)
              .optional(),
          })
          .strict(),
      )
      .max(10)
      .optional(),
    framed_by: z.literal('laura').optional(),
    // #4433.9 (re-recette prod 26/10) — le PALIER de zone qui a fait sortir le compte (50 km, département, région) :
    // il suit le compte jusqu'au dossier, nommé en toutes lettres. Absent = compte exact, ou palier non mesuré.
    // Même colonne jsonb — aucune migration (sa CHECK ne vérifie que le type objet).
    zone_widened: z
      .object({
        tier: z.enum(['radius_50', 'department', 'region', 'france']),
        area: z.string().trim().min(1).max(60).optional(),
        distance_km: z.number().nonnegative().optional(),
        place: z.string().trim().min(1).max(120),
      })
      .strict()
      .optional(),
  })
  .strict()
export type DiscoverOriginCriteria = z.infer<typeof discoverOriginCriteriaSchema>

/**
 * #4646.9 — le jour où la collecte d'un compte sorti par une compétence a commencé à reprendre les offres de Découvrir.
 * Un dossier Découvrir analysé AVANT ce jour (et sans offre recopiée) le dit : le rattrapage ne part pas seul.
 */
export const DISCOVER_OFFERS_CARRIED_SINCE = '2026-10-28'

/** Aucun axe posé = rien à nommer (« on n'affiche pas ce qu'on n'a pas »). */
export function isDiscoverOriginCriteriaEmpty(criteria: DiscoverOriginCriteria | null | undefined): boolean {
  if (!criteria) return true
  return (
    !(criteria.sectors?.length ?? 0) &&
    !criteria.zone?.trim() &&
    !criteria.zone_city?.trim() &&
    !(criteria.zone_departments?.length ?? 0) &&
    !(criteria.zone_regions?.length ?? 0) &&
    !(criteria.headcount?.length ?? 0) &&
    !(criteria.signals?.length ?? 0) &&
    !(criteria.skills?.length ?? 0) &&
    !(criteria.offers?.length ?? 0) &&
    !criteria.zone_widened
  )
}

const SIGNAL_LABELS_FR: Record<DiscoverOriginSignalSource, string> = {
  tender: "appel d'offres public en cours",
  award: 'marché public remporté',
  hiring: 'recrutement',
}

function sectorLabelFr(code: string): string {
  return APPLICATION_SECTORS.find(sector => sector.code === code)?.labelFr ?? code
}

/** #4433.9 — « Élargi au département · Nord », « à 38 km de Lille » : le palier d'un compte élargi, nommé. */
export function zoneWidenedLabel(
  widened: NonNullable<DiscoverOriginCriteria['zone_widened']>,
  locale: 'fr' | 'en' = 'fr',
): string | null {
  return candidateZoneLabel(
    {
      tier: widened.tier,
      ...(widened.area ? { area: widened.area } : {}),
      ...(widened.distance_km !== undefined ? { distanceKm: widened.distance_km } : {}),
    },
    widened.place,
    locale,
  )
}

/**
 * Une ligne par axe posé, en français — la forme que le cadrage de l'analyse
 * reçoit (`seller_hypotheses.discover_origin_criteria`). Un axe vide ne fait
 * AUCUNE ligne. L'écran, lui, traduit les codes par ses propres libellés i18n.
 */
export function describeDiscoverOriginCriteriaFr(criteria: DiscoverOriginCriteria | null | undefined): string[] {
  if (!criteria) return []
  const lines: string[] = []
  // #4642 — la demande de Laura passe en TÊTE et se dit prioritaire sans rien écarter.
  if (criteria.framed_by === 'laura') {
    lines.push("demande : issue d'une conversation avec Laura (à traiter en tête et à nommer ; rien n'est écarté)")
  }
  if (criteria.talent_name?.trim()) lines.push(`consultant : ${criteria.talent_name.trim()}`)
  if (criteria.sectors?.length) lines.push(`secteur : ${criteria.sectors.map(sectorLabelFr).join(', ')}`)
  if (criteria.zone?.trim()) lines.push(`zone : ${criteria.zone.trim()}`)
  if (criteria.headcount?.length) lines.push(`effectif : ${criteria.headcount.join(', ')} salariés`)
  if (criteria.signals?.length) lines.push(`signal : ${criteria.signals.map(s => SIGNAL_LABELS_FR[s]).join(', ')}`)
  if (criteria.zone_widened) {
    const label = zoneWidenedLabel(criteria.zone_widened)
    if (label) lines.push(`zone : ${label}`)
  }
  if (criteria.skills?.length) lines.push(`compétence : ${criteria.skills.join(', ')}`)
  if (criteria.offers?.length) {
    const listed = criteria.offers.map(offer => (offer.date ? `${offer.title} (${offer.date})` : offer.title))
    lines.push(`offres relevées par la recherche : ${listed.join(' ; ')}`)
  }
  return lines
}
