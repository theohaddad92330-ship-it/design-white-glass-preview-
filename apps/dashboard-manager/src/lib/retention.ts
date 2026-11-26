// Client for the API's retention-cohorts endpoint
// (GET /internal/analytics/retention-cohorts, guarded by InternalSecretGuard).
// Server-side only — the internal secret never reaches the browser. Mirrors
// src/lib/team-kpis.ts.

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

/**
 * Une cohorte mensuelle d'ESPACES — miroir de `CohorteRetention` côté API
 * (`apps/api/src/modules/analytics/retention-cohorts.ts`).
 */
export type CohorteRetention = {
  /** `YYYY-MM` — le mois d'INSCRIPTION, jamais un mois d'activité. */
  cohorte: string
  /** Espaces inscrits ce mois-là. Le dénominateur, et ce qui décide du masquage. */
  espaces: number
  /** Décalages de mois DÉJÀ atteints. Calculé par le serveur, qui seul connaît
   *  l'heure de la lecture — le refaire ici en ferait une seconde vérité. */
  moisEcoules: number
  /** Part d'espaces actifs à chaque décalage, 0 → 1. `null` = mois à venir,
   *  JAMAIS « zéro espace actif ». */
  retentionParMois: (number | null)[]
}

export type RapportRetention = {
  cohortes: CohorteRetention[]
  mois: number
  calculeA: string
  espaces: number
  espacesSansAucuneAction: number
}

/**
 * La rétention par cohorte mensuelle d'espaces.
 *
 * ⚠️ Jette quand l'API ne répond pas — et c'est voulu : rendre une grille vide
 * sur une panne écrirait « aucune cohorte » par-dessus une indisponibilité.
 * L'appelant attrape et affiche une ERREUR. Même geste que
 * `fetchAnalysesHeatmap`.
 */
export async function fetchRetentionCohorts(): Promise<RapportRetention> {
  const res = await fetch(`${REAL_BASE}/internal/analytics/retention-cohorts`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Retention endpoint returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as RapportRetention
}
