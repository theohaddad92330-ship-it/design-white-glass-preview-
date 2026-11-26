import type { ChatAnalyticsEvent } from './contract'

/**
 * La mesure du §9 — côté navigateur, parce que c'est là que Plausible vit.
 *
 * Le serveur DÉCIDE quels événements sont vrais (intention détectée, lead créé,
 * qualification terminée) et le navigateur les DÉCLENCHE : faire décider le
 * navigateur donnerait des chiffres qu'un client modifié peut écrire, faire
 * déclencher le serveur exigerait un second chemin de mesure à maintenir.
 *
 * Sans Plausible configuré : no-op strict, comme le script lui-même.
 */

type PlausibleFn = (event: string, options?: { props?: Record<string, string | number | boolean> }) => void

export function trackChat(event: ChatAnalyticsEvent, props?: Record<string, string>): void {
  if (typeof window === 'undefined') return
  const plausible = (window as unknown as { plausible?: PlausibleFn }).plausible
  if (typeof plausible !== 'function') return
  try {
    plausible(event, props ? { props } : undefined)
  } catch {
    // Une mesure ne casse jamais ce qu'elle observe.
  }
}
