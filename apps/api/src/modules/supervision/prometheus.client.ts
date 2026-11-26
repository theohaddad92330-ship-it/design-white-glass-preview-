import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { z } from 'zod'

/**
 * CLIENT PROMETHEUS DE LA SUPERVISION — serveur seulement, liste blanche.
 *
 * Lit Grafana Cloud Prometheus, où Grafana Alloy pousse depuis les 4 VPS
 * runners CI (labels `host` et `role="ci-runner"`). Trois règles tiennent ce
 * fichier, et chacune a son test (`prometheus.client.spec.ts`) :
 *
 * 1. LISTE BLANCHE — l'appelant ne passe QU'UN identifiant de {@link REQUETES},
 *    validé par zod contre ses clés, et au plus une fenêtre bornée par
 *    `fenetreMaxSec`. Aucune chaîne PromQL venue de l'extérieur, jamais : une
 *    PromQL libre lirait toutes les séries du compte Grafana.
 * 2. NO-OP STRICT — sans `GRAFANA_PROM_URL`, `GRAFANA_PROM_USER` ou
 *    `GRAFANA_PROM_READ_TOKEN`, aucun appel réseau : `{ etat: 'non_configure' }`.
 * 3. LE JETON NE SORT PAS — une panne rend une raison à vocabulaire FERMÉ
 *    (`HTTP 401`, `délai dépassé (5 s)`…), jamais le message d'exception, qui
 *    peut porter l'URL ou l'en-tête. Idem pour les journaux.
 *
 * Et la doctrine « non mesuré n'est jamais 0 » : une valeur `NaN`/`Inf` devient
 * `null`, une série absente n'est pas inventée.
 */

/** `cible` : une sonde externe de disponibilité (label `cible`, blackbox des runners). */
type Perimetre = 'hote' | 'conteneur' | 'flotte' | 'cible'

type DefinitionRequete = {
  readonly promql: string
  readonly type: 'instant' | 'range'
  /** Pas d'échantillonnage (range seulement ; 0 pour une instantanée). */
  readonly pasSec: number
  /** Fenêtre maximale acceptée (range : aussi la fenêtre par défaut). */
  readonly fenetreMaxSec: number
  readonly unite: 'coeurs' | 'pct' | 'octets' | 'secondes' | 'nombre' | 'charge' | 'ms' | 'jours'
  readonly perimetre: Perimetre
}

const RUNNER = 'role="ci-runner"'
const CONTENEUR = 'role="ci-runner",name=~"ci-runner-.+"'
const RACINE = 'role="ci-runner",mountpoint="/"'
const JOUR_SEC = 24 * 3600

const CPU_PCT = `100 * (1 - avg by (host)(rate(node_cpu_seconds_total{${RUNNER},mode="idle"}[5m])))`
const MEM_PCT = `100 * (1 - max by (host)(node_memory_MemAvailable_bytes{${RUNNER}}) / max by (host)(node_memory_MemTotal_bytes{${RUNNER}}))`

