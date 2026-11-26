// Client for the API's backoffice access-journal SECURITY STATE
// (GET /internal/backoffice/access-journal/etat-securite, guarded by
// InternalSecretGuard). Server-side only — the internal secret never reaches
// the browser. Mirrors src/lib/journal-audit.ts and src/lib/retention.ts.

/**
 * #1671.4 — L'ÉTAT DE SÉCURITÉ DE `/securite`, ET #1671.3 — LA DÉTECTION
 * D'ACCÈS ANORMAL QU'IL AFFICHE.
 *
 * ⚠️ CE FICHIER NE CALCULE RIEN. Les trois signaux (rafale d'échecs, pays
 * jamais vu, heure inhabituelle) et les compteurs de la fenêtre sont calculés
 * côté API, par `BackofficeAccessJournalService.etatSecurite()` — la même
 * discipline que le journal d'audit : le serveur seul connaît l'heure de la
 * lecture, et une seconde dérivation ici divergerait un jour de la première
 * (GA-26). Ce module lit, et rien de plus.
 *
 * ⚠️ AUCUN ENVOI. Cette route est LECTURE SEULE côté API, et ce client ne fait
 * qu'un `GET` — aucun chemin d'écriture n'existe ici pour un futur appel qui en
 * ajouterait un par erreur.
 */

const BASE = (): string | undefined => process.env['API_BASE_URL']
const SECRET = (): string | undefined => process.env['INTERNAL_API_SECRET']

export type TypeAnomalie = 'rafale_echecs' | 'pays_inhabituel' | 'heure_inhabituelle'

export type Anomalie = {
  type: TypeAnomalie
  /** L'adresse de l'opérateur concerné — rendue en clair par `<EmailEnClair>` (c87). */
  actorEmail: string
  /** ISO — l'instant de l'événement qui a déclenché le signal. */
  at: string
  /** Une phrase, pas une charge utile : ce qui s'est passé, en clair. */
  detail: string
}

/** Une entrée du journal, telle que l'API la rend — miroir de `LigneAudit` côté `journal-audit.ts`. */
export type EntreeJournalAcces = {
  id: string
  event: string
  actor_email: string | null
  actor_role: string | null
  reason: string | null
  detail: string | null
  ip: string | null
  user_agent: string | null
  country: string | null
  target: string | null
  created_at: string
}

export type EtatSecurite = {
  /** `false` quand la fenêtre est VIDE — jamais confondu avec « zéro anomalie ». */
  mesure: boolean
  fenetreJours: number
  depuis: string
  measuredAt: string
  total: number
  parEvenement: Partial<Record<string, number>>
  acteursDistincts: number
  /** Les pays observés sur des connexions RÉUSSIES dans la fenêtre. */
  paysObserves: string[]
  /** `null` quand le journal entier est vide — jamais une date inventée. */
  oldestEntryAt: string | null
  anomalies: Anomalie[]
  /** Les entrées les plus récentes, déjà bornées côté API. */
  entries: EntreeJournalAcces[]
}

/**
 * L'état de sécurité du back-office (#1671.4) : connexions récentes, échecs,
 * pays observés, ce qui a été purgé et quand, et les anomalies des trois
 * signaux de #1671.3.
 *
 * ⚠️ Jette quand l'API ne répond pas — même règle que `fetchJournalAudit` et
 * `fetchRetentionCohorts` : un écran de sécurité qui affiche « aucune anomalie »
 * sur une panne mentirait par silence, et c'est la pire page pour le faire.
 */
export async function fetchEtatSecurite(fenetreJours?: number): Promise<EtatSecurite> {
  const base = BASE()
  const secret = SECRET()
  if (!base || !secret) {
    throw new Error('API_BASE_URL ou INTERNAL_API_SECRET non configuré côté console.')
  }

  const params = new URLSearchParams()
  if (fenetreJours !== undefined) params.set('jours', String(fenetreJours))
  const query = params.toString()

  const res = await fetch(`${base}/internal/backoffice/access-journal/etat-securite${query ? `?${query}` : ''}`, {
    headers: { 'x-internal-secret': secret },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Le journal d’accès a répondu ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as EtatSecurite
}
