import type { DemoLead } from '@/lib/demo-leads'

/**
 * #2706 — L'ÉCRAN `/prospects` — ce qu'il CALCULE, séparé de ce qu'il rend.
 * Même discipline que `impersonations.logic.ts` : le tri et le dédoublonnage
 * sont faits côté API, ce module ne fait que nommer un statut et choisir
 * quelles lignes source/UTM existent vraiment.
 */

/**
 * #2706.1 — Théo (CEO, 22/09/2026) : « statut Démo lancée ». Un libellé FIXE,
 * défini à un seul endroit (GA-26) — il n'existe aujourd'hui qu'une seule
 * étape de l'entonnoir de démo, donc rien à dériver.
 */
export const STATUT_PROSPECT_DEMO = 'Démo lancée'

type UtmPart = { label: string; value: string }

/**
 * #2706.2 — la source, et CHAQUE UTM qui existe vraiment. « On n'affiche pas
 * ce qu'on n'a pas » (doctrine, Louis 20/09/2026) : un UTM absent ne
 * fabrique aucune ligne, jamais un « — » ni un « 0 » (GA-18/GA-19).
 */
export function partsSourceUtm(
  lead: Pick<DemoLead, 'source' | 'utmSource' | 'utmMedium' | 'utmCampaign' | 'utmTerm' | 'utmContent'>,
): UtmPart[] {
  const parts: UtmPart[] = [{ label: 'Source', value: lead.source }]
  if (lead.utmSource) parts.push({ label: 'UTM source', value: lead.utmSource })
  if (lead.utmMedium) parts.push({ label: 'UTM support', value: lead.utmMedium })
  if (lead.utmCampaign) parts.push({ label: 'UTM campagne', value: lead.utmCampaign })
  if (lead.utmTerm) parts.push({ label: 'UTM terme', value: lead.utmTerm })
  if (lead.utmContent) parts.push({ label: 'UTM contenu', value: lead.utmContent })
  return parts
}
