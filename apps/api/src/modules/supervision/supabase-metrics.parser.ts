/**
 * PARSEUR DU FORMAT TEXTE PROMETHEUS (endpoint de métriques de Supabase).
 *
 * Lignes `nom{labels} valeur [horodatage]`, commentaires `#` et lignes vides
 * ignorés. Petit, sans dépendance, tolérant : une ligne illisible est jetée,
 * jamais levée. `NaN`/`±Inf` ⇒ `null` — « non mesuré » n'est jamais 0.
 */

export type Echantillon = { nom: string; labels: Record<string, string>; valeur: number | null }

/**
 * LISTE BLANCHE DE NOMS : les seules métriques gardées. L'endpoint expose
 * ~1 800 séries ; tout le reste est jeté dès le parseur (`pg_stat_replication_*`
 * compris), pour qu'aucune série non prévue ne traverse jusqu'à l'écran.
 */
export const NOMS_AUTORISES: ReadonlySet<string> = new Set([
  'node_cpu_seconds_total',
  'node_memory_MemTotal_bytes',
  'node_memory_MemAvailable_bytes',
  'node_filesystem_size_bytes',
  'node_filesystem_avail_bytes',
  'node_load1',
  'pg_stat_database_num_backends',
  'pg_settings_max_connections',
  'pg_database_size_bytes',
  'pgbouncer_pools_client_active_connections',
  'pgbouncer_pools_client_waiting_connections',
  'pgbouncer_pools_server_active_connections',
  'pgbouncer_databases_pool_size',
])

const NOM = /^[a-zA-Z_:][a-zA-Z0-9_:]*/
const LABEL = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g

function desechapper(v: string): string {
  return v.replace(/\\(.)/g, (_m, c: string) => (c === 'n' ? '\n' : c))
}

/** Index de l'accolade fermante, en sautant les valeurs entre guillemets. */
function fermeture(ligne: string, debut: number): number {
  let dansChaine = false
  for (let i = debut; i < ligne.length; i++) {
    const c = ligne.charAt(i)
    if (dansChaine) {
      if (c === '\\') i++
      else if (c === '"') dansChaine = false
    } else if (c === '"') dansChaine = true
    else if (c === '}') return i
  }
  return -1
}

function valeur(brute: string): number | null | undefined {
  // undefined = illisible (ligne jetée) ; null = NaN/Inf (non mesuré).
  if (/^(NaN|[+-]?Inf)$/i.test(brute)) return null
  const n = Number(brute)
  if (Number.isNaN(n)) return undefined
  return Number.isFinite(n) ? n : null
}

export function parserMetriquesPrometheus(texte: string, autorises?: ReadonlySet<string>): Echantillon[] {
  const sortie: Echantillon[] = []
  for (const brute of texte.split('\n')) {
    const ligne = brute.trim()
    if (ligne === '' || ligne.startsWith('#')) continue
    const m = NOM.exec(ligne)
    if (!m) continue
    const nom = m[0]
    if (autorises && !autorises.has(nom)) continue
    let reste = ligne.slice(nom.length)
    const labels: Record<string, string> = {}
    if (reste.startsWith('{')) {
      const fin = fermeture(reste, 1)
      if (fin < 0) continue
      for (const l of reste.slice(1, fin).matchAll(LABEL)) {
        labels[l[1] as string] = desechapper(l[2] as string)
      }
      reste = reste.slice(fin + 1)
    }
    const morceaux = reste.trim().split(/\s+/)
    const v = morceaux[0] ? valeur(morceaux[0]) : undefined
    if (v === undefined) continue
    sortie.push({ nom, labels, valeur: v })
  }
  return sortie
}
