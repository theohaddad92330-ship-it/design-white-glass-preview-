import { Injectable, Logger } from '@nestjs/common'

/**
 * CLIENT DES MÉTRIQUES RAILWAY — serveur seulement.
 *
 * `POST https://backboard.railway.com/graphql/v2`, jeton de PROJET
 * `RAILWAY_METRICS_TOKEN` en en-tête `Project-Access-Token` (Bearer est refusé).
 * Projet et environnement viennent des variables système Railway
 * (`RAILWAY_PROJECT_ID` / `RAILWAY_ENVIRONMENT_ID`), jamais codés en dur.
 * Lecture INSTANTANÉE, aucun stockage. Mêmes règles que `prometheus.client.ts` :
 *
 * 1. NO-OP STRICT — jeton, projet ou environnement absent (ou non conforme à un
 *    UUID) ⇒ `{ etat: 'non_configure' }`, zéro réseau.
 * 2. LE JETON NE SORT PAS — une panne rend une raison à vocabulaire FERMÉ, jamais
 *    le message d'exception ni le message GraphQL. Idem journaux.
 * 3. LISTE BLANCHE — deux requêtes fixes (métriques, noms), mesures et fenêtres
 *    énumérées ; rien de l'appelant n'entre dans la requête.
 */

export type FenetreRailway = '1h' | '24h' | '7j'

export const FENETRES_RAILWAY: readonly FenetreRailway[] = ['1h', '24h', '7j']

const MESURES = ['CPU_USAGE', 'CPU_LIMIT', 'MEMORY_USAGE_GB', 'MEMORY_LIMIT_GB'] as const
type MesureRailway = (typeof MESURES)[number]

const FENETRES: Record<FenetreRailway, { dureeMs: number; pasSec: number }> = {
  '1h': { dureeMs: 3_600_000, pasSec: 60 },
  '24h': { dureeMs: 86_400_000, pasSec: 300 },
  '7j': { dureeMs: 7 * 86_400_000, pasSec: 1800 },
}

type PointRailway = { t: number; v: number | null }
type SerieRailway = { mesure: MesureRailway; serviceId: string; points: PointRailway[] }

export type ResultatRailway =
  | { etat: 'non_configure' }
  | { etat: 'injoignable'; raison: string }
  | {
      etat: 'mesure'
      /** ms epoch de la lecture réseau (stable pendant le cache). */ lueA: number
      series: SerieRailway[]
      /** id de service → nom ; vide si la requête des noms a échoué. */ noms: Record<string, string>
    }

const URL_GRAPHQL = 'https://backboard.railway.com/graphql/v2'
const DELAI_MS = 20_000
/** Pause avant l'unique nouvelle tentative (délai dépassé ou HTTP 5xx). */
const PAUSE_RETRY_MS = 2_000
const CACHE_MS = 30_000
/** #4480 — les noms de services bougent à peine : relus toutes les 10 min, pas à chaque mesure. */
const CACHE_NOMS_MS = 600_000
/** #4480 — repli après une PANNE : 30 s, puis le double à chaque échec de suite, plafonné à 10 min. */
const PAUSE_PANNE_MS = 30_000
const PAUSE_PANNE_MAX_MS = 600_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Config = { jeton: string; projet: string; env: string }

function lireConfig(): Config | null {
  const jeton = process.env['RAILWAY_METRICS_TOKEN']?.trim()
  const projet = process.env['RAILWAY_PROJECT_ID']?.trim()
  const env = process.env['RAILWAY_ENVIRONMENT_ID']?.trim()
  if (!jeton || !projet || !env) return null
  // Les ids entrent dans le texte de la requête : seuls des UUID passent.
  if (!UUID.test(projet) || !UUID.test(env)) return null
  return { jeton, projet, env }
}

/** Vrai si jeton, projet et environnement sont posés (conformes) : sert au minuteur de fond, zéro réseau. */
export const railwayConfigure = (): boolean => lireConfig() !== null

const estMesure = (m: unknown): m is MesureRailway => (MESURES as readonly unknown[]).includes(m)

type Appel = { ok: true; data: unknown } | { ok: false; raison: string }

