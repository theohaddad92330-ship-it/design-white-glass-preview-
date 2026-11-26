import { useCallback, useState } from 'react'

/**
 * La colonne des conversations est-elle dépliée ? — le réglage, à UN endroit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE PLUTÔT QU'UN `useState` DANS LE COMPOSANT
 * ─────────────────────────────────────────────────────────────────────────────
 * Un repli qu'on rouvre à chaque chargement de page n'est pas un repli, c'est
 * une animation. La préférence est donc PERSISTÉE — et « un réglage vit à un
 * seul endroit » (GA-26) : la clé, le défaut, la lecture et l'écriture sont
 * ici, et nulle part ailleurs. La garde GA-111 le vérifie en comptant les
 * fichiers qui nomment la clé.
 *
 * La clé est EXPORTÉE parce que le test la lit. La recopier à la main dans une
 * garde donne un test qui reste vert le jour où la clé change — c'est le défaut
 * « clé de cache recopiée à la main », déjà vécu dans ce dépôt.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LE DÉFAUT EST « OUVERT »
 * ─────────────────────────────────────────────────────────────────────────────
 * Jusqu'au 30/08/2026, la liste des conversations vivait dans la barre latérale
 * du produit, TOUJOURS dépliée. La déplacer dans le chat est un déplacement ;
 * la refermer par défaut serait un RETRAIT — sur un poste neuf, un utilisateur
 * qui n'a jamais vu la colonne ne saurait pas qu'il a un historique, et
 * `/actions/sequences` est resté orphelin des mois exactement pour cette
 * raison.
 *
 * Le repli sert donc à gagner la largeur quand on la veut, pas à cacher la
 * fonctionnalité en attendant qu'on la trouve. Et même replié, le rail garde
 * son bouton visible : la colonne ne disparaît jamais complètement.
 *
 * ⚠️ `localStorage` n'est pas une variable, c'est un appel qui peut ÉCHOUER —
 * Safari en navigation privée, un navigateur réglé pour bloquer le stockage, un
 * quota plein : l'ACCÈS lui-même lève. Une préférence d'interface ne justifie
 * jamais un écran blanc : sans stockage, on rend le défaut et on continue.
 */
export const CONVERSATIONS_PANEL_STORAGE_KEY = 'bellum-chat-conversations-open'

/** Le défaut, nommé une fois — voir le docblock pour la raison. */
const OPEN_BY_DEFAULT = true

/**
 * L'état stocké, ou le défaut. Exportée pour que la garde l'EXÉCUTE plutôt que
 * de relire une constante : ce qui compte est ce que l'écran obtient.
 */
export function readConversationsPanelOpen(): boolean {
  try {
    const stored = localStorage.getItem(CONVERSATIONS_PANEL_STORAGE_KEY)
    if (stored === 'true') return true
    if (stored === 'false') return false
    return OPEN_BY_DEFAULT
  } catch {
    return OPEN_BY_DEFAULT
  }
}

function writeConversationsPanelOpen(open: boolean): void {
  try {
    localStorage.setItem(CONVERSATIONS_PANEL_STORAGE_KEY, open ? 'true' : 'false')
  } catch {
    /* pas de stockage : le repli ne vit alors que le temps de l'onglet */
  }
}

/** L'état et sa bascule. Le seul consommateur est `ConversationsPanel`. */
export function useConversationsPanelOpen(): readonly [boolean, () => void] {
  const [open, setOpen] = useState<boolean>(readConversationsPanelOpen)
  const toggle = useCallback(() => {
    setOpen(current => {
      const next = !current
      writeConversationsPanelOpen(next)
      return next
    })
  }, [])
  return [open, toggle] as const
}
