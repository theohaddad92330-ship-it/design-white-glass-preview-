// Client pour la LECTURE des prospects du formulaire de démo
// (GET /internal/demo-leads, gardé par InternalSecretGuard).
// Serveur uniquement — le secret interne ne touche jamais le navigateur.
// Mirrors src/lib/impersonations.ts et src/lib/feedback.ts.

/**
 * #2706 — Théo (CEO, 22/09/2026) : « pouvoir lire, trier et recontacter les
 * prospects qui ont ouvert la démo ». Ce module ne calcule RIEN : le tri
 * (plus récent d'abord) et le dédoublonnage par e-mail sont faits côté API
 * (`DemoLeadService.listMostRecentFirst`) ; ici on ne fait que lire.
 */

const BASE = (): string | undefined => process.env['API_BASE_URL']
const SECRET = (): string | undefined => process.env['INTERNAL_API_SECRET']

/**
 * ⚠️ Un champ optionnel absent (téléphone, UTM) est `undefined`, jamais
 * `null` ni une chaîne vide — « on n'affiche pas ce qu'on n'a pas » (doctrine,
 * Louis 20/09/2026). Même forme que rendue par `InternalDemoLeadsController`.
 */
export type DemoLead = {
  id: string
  firstName: string
  lastName: string
  email: string
  jobTitle: string
  company: string
  phone?: string
  firstAccessAt: string
  lastAccessAt: string
  accessCount: number
  source: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmTerm?: string
  utmContent?: string
}

/**
 * Les prospects du formulaire de démo, plus récent d'abord.
 *
 * ⚠️ JETTE quand l'API ne répond pas — même règle que `fetchImpersonations` :
 * une liste vide sur une panne se lirait comme « personne n'a lancé la
 * démo », ce qui n'est pas ce qu'on sait.
 */
export async function fetchDemoLeads(): Promise<DemoLead[]> {
  const base = BASE()
  const secret = SECRET()
  if (!base || !secret) {
    throw new Error('API_BASE_URL ou INTERNAL_API_SECRET non configuré côté console.')
  }

  const res = await fetch(`${base}/internal/demo-leads`, {
    headers: { 'x-internal-secret': secret },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Le service des prospects a répondu ${res.status} ${res.statusText}`)
  }
  const data = (await res.json()) as { items: DemoLead[] }
  return data.items
}
