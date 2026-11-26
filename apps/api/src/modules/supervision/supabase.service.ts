import { Injectable } from '@nestjs/common'
import { SupabaseMetricsClient } from './supabase-metrics.client'
import { NOMS_AUTORISES, type Echantillon } from './supabase-metrics.parser'

/**
 * L'ONGLET « BASE SUPABASE » DE LA SUPERVISION — assemble les métriques de la
 * liste blanche en trois périmètres : instance Postgres, connexions, volumes.
 *
 * Doctrine « non mesuré n'est jamais 0 » : une métrique absente donne `null` et
 * est NOMMÉE dans `absentes` ; un total de valeurs toutes `null` reste `null`.
 * Les labels exacts ne sont pas garantis : on affiche ce qui est là, nommé, et
 * un label manquant devient `'(sans nom)'`, jamais un choix deviné.
 *
 * CPU : `node_cpu_seconds_total` est un compteur sans historique (aucun
 * stockage ici). On garde EN MÉMOIRE la lecture précédente et on calcule le taux
 * entre les deux ; la 1re lecture donne `null` + `cpuPremiereLecture`.
 */

type DisqueSupabase = {
  mountpoint: string
  tailleOctets: number | null
  libreOctets: number | null
  usagePct: number | null
}

type PoolPgbouncer = {
  base: string
  utilisateur: string | null
  clientsActifs: number | null
  clientsEnAttente: number | null
  serveursActifs: number | null
  taillePool: number | null
}

export type SupervisionSupabase =
  | { etat: 'non_configure' }
  | { etat: 'injoignable'; raison: string }
  | {
      etat: 'mesure'
      mesureA: string
      instance: {
        coeurs: number | null
        cpuPct: number | null
        /** Vrai tant qu'aucune lecture précédente ne permet de calculer un taux. */
        cpuPremiereLecture: boolean
        load1: number | null
        memPct: number | null
        memTotalOctets: number | null
        disques: DisqueSupabase[]
      }
      connexions: {
        backendsTotal: number | null
        backendsParBase: { base: string; backends: number | null }[]
        maxConnections: number | null
        pgbouncer: PoolPgbouncer[]
      }
      volumes: { base: string; octets: number | null }[]
      absentes: string[]
    }

const SANS_NOM = '(sans nom)'

/** Le label de base n'est pas garanti sur l'endpoint Supabase : le premier présent gagne. */
const LABELS_BASE = ['datname', 'database', 'db', 'datid'] as const

function premierLabel(e: Echantillon, labels: string | readonly string[]): string | undefined {
  for (const l of typeof labels === 'string' ? [labels] : labels) {
    const v = e.labels[l]
    if (v !== undefined && v !== '') return v
  }
  return undefined
}

type CompteursCpu = { idle: number; total: number }
type Lecture = { lueA: number; cpu: CompteursCpu | null }

function compteursCpu(echantillons: Echantillon[]): CompteursCpu | null {
  let idle = 0
  let total = 0
  let vu = false
  for (const e of echantillons) {
    if (e.nom !== 'node_cpu_seconds_total') continue
    if (e.valeur === null) return null
    vu = true
    total += e.valeur
    if (e.labels['mode'] === 'idle') idle += e.valeur
  }
  return vu ? { idle, total } : null
}

function tauxCpu(avant: CompteursCpu | null, apres: CompteursCpu | null): number | null {
  if (!avant || !apres) return null
  const dTotal = apres.total - avant.total
  const dIdle = apres.idle - avant.idle
  // Compteur qui recule (redémarrage) ou intervalle nul : pas de taux, jamais négatif.
  if (dTotal <= 0 || dIdle < 0 || dIdle > dTotal) return null
  return 100 * (1 - dIdle / dTotal)
}

function serie(echantillons: Echantillon[], nom: string): Echantillon[] {
  return echantillons.filter(e => e.nom === nom)
}

/** Première valeur mesurée d'une métrique scalaire (sans label utile). */
function scalaire(echantillons: Echantillon[], nom: string): number | null {
  return serie(echantillons, nom).find(e => e.valeur !== null)?.valeur ?? null
}

/** Somme des valeurs mesurées ; `null` si aucune n'est mesurée. */
function somme(valeurs: (number | null)[]): number | null {
  const mesurees = valeurs.filter((v): v is number => v !== null)
  return mesurees.length === 0 ? null : mesurees.reduce((a, b) => a + b, 0)
}

function parLabel(
  echantillons: Echantillon[],
  nom: string,
  label: string | readonly string[],
): Map<string, number | null> {
  const m = new Map<string, number | null>()
  for (const e of serie(echantillons, nom)) m.set(premierLabel(e, label) ?? SANS_NOM, e.valeur)
  return m
}

function trierParNom<T>(lignes: T[], cle: (l: T) => string): T[] {
  return [...lignes].sort((a, b) => cle(a).localeCompare(cle(b)))
}