@Injectable()
export class RailwayClient {
  private readonly logger = new Logger(RailwayClient.name)
  private readonly cache = new Map<FenetreRailway, { expire: number; valeur: ResultatRailway }>()
  private noms: { expire: number; valeur: Record<string, string> } | null = null
  /** #4480 — la dernière panne : tant que sa pause court, AUCUN appel réseau (minuteur de fond, écran et
   *  alertes relisaient chacun, ~315 erreurs en 1 h 30). Vaut pour toutes les fenêtres : jeton, point
   *  d'accès ou limite de débit ne dépendent pas de la fenêtre. */
  private panne: { jusqua: number; raison: string; echecs: number } | null = null
  /** Dernière raison journalisée : une erreur qui dure ne se redit pas à chaque lecture. */
  private raisonJournalisee: string | null = null
  /** #4480 — la lecture réseau EN COURS par fenêtre : un appelant de plus attend la même réponse au lieu
   *  d'en lancer une deuxième (minuteur de fond, écran et alertes lisent souvent au même moment). */
  private readonly enVol = new Map<FenetreRailway, Promise<ResultatRailway>>()

  async lire(fenetre: FenetreRailway): Promise<ResultatRailway> {
    const config = lireConfig()
    if (!config) return { etat: 'non_configure' }
    const enCache = this.cache.get(fenetre)
    if (enCache && enCache.expire > Date.now()) return enCache.valeur
    if (this.panne && this.panne.jusqua > Date.now()) return { etat: 'injoignable', raison: this.panne.raison }
    const enCours = this.enVol.get(fenetre)
    if (enCours) return enCours
    const lecture = this.lireReseau(config, fenetre).finally(() => this.enVol.delete(fenetre))
    this.enVol.set(fenetre, lecture)
    return lecture
  }

  private async lireReseau(config: Config, fenetre: FenetreRailway): Promise<ResultatRailway> {
    const { dureeMs, pasSec } = FENETRES[fenetre]
    const debut = new Date(Date.now() - dureeMs).toISOString()
    const requeteMetriques =
      `query{metrics(projectId:"${config.projet}",environmentId:"${config.env}",startDate:"${debut}",` +
      `sampleRateSeconds:${pasSec},measurements:[${MESURES.join(',')}],groupBy:[SERVICE_ID])` +
      `{measurement tags{serviceId} values{ts value}}}`
    const requeteNoms = `query{project(id:"${config.projet}"){services{edges{node{id name}}}}}`

    const nomsEnCache = this.noms && this.noms.expire > Date.now() ? this.noms.valeur : null
    const [metriques, noms] = await Promise.all([
      this.appeler(config, requeteMetriques),
      nomsEnCache ? Promise.resolve(null) : this.appeler(config, requeteNoms),
    ])
    if (!metriques.ok) {
      const echecs = (this.panne?.echecs ?? 0) + 1
      const pause = Math.min(PAUSE_PANNE_MS * 2 ** (echecs - 1), PAUSE_PANNE_MAX_MS)
      this.panne = { jusqua: Date.now() + pause, raison: metriques.raison, echecs }
      return { etat: 'injoignable', raison: metriques.raison }
    }
    this.panne = null
    this.raisonJournalisee = null

    let nomsLus: Record<string, string> = nomsEnCache ?? {}
    if (noms?.ok) {
      nomsLus = this.lireNoms(noms.data)
      this.noms = { expire: Date.now() + CACHE_NOMS_MS, valeur: nomsLus }
    }
    const valeur: ResultatRailway = {
      etat: 'mesure',
      lueA: Date.now(),
      series: this.lireSeries(metriques.data),
      noms: nomsLus,
    }
    // Seule une MESURE se met en cache : une panne doit pouvoir se lever au rafraîchissement suivant.
    this.cache.set(fenetre, { expire: Date.now() + CACHE_MS, valeur })
    return valeur
  }

  /** Une nouvelle tentative après 2 s si délai dépassé ou HTTP 5xx ; jamais sur 4xx ni erreur GraphQL. */
  private async appeler(config: Config, query: string): Promise<Appel> {
    const premier = await this.tenter(config, query)
    if (premier.ok || !premier.reessayer) return premier.appel
    await new Promise<void>(resolve => setTimeout(resolve, PAUSE_RETRY_MS))
    return (await this.tenter(config, query)).appel
  }

