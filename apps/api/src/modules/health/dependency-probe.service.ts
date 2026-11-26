import { Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import IORedis from 'ioredis'
import { DataSource } from 'typeorm'
import { parseRedisUrl } from '../../config/redis-connection'
import { ANALYSIS_WORKER_NAME, WorkerReadinessRegistry } from '../worker-readiness/worker-readiness.registry'
import { DEPENDENCIES, DEPENDENCY_IDS, isConfigured, type DependencyId } from './dependency-registry'
import type { DependencySample } from './dependency-health.logic'

/**
 * #1660 — les sondes de la page Santé, et leur historique.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI REDIS ET PAS UNE TABLE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une latence médiane sur 24 h et une disponibilité sur 7 jours ne se calculent
 * pas sans historique — le triage de #1660 le dit : « poser la table avant
 * l'écran ». Elle n'a pas été posée, et la raison est écrite plutôt que
 * sous-entendue : **toute nouvelle table TypeORM doit être déclarée au registre
 * des portées** (`packages/contracts/src/schemas/table-scopes.ts`, gardes GA-16
 * et GA-65), qui vit dans un paquet hors du périmètre de ce lot.
 *
 * Redis est de toute façon le bon endroit pour une fenêtre glissante de
 * télémétrie : une série qui s'auto-périme (huit jours) n'a pas besoin d'une
 * migration, d'une purge planifiée ni d'une décision de rétention RGPD — elle
 * ne porte AUCUNE donnée de client, seulement des « à telle heure, ça
 * répondait, en tant de millisecondes ».
 *
 * ⚠️ Conséquence assumée, et elle doit rester visible : **si Redis tombe,
 * l'historique devient illisible, et l'écran dit « inconnu » — jamais « sain ».**
 * C'est cohérent : Redis est lui-même l'une des onze dépendances, et une tuile
 * Redis rouge à côté de dix tuiles « inconnu » raconte exactement ce qui se
 * passe.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ON NE SONDE PAS, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * Claude, Apollo, Firecrawl, Pappers et Brave sont facturés à l'appel. Les
 * sonder toutes les cinq minutes coûterait 1 440 appels payants par jour pour
 * apprendre ce que la production apprend déjà : leur état vient des analyses
 * réellement exécutées (`analysis_runs.source_health`), qui est un test réel au
 * sens le plus fort — un vrai appel, pour un vrai client.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SANS CLÉ = PAS DE SONDE
 * ─────────────────────────────────────────────────────────────────────────────
 * `isConfigured` décide. Une dépendance non configurée n'est pas sondée du tout
 * — zéro appel réseau, comme partout dans ce dépôt — et l'écran l'affiche
 * « éteinte », pas « en panne ».
 */

/** Combien de temps une sonde reste dans la fenêtre. Huit jours pour couvrir
 *  les sept de la série sans qu'un décalage d'horloge n'ampute le plus vieux. */
const HISTORY_TTL_MS = 8 * 24 * 60 * 60 * 1000

/** Budget dur d'une sonde. Au-delà, la dépendance est en panne POUR NOS
 *  UTILISATEURS — c'est le même arbitrage que `StatusService`. */
const PROBE_TIMEOUT_MS = 2_000

/** Le préfixe des séries. Un seul endroit, pour que lecture et écriture ne
 *  puissent pas diverger — une clé de cache recopiée à la main est un piège
 *  déjà payé dans ce dépôt. */
function seriesKey(id: DependencyId): string {
  return `health:dependency:${id}`
}

type ProbeOutcome = { ok: boolean; latencyMs: number | null }

@Injectable()
export class DependencyProbeService {
  private readonly logger = new Logger(DependencyProbeService.name)

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly workers: WorkerReadinessRegistry,
  ) {}

  /**
   * Sonde les dépendances configurées et range le résultat.
   *
   * Ne lève JAMAIS : une mesure ne casse jamais ce qu'elle observe, et surtout
   * elle ne casse pas la passe qui l'héberge (`StatusMonitorService`, qui alerte
   * par ailleurs sur l'état public).
   */
  async probeAndRecord(now: number = Date.now()): Promise<void> {
    const probed = DEPENDENCY_IDS.filter(id => DEPENDENCIES[id].measuredBy === 'probe').filter(id =>
      isConfigured(DEPENDENCIES[id]),
    )

    const outcomes = await Promise.all(probed.map(async id => ({ id, outcome: await this.runProbe(id) }) as const))

    await this.write(
      outcomes.map(({ id, outcome }) => ({ id, sample: { at: now, ok: outcome.ok, latencyMs: outcome.latencyMs } })),
    )
  }

  /**
   * L'historique des sondes, par dépendance.
   *
   * ⚠️ Une série ILLISIBLE rend un tableau VIDE, jamais une erreur : l'appelant
   * en dérive « inconnu », ce qui est la vérité. Lever ferait disparaître les
   * dix autres tuiles parce qu'une seule série est cassée.
   */
  async history(now: number = Date.now()): Promise<Partial<Record<DependencyId, DependencySample[]>>> {
    const client = this.redis()
    if (!client) return {}
    try {
      await client.connect()
      const out: Partial<Record<DependencyId, DependencySample[]>> = {}
      for (const id of DEPENDENCY_IDS) {
        if (DEPENDENCIES[id].measuredBy !== 'probe') continue
        const raw = await client.zrangebyscore(seriesKey(id), now - HISTORY_TTL_MS, now)
        out[id] = raw.map(decodeSample).filter((sample): sample is DependencySample => sample !== null)
      }
      return out
    } catch (error) {
      this.logger.warn('Dependency history unreadable', {
        error: error instanceof Error ? error.message : String(error),
      })
      return {}
    } finally {
      client.disconnect()
    }
  }

  /** Une sonde, avec son budget dur. Ne lève jamais. */
  private async runProbe(id: DependencyId): Promise<ProbeOutcome> {
    const startedAt = Date.now()
    let timer: NodeJS.Timeout | undefined
    try {
      const measured = await Promise.race([
        this.probe(id),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`probe '${id}' timed out`)), PROBE_TIMEOUT_MS)
        }),
      ])
      // ⚠️ Une sonde sans latence rend `null` et NON zéro : un registre en
      // mémoire n'a pas d'aller-retour réseau, et « 0 ms » serait la lecture la
      // plus flatteuse possible d'une absence de mesure.
      return { ok: true, latencyMs: measured ? Date.now() - startedAt : null }
    } catch (error) {
      // Le détail reste au journal : la charge utile de l'écran ne porte
      // aucune URL ni interne de pilote.
      this.logger.warn(`Dependency probe '${id}' failed`, {
        error: error instanceof Error ? error.message : String(error),
      })
      return { ok: false, latencyMs: null }
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  /**
   * Le test RÉEL de chaque dépendance. Rend `true` quand la sonde a mesuré un
   * aller-retour (donc une latence a un sens), `false` quand elle n'en a pas.
   *
   * `protected` pour qu'un test puisse substituer un double sans réseau.
   */
  protected async probe(id: DependencyId): Promise<boolean> {
    switch (id) {
      case 'api':
        // Le fait que cette passe s'exécute EST le test : le processus répond.
        // Aucune latence — celle d'une réponse HTTP se mesure côté client.
        return false
      case 'worker':
        // Le registre de vivacité, celui-là même sur lequel Railway promeut un
        // déploiement. Un worker mort n'y est pas « en retard », il n'y est pas.
        if (!this.workers.isLive(ANALYSIS_WORKER_NAME)) throw new Error('analysis worker is not live')
        return false
      case 'postgres':
        await this.dataSource.query('SELECT 1')
        return true
      case 'redis':
        await this.pingRedis()
        return true
      case 'supabase':
        // #1840 — l'appel partait SANS authentification. Kong (la passerelle
        // devant GoTrue) répond alors 401 « No API key found in request » —
        // un refus de NOTRE requête, pas une preuve que le service est mort —
        // et `fetchOk` lisait ce 401 comme une panne. La clé ANON suffit à un
        // contrôle de vivacité : elle est publique par nature (c'est la même
        // que le navigateur porte), là où la clé de SERVICE est un privilège
        // d'administration qui n'a rien à faire dans une sonde.
        await this.fetchOk(new URL('/auth/v1/health', requireEnv('SUPABASE_URL')).toString(), {
          apikey: requireEnv('SUPABASE_ANON_KEY'),
        })
        return true
      case 'stripe':
        // Une lecture, jamais une écriture : `GET /v1/balance` prouve que la clé
        // est acceptée et que l'API répond, sans toucher à un paiement.
        await this.fetchOk('https://api.stripe.com/v1/balance', {
          Authorization: `Bearer ${requireEnv('STRIPE_SECRET_KEY')}`,
        })
        return true
      default:
        // Les dépendances mesurées à l'usage n'arrivent jamais ici : elles sont
        // filtrées en amont. Lever plutôt que rendre « ok » — une sonde qui ne
        // sonde rien ne doit pas produire de la santé.
        throw new Error(`dependency '${id}' is not probed`)
    }
  }

  /** Un aller-retour HTTP borné. `protected` pour la substitution en test. */
  protected async fetchOk(url: string, headers: Record<string, string> = {}): Promise<void> {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  }

  /** Un Redis neuf par sonde — même raison que `StatusService` : ne pas
   *  empoisonner les connexions BullMQ partagées avec un état de reconnexion. */
  protected async pingRedis(): Promise<void> {
    const client = this.redis()
    if (!client) throw new Error('redis is not configured')
    try {
      await client.connect()
      await client.ping()
    } finally {
      client.disconnect()
    }
  }

  /** Range les sondes. Ne lève jamais : perdre un point de série ne doit pas
   *  faire échouer la passe qui alerte sur l'état public. */
  protected async write(entries: readonly { id: DependencyId; sample: DependencySample }[]): Promise<void> {
    if (entries.length === 0) return
    const client = this.redis()
    if (!client) return
    try {
      await client.connect()
      for (const { id, sample } of entries) {
        const key = seriesKey(id)
        await client.zadd(key, sample.at, encodeSample(sample))
        // La purge voyage AVEC l'écriture : une série qu'on n'élague qu'à la
        // lecture grossit sans fin le jour où personne n'ouvre l'écran.
        await client.zremrangebyscore(key, '-inf', sample.at - HISTORY_TTL_MS)
        await client.pexpire(key, HISTORY_TTL_MS)
      }
    } catch (error) {
      this.logger.warn('Dependency probe not recorded', {
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      client.disconnect()
    }
  }

  /** `protected` : un test substitue un double, et l'absence de Redis rend
   *  `null` plutôt que de lever au démarrage. */
  protected redis(): IORedis | null {
    try {
      return new IORedis({
        ...parseRedisUrl(),
        lazyConnect: true,
        connectTimeout: PROBE_TIMEOUT_MS,
        maxRetriesPerRequest: 0,
        retryStrategy: () => null,
        enableOfflineQueue: false,
      })
    } catch {
      return null
    }
  }
}

function requireEnv(key: string): string {
  const value = (process.env[key] ?? '').trim()
  // Inatteignable en pratique — `isConfigured` filtre en amont. La garde existe
  // pour que « configurée » et « sondée » ne puissent pas diverger en silence.
  if (!value) throw new Error(`${key} is not configured`)
  return value
}

/**
 * Une sonde tient dans une chaîne : `<instant>:<0|1>:<latence?>`.
 *
 * Trois champs séparés par `:`, parce qu'un membre de ZSET doit être UNIQUE —
 * deux sondes identiques à la milliseconde près seraient dédupliquées par
 * Redis, ce qui est le comportement voulu (une passe ne tire qu'une fois).
 */
function encodeSample(sample: DependencySample): string {
  return `${sample.at}:${sample.ok ? '1' : '0'}:${sample.latencyMs === null ? '' : sample.latencyMs}`
}

/** Une ligne illisible rend `null` — on jette le point, pas la série. */
function decodeSample(raw: string): DependencySample | null {
  const [at, ok, latency] = raw.split(':')
  const timestamp = Number(at)
  if (!Number.isFinite(timestamp) || (ok !== '0' && ok !== '1')) return null
  const latencyMs = latency === '' || latency === undefined ? null : Number(latency)
  return {
    at: timestamp,
    ok: ok === '1',
    latencyMs: latencyMs !== null && Number.isFinite(latencyMs) ? latencyMs : null,
  }
}
