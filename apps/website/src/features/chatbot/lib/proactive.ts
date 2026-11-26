/**
 * Le message proactif du §5 : ce que Laura propose SPONTANÉMENT, selon la page.
 *
 * Une seule phrase, une seule fois, et jamais sur les pages légales — quelqu'un
 * qui lit les CGV ou la politique de confidentialité ne veut pas qu'on lui vende
 * quoi que ce soit, et l'interrompre là est le meilleur moyen de perdre la
 * confiance qu'il était justement en train d'évaluer.
 *
 * La fonction est PURE et prend le chemin brut, préfixe de langue compris : le
 * piège est que `/en/pricing` et `/tarifs` doivent tomber sur le même message,
 * et une comparaison naïve `pathname === '/pricing'` n'en attrape aucun des deux
 * en production.
 */

import { routing } from '@/i18n/routing'

/** Les sujets d'accroche. Une clé de traduction, jamais une phrase : le message
 *  proactif est du contenu, il se traduit comme le reste du site. */
export type ProactiveTopic = 'home' | 'pricing' | 'product' | 'useCases' | 'demo' | 'beta' | 'about' | 'webinar'

/** Les pages où Laura se tait. */
const SILENT_SEGMENTS = new Set(['legal', 'privacy', 'cookies', 'cgu', 'cgv', 'dpa', 'status'])

/**
 * Le premier segment du chemin, préfixe de langue retiré.
 * Rend `''` pour la racine.
 */
export function pageSegment(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length && (routing.locales as readonly string[]).includes(segments[0]!)) segments.shift()
  return segments[0] ?? ''
}

const TOPIC_BY_SEGMENT: Record<string, ProactiveTopic> = {
  '': 'home',
  // Seuls des chemins que le site sert RÉELLEMENT. Le français est rendu à la
  // racine sans traduire les chemins : `/tarifs` est un 404, et lui répondre
  // par une accroche commerciale est le pire moment pour en placer une.
  pricing: 'pricing',
  product: 'product',
  'use-cases': 'useCases',
  demo: 'demo',
  beta: 'beta',
  about: 'about',
  webinar: 'webinar',
}

/**
 * Quel message proposer sur cette page — ou `null` pour se taire.
 *
 * Une page inconnue est SILENCIEUSE plutôt que générique : un « je peux
 * t'aider ? » sur une page qu'on n'a pas prévue ne sait rien de ce que la
 * personne lit, et se voit.
 */
export function proactiveTopicFor(pathname: string): ProactiveTopic | null {
  const segment = pageSegment(pathname)
  if (SILENT_SEGMENTS.has(segment)) return null
  return TOPIC_BY_SEGMENT[segment] ?? null
}

/** Le délai avant l'accroche. Assez long pour que la personne ait commencé à
 *  lire, assez court pour être encore sur la page. */
export const PROACTIVE_DELAY_MS = 12_000