export const REQUETES = {
  // ── Périmètre HÔTE (par `host`) ────────────────────────────────────────────
  hote_coeurs: {
    promql: `count by (host)(node_cpu_seconds_total{${RUNNER},mode="idle"})`,
    type: 'instant',
    pasSec: 0,
    fenetreMaxSec: 0,
    unite: 'coeurs',
    perimetre: 'hote',
  },
  hote_cpu_pct: { promql: CPU_PCT, type: 'instant', pasSec: 0, fenetreMaxSec: 0, unite: 'pct', perimetre: 'hote' },
  hote_load1: {
    promql: `max by (host)(node_load1{${RUNNER}})`,
    type: 'instant',
    pasSec: 0,
    fenetreMaxSec: 0,
    unite: 'charge',
    perimetre: 'hote',
  },
  hote_mem_pct: { promql: MEM_PCT, type: 'instant', pasSec: 0, fenetreMaxSec: 0, unite: 'pct', perimetre: 'hote' },
  hote_disque_pct: {
    promql: `100 * (1 - max by (host)(node_filesystem_avail_bytes{${RACINE}}) / max by (host)(node_filesystem_size_bytes{${RACINE}}))`,
    type: 'instant',
    pasSec: 0,
    fenetreMaxSec: 0,
    unite: 'pct',
    perimetre: 'hote',
  },
  hote_disque_libre_octets: {
    promql: `max by (host)(node_filesystem_avail_bytes{${RACINE}})`,
    type: 'instant',
    pasSec: 0,
    fenetreMaxSec: 0,
    unite: 'octets',
    perimetre: 'hote',
  },
  hote_fraicheur_sec: {
    promql: `time() - max by (host)(timestamp(up{${RUNNER}}))`,
    type: 'instant',
    pasSec: 0,
    fenetreMaxSec: 0,
    unite: 'secondes',
    perimetre: 'hote',
  },
  /**
   * Silence d'un hôte sur 6 h : `hote_fraicheur_sec` disparaît après 5 min sans
   * donnée (le « dernier point » d'une instantanée ne remonte pas plus loin),
   * donc un runner MUET n'y figure plus. Ce sous-requête garde sa dernière
   * donnée vue jusqu'à 6 h — c'est celle de l'alerte `runner_muet`.
   */
  hote_silence_sec: {
    promql: `time() - max by (host)(max_over_time(timestamp(up{${RUNNER}})[6h:1m]))`,
    type: 'instant',
    pasSec: 0,
    fenetreMaxSec: 0,
    unite: 'secondes',
    perimetre: 'hote',
  },
  // ── Périmètre CONTENEUR (par `host` + `name`) ──────────────────────────────
  conteneur_cpu_coeurs: {
    promql: `sum by (host, name)(rate(container_cpu_usage_seconds_total{${CONTENEUR}}[5m]))`,
    type: 'instant',
    pasSec: 0,
    fenetreMaxSec: 0,
    unite: 'coeurs',
    perimetre: 'conteneur',
  },
  conteneur_cpu_limite_coeurs: {
    promql: `max by (host, name)(container_spec_cpu_quota{${CONTENEUR}}) / max by (host, name)(container_spec_cpu_period{${CONTENEUR}})`,
    type: 'instant',
    pasSec: 0,
    fenetreMaxSec: 0,
    unite: 'coeurs',
    perimetre: 'conteneur',
  },
  conteneur_mem_octets: {
    promql: `max by (host, name)(container_memory_working_set_bytes{${CONTENEUR}})`,
    type: 'instant',
    pasSec: 0,
    fenetreMaxSec: 0,
    unite: 'octets',
    perimetre: 'conteneur',
  },
  conteneur_mem_limite_octets: {
    promql: `max by (host, name)(container_spec_memory_limit_bytes{${CONTENEUR}})`,
    type: 'instant',
    pasSec: 0,
    fenetreMaxSec: 0,
    unite: 'octets',
    perimetre: 'conteneur',
  },
  conteneur_disque_octets: {
    promql: `max by (host, name)(container_fs_usage_bytes{${CONTENEUR}})`,
    type: 'instant',
    pasSec: 0,
    fenetreMaxSec: 0,
    unite: 'octets',
    perimetre: 'conteneur',
  },
  conteneur_oom_24h: {
    promql: `sum by (host, name)(increase(container_oom_events_total{${CONTENEUR}}[24h]))`,
    type: 'instant',
    pasSec: 0,
    fenetreMaxSec: 0,
    unite: 'nombre',
    perimetre: 'conteneur',
  },
  // ── Périmètre FLOTTE ───────────────────────────────────────────────────────
  flotte_runners_vus: {
    promql: `count(container_last_seen{${CONTENEUR}})`,
    type: 'instant',
    pasSec: 0,
    fenetreMaxSec: 0,
    unite: 'nombre',
    perimetre: 'flotte',
  },
  flotte_coeurs: {
    promql: `count(node_cpu_seconds_total{${RUNNER},mode="idle"})`,
    type: 'instant',
    pasSec: 0,
    fenetreMaxSec: 0,
    unite: 'coeurs',
    perimetre: 'flotte',
  },
  // ── Séries 24 h (pas 5 min), par hôte ──────────────────────────────────────
  serie_cpu_pct_24h: {
    promql: CPU_PCT,
    type: 'range',
    pasSec: 300,
    fenetreMaxSec: JOUR_SEC,
    unite: 'pct',
    perimetre: 'hote',
  },
  serie_mem_pct_24h: {
    promql: MEM_PCT,
    type: 'range',
    pasSec: 300,
    fenetreMaxSec: JOUR_SEC,
    unite: 'pct',
    perimetre: 'hote',
  },
  // ── Périmètre CIBLE (sondes blackbox des runners, label `cible`) ───────────
  // Tant que les runners n'ont pas été redéployés avec la sonde, aucune de ces
  // séries n'existe : les réponses sont vides, jamais 0.
  dispo_hotes_ok: {
    promql: `sum by (cible)(probe_success{${RUNNER}})`,
    type: 'instant',
    pasSec: 0,
    fenetreMaxSec: 0,
    unite: 'nombre',
    perimetre: 'cible',
  },
  dispo_hotes_total: {
    promql: `count by (cible)(probe_success{${RUNNER}})`,
    type: 'instant',
    pasSec: 0,
    fenetreMaxSec: 0,
    unite: 'nombre',
    perimetre: 'cible',
  },
  dispo_24h_pct: {
    promql: `100 * avg by (cible)(avg_over_time(probe_success{${RUNNER}}[24h]))`,
    type: 'instant',
    pasSec: 0,
    fenetreMaxSec: 0,
    unite: 'pct',
    perimetre: 'cible',
  },
  // Médiane par hôte sur 1 h, puis la plus lente des médianes : on ne masque pas un hôte lent.
  dispo_latence_p50_ms: {
    promql: `1000 * max by (cible)(quantile_over_time(0.5, probe_duration_seconds{${RUNNER}}[1h]))`,
    type: 'instant',
    pasSec: 0,
    fenetreMaxSec: 0,
    unite: 'ms',
    perimetre: 'cible',
  },
  dispo_latence_max_ms: {
    promql: `1000 * max by (cible)(max_over_time(probe_duration_seconds{${RUNNER}}[1h]))`,
    type: 'instant',
    pasSec: 0,
    fenetreMaxSec: 0,
    unite: 'ms',
    perimetre: 'cible',
  },
  dispo_tls_jours: {
    promql: `min by (cible)((probe_ssl_earliest_cert_expiry{${RUNNER}} - time()) / 86400)`,
    type: 'instant',
    pasSec: 0,
    fenetreMaxSec: 0,
    unite: 'jours',
    perimetre: 'cible',
  },
  serie_dispo_24h: {
    promql: `avg by (cible)(probe_success{${RUNNER}})`,
    type: 'range',
    pasSec: 300,
    fenetreMaxSec: JOUR_SEC,
    unite: 'pct',
    perimetre: 'cible',
  },
} as const satisfies Record<string, DefinitionRequete>

