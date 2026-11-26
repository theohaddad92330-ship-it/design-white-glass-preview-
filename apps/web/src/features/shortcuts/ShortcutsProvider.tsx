import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { GlobalSearchDialog } from '@/features/global-search/GlobalSearchDialog'
import { useGlobalSearchStore } from '@/features/global-search/globalSearchStore'
import {
  SEQUENCE_LEAD,
  SEQUENCE_TIMEOUT_MS,
  gotoTarget,
  isPlainSequenceKey,
  isTypingTarget,
  matchesChord,
  sequencesAllowedOn,
  shortcutById,
  shortcutTarget,
} from './shortcuts'

/**
 * Le clavier, monté une fois au root (tome 7 §30).
 *
 * Des gardes, chacune contre une frappe volée :
 * - **on ne détourne jamais une touche pendant qu'on écrit** — sans quoi taper
 *   « Groupe TF1 » dans une recherche partirait sur une autre page ;
 * - **aucun modificateur** sur la séquence : `⌘G` est « chercher le suivant »
 *   dans le navigateur, et le voler casserait une habitude plus ancienne que
 *   le produit ;
 * - **la séquence expire** au bout d'une seconde et demie, sinon un `G` oublié
 *   détournerait la prochaine lettre tapée, une minute plus tard.
 *
 * ⚠️ Aucune touche n'est écrite ici. Elles vivent toutes dans `shortcuts.ts`,
 * et ce fichier les DEMANDE par identifiant — sans quoi changer une touche
 * demanderait de la changer à deux endroits, et l'un des deux serait oublié.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI `⌘K` FAIT EXCEPTION À LA PREMIÈRE GARDE
 * ─────────────────────────────────────────────────────────────────────────
 * Il fonctionne PENDANT qu'on écrit — c'est le seul, et le registre le DIT
 * (`firesWhileTyping`). La raison : `⌘K` est le geste que tout le monde tente
 * en premier dans un outil, et une porte qui ne répond pas depuis le champ où
 * l'on vient de taper n'est pas une porte.
 *
 * L'argument qui fonde la règle générale — « ne pas voler une habitude plus
 * ancienne que le produit » — ne s'applique justement pas ici : `⌘G` est
 * « chercher le suivant » et sert vraiment dans une page, alors que `⌘K` du
 * navigateur double `⌘L`, que personne n'a désappris.
 *
 * ⚠️ `⌘/` reste sous la garde « pas pendant qu'on écrit ». C'est délibéré : une
 * liste d'aide qui s'ouvre au milieu d'une phrase interrompt pour rien, là où
 * le lanceur EST ce qu'on cherchait.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #2207.67 — LA RECHERCHE GLOBALE (`⌘⇧K`) N'EST PAS UNE NAVIGATION
 * ─────────────────────────────────────────────────────────────────────────
 * Elle OUVRE une modale au lieu de mener à une route (`GlobalSearchDialog`,
 * `@/features/global-search`) — c'est pourquoi son entrée du registre ne porte
 * pas de `to`. Le composant est donc rendu ICI, et pas ailleurs : ce fichier
 * est monté une seule fois à la racine (voir plus bas), exactement la garantie
 * qu'une modale globale demande — deux montages ouvriraient deux fenêtres sur
 * la même frappe.
 */
