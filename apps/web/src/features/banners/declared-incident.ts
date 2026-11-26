import type { PublicBanner } from '@bellum/contracts'
import { normalizeBannerLocale } from './locale'

/**
 * #1960.13 — UN INCIDENT SE DÉCLARE, IL NE SE DEVINE PAS.
 *
 * Décision de Louis du 16/09/2026. « Incident connu » n'apparaît que si un
 * OPÉRATEUR a posé un drapeau dans le back-office : une bannière de `kind`
 * `incident` (`POST /internal/admin/banners`). Le refus le sert alors avec SON
 * message. Personne ne devine.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EXPLICITEMENT REFUSÉ : déduire l'incident d'un taux d'erreur ou d'un 5xx
 * ─────────────────────────────────────────────────────────────────────────────
 * Une panne isolée chez un client n'est pas un incident connu. Et **annoncer un
 * incident qui n'existe pas coûte plus cher qu'un refus nu** : l'utilisateur
 * cesse de signaler, croyant qu'on sait déjà — on perd le seul signal qui
 * aurait dit qu'il se passe quelque chose. C'est pour ça que cette fonction ne
 * prend AUCUN code d'erreur en entrée : elle ne peut pas déduire, par
 * construction.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ON ÉTEND LES BANNIÈRES PLUTÔT QUE D'INVENTER UN DRAPEAU
 * ─────────────────────────────────────────────────────────────────────────────
 * GA-26 — un réglage vit à un seul endroit. Les bannières sont DÉJÀ écrites par
 * l'opérateur, déjà planifiables, déjà bilingues, déjà lues en direct par l'app
 * (`useActiveBanners`). Un second mécanisme aurait donné deux endroits où
 * déclarer un incident, et le jour de l'incident on aurait cherché lequel.
 *
 * `incident` se distingue de `maintenance` par le TEMPS : `maintenance` annonce
 * une interruption PRÉVUE, `incident` dit qu'une panne est EN COURS. Un
 * utilisateur bloqué maintenant ne lit pas la même chose dans les deux cas —
 * et c'est pour ça qu'une bannière `maintenance` ne décore AUCUN refus.
 *
 * Sans drapeau posé, cette fonction rend `null` et le refus reste NU, à l'octet
 * près.
 */
export function declaredIncidentMessage(
  banners: readonly PublicBanner[] | undefined | null,
  language: string | null | undefined,
): string | null {
  if (!banners?.length) return null
  const locale = normalizeBannerLocale(language)
  // Les bannières arrivent déjà filtrées (actives, dans leur fenêtre, pour
  // cette audience) et classées par priorité : la PREMIÈRE d'un incident est
  // celle que l'opérateur a mise devant. En cumuler plusieurs empilerait deux
  // messages dans un refus, qu'on ne lit plus.
  const incident = banners.find(banner => banner.kind === 'incident')
  if (!incident) return null

  // Le corps est le message de l'opérateur ; le titre est son repli, parce que
  // `body` a un défaut vide en base alors que le titre est NOT NULL. Jamais une
  // phrase de remplissage : sans texte lisible, on rend `null` et le refus
  // reste nu — annoncer un incident SANS pouvoir dire lequel est précisément
  // ce qui fait cesser de signaler.
  const body = incident.body?.[locale]?.trim()
  if (body) return body
  const title = incident.title?.[locale]?.trim()
  return title || null
}