export type IdRequete = keyof typeof REQUETES

const ID_SCHEMA = z.enum(Object.keys(REQUETES) as [IdRequete, ...IdRequete[]])

export type PointMesure = { t: number; v: number | null }
export type SerieMesuree = { labels: Record<string, string>; points: PointMesure[] }

export type ResultatPrometheus =
  | { etat: 'non_configure' }
  | { etat: 'injoignable'; raison: string }
  | { etat: 'mesure'; series: SerieMesuree[] }

const DELAI_MS = 5_000
const CACHE_MS = 30_000

const ECHANTILLON = z.tuple([z.number(), z.string()])
const REPONSE = z.object({
  status: z.literal('success'),
  data: z.object({
    resultType: z.enum(['vector', 'matrix', 'scalar']),
    result: z.union([
      z.array(
        z.object({
          metric: z.record(z.string(), z.string()).default({}),
          value: ECHANTILLON.optional(),
          values: z.array(ECHANTILLON).optional(),
        }),
      ),
      ECHANTILLON,
    ]),
  }),
})

function isScalaire(r: z.infer<typeof REPONSE>['data']['result']): r is [number, string] {
  return r.length === 2 && typeof r[0] === 'number'
}

/** `"NaN"`, `"+Inf"`, `"-Inf"` : pas une mesure — `null`, jamais 0. */
function valeur(brute: string): number | null {
  const n = Number(brute)
  return Number.isFinite(n) ? n : null
}

type Config = { base: string; autorisation: string }

