import { Injectable, Logger } from '@nestjs/common'

/** Un point géocodé, en degrés décimaux. Non exporté : consommé uniquement
 *  ici (`pnpm lint:exports:types`) — les appelants (`ConsultantsService`,
 *  `TalentService`) lisent `{ latitude, longitude } | null` par inférence. */
type GeocodedPoint = { latitude: number; longitude: number }

const TIMEOUT_MS = 5000
const BAN_URL = 'https://api-adresse.data.gouv.fr/search/'

/**
 * LE GÉOCODAGE — Base Adresse Nationale (écran Vivier, PDF-22 §01).
 *
 * Décision de Louis du 31/08/2026 : géocoder via `api-adresse.data.gouv.fr` —
 * un registre PUBLIC français, gratuit, et surtout SANS CLÉ. C'est ce qui
 * permet de tenir « aucune clé d'API côté client » sans même avoir besoin d'un
 * relais serveur pour cacher un secret : il n'y a pas de secret à cacher. Le
 * relais côté API existe quand même, pour DEUX raisons :
 *
 *  1. un consultant se géocode à l'ÉCRITURE (`ConsultantsService`), qui vit
 *     déjà côté serveur ;
 *  2. la recherche géocode la VILLE tapée dans le filtre — la laisser partir
 *     du navigateur aurait exposé un appel réseau tiers à chaque frappe, sans
 *     rien gagner puisqu'aucune clé n'était de toute façon à protéger.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'ÉCHEC EST TOUJOURS PROPRE, JAMAIS UNE INVENTION
 * ─────────────────────────────────────────────────────────────────────────
 * Réseau indisponible, ville inconnue de la BAN, réponse malformée : dans les
 * trois cas, `geocode()` rend `null`. La ville SAISIE reste ce qu'elle est
 * (un texte libre), et les coordonnées restent `null` — jamais une valeur
 * approchée, jamais « le centre de la France » par défaut. C'est l'appelant
 * (`ConsultantsService` à l'écriture, `TalentService` à la recherche) qui
 * décide ce que « pas de coordonnées » veut dire pour lui : une fiche non
 * localisée, ou un rayon silencieusement ignoré.
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name)

  /**
   * Géocode un texte libre (« Paris », « Lyon 69003 »…) — le PREMIER résultat
   * de la BAN, ou `null`.
   *
   * `limit=1` : on ne demande qu'une réponse, la plus pertinente au sens du
   * moteur de la BAN — un vivier n'a pas besoin de désambiguïser entre deux
   * communes homonymes, un rayon de quelques dizaines de km absorbe l'écart.
   */
  async geocode(query: string): Promise<GeocodedPoint | null> {
    const trimmed = query.trim()
    if (!trimmed) return null

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const url = `${BAN_URL}?q=${encodeURIComponent(trimmed)}&limit=1`
      const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
      if (!res.ok) {
        this.logger.warn(`Géocodage BAN en échec (${res.status}) pour « ${trimmed} »`)
        return null
      }
      const body = (await res.json()) as {
        features?: Array<{ geometry?: { coordinates?: unknown } }>
      }
      const coordinates = body.features?.[0]?.geometry?.coordinates
      if (!Array.isArray(coordinates) || coordinates.length !== 2) return null
      const [longitude, latitude] = coordinates
      if (typeof latitude !== 'number' || typeof longitude !== 'number') return null
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
      return { latitude, longitude }
    } catch (error) {
      // Un timeout, une panne réseau, un JSON malformé : aucun ne doit faire
      // tomber l'écriture d'une fiche ni la recherche du vivier — la ville
      // reste, les coordonnées restent nulles, rien n'est inventé.
      this.logger.warn(`Géocodage BAN indisponible pour « ${trimmed} »`, {
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    } finally {
      clearTimeout(timer)
    }
  }
}
