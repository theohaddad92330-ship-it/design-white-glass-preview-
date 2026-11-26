import { z } from 'zod'

/**
 * CASCADE-ECRAN — le contrat de `raw_analysis.offersCascade`, posé par le moteur de cascade du service IA
 * (`apps/ia/app/services/offers_cascade.py`, plancher de 5 offres DU MÉTIER). Le web AFFICHE ce que le
 * moteur a compté ; il ne recalcule rien. Aucun fournisseur nommé : le payload ne porte que des paliers.
 *
 * Miroir Python : les paliers de `TIER_ORDER` et les statuts de `STATUS_*` (le service IA ne peut pas
 * importer ce paquet — racine Railway `apps/ia`).
 */
export const OFFERS_CASCADE_TIERS = ['sources', 'terms', 'window', 'group'] as const
export type OffersCascadeTier = (typeof OFFERS_CASCADE_TIERS)[number]

/** Le statut d'un palier que le moteur a réellement interrogé (« tenté »). */
const STATUS_TRIED = 'tenté'

const offersCascadeTierSchema = z.object({
  tier: z.enum(OFFERS_CASCADE_TIERS),
  status: z.string(),
  gained: z.number().int().nonnegative(),
  paid: z.number().int().nonnegative(),
  cached: z.number().int().nonnegative(),
  notAttempted: z.number().int().nonnegative(),
})

const offersCascadeSchema = z.object({
  floor: z.number().int().positive(),
  found: z.number().int().nonnegative(),
  belowFloor: z.boolean(),
  explicit: z.boolean(),
  reason: z.string().nullable(),
  paidCalls: z.number().int().nonnegative(),
  tiers: z.array(offersCascadeTierSchema),
  /** #4646.7 — offres de Découvrir que la collecte du compte n'a PAS retrouvées et que le dossier garde recopiées. */
  carriedFromDiscover: z.number().int().positive().optional(),
})
export type OffersCascade = z.infer<typeof offersCascadeSchema>

/** Ce que l'écran dit : jusqu'où la recherche s'est élargie, et si le plancher n'a pas été atteint. */
export type OffersCascadeView = {
  floor: number
  /** Offres du métier trouvées ; `null` quand il n'y en a aucune (une absence ne s'affiche jamais « 0 »). */
  found: number | null
  /** Le dernier palier réellement tenté ; `null` si aucun n'a été interrogé. */
  widenedTo: OffersCascadeTier | null
  belowFloor: boolean
  /** #4646.7 — offres relevées dans Découvrir et gardées au dossier faute d'être retrouvées ; `null` sans (jamais 0). */
  carried: number | null
}

/** Lit `raw_analysis.offersCascade`. Absent ou illisible : `null` — rien à dire, jamais une mention devinée. */
export function readOffersCascade(rawAnalysis: unknown): OffersCascade | null {
  const raw = rawAnalysis && typeof rawAnalysis === 'object' ? (rawAnalysis as Record<string, unknown>) : {}
  const parsed = offersCascadeSchema.safeParse(raw['offersCascade'])
  return parsed.success ? parsed.data : null
}

/**
 * La vue à afficher, ou `null` quand la cascade ne s'est pas déclenchée (plancher atteint au palier 0 :
 * aucune ligne, aucun texte). Un plancher non atteint se dit même si aucun palier n'a pu être interrogé.
 */
export function offersCascadeView(cascade: OffersCascade | null): OffersCascadeView | null {
  if (!cascade) return null
  const tried = cascade.tiers.filter(t => t.status === STATUS_TRIED)
  const widenedTo = tried.length > 0 ? tried[tried.length - 1]!.tier : null
  const carried = cascade.carriedFromDiscover ?? null
  if (!widenedTo && !cascade.belowFloor && carried === null) return null
  return {
    floor: cascade.floor,
    found: cascade.found > 0 ? cascade.found : null,
    widenedTo,
    belowFloor: cascade.belowFloor,
    carried,
  }
}
