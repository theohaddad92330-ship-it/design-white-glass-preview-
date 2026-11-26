import { useCallback, useState } from 'react'

/**
 * Comment la liste des conversations se RANGE — par date ou par compte.
 * Le réglage, à UN endroit (GA-26), sur le patron de `conversations-panel-open.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1911.7 à #1911.10 — décision de Louis du 13/09/2026 (batch 11)
 * ─────────────────────────────────────────────────────────────────────────────
 * « Date + par compte », contre la recommandation « date seule ». Les deux
 * rangements existent donc, et on passe de l'un à l'autre par une bascule en
 * tête de liste. Jamais les deux imbriqués : 240 px n'ont pas la largeur d'une
 * arborescence à deux niveaux (la raison de la liste plate d'avant tient
 * toujours pour CETTE partie-là).
 *
 * POURQUOI LE DÉFAUT EST « PAR DATE ». La liste plate d'avant était déjà
 * classée par dernière activité : les intercalaires de date s'y posent sans
 * déplacer un seul fil. Ouvrir « par compte » par défaut réordonnerait la liste
 * de tout le monde au déploiement — et le fil qu'on vient de quitter, qui était
 * en tête, pourrait se retrouver sous un autre compte.
 *
 * Retenu PAR PERSONNE SUR CE NAVIGATEUR (`localStorage`), pas en base : c'est une
 * préférence de lecture, pas une donnée de l'espace. La colonne (ordinateur) et
 * le tiroir (téléphone) lisent la même clé — ils ne coexistent jamais à l'écran.
 *
 * ⚠️ `localStorage` peut LEVER (navigation privée, stockage bloqué, quota) :
 * sans stockage, on rend le défaut et le choix vit le temps de l'onglet.
 */
export const CONVERSATIONS_GROUPING_STORAGE_KEY = 'bellum-chat-conversations-grouping'

type ConversationsGrouping = 'date' | 'account'

/** Le défaut, nommé une fois — voir le docblock pour la raison. */
const DEFAULT_GROUPING: ConversationsGrouping = 'date'

/** L'état stocké, ou le défaut. Une valeur inconnue (ancienne version, saisie à la main) rend le défaut. */
export function readConversationsGrouping(): ConversationsGrouping {
  try {
    const stored = localStorage.getItem(CONVERSATIONS_GROUPING_STORAGE_KEY)
    return stored === 'account' || stored === 'date' ? stored : DEFAULT_GROUPING
  } catch {
    return DEFAULT_GROUPING
  }
}

function writeConversationsGrouping(grouping: ConversationsGrouping): void {
  try {
    localStorage.setItem(CONVERSATIONS_GROUPING_STORAGE_KEY, grouping)
  } catch {
    /* pas de stockage : le choix ne vit que le temps de l'onglet */
  }
}

/** L'état et son écriture. Le seul consommateur est `ConversationList`. */
export function useConversationsGrouping(): readonly [ConversationsGrouping, (next: ConversationsGrouping) => void] {
  const [grouping, setGrouping] = useState<ConversationsGrouping>(readConversationsGrouping)
  const choose = useCallback((next: ConversationsGrouping) => {
    writeConversationsGrouping(next)
    setGrouping(next)
  }, [])
  return [grouping, choose] as const
}
