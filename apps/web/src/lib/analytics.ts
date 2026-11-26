import { isAnalyticsAllowed } from '@bellum/consent'

/**
 * Mesure d'audience — Plausible.
 *
 * DEUX conditions, et il faut les DEUX : la variable `VITE_PLAUSIBLE_DOMAIN`
 * **et** le consentement du visiteur. Sans l'une ou l'autre : NO-OP STRICT —
 * aucun script injecté, aucune requête réseau, `track()` ne fait rien.
 *
 * ⚠️ L'ancienne version de ce commentaire justifiait l'absence de bandeau par
 * « aucun cookie, aucune donnée personnelle, il n'y a rien à faire accepter ».
 * C'est un raisonnement, pas une décision : la bannière existait déjà sur le
 * site et la page `/cookies` promettait, mot pour mot, que les cookies
 * analytiques sont soumis au consentement préalable. Arbitrage de Louis du
 * 28/08/2026 : le consentement commande.
 *
 * ⚠️ **Portée du retrait, mesurée et assumée.** Cette fonction est appelée UNE
 * fois, au démarrage (`main.tsx`). L'application n'a pas de bannière à elle : le
 * choix se fait sur le site, sur une AUTRE origine, donc aucun événement du
 * navigateur ne peut le signaler à cet onglet-ci. Un retrait prend effet **au
 * prochain chargement** de l'application — et un script déjà chargé ne se
 * dé-charge pas, quoi qu'on fasse. C'est une limite du navigateur, écrite ici
 * pour qu'on ne la redécouvre pas comme un bug.
 *
 * `VITE_PLAUSIBLE_SRC` permet de pointer une instance auto-hébergée (défaut :
 * le script officiel plausible.io).
 */

const DEFAULT_SRC = 'https://plausible.io/js/script.js'

/** Le domaine déclaré dans Plausible (`app.bellum-ai.com`). Vide = mesure off. */
function domain(): string {
  return (import.meta.env.VITE_PLAUSIBLE_DOMAIN ?? '').trim()
}

/**
 * Injecte le script de mesure si — et seulement si — un domaine est configuré.
 *
 * Plausible suit les changements d'URL de l'application (history API) tout seul :
 * pas de hook à brancher sur le routeur, donc pas de risque qu'une page ajoutée
 * demain sorte des statistiques par oubli.
 */
export function initAnalytics(): void {
  const site = domain()
  if (!site || typeof document === 'undefined') return
  // La porte. « Pas encore répondu » n'est pas « oui » : on ne charge rien.
  if (!isAnalyticsAllowed()) return
  // Rechargement à chaud en dev / double montage StrictMode : un seul script.
  if (document.querySelector('script[data-domain]')) return

  const script = document.createElement('script')
  script.defer = true
  script.dataset.domain = site
  script.src = import.meta.env.VITE_PLAUSIBLE_SRC ?? DEFAULT_SRC
  document.head.appendChild(script)
}

type PlausibleFn = (event: string, options?: { props?: Record<string, string | number | boolean> }) => void

/**
 * Événement produit (« le visiteur a lancé la démo », « il a débloqué un
 * besoin »). Sans mesure configurée — ou avant que le script soit chargé — c'est
 * un no-op silencieux : un événement perdu ne doit JAMAIS casser le geste métier
 * qu'il observe.
 */
export function track(event: string, props?: Record<string, string | number | boolean>): void {
  if (!domain()) return
  // Deuxième garde, volontairement redondante : un retrait pendant la session
  // ferme `track()` immédiatement, même si le script est déjà en mémoire.
  if (!isAnalyticsAllowed()) return
  const plausible = (globalThis as { plausible?: PlausibleFn }).plausible
  if (typeof plausible !== 'function') return
  try {
    plausible(event, props ? { props } : undefined)
  } catch {
    // Une mesure d'audience ne casse pas une page.
  }
}