  private async tenter(
    config: Config,
    query: string,
  ): Promise<{ ok: true; appel: Appel } | { ok: false; reessayer: boolean; appel: Appel }> {
    let res: Response
    try {
      res = await fetch(URL_GRAPHQL, {
        method: 'POST',
        headers: { 'Project-Access-Token': config.jeton, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(DELAI_MS),
      })
    } catch (err) {
      // ⚠️ Jamais `err.message` : il peut porter l'URL ou l'en-tête.
      const delai = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
      const raison = delai ? 'délai dépassé (20 s)' : 'erreur réseau'
      this.avertir(raison)
      return { ok: false, reessayer: delai, appel: { ok: false, raison } }
    }
    if (!res.ok) {
      const raison = `HTTP ${res.status}`
      this.avertir(raison)
      return { ok: false, reessayer: res.status >= 500, appel: { ok: false, raison } }
    }
    const appel = await this.lireCorps(res)
    return appel.ok ? { ok: true, appel } : { ok: false, reessayer: false, appel }
  }

  private async lireCorps(res: Response): Promise<Appel> {
    let corps: unknown
    try {
      corps = await res.json()
    } catch {
      this.avertir('réponse illisible')
      return { ok: false, raison: 'réponse illisible' }
    }
    const c = corps as { errors?: unknown; data?: unknown } | null
    if (!c || typeof c !== 'object') return { ok: false, raison: 'réponse illisible' }
    // ⚠️ Le message GraphQL n'est ni rendu ni journalisé (il peut citer le jeton).
    if (Array.isArray(c.errors) && c.errors.length > 0) {
      // #4480.5 — la CLASSE (vocabulaire fermé) voyage aussi jusqu'à l'écran : « erreur GraphQL » seul ne dit
      // pas quoi corriger (jeton, débit, requête).
      const raison = `erreur GraphQL${this.classeGraphql(c.errors)}`
      this.avertir(raison)
      return { ok: false, raison }
    }
    return { ok: true, data: c.data }
  }

  /** #4480 — une erreur qui dure se dit UNE fois (jusqu'à la prochaine mesure réussie). */
  private avertir(raison: string): void {
    if (raison === this.raisonJournalisee) return
    this.raisonJournalisee = raison
    this.logger.warn(`supervision railway : ${raison}`)
  }

  /**
   * La CLASSE d'une erreur GraphQL, à vocabulaire fermé — le message serveur lui-même n'est jamais repris
   * (il peut citer le jeton). Le journal ET l'écran de supervision disent la classe : l'accès (jeton), le débit, ou une requête que
   * Railway ne reconnaît plus (schéma qui a bougé).
   */
  private classeGraphql(erreurs: unknown[]): string {
    const message = String((erreurs[0] as { message?: unknown } | null)?.message ?? '')
    if (/not authori[sz]ed|unauthori[sz]ed|forbidden/i.test(message)) return ' (accès refusé : jeton à vérifier)'
    if (/rate.?limit|too many/i.test(message)) return ' (limite de débit)'
    if (/cannot query field|unknown (argument|type)|validation|not a valid/i.test(message)) {
      return ' (requête non reconnue par Railway)'
    }
    return ''
  }

  private lireSeries(data: unknown): SerieRailway[] {
    const brut = (data as { metrics?: unknown } | null)?.metrics
    if (!Array.isArray(brut)) return []
    const series: SerieRailway[] = []
    for (const s of brut as Array<{
      measurement?: unknown
      tags?: { serviceId?: unknown }
      values?: unknown
    }>) {
      const serviceId = s?.tags?.serviceId
      if (!estMesure(s?.measurement) || typeof serviceId !== 'string' || !Array.isArray(s.values)) continue
      const points: PointRailway[] = []
      for (const p of s.values as Array<{ ts?: unknown; value?: unknown }>) {
        if (typeof p?.ts !== 'number') continue
        // Railway rend des secondes epoch ; au-delà de 1e12 c'est déjà des ms.
        const t = p.ts < 1e12 ? p.ts * 1000 : p.ts
        points.push({ t, v: typeof p.value === 'number' && Number.isFinite(p.value) ? p.value : null })
      }
      series.push({ mesure: s.measurement, serviceId, points })
    }
    return series
  }

  private lireNoms(data: unknown): Record<string, string> {
    const edges = (data as { project?: { services?: { edges?: unknown } } } | null)?.project?.services?.edges
    const noms: Record<string, string> = {}
    if (!Array.isArray(edges)) return noms
    for (const e of edges as Array<{ node?: { id?: unknown; name?: unknown } }>) {
      const { id, name } = e?.node ?? {}
      if (typeof id === 'string' && typeof name === 'string' && name.trim()) noms[id] = name
    }
    return noms
  }
}
