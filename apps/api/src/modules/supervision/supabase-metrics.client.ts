import { Injectable, Logger } from '@nestjs/common'
import { NOMS_AUTORISES, parserMetriquesPrometheus, type Echantillon } from './supabase-metrics.parser'

/**
 * CLIENT DES MÉTRIQUES SUPABASE — serveur seulement.
 *
 * `GET ${SUPABASE_URL}/customer/v1/privileged/metrics`, Basic
 * `service_role:${SUPABASE_SERVICE_ROLE_KEY}` (clés déjà dans la config de
 * l'API). Lecture INSTANTANÉE, aucun stockage. Mêmes règles que
 * `prometheus.client.ts`, chacune testée :
 *
 * 1. NO-OP STRICT — URL ou clé absente ⇒ `{ etat: 'non_configure' }`, zéro réseau.
 * 2. LA CLÉ NE SORT PAS — une panne rend une raison à vocabulaire FERMÉ, jamais
 *    le message d'exception (il peut porter l'URL ou l'en-tête). Idem journaux.
 * 3. LISTE BLANCHE DE NOMS — voir `NOMS_AUTORISES` : le reste est jeté.
 */

export type ResultatMetriquesSupabase =
  | { etat: 'non_configure' }
  | { etat: 'injoignable'; raison: string }
  | {
      etat: 'mesure'
      /** ms epoch de la lecture réseau (stable pendant le cache). */ lueA: number
      echantillons: Echantillon[]
    }

const DELAI_MS = 5_000
const CACHE_MS = 30_000

type Config = { url: string; autorisation: string }

function lireConfig(): Config | null {
  const url = process.env['SUPABASE_URL']?.trim()
  const cle = process.env['SUPABASE_SERVICE_ROLE_KEY']?.trim()
  if (!url || !cle) return null
  return {
    url: `${url.replace(/\/+$/, '')}/customer/v1/privileged/metrics`,
    autorisation: `Basic ${Buffer.from(`service_role:${cle}`).toString('base64')}`,
  }
}

/** Vrai si URL et clé sont posées : sert au minuteur de fond, zéro réseau. */
export const supabaseConfigure = (): boolean => lireConfig() !== null

@Injectable()
export class SupabaseMetricsClient {
  private readonly logger = new Logger(SupabaseMetricsClient.name)
  private cache: { expire: number; valeur: ResultatMetriquesSupabase } | null = null

  async lire(): Promise<ResultatMetriquesSupabase> {
    const config = lireConfig()
    if (!config) return { etat: 'non_configure' }
    if (this.cache && this.cache.expire > Date.now()) return this.cache.valeur

    const resultat = await this.appeler(config)
    // Seule une MESURE se met en cache : une panne doit pouvoir se lever au rafraîchissement suivant.
    if (resultat.etat === 'mesure') this.cache = { expire: Date.now() + CACHE_MS, valeur: resultat }
    return resultat
  }

  private async appeler(config: Config): Promise<ResultatMetriquesSupabase> {
    let res: Response
    try {
      res = await fetch(config.url, {
        headers: { Authorization: config.autorisation, Accept: 'text/plain' },
        signal: AbortSignal.timeout(DELAI_MS),
      })
    } catch (err) {
      // ⚠️ Jamais `err.message` : il peut porter l'URL ou l'en-tête d'autorisation.
      const raison =
        err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
          ? 'délai dépassé (5 s)'
          : 'erreur réseau'
      this.logger.warn(`supervision supabase : ${raison}`)
      return { etat: 'injoignable', raison }
    }

    if (!res.ok) {
      const raison = `HTTP ${res.status}`
      this.logger.warn(`supervision supabase : ${raison}`)
      return { etat: 'injoignable', raison }
    }

    let texte: string
    try {
      texte = await res.text()
    } catch {
      texte = ''
    }
    // Illisible = aucune ligne de métrique du tout (avant la liste blanche).
    const toutes = parserMetriquesPrometheus(texte)
    if (toutes.length === 0) {
      this.logger.warn('supervision supabase : réponse illisible')
      return { etat: 'injoignable', raison: 'réponse illisible' }
    }
    return { etat: 'mesure', lueA: Date.now(), echantillons: toutes.filter(e => NOMS_AUTORISES.has(e.nom)) }
  }
}
