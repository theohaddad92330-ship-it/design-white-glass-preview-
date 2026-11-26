import { Inject, Injectable, Logger, Optional, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import IORedis from 'ioredis'
import { Resend } from 'resend'
import { killSwitchCut } from '../../common/kill-switches'
import { parseRedisUrl } from '../../config/redis-connection'
import { LectureDeFondService } from './lecture-de-fond.service'
import { PrometheusClient, type IdRequete, type ResultatPrometheus } from './prometheus.client'
import { railwayConfigure } from './railway.client'
import { supabaseConfigure } from './supabase-metrics.client'

/**
 * ALERTES D'INFRA (30/09/2026) — la supervision ne se contente plus d'être LUE :
 * elle PRÉVIENT l'équipe interne quand une règle tient assez longtemps.
 *
 * DESTINATAIRE : `BACKOFFICE_ALERT_EMAILS` SEULEMENT (le canal e-mail du
 * back-office, même transport Resend). C'est une alerte d'INFRA vers NOTRE
 * équipe — jamais vers un client ni un destinataire métier ; ce n'est pas un
 * envoi de prospection (garde `aucun-envoi-sans-clic`, qui ne l'accuse pas).
 *
 * UNE ALERTE = UN SEUIL ET UNE DURÉE (`REGLES_ALERTES`). Le premier
 * dépassement est daté dans Redis (`depuis`) ; l'incident ne s'ouvre que
 * lorsque le dépassement dure `dureeSec`. Un retour sous le seuil efface la
 * date (le compteur repart de zéro).
 *
 * UN INCIDENT = DEUX E-MAILS AU PLUS : « ouvert » à la transition, « résolu » à
 * l'autre. Tant qu'il est ouvert : silence. Les transitions sont ATOMIQUES
 * (`SET NX` pour ouvrir, `DEL` qui rend 1 pour résoudre) : deux réplicas qui
 * évaluent en même temps n'envoient qu'un seul e-mail, en plus du verrou
 * d'évaluation.
 *
 * VALEUR ABSENTE (`null`) = règle NON ÉVALUABLE : ni ouverture, ni résolution,
 * ni remise à zéro de la durée. Un sujet qui disparaît de la mesure (runner
 * muet dont la série s'éteint) garde son incident ouvert.
 *
 * GRAFANA INJOIGNABLE : UN incident `supervision_injoignable`, et tant qu'il est
 * ouvert les règles qui dépendent de Grafana sont SUSPENDUES — une panne de
 * lecture n'est pas mille pannes de runner.
 *
 * LIMITE ASSUMÉE : l'API ne peut pas alerter sur sa propre panne. Règle à poser
 * dans Grafana sur `probe_success{cible="api"}` (voir env-reference.md).
 *
 * NO-OP STRICT : ni Grafana, ni Railway, ni Supabase configuré ⇒ aucun minuteur.
 * Sans `REDIS_URL` : pas d'état, donc pas d'évaluation (on n'enverrait que des
 * doublons).
 *
 * VERROU : `SET NX EX` direct sur Redis plutôt que `SingletonLockService` —
 * l'import de `locks` dans un service de plus ferait monter le gel GA-07
 * (services qui importent un autre module) pour rien : cette classe ouvre déjà
 * sa propre connexion Redis pour l'état des incidents, le verrou est la même
 * commande (`SET key val EX ttl NX`), jamais relâché (il expire).
 */

const INTERVALLE_MS = 5 * 60_000
/** < 5 min : le tour suivant retrouve le verrou expiré. */
const VERROU_TTL_SEC = 240
const PREFIXE = 'bellum:supervision-alertes:'
const TTL_INCIDENT_SEC = 30 * 24 * 3600
const TTL_DEPUIS_SEC = 24 * 3600
const TTL_GRAFANA_VU_SEC = 90 * 24 * 3600

type Onglet = 'runners' | 'supabase' | 'disponibilite'

/**
 * LA table des règles : seule source du seuil, de la durée et du message
 * (GA-26 — un réglage vit à un seul endroit). `dureeSec` : 0 = le seuil seul ;
 * 240 = deux évaluations consécutives (5 min d'écart moins la gigue).
 */
export const REGLES_ALERTES = [
  {
    id: 'runner_muet',
    seuil: 600,
    dureeSec: 0,
    unite: 's',
    onglet: 'runners',
    grafana: true,
    message: 'Un runner CI n’a plus envoyé de donnée depuis plus de 10 minutes',
  },
  {
    id: 'runner_disque',
    seuil: 85,
    dureeSec: 15 * 60,
    unite: '%',
    onglet: 'runners',
    grafana: true,
    message: 'Le disque d’un runner CI dépasse 85 % depuis 15 minutes',
  },
  {
    id: 'supabase_disque',
    seuil: 85,
    dureeSec: 0,
    unite: '%',
    onglet: 'supabase',
    grafana: false,
    message: 'Un point de montage Supabase dépasse 85 %',
  },
  {
    id: 'supabase_connexions',
    seuil: 80,
    dureeSec: 10 * 60,
    unite: '% de max_connections',
    onglet: 'supabase',
    grafana: false,
    message: 'Les connexions Postgres dépassent 80 % de max_connections depuis 10 minutes',
  },
  {
    id: 'dispo_cible',
    seuil: 2,
    dureeSec: 240,
    unite: 'runners en échec',
    onglet: 'disponibilite',
    grafana: true,
    message: 'Une cible est en échec vue par au moins 2 runners, sur 2 évaluations consécutives',
  },
  {
    id: 'tls_expire',
    seuil: 14,
    dureeSec: 0,
    unite: 'jours',
    onglet: 'disponibilite',
    grafana: true,
    message: 'Un certificat TLS expire dans moins de 14 jours',
  },
  {
    id: 'supervision_injoignable',
    seuil: 1,
    dureeSec: 240,
    unite: '(1 = injoignable)',
    onglet: 'runners',
    grafana: false,
    message: 'Grafana est injoignable ou n’est plus configuré : les règles qui en dépendent sont suspendues',
  },
] as const satisfies readonly {
  id: string
  seuil: number
  dureeSec: number
  unite: string
  onglet: Onglet
  grafana: boolean
  message: string
}[]

type Regle = (typeof REGLES_ALERTES)[number]
type IdRegle = Regle['id']

type Mesure = { sujet: string; valeur: number | null }

type IncidentInfra = {
  regle: string
  sujet: string
  message: string
  valeur: number
  seuil: number
  unite: string
  depuis: string
  onglet: string
}

export type IncidentsServis = { etat: 'mesure'; incidents: IncidentInfra[] } | { etat: 'illisible' }

/** Le sous-ensemble de Redis utilisé ici (injectable en test). */
type RedisAlertes = Pick<IORedis, 'set' | 'get' | 'del' | 'sadd' | 'srem' | 'smembers' | 'quit'>
const REDIS_ALERTES = 'SUPERVISION_ALERTES_REDIS'

const grafanaConfigure = (): boolean =>
  ['GRAFANA_PROM_URL', 'GRAFANA_PROM_USER', 'GRAFANA_PROM_READ_TOKEN'].every(k => Boolean(process.env[k]?.trim()))

function replica(): string {
  return process.env['RAILWAY_REPLICA_ID'] ?? process.env['HOSTNAME'] ?? `pid:${process.pid}`
}

/** Dernière valeur de chaque série, par le label demandé (`null` conservé). */
function parLabel(r: ResultatPrometheus, label: string): Map<string, number | null> {
  const m = new Map<string, number | null>()
  if (r.etat !== 'mesure') return m
  for (const s of r.series) {
    const cle = s.labels[label]
    if (cle) m.set(cle, s.points[s.points.length - 1]?.v ?? null)
  }
  return m
}

/** Le dépassement est-il franchi ? (`tls_expire` : en dessous ; les autres : au-dessus, `>=` pour le nombre de runners). */
function franchit(id: IdRegle, valeur: number, seuil: number): boolean {
  if (id === 'tls_expire') return valeur < seuil
  if (id === 'dispo_cible' || id === 'supervision_injoignable') return valeur >= seuil
  return valeur > seuil
}

@Injectable()
export class AlertesInfraService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertesInfraService.name)
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly redis?: RedisAlertes
  private resend: Resend | null = null

  constructor(
    private readonly prometheus: PrometheusClient,
    private readonly lectureDeFond: LectureDeFondService,
    private readonly config: ConfigService,
    @Optional() @Inject(REDIS_ALERTES) redis?: RedisAlertes,
  ) {
    if (redis) this.redis = redis
    else if (process.env['REDIS_URL']) this.redis = new IORedis({ ...parseRedisUrl(), maxRetriesPerRequest: 3 })
  }

  onModuleInit(): void {
    if (!grafanaConfigure() && !railwayConfigure() && !supabaseConfigure()) return
    this.timer = setInterval(() => void this.evaluer(), INTERVALLE_MS)
    this.timer.unref?.()
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    await Promise.allSettled([this.redis?.quit()])
  }

  /** Un tour d'évaluation, sur UN seul réplica (verrou `SET NX EX`). Ne lève jamais. */
  async evaluer(): Promise<void> {
    if (!grafanaConfigure() && !railwayConfigure() && !supabaseConfigure()) return
    if (!this.redis) {
      this.logger.warn('alertes infra : REDIS_URL absente — pas d’état, pas d’évaluation')
      return
    }
    try {
      const gagne = await this.redis.set(`${PREFIXE}verrou`, replica(), 'EX', VERROU_TTL_SEC, 'NX')
      if (gagne !== 'OK') return
      await this.passe()
    } catch {
      // ⚠️ Jamais le message : il peut porter l'URL Redis.
      this.logger.warn('alertes infra : tour d’évaluation en échec')
    }
  }

  /** `GET internal/admin/supervision/incidents` — Redis injoignable ⇒ `illisible`, jamais « aucun ». */
  async incidents(): Promise<IncidentsServis> {
    if (!this.redis) return { etat: 'illisible' }
    try {
      const cles = await this.redis.smembers(`${PREFIXE}ouverts`)
      const out: IncidentInfra[] = []
      for (const cle of cles.sort()) {
        const brut = await this.redis.get(`${PREFIXE}ouvert:${cle}`)
        if (!brut) continue
        try {
          out.push(JSON.parse(brut) as IncidentInfra)
        } catch {
          // Entrée illisible : ignorée, l'écran ne reçoit jamais de JSON brut.
        }
      }
      return { etat: 'mesure', incidents: out }
    } catch {
      this.logger.warn('alertes infra : lecture des incidents impossible')
      return { etat: 'illisible' }
    }
  }

  // ───────────────────────────── évaluation ──────────────────────────────────

  private async passe(): Promise<void> {
    const ids = [
      'hote_silence_sec',
      'hote_disque_pct',
      'dispo_hotes_ok',
      'dispo_hotes_total',
      'dispo_tls_jours',
    ] as const satisfies readonly IdRequete[]
    const r = await Promise.all(ids.map(id => this.prometheus.interroger(id)))
    const [silence, disque, ok, total, tls] = r as [
      ResultatPrometheus,
      ResultatPrometheus,
      ResultatPrometheus,
      ResultatPrometheus,
      ResultatPrometheus,
    ]

    // Grafana : 1 = injoignable, 0 = lu, null = jamais configuré (non évaluable).
    let etatGrafana: number | null = null
    if (r.some(x => x.etat === 'injoignable')) etatGrafana = 1
    else if (r.some(x => x.etat === 'non_configure')) {
      etatGrafana = (await this.redis!.get(`${PREFIXE}grafana-vu`)) ? 1 : null
    } else {
      etatGrafana = 0
      await this.redis!.set(`${PREFIXE}grafana-vu`, new Date().toISOString(), 'EX', TTL_GRAFANA_VU_SEC)
    }
    await this.traiter('supervision_injoignable', [{ sujet: 'grafana', valeur: etatGrafana }])
    const suspendu = etatGrafana === 1 || (await this.estOuvert('supervision_injoignable', 'grafana'))

    if (!suspendu && etatGrafana === 0) {
      await this.traiter(
        'runner_muet',
        [...parLabel(silence, 'host')].map(([sujet, valeur]) => ({ sujet, valeur })),
      )
      await this.traiter(
        'runner_disque',
        [...parLabel(disque, 'host')].map(([sujet, valeur]) => ({ sujet, valeur })),
      )
      const okParCible = parLabel(ok, 'cible')
      const totalParCible = parLabel(total, 'cible')
      await this.traiter(
        'dispo_cible',
        [...totalParCible].map(([sujet, t]) => {
          const o = okParCible.get(sujet) ?? null
          return { sujet, valeur: t === null || o === null ? null : t - o }
        }),
      )
      await this.traiter(
        'tls_expire',
        [...parLabel(tls, 'cible')].map(([sujet, valeur]) => ({ sujet, valeur })),
      )
    }

    await this.evaluerSupabase()
  }

  private async evaluerSupabase(): Promise<void> {
    if (!supabaseConfigure()) return
    const s = await this.lectureDeFond.supabase()
    // Périmé ou non mesuré : non évaluable (aucune mesure n'est inventée).
    if (s.etat !== 'mesure' || s.perime) return
    await this.traiter(
      'supabase_disque',
      s.instance.disques.map(d => ({ sujet: d.mountpoint, valeur: d.usagePct })),
    )
    const { backendsTotal, maxConnections } = s.connexions
    const pct =
      backendsTotal === null || maxConnections === null || maxConnections <= 0
        ? null
        : (100 * backendsTotal) / maxConnections
    await this.traiter('supabase_connexions', [{ sujet: 'postgres', valeur: pct }])
  }

  /** Applique une règle à ses mesures : durée, ouverture, résolution. `null` ⇒ on n'y touche pas. */
  private async traiter(id: IdRegle, mesures: Mesure[]): Promise<void> {
    const regle = REGLES_ALERTES.find(x => x.id === id)!
    for (const m of mesures) {
      if (m.valeur === null || !Number.isFinite(m.valeur)) continue
      const cleDepuis = `${PREFIXE}depuis:${id}:${m.sujet}`
      if (franchit(id, m.valeur, regle.seuil)) {
        const maintenant = Date.now()
        await this.redis!.set(cleDepuis, String(maintenant), 'EX', TTL_DEPUIS_SEC, 'NX')
        const depuis = Number(await this.redis!.get(cleDepuis))
        const debut = Number.isFinite(depuis) && depuis > 0 ? depuis : maintenant
        if (maintenant - debut >= regle.dureeSec * 1000) await this.ouvrir(regle, m.sujet, m.valeur, debut)
      } else {
        await this.redis!.del(cleDepuis)
        await this.resoudre(regle, m.sujet, m.valeur)
      }
    }
  }

  private async estOuvert(id: IdRegle, sujet: string): Promise<boolean> {
    return (await this.redis!.get(`${PREFIXE}ouvert:${id}:${sujet}`)) !== null
  }

  /** `SET NX` : un seul gagnant, donc un seul e-mail « ouvert ». */
  private async ouvrir(regle: Regle, sujet: string, valeur: number, debut: number): Promise<void> {
    const incident: IncidentInfra = {
      regle: regle.id,
      sujet,
      message: regle.message,
      valeur,
      seuil: regle.seuil,
      unite: regle.unite,
      depuis: new Date(debut).toISOString(),
      onglet: regle.onglet,
    }
    const gagne = await this.redis!.set(
      `${PREFIXE}ouvert:${regle.id}:${sujet}`,
      JSON.stringify(incident),
      'EX',
      TTL_INCIDENT_SEC,
      'NX',
    )
    if (gagne !== 'OK') return
    await this.redis!.sadd(`${PREFIXE}ouverts`, `${regle.id}:${sujet}`)
    await this.notifier('ouvert', incident, valeur)
  }

  /** `DEL` qui rend 1 : un seul gagnant, donc un seul e-mail « résolu ». */
  private async resoudre(regle: Regle, sujet: string, valeur: number): Promise<void> {
    const cle = `${PREFIXE}ouvert:${regle.id}:${sujet}`
    const brut = await this.redis!.get(cle)
    if (brut === null) return
    const supprimees = await this.redis!.del(cle)
    if (supprimees !== 1) return
    await this.redis!.srem(`${PREFIXE}ouverts`, `${regle.id}:${sujet}`)
    let incident: IncidentInfra
    try {
      incident = JSON.parse(brut) as IncidentInfra
    } catch {
      incident = {
        regle: regle.id,
        sujet,
        message: regle.message,
        valeur,
        seuil: regle.seuil,
        unite: regle.unite,
        depuis: new Date().toISOString(),
        onglet: regle.onglet,
      }
    }
    await this.notifier('resolu', incident, valeur)
  }

  // ───────────────────────────── e-mail ──────────────────────────────────────

  /**
   * Seul destinataire : `BACKOFFICE_ALERT_EMAILS`. Comme le dispatcheur du
   * back-office : rien ne part hors production ni interrupteur coupé ; l'état
   * est déjà écrit, donc jamais de redécouverte « neuve » au déploiement.
   */
  private async notifier(sorte: 'ouvert' | 'resolu', incident: IncidentInfra, valeurActuelle: number): Promise<void> {
    if (killSwitchCut('backoffice.alerts_dispatch')) return
    if (process.env['NODE_ENV'] !== 'production') {
      this.logger.log(
        `alerte infra ${incident.regle}/${incident.sujet} (${sorte}) calculée, NON envoyée (hors production)`,
      )
      return
    }
    const destinataires = (process.env['BACKOFFICE_ALERT_EMAILS'] ?? '')
      .split(',')
      .map(e => e.trim())
      .filter(e => e.includes('@'))
    if (destinataires.length === 0) {
      this.logger.warn('BACKOFFICE_ALERT_EMAILS absente — alerte infra calculée, aucun destinataire (no-op strict)')
      return
    }
    const apiKey = this.config.get<string>('resendApiKey')
    const from = this.config.get<string>('resendFrom')
    if (!apiKey || !from) {
      this.logger.warn('RESEND_API_KEY/RESEND_FROM absents — alerte infra non envoyée (no-op strict)')
      return
    }
    const base = (process.env['DASHBOARD_MANAGER_URL'] ?? '').trim().replace(/\/+$/, '')
    const lien = `${base}/supervision?onglet=${incident.onglet}`
    const mesure = sorte === 'ouvert' ? incident.valeur : valeurActuelle
    const sujet = `[Infra] ${sorte === 'ouvert' ? 'ouvert' : 'résolu'} — ${incident.regle} (${incident.sujet})`
    const texte = [
      incident.message,
      '',
      `Règle : ${incident.regle}`,
      `Sujet : ${incident.sujet}`,
      `Valeur mesurée : ${Math.round(mesure * 10) / 10} ${incident.unite}`,
      `Seuil : ${incident.seuil} ${incident.unite}`,
      `Depuis : ${incident.depuis}`,
      `Détail : ${lien}`,
    ].join('\n')
    this.resend ??= new Resend(apiKey)
    for (const to of destinataires) {
      try {
        const { error } = await this.resend.emails.send({ from, to: [to], subject: sujet, text: texte })
        if (error) throw new Error(error.message)
      } catch {
        this.logger.error(`alerte infra : envoi en échec vers ${to}`)
      }
    }
  }
}
