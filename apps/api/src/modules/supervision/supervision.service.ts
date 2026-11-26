import { Injectable } from '@nestjs/common'
import { PrometheusClient, type IdRequete, type PointMesure, type ResultatPrometheus } from './prometheus.client'

/**
 * L'ONGLET « RUNNERS CI » DE LA SUPERVISION — assemble les requêtes de la liste
 * blanche en une réponse par PÉRIMÈTRE : hôte, conteneur, flotte.
 *
 * Doctrine « non mesuré n'est jamais 0 » : chaque valeur absente est `null`.
 * Un compteur mesuré à 0 (OOM 24 h) reste 0 — c'est une mesure. Une limite de
 * conteneur ≤ 0 (cAdvisor : « illimitée ») n'est pas une limite : `null`.
 *
 * Trois états qui ne se confondent pas, comme l'ancienneté des files BullMQ :
 * `non_configure` (clés absentes, no-op strict), `injoignable` (toutes les
 * requêtes ont échoué), `mesure` (au moins une a répondu — celles qui ont
 * échoué sont NOMMÉES dans `requetesEnEchec`, leurs valeurs restent `null`).
 */

/** Au-delà, la dernière donnée d'un hôte est trop vieille pour être crue. */
const SEUIL_PERIME_SEC = 120

type ConteneurRunner = {
  host: string
  name: string
  cpuCoeurs: number | null
  cpuLimiteCoeurs: number | null
  memOctets: number | null
  memLimiteOctets: number | null
  disqueOctets: number | null
  oom24h: number | null
}

type HoteRunner = {
  host: string
  /** Âge de la dernière donnée, en secondes. */
  fraicheurSec: number | null
  /** `fraicheurSec > 120`, ou fraîcheur inconnue : la donnée ne se croit pas. */
  perime: boolean
  coeurs: number | null
  cpuPct: number | null
  load1: number | null
  memPct: number | null
  disquePct: number | null
  disqueLibreOctets: number | null
  conteneurs: ConteneurRunner[]
}

type SerieHote = { host: string; points: PointMesure[] }

export type SupervisionRunners =
  | { etat: 'non_configure' }
  | { etat: 'injoignable'; raison: string }
  | {
      etat: 'mesure'
      mesureA: string
      hotes: HoteRunner[]
      flotte: { runnersVus: number | null; coeurs: number | null }
      series: { cpuPct: SerieHote[]; memPct: SerieHote[] }
      requetesEnEchec: IdRequete[]
    }

const IDS = [
  'hote_coeurs',
  'hote_cpu_pct',
  'hote_load1',
  'hote_mem_pct',
  'hote_disque_pct',
  'hote_disque_libre_octets',
  'hote_fraicheur_sec',
  'conteneur_cpu_coeurs',
  'conteneur_cpu_limite_coeurs',
  'conteneur_mem_octets',
  'conteneur_mem_limite_octets',
  'conteneur_disque_octets',
  'conteneur_oom_24h',
  'flotte_runners_vus',
  'flotte_coeurs',
  'serie_cpu_pct_24h',
  'serie_mem_pct_24h',
] as const satisfies readonly IdRequete[]

type Resultats = Record<(typeof IDS)[number], ResultatPrometheus>

function derniere(points: PointMesure[]): number | null {
  return points[points.length - 1]?.v ?? null
}

function limite(v: number | null): number | null {
  return v !== null && v > 0 ? v : null
}

@Injectable()
export class SupervisionService {
  constructor(private readonly prometheus: PrometheusClient) {}