export function ShortcutsProvider() {
  const navigate = useNavigate()
  const pending = useRef<number | null>(null)
  const openGlobalSearch = useGlobalSearchStore(state => state.open)
  // L'écran courant, lu par le gestionnaire sans le recréer à chaque navigation.
  const pathname = useRouterState({ select: state => state.location.pathname })
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname

  useEffect(() => {
    const laura = shortcutById('laura')
    const help = shortcutById('help')
    const globalSearch = shortcutById('global-search')

    // #3648 — « sur /chat » se lit aussi dans l'URL du navigateur : pendant le
    // montage ou une redirection, le routeur annonce encore l'écran d'avant.
    const onChat = () => !sequencesAllowedOn(pathnameRef.current) || !sequencesAllowedOn(window.location.pathname)

    const onKeyDown = (event: KeyboardEvent) => {
      // Laura AVANT la garde de frappe : voir le préambule. C'est le seul
      // raccourci qui répond depuis un champ de saisie, et le registre en porte
      // la raison plutôt qu'un `if` muet.
      if (laura.firesWhileTyping === true && matchesChord(laura, event)) {
        event.preventDefault()
        // L'adresse vient du REGISTRE. Elle était écrite ici en dur, ce qui la
        // mettait à deux endroits — et la page dédiée annonce désormais « où ça
        // mène » d'après le registre : deux vérités pour un seul fait.
        void navigate({ to: shortcutTarget(laura.id) })
        return
      }

      // #3648 — la cible OU l'élément actif : pendant le montage, le focus
      // peut déjà être dans le composeur alors que l'événement cible encore le body.
      if (isTypingTarget(event.target) || isTypingTarget(document.activeElement)) {
        pending.current = null
        return
      }

      if (matchesChord(globalSearch, event)) {
        event.preventDefault()
        openGlobalSearch()
        return
      }

      if (matchesChord(help, event)) {
        event.preventDefault()
        // Une NAVIGATION, plus une modale (30/08). La modale et la page
        // dédiée listaient les mêmes raccourcis sous la même forme — la loi 4
        // du tome 7 (« rien n'apparaît deux fois sous la même forme avec le
        // même contenu ») retournée contre nous, et deux listes à tenir dont
        // l'une aurait fini par dériver. La page en dit strictement plus : la
        // portée de chaque raccourci, et ce qu'il fait.
        void navigate({ to: shortcutTarget(help.id) })
        return
      }

      // #3469 — sur /chat, écrire est LE geste : un caractère imprimable (majuscule comprise,
      // sans ⌘/Ctrl/Alt) tapé alors que le focus est sur le body — avant que le composeur ait pris
      // le focus, ou après un clic dans le fil — va au composeur au lieu de se perdre. Ce bloc passe
      // AVANT la garde de séquences ci-dessous, qui sort dès qu'on est sur /chat.
      if (onChat() && event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const composer = document.querySelector<HTMLTextAreaElement>('[data-testid="chat-composer"] textarea')
        if (composer) {
          composer.focus()
          return
        }
      }

      // #3562.5 — les séquences ne partent ni sur une majuscule (de la saisie),
      // ni sur une touche répétée, ni dans la conversation. Une touche hors
      // séquence désarme aussi un `G` en attente : « g » puis une autre frappe
      // n'est pas « G » + lettre.
      if (!isPlainSequenceKey(event) || onChat()) {
        pending.current = null
        return
      }

      // Recette prod 02/10 — sur /chat, écrire est LE geste : une lettre tapée sans
      // focus va au composeur (le focus déplacé pendant le keydown reçoit le
      // caractère), elle n'arme jamais « G puis lettre » (« Générale » partait
      // vers /contacts). Le raccourci reste disponible sur toutes les autres pages.
      if (event.key.length === 1) {
        const composer = document.querySelector<HTMLTextAreaElement>('[data-testid="chat-composer"] textarea')
        if (composer) {
          composer.focus()
          return
        }
      }

      const now = Date.now()
      const armed = pending.current !== null && now - pending.current < SEQUENCE_TIMEOUT_MS

      if (armed) {
        pending.current = null
        const to = gotoTarget(event.key)
        if (to) {
          event.preventDefault()
          void navigate({ to })
        }
        return
      }

      if (event.key.toLowerCase() === SEQUENCE_LEAD.toLowerCase()) {
        pending.current = now
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate, openGlobalSearch])

  // Un seul enfant à rendre depuis #2207.67 : la modale de recherche globale,
  // qui doit exister exactement une fois — voir le préambule. Ce composant
  // reste le bon endroit pour la monter : il doit LUI-MÊME être monté une
  // fois, au root, et un hook séparé se recopierait dans deux coques (bureau
  // et mobile) — deux montages, deux modales sur la même frappe.
  return <GlobalSearchDialog />
}
