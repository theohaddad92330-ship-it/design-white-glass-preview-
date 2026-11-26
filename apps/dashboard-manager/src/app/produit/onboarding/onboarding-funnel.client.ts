// Client pour l'endpoint d'entonnoir d'onboarding de l'API
// (GET /internal/analytics/onboarding-funnel, gardé par InternalSecretGuard).
// Server-side only — le secret interne ne doit jamais atteindre le navigateur.
//
// Miroir de `src/lib/retention.ts` (#1658.1) : même patron (fetch server-side,
// `x-internal-secret`, jamais de cache). Ce fichier vit ICI, dans
// `app/produit/onboarding/`, plutôt que dans `src/lib/`, parce que le
// périmètre de fichiers de #1686 ne permet d'écrire que sous `app/produit/**`.

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

/**
 * Les sept étapes affichées — même clé que côté API
 * (`apps/api/src/modules/analytics/onboarding-funnel.ts`, `ETAPES_ENTONNOIR`).
 *
 * ⚠️ #1686.5 — ce fichier n'est PAS nommé dans le périmètre de ce lot
 * (`page.tsx` + ses `_components/` seulement), mais il est un MIROIR pur du
 * type API (le commentaire ci-dessus le disait déjà avant ce lot) : le laisser
 * à quatre clés aurait fait mentir ce mirror sur les données qu'il reçoit
 * réellement, sans qu'aucune erreur de compilation ne le signale (`res.json()
 * as RapportEntonnoir` n'est pas vérifié à l'exécution). Changement additif et
 * mécanique, signalé au rapport de lot.
 */
type EtapeEntonnoirCle =
  | 'onboarding_started'
  | 'onboarding_completed'
  | 'integration_connected'
  | 'analysis_started'
  | 'premiere_action_validee'
  | 'deuxieme_session'
  | 'actif_j30'

type DefinitionEtape = { cle: EtapeEntonnoirCle; libelle: string; graceJours: number }

type EtapeCohorte = {
  cle: EtapeEntonnoirCle
  /** `mesuree` : `part` est une vraie proportion, 0 → 1 (0 compris — un vrai
   *  zéro se montre). `non_mesuree` : la cohorte n'a pas eu le temps d'y
   *  arriver, `part` est `null` — jamais 0. */
  etat: 'mesuree' | 'non_mesuree' | 'non_instrumentee'
  atteints: number
  part: number | null
}

type DelaiPremiereValeur = {
  /** Médiane en jours, jamais une moyenne (1686.4). `null` = aucun espace
   *  mesuré, pas « immédiat ». */
  medianJours: number | null
  echantillon: number
}

export type CohorteEntonnoir = {
  /** `YYYY-MM` — le mois d'INSCRIPTION de l'espace. */
  cohorte: string
  /** Espaces inscrits ce mois-là — décide du masquage (`COHORT_MIN_SPACES`). */
  espaces: number
  etapes: EtapeCohorte[]
  delaiPremiereValeur: DelaiPremiereValeur
}

export type RapportEntonnoir = {
  cohortes: CohorteEntonnoir[]
  etapes: DefinitionEtape[]
  espaces: number
  calculeA: string
}

/**
 * L'entonnoir d'onboarding par cohorte mensuelle d'espaces.
 *
 * ⚠️ Jette quand l'API ne répond pas — et c'est voulu : rendre un entonnoir
 * vide sur une panne écrirait « aucun espace » par-dessus une indisponibilité.
 * L'appelant attrape et affiche une ERREUR. Même geste que `fetchRetentionCohorts`.
 */
export async function fetchOnboardingFunnel(): Promise<RapportEntonnoir> {
  const res = await fetch(`${REAL_BASE}/internal/analytics/onboarding-funnel`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Onboarding funnel endpoint returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as RapportEntonnoir
}
