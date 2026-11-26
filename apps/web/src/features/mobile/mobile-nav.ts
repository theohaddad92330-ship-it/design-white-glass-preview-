/**
 * Les onglets de la coque mobile — quatre, et l'ordre compte.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI LAURA EN PREMIER
 * ─────────────────────────────────────────────────────────────────────────
 * Décision de Louis du 23/08/2026 : l'appli mobile s'organise autour de Laura
 * et de la journée. En mobilité, on n'explore pas un portefeuille de comptes —
 * on demande quelque chose et on veut une réponse. Le premier onglet est donc
 * celui où l'on PARLE, et c'est aussi l'écran d'arrivée.
 *
 * Quatre et pas six : au-delà, les cibles tactiles passent sous les 44 px
 * recommandés sur un téléphone étroit, et un onglet qu'on rate est un onglet
 * qui n'existe pas.
 *
 * Ce que ces quatre onglets NE sont pas : un sous-ensemble du produit. Toutes
 * les routes restent atteignables — depuis Laura, depuis une notification,
 * depuis un lien. Ils sont les quatre portes d'entrée, pas les quatre écrans.
 */
type MobileTab = {
  to: string
  labelKey: string
  /** Les routes qui allument cet onglet, en plus de `to`. */
  owns: readonly string[]
}

export const MOBILE_TABS: readonly MobileTab[] = [
  { to: '/chat', labelKey: 'tabs.laura', owns: ['/chat'] },
  { to: '/briefing', labelKey: 'tabs.today', owns: ['/briefing', '/mailbox'] },
  // ⚠️ #1800 (09/09/2026) — `/favorites` possédait cet onglet, retiré avec la
  // notion de favori (retour Louis, « supprime la notion de favori »).
  {
    to: '/accounts',
    labelKey: 'tabs.accounts',
    // #2155.26 — Mes cibles vit sous Comptes : deux gestes, onglet puis sous-onglet.
    owns: ['/accounts', '/contacts', '/signals', '/discover'],
  },
  { to: '/actions', labelKey: 'tabs.actions', owns: ['/actions', '/projects', '/missions', '/consultants', '/team'] },
]

/** L'écran d'arrivée sur mobile — Laura, quoi qu'en dise la préférence de
 *  démarrage, qui a été choisie pour un écran de bureau. */
export const MOBILE_HOME = '/chat'

/** Quel onglet est actif pour ce chemin ? `null` = aucun (écran hors coque). */
export function activeMobileTab(pathname: string): string | null {
  let best: { to: string; length: number } | null = null
  for (const tab of MOBILE_TABS) {
    for (const owned of tab.owns) {
      if (pathname !== owned && !pathname.startsWith(`${owned}/`)) continue
      // Le préfixe le plus LONG gagne : `/accounts/partners` appartient à
      // Comptes, pas au premier onglet dont un préfixe correspond.
      if (!best || owned.length > best.length) best = { to: tab.to, length: owned.length }
    }
  }
  return best?.to ?? null
}