function lireConfig(): Config | null {
  const url = process.env['GRAFANA_PROM_URL']?.trim()
  const user = process.env['GRAFANA_PROM_USER']?.trim()
  const jeton = process.env['GRAFANA_PROM_READ_TOKEN']?.trim()
  if (!url || !user || !jeton) return null
  return {
    base: url.replace(/\/+$/, ''),
    autorisation: `Basic ${Buffer.from(`${user}:${jeton}`).toString('base64')}`,
  }
}

@Injectable()
export class PrometheusClient {
  private readonly logger = new Logger(PrometheusClient.name)
  private readonly cache = new Map<string, { expire: number; valeur: ResultatPrometheus }>()

  /**
   * @param idBrut  identifiant de la liste blanche — tout autre valeur ⇒ 400.
   * @param fenetreBrute  fenêtre en secondes (range seulement), ≤ `fenetreMaxSec`.
   */
  async interroger(idBrut: unknown, fenetreBrute?: unknown): Promise<ResultatPrometheus> {
    const id = ID_SCHEMA.safeParse(idBrut)
    if (!id.success) throw new BadRequestException('Requête de supervision inconnue')
    const def: DefinitionRequete = REQUETES[id.data]
    let fenetreSec = def.fenetreMaxSec
    if (fenetreBrute !== undefined) {
      const f = z.number().int().positive().max(def.fenetreMaxSec).safeParse(fenetreBrute)
      if (!f.success || def.type !== 'range') throw new BadRequestException('Fenêtre de supervision hors borne')
      fenetreSec = f.data
    }

    const config = lireConfig()
    if (!config) return { etat: 'non_configure' }

    const cle = `${id.data}:${fenetreSec}`
    const enCache = this.cache.get(cle)
    if (enCache && enCache.expire > Date.now()) return enCache.valeur

    const resultat = await this.appeler(config, def, fenetreSec, id.data)
    // Seule une MESURE se met en cache : une panne doit pouvoir se lever au rafraîchissement suivant.
    if (resultat.etat === 'mesure') this.cache.set(cle, { expire: Date.now() + CACHE_MS, valeur: resultat })
    return resultat
  }

  private async appeler(
    config: Config,
    def: DefinitionRequete,
    fenetreSec: number,
    id: IdRequete,
  ): Promise<ResultatPrometheus> {
    const params = new URLSearchParams({ query: def.promql })
    let chemin = '/api/prom/api/v1/query'
    if (def.type === 'range') {
      const fin = Math.floor(Date.now() / 1000)
      params.set('start', String(fin - fenetreSec))
      params.set('end', String(fin))
      params.set('step', String(def.pasSec))
      chemin = '/api/prom/api/v1/query_range'
    }

    let res: Response
    try {
      res = await fetch(`${config.base}${chemin}?${params.toString()}`, {
        headers: { Authorization: config.autorisation, Accept: 'application/json' },
        signal: AbortSignal.timeout(DELAI_MS),
      })
    } catch (err) {
      // ⚠️ Jamais `err.message` : il peut porter l'URL ou l'en-tête d'autorisation.
      const raison =
        err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
          ? 'délai dépassé (5 s)'
          : 'erreur réseau'
      this.logger.warn(`supervision ${id} : ${raison}`)
      return { etat: 'injoignable', raison }
    }

    if (!res.ok) {
      const raison = `HTTP ${res.status}`
      this.logger.warn(`supervision ${id} : ${raison}`)
      return { etat: 'injoignable', raison }
    }

    let corps: unknown
    try {
      corps = await res.json()
    } catch {
      corps = null
    }
    const lu = REPONSE.safeParse(corps)
    if (!lu.success) {
      this.logger.warn(`supervision ${id} : réponse illisible`)
      return { etat: 'injoignable', raison: 'réponse illisible' }
    }

    const brut = lu.data.data.result
    if (isScalaire(brut)) {
      // Résultat `scalar` : un seul point, sans label.
      return { etat: 'mesure', series: [{ labels: {}, points: [{ t: brut[0], v: valeur(brut[1]) }] }] }
    }
    const series = brut.map(s => ({
      labels: s.metric,
      points: (s.values ?? (s.value ? [s.value] : [])).map(([t, v]) => ({ t, v: valeur(v) })),
    }))
    return { etat: 'mesure', series }
  }
}
