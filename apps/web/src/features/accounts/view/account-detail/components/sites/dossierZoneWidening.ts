export type DossierZoneWidening = {
  requested: string[]
  tier: 'region' | 'france'
  area?: string
}

/**
 * #4432.9 — la mention « Aucune entité du groupe en <zone> — élargi à <palier> » que l'IA pose sur le dossier zoné
 * (`raw_analysis.dossierZoneWidening`). Absente, ou illisible : `null` — rien à dire, jamais une mention devinée.
 */
export function readDossierZoneWidening(rawAnalysis: unknown): DossierZoneWidening | null {
  const raw = rawAnalysis && typeof rawAnalysis === 'object' ? (rawAnalysis as Record<string, unknown>) : {}
  const value = raw['dossierZoneWidening']
  if (!value || typeof value !== 'object') return null
  const { requested, tier, area } = value as Record<string, unknown>
  if (tier !== 'region' && tier !== 'france') return null
  const zones = Array.isArray(requested)
    ? requested.filter((z): z is string => typeof z === 'string' && !!z.trim())
    : []
  if (zones.length === 0) return null
  return { requested: zones, tier, ...(typeof area === 'string' && area.trim() ? { area } : {}) }
}

/**
 * #4432.10 — « de quels critères le dossier est né » : les lignes de critères de la recherche (Découvrir ou carte de
 * Laura) et la zone du cadrage (`raw_analysis.dossierBornFrom`). Rien de lisible : `null`, jamais une ligne devinée.
 */
export function readDossierBornFrom(rawAnalysis: unknown): string[] | null {
  const raw = rawAnalysis && typeof rawAnalysis === 'object' ? (rawAnalysis as Record<string, unknown>) : {}
  const value = raw['dossierBornFrom']
  if (!value || typeof value !== 'object') return null
  const { criteria, areas } = value as Record<string, unknown>
  const lines = (list: unknown) =>
    Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string' && !!x.trim()) : []
  const all = [...lines(criteria), ...(lines(areas).length ? [lines(areas).join(', ')] : [])]
  return all.length > 0 ? all : null
}