@Injectable()
export class SupabaseSupervisionService {
  private courante: Lecture | null = null
  private precedente: Lecture | null = null

  constructor(private readonly client: SupabaseMetricsClient) {}

  async supabase(): Promise<SupervisionSupabase> {
    const r = await this.client.lire()
    if (r.etat !== 'mesure') return r
    const ech = r.echantillons

    // Rotation des lectures : une lecture servie par le cache (même `lueA`) ne
    // remplace pas la référence, sinon l'intervalle serait nul.
    if (this.courante?.lueA !== r.lueA) {
      this.precedente = this.courante
      this.courante = { lueA: r.lueA, cpu: compteursCpu(ech) }
    }
    const cpuPct = tauxCpu(this.precedente?.cpu ?? null, this.courante?.cpu ?? null)
    const cpuPremiereLecture = this.precedente === null

    const coeurs = new Set(serie(ech, 'node_cpu_seconds_total').map(e => e.labels['cpu'])).size
    const memTotal = scalaire(ech, 'node_memory_MemTotal_bytes')
    const memDispo = scalaire(ech, 'node_memory_MemAvailable_bytes')

    const tailles = parLabel(ech, 'node_filesystem_size_bytes', 'mountpoint')
    const libres = parLabel(ech, 'node_filesystem_avail_bytes', 'mountpoint')
    const montages = new Set([...tailles.keys(), ...libres.keys()])
    const disques: DisqueSupabase[] = trierParNom(
      [...montages].map(mountpoint => {
        const tailleOctets = tailles.get(mountpoint) ?? null
        const libreOctets = libres.get(mountpoint) ?? null
        const usagePct =
          tailleOctets !== null && tailleOctets > 0 && libreOctets !== null
            ? 100 * (1 - libreOctets / tailleOctets)
            : null
        return { mountpoint, tailleOctets, libreOctets, usagePct }
      }),
      d => d.mountpoint,
    )

    const backends = parLabel(ech, 'pg_stat_database_num_backends', LABELS_BASE)
    const volumes = parLabel(ech, 'pg_database_size_bytes', LABELS_BASE)

    // pgbouncer : une ligne par (database, user) ; la taille du pool est par database seulement.
    const cles = new Map<string, { base: string; utilisateur: string | null }>()
    for (const nom of [
      'pgbouncer_pools_client_active_connections',
      'pgbouncer_pools_client_waiting_connections',
      'pgbouncer_pools_server_active_connections',
    ]) {
      for (const e of serie(ech, nom)) {
        const base = e.labels['database'] ?? SANS_NOM
        const utilisateur = e.labels['user'] ?? null
        cles.set(`${base}\u0000${utilisateur ?? ''}`, { base, utilisateur })
      }
    }
    const valeurPool = (nom: string, base: string, utilisateur: string | null): number | null =>
      serie(ech, nom).find(
        e => (e.labels['database'] ?? SANS_NOM) === base && (e.labels['user'] ?? null) === utilisateur,
      )?.valeur ?? null
    const tailleParBase = parLabel(ech, 'pgbouncer_databases_pool_size', 'database')
    const pgbouncer: PoolPgbouncer[] = trierParNom(
      [...cles.values()].map(({ base, utilisateur }) => ({
        base,
        utilisateur,
        clientsActifs: valeurPool('pgbouncer_pools_client_active_connections', base, utilisateur),
        clientsEnAttente: valeurPool('pgbouncer_pools_client_waiting_connections', base, utilisateur),
        serveursActifs: valeurPool('pgbouncer_pools_server_active_connections', base, utilisateur),
        taillePool: tailleParBase.get(base) ?? null,
      })),
      p => `${p.base}/${p.utilisateur ?? ''}`,
    )

    const presents = new Set(ech.map(e => e.nom))
    return {
      etat: 'mesure',
      mesureA: new Date(r.lueA).toISOString(),
      instance: {
        coeurs: coeurs > 0 ? coeurs : null,
        cpuPct,
        cpuPremiereLecture,
        load1: scalaire(ech, 'node_load1'),
        memPct: memTotal !== null && memTotal > 0 && memDispo !== null ? 100 * (1 - memDispo / memTotal) : null,
        memTotalOctets: memTotal,
        disques,
      },
      connexions: {
        backendsTotal: somme([...backends.values()]),
        backendsParBase: trierParNom(
          [...backends].map(([base, n]) => ({ base, backends: n })),
          b => b.base,
        ),
        maxConnections: scalaire(ech, 'pg_settings_max_connections'),
        pgbouncer,
      },
      volumes: trierParNom(
        [...volumes].map(([base, octets]) => ({ base, octets })),
        v => v.base,
      ),
      absentes: [...NOMS_AUTORISES].filter(n => !presents.has(n)),
    }
  }
}
