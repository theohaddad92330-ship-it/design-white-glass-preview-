import type { QueueJob } from '@/lib/queues'

/**
 * #1673.3 — LE FILTRE « ANCIENNETÉ » DES JOBS, absent de `/queues` avant ce
 * lot (mesuré : `queues/page.tsx` n'avait que des onglets d'ÉTAT, aucune
 * dimension d'âge).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE N'EST PAS LE SEUIL DE #1647
 * ─────────────────────────────────────────────────────────────────────────
 * `queues.logic.ts` le dit déjà : « le SEUIL de "job bloqué" n'est pas ici,
 * et c'est délibéré — deux dérivations du même seuil divergeraient ». Les
 * trois paliers ci-dessous ne QUALIFIENT rien (aucun n'est nommé « incident »
 * ou « bloqué ») : ils DÉCOUPENT une durée pour qu'un opérateur retrouve un
 * job, exactement comme un tri par colonne. La gravité reste #1647.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI `now` EST UN PARAMÈTRE
 * ─────────────────────────────────────────────────────────────────────────
 * `queues/page.tsx` (Server Component) le calcule UNE fois par requête et le
 * passe en prop sérialisée — jamais un `new Date()` lu dans le composant
 * client qui range les jobs. Le SSR et l'hydratation reçoivent alors la MÊME
 * ancre, donc classent chaque job de façon identique : lire l'horloge en
 * client aurait pu faire basculer un job pile à la frontière d'un palier
 * entre les deux rendus (le défaut #418/#423/#425 déjà payé sur cette
 * console, `lib/dates.ts` en tête de fichier).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FILTRE NE PORTE QUE SUR LA PAGE CHARGÉE
 * ─────────────────────────────────────────────────────────────────────────
 * BullMQ ne filtre pas par âge côté serveur, et lui ajouter cette capacité
 * toucherait `apps/api` au-delà du périmètre en écriture de ce lot
 * (`admin.service.ts` seul). Les compteurs ci-dessous portent donc sur les
 * jobs déjà CHARGÉS (une page de `PAGE_LIMIT`), jamais sur la file entière —
 * et l'écran le dit, pas seulement ce commentaire.
 */

export const AGE_BUCKET_KEYS = ['tous', 'recent', 'aujourdhui', 'ancien'] as const
export type AgeBucketKey = (typeof AGE_BUCKET_KEYS)[number]

const UNE_HEURE_MS = 60 * 60 * 1000
const VINGT_QUATRE_HEURES_MS = 24 * UNE_HEURE_MS

/** Les trois paliers, jamais "tous" — c'est le résultat d'un CLASSEMENT, pas
 *  d'un filtre. */
type Palier = Exclude<AgeBucketKey, 'tous'>

/**
 * Le palier d'UN job. `null` = âge NON MESURABLE — un horodatage absent ou
 * dans le futur (horloge incohérente) ne devient JAMAIS "recent" par défaut :
 * si cette valeur est absente, "récent" n'est pas plus vrai qu'un autre mot.
 */
export function ageBucketDeJob(timestamp: number | null, now: number): Palier | null {
  if (timestamp === null || !Number.isFinite(timestamp)) return null
  const age = now - timestamp
  if (age < 0) return null
  if (age < UNE_HEURE_MS) return 'recent'
  if (age < VINGT_QUATRE_HEURES_MS) return 'aujourdhui'
  return 'ancien'
}

/** "tous" ne filtre rien (y compris les âges non mesurables) ; un palier
 *  précis ne rend QUE les jobs dont l'âge est mesuré et matche. */
export function filtrerParAnciennete<T extends Pick<QueueJob, 'timestamp'>>(
  jobs: readonly T[],
  bucket: AgeBucketKey,
  now: number,
): T[] {
  if (bucket === 'tous') return [...jobs]
  return jobs.filter(j => ageBucketDeJob(j.timestamp, now) === bucket)
}

/** Le compte de chaque palier, sur les jobs REÇUS (la page chargée — jamais
 *  la file entière, voir l'en-tête du fichier). `tous` est un vrai compteur :
 *  une page vide rend 0 partout, ce qui est MESURÉ, pas absent. */
export function compterParAnciennete<T extends Pick<QueueJob, 'timestamp'>>(
  jobs: readonly T[],
  now: number,
): Record<AgeBucketKey, number> {
  const comptes: Record<AgeBucketKey, number> = { tous: jobs.length, recent: 0, aujourdhui: 0, ancien: 0 }
  for (const j of jobs) {
    const palier = ageBucketDeJob(j.timestamp, now)
    if (palier !== null) comptes[palier] += 1
  }
  return comptes
}

/**
 * Combien de jobs (sur la page chargée) n'ont PAS pu être classés — un
 * horodatage absent ou incohérent. `null` quand il n'y en a aucun : rien à
 * dire, plutôt qu'une phrase qui s'affiche même à zéro.
 */
export function compterAgeInconnu<T extends Pick<QueueJob, 'timestamp'>>(jobs: readonly T[], now: number): number {
  return jobs.filter(j => ageBucketDeJob(j.timestamp, now) === null).length
}

/**
 * La phrase qui NOMME ce qui n'a pas pu être classé — jamais absorbé en
 * silence dans "recent". `null` sous ce compte : rien à afficher.
 */
export function libelleAgeInconnu(compteInconnu: number, langue: 'fr' | 'en'): string | null {
  if (compteInconnu <= 0) return null
  if (langue === 'en') {
    return `${compteInconnu} job${compteInconnu > 1 ? 's' : ''} on this page with no usable timestamp — not filtered by age.`
  }
  return `${compteInconnu} job${compteInconnu > 1 ? 's' : ''} de cette page sans horodatage exploitable — non filtrés par ancienneté.`
}
