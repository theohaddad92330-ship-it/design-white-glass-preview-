// Client for the API's manager-KPI endpoint (GET /internal/analytics/manager-kpis,
// guarded by InternalSecretGuard). Server-side only: the internal secret must
// never reach the browser. Mirrors src/lib/retention.ts.

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

/**
 * Ce que l'API rend pour un taux : la valeur, ou `null` avec de quoi dire
 * POURQUOI. Miroir de `ManagerKpiRateMeasure`
 * (`apps/api/src/modules/analytics/manager-kpi.ts`) — miroir local comme le
 * reste de ce dossier : le back-office ne dépend pas du code de l'API. Les
 * NOMBRES ne sont pas recopiés, ils voyagent dans la charge utile.
 */
export type MesureDeTaux = {
  /** `null` tant que la cohorte est sous le seuil, ou vide — jamais 0 %. */
  value: number | null
  measurability: { measurable: boolean; observed: number; required: number; missing: number }
}

/**
 * #1946.14 — les deux repères d'usage après inscription.
 *
 * ⚠️ Seuls les deux champs lus ici sont typés. La route en rend six ; en
 * déclarer quatre de plus que l'écran n'affiche donnerait l'illusion qu'ils
 * sont rendus quelque part — c'est le défaut n°1 de ce dépôt, du code juste que
 * personne n'appelle, à l'envers.
 */
export type CohortesDUsage = {
  activeCohortAtDay7: MesureDeTaux
  activeCohortAtDay30: MesureDeTaux
}

/**
 * Les deux cohortes d'usage.
 *
 * ⚠️ Jette quand l'API ne répond pas — comme `fetchRetentionCohorts`. L'appelant
 * attrape et affiche « non lu », JAMAIS un zéro : une panne de cette route ne
 * doit ni écrire « 0 % d'usage », ni emporter la grille de cohortes qui, elle,
 * vient d'une autre route et peut très bien avoir répondu.
 */
export async function fetchCohortesDUsage(): Promise<CohortesDUsage> {
  const res = await fetch(`${REAL_BASE}/internal/analytics/manager-kpis`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Manager-KPI endpoint returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as CohortesDUsage
}
