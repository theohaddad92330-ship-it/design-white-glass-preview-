import { Injectable, Optional } from '@nestjs/common'
import { IaClient } from '../ia/ia.client'
import { PrometheusClient, type IdRequete, type PointMesure, type ResultatPrometheus } from './prometheus.client'

/**
 * L'ONGLET « DISPONIBILITÉ » — ce que les 4 runners CI voient de l'EXTÉRIEUR
 * (sondes blackbox d'Alloy, série `probe_*`, label `cible`), plus le commit servi.
 *
 * Doctrine « non mesuré n'est jamais 0 » : tant que les runners n'ont pas été
 * redéployés avec la sonde, AUCUNE série `probe_*` n'existe. La réponse le dit
 * (`sondesDeployees: false`) et chaque valeur est `null` — jamais « 0 % de dispo ».
 *
 * Commit servi : l'API lit sa propre révision (même source que `/version`, pas
 * de requête HTTP vers soi-même) ; l'IA, son `/version` via `IaClient` (`null`
 * quand elle ne répond pas). Le commit de `main` n'est PAS évalué ici (aucun
 * appel GitHub) : `null`, affiché « non mesuré ».
 */

/** Cibles attendues — une ligne par cible même quand aucune série n'est encore là. */
const CIBLES_ATTENDUES = ['api', 'version', 'web', 'site'] as const

type CibleDisponibilite = {
  cible: string
  hotesOk: number | null
  hotesTotal: number | null
  dispo24hPct: number | null
  latenceP50Ms: number | null
  latenceMaxMs: number | null
  tlsJours: number | null
  serie: PointMesure[]
}

type CommitsServis = { api: string | null; ia: string | null; main: null }

export type SupervisionDisponibilite =
  | { etat: 'non_configure' }
  | { etat: 'injoignable'; raison: string }
  | {
      etat: 'mesure'
      mesureA: string
      /** `false` tant qu'aucune série `probe_*` n'a été poussée par les runners. */
      sondesDeployees: boolean
      cibles: CibleDisponibilite[]
      commits: CommitsServis
      requetesEnEchec: IdRequete[]
    }

const IDS = [
  'dispo_hotes_ok',
  'dispo_hotes_total',
  'dispo_24h_pct',
  'dispo_latence_p50_ms',
  'dispo_latence_max_ms',
  'dispo_tls_jours',
  'serie_dispo_24h',
] as const satisfies readonly IdRequete[]

type Id = (typeof IDS)[number]

function derniere(points: PointMesure[]): number | null {
  return points[points.length - 1]?.v ?? null
}

/** Une révision inconnue (`unknown`, vide) n'est pas une révision : `null`. */
function revision(brute: string | undefined | null): string | null {
  const v = brute?.trim()
  return v && v !== 'unknown' ? v : null
}

@Injectable()
export class DisponibiliteService {
  // `@Optional()` : un déploiement sans client IA rend simplement `ia: null`.
  constructor(
    private readonly prometheus: PrometheusClient,
    @Optional() private readonly ia?: IaClient,
  ) {}

  async disponibilite(): Promise<SupervisionDisponibilite> {
    const reponses = await Promise.all(IDS.map(id => this.prometheus.interroger(id)))
    const res = Object.fromEntries(IDS.map((id, i) => [id, reponses[i]!])) as Record<Id, ResultatPrometheus>

    if (reponses.some(r => r.etat === 'non_configure')) return { etat: 'non_configure' }
    const echecs = IDS.filter(id => res[id].etat === 'injoignable')
    if (echecs.length === IDS.length) {
      const premier = res[IDS[0]]
      return { etat: 'injoignable', raison: premier.etat === 'injoignable' ? premier.raison : 'inconnue' }
    }

    const parCible = (id: Id) => {
      const r = res[id]
      const m = new Map<string, PointMesure[]>()
      if (r.etat === 'mesure') for (const s of r.series) if (s.labels['cible']) m.set(s.labels['cible'], s.points)
      return m
    }
    const ok = parCible('dispo_hotes_ok')
    const total = parCible('dispo_hotes_total')
    const dispo = parCible('dispo_24h_pct')
    const p50 = parCible('dispo_latence_p50_ms')
    const max = parCible('dispo_latence_max_ms')
    const tls = parCible('dispo_tls_jours')
    const serie = parCible('serie_dispo_24h')

    const vues = new Set([ok, total, dispo, p50, max, tls, serie].flatMap(m => [...m.keys()]))
    const noms = [
      ...CIBLES_ATTENDUES,
      ...[...vues].filter(c => !(CIBLES_ATTENDUES as readonly string[]).includes(c)).sort(),
    ]
    const cibles: CibleDisponibilite[] = noms.map(cible => ({
      cible,
      hotesOk: derniere(ok.get(cible) ?? []),
      hotesTotal: derniere(total.get(cible) ?? []),
      dispo24hPct: derniere(dispo.get(cible) ?? []),
      latenceP50Ms: derniere(p50.get(cible) ?? []),
      latenceMaxMs: derniere(max.get(cible) ?? []),
      tlsJours: derniere(tls.get(cible) ?? []),
      serie: serie.get(cible) ?? [],
    }))

    const iaVersion = this.ia ? await this.ia.version() : null
    return {
      etat: 'mesure',
      mesureA: new Date().toISOString(),
      sondesDeployees: vues.size > 0,
      cibles,
      commits: {
        api: revision(
          process.env['SENTRY_RELEASE'] ?? process.env['RAILWAY_GIT_COMMIT_SHA'] ?? process.env['GIT_COMMIT'],
        ),
        ia: revision(iaVersion?.commit),
        main: null,
      },
      requetesEnEchec: echecs,
    }
  }
}
