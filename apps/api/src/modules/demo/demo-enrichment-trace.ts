import { missingEnrichmentChannels, type ContactAvailability, type EnrichmentCoordinateStates } from '@bellum/contracts'

/**
 * #3549.4 (recette salle démo 03/10) — la trace d'enrichissement d'un contact
 * SIMULÉ, écrite à UN seul endroit (GA-26) et lue par `DemoSeedService`.
 *
 * Pourquoi : /contacts dit « Téléphone non trouvé » / « E-mail non trouvé »
 * uniquement quand une recherche a eu lieu (`last_enrichment_at`) ; le tiret est
 * réservé au jamais-enrichi. En démo, des contacts « Enrichi » (état dérivé de la
 * présence d'un e-mail OU d'un téléphone) n'avaient AUCUNE trace d'essai : leur
 * canal manquant restait « - » — l'écran affirmait « jamais cherché » d'un
 * contact que le produit dit enrichi. La règle de l'écran était juste, c'est le
 * semis qui ne portait pas le marqueur.
 *
 * Deux cas :
 *  - `recently_enriched_no_result_days_ago` : l'essai récent resté vide
 *    (#2297.26), sous délai de protection — inchangé ;
 *  - un contact joignable par e-mail OU téléphone mais pas par les deux : un essai
 *    a abouti pour un canal et pas pour l'autre (`matched`, canaux manquants
 *    nommés). Aucun délai de protection (`matched` n'en déclenche pas). Un
 *    contact sans e-mail ni téléphone, ou complet, n'a pas d'essai à raconter.
 */
export const DEMO_MATCHED_ENRICHMENT_DAYS_AGO = 12

type TraceInput = {
  full_name?: string
  email?: string | null
  phone?: string | null
  linkedin_url?: string | null
  recently_enriched_no_result_days_ago?: number
  /** #4106.4 — la 1re source est restée vide, la 2e a répondu. */
  enrichment_cascade_sources?: 2
}

type DemoEnrichmentTrace = {
  last_enrichment_at: Date
  last_enrichment_result: 'matched' | 'no_new_data'
  last_enrichment_missing: ReturnType<typeof missingEnrichmentChannels>
}

export function demoEnrichmentTrace(contact: TraceInput, now: Date): DemoEnrichmentTrace | null {
  const channels = {
    email: contact.email ?? null,
    linkedin_url: contact.linkedin_url ?? null,
    phone: contact.phone ?? null,
  }
  const missing = missingEnrichmentChannels(channels)
  const dayMs = 86_400_000
  if (contact.recently_enriched_no_result_days_ago !== undefined) {
    return {
      last_enrichment_at: new Date(now.getTime() - contact.recently_enriched_no_result_days_ago * dayMs),
      last_enrichment_result: 'no_new_data',
      last_enrichment_missing: missing,
    }
  }
  const hasEmail = Boolean(channels.email)
  const hasPhone = Boolean(channels.phone)
  // #4106.4 — la cascade à deux sources est un essai ABOUTI même sur un contact complet.
  if (contact.enrichment_cascade_sources === 2 || ((hasEmail || hasPhone) && !(hasEmail && hasPhone))) {
    return {
      last_enrichment_at: new Date(now.getTime() - DEMO_MATCHED_ENRICHMENT_DAYS_AGO * dayMs),
      last_enrichment_result: 'matched',
      last_enrichment_missing: missing,
    }
  }
  return null
}

/**
 * E1 (#3698, #3822) — l’état PAR COORDONNÉE d’un contact simulé, dérivé de la
 * MÊME trace (GA-26) : une coordonnée présente est « trouvée », une coordonnée
 * absente après un essai est « recherchée, introuvable chez 2 sources » (le
 * nombre de sources qu’interroge la cascade réelle quand la révélation du mobile
 * ne part pas — jamais nommées). Sans essai à raconter : aucun état.
 */
export const DEMO_NOT_FOUND_SOURCES = 2

export function demoEnrichmentCoordinates(contact: TraceInput, now: Date): EnrichmentCoordinateStates | null {
  const trace = demoEnrichmentTrace(contact, now)
  if (!trace) return null
  const at = trace.last_enrichment_at.toISOString()
  const missing = new Set<string>(trace.last_enrichment_missing)
  const state = (channel: 'email' | 'phone' | 'linkedin') =>
    missing.has(channel)
      ? { state: 'not_found' as const, sources_queried: DEMO_NOT_FOUND_SOURCES, at }
      : { state: 'found' as const, sources_queried: contact.enrichment_cascade_sources ?? 1, at }
  return { email: state('email'), phone: state('phone'), linkedin: state('linkedin') }
}

/**
 * R22 a4 (Louis 22/10) — la DISPONIBILITÉ annoncée d'un contact simulé : la
 * salle montre les quatre états de la cellule « Coordonnées » (connu · disponible
 * · jamais cherché · introuvable). Même trace que le reste (GA-26) :
 *  - coordonnée présente → aucune annonce ;
 *  - absente après un essai (`demoEnrichmentTrace`) → `not_found` (la date vient
 *    de `enrichment_coordinates`) ;
 *  - absente, jamais cherchée → la source ANNONCE qu'elle existe pour une partie
 *    des sièges (alternance stable par nom), le reste reste « jamais cherché ».
 */
export function demoCoordinateAvailability(
  contact: TraceInput,
  now: Date,
): { email_availability: ContactAvailability | null; phone_availability: ContactAvailability | null } {
  const trace = demoEnrichmentTrace(contact, now)
  const missing = new Set<string>(trace?.last_enrichment_missing ?? [])
  const nameSum = [...(contact.full_name ?? '')].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  const announced = (channel: 'email' | 'phone', offset: number): ContactAvailability | null => {
    if (contact[channel]) return null
    if (trace) return missing.has(channel) ? 'not_found' : null
    return (nameSum + offset) % 3 !== 0 ? 'available' : null
  }
  return { email_availability: announced('email', 0), phone_availability: announced('phone', 1) }
}