  async runners(): Promise<SupervisionRunners> {
    const reponses = await Promise.all(IDS.map(id => this.prometheus.interroger(id)))
    const res = Object.fromEntries(IDS.map((id, i) => [id, reponses[i]!])) as Resultats

    if (reponses.some(r => r.etat === 'non_configure')) return { etat: 'non_configure' }
    const echecs = IDS.filter(id => res[id].etat === 'injoignable')
    if (echecs.length === IDS.length) {
      const premier = res[IDS[0]]
      return { etat: 'injoignable', raison: premier.etat === 'injoignable' ? premier.raison : 'inconnue' }
    }

    const series = (id: (typeof IDS)[number]) => {
      const r = res[id]
      return r.etat === 'mesure' ? r.series : []
    }
    const parHote = (id: (typeof IDS)[number]) => {
      const m = new Map<string, number | null>()
      for (const s of series(id)) if (s.labels['host']) m.set(s.labels['host'], derniere(s.points))
      return m
    }
    const cleConteneur = (host: string, name: string) => `${host}\u0000${name}`
    const parConteneur = (id: (typeof IDS)[number]) => {
      const m = new Map<string, number | null>()
      for (const s of series(id)) {
        const host = s.labels['host']
        const name = s.labels['name']
        if (host && name) m.set(cleConteneur(host, name), derniere(s.points))
      }
      return m
    }
    const flotte = (id: (typeof IDS)[number]) => {
      const s = series(id)[0]
      return s ? derniere(s.points) : null
    }

    const coeurs = parHote('hote_coeurs')
    const cpu = parHote('hote_cpu_pct')
    const load = parHote('hote_load1')
    const mem = parHote('hote_mem_pct')
    const disque = parHote('hote_disque_pct')
    const libre = parHote('hote_disque_libre_octets')
    const fraicheur = parHote('hote_fraicheur_sec')

    const cCpu = parConteneur('conteneur_cpu_coeurs')
    const cCpuLim = parConteneur('conteneur_cpu_limite_coeurs')
    const cMem = parConteneur('conteneur_mem_octets')
    const cMemLim = parConteneur('conteneur_mem_limite_octets')
    const cDisque = parConteneur('conteneur_disque_octets')
    const cOom = parConteneur('conteneur_oom_24h')

    const conteneursParHote = new Map<string, ConteneurRunner[]>()
    const clesConteneurs = new Set([cCpu, cCpuLim, cMem, cMemLim, cDisque, cOom].flatMap(m => [...m.keys()]))
    for (const cle of [...clesConteneurs].sort()) {
      const [host = '', name = ''] = cle.split('\u0000')
      const liste = conteneursParHote.get(host) ?? []
      liste.push({
        host,
        name,
        cpuCoeurs: cCpu.get(cle) ?? null,
        cpuLimiteCoeurs: limite(cCpuLim.get(cle) ?? null),
        memOctets: cMem.get(cle) ?? null,
        memLimiteOctets: limite(cMemLim.get(cle) ?? null),
        disqueOctets: cDisque.get(cle) ?? null,
        oom24h: cOom.get(cle) ?? null,
      })
      conteneursParHote.set(host, liste)
    }

    const hotesConnus = new Set([
      ...[coeurs, cpu, load, mem, disque, libre, fraicheur].flatMap(m => [...m.keys()]),
      ...conteneursParHote.keys(),
    ])
    const hotes: HoteRunner[] = [...hotesConnus].sort().map(host => {
      const f = fraicheur.get(host) ?? null
      return {
        host,
        fraicheurSec: f,
        perime: f === null || f > SEUIL_PERIME_SEC,
        coeurs: coeurs.get(host) ?? null,
        cpuPct: cpu.get(host) ?? null,
        load1: load.get(host) ?? null,
        memPct: mem.get(host) ?? null,
        disquePct: disque.get(host) ?? null,
        disqueLibreOctets: libre.get(host) ?? null,
        conteneurs: conteneursParHote.get(host) ?? [],
      }
    })

    const serieParHote = (id: (typeof IDS)[number]): SerieHote[] =>
      series(id)
        .filter(s => s.labels['host'])
        .map(s => ({ host: s.labels['host']!, points: s.points }))
        .sort((a, b) => a.host.localeCompare(b.host))

    return {
      etat: 'mesure',
      mesureA: new Date().toISOString(),
      hotes,
      flotte: { runnersVus: flotte('flotte_runners_vus'), coeurs: flotte('flotte_coeurs') },
      series: { cpuPct: serieParHote('serie_cpu_pct_24h'), memPct: serieParHote('serie_mem_pct_24h') },
      requetesEnEchec: echecs,
    }
  }
}
