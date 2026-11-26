import { useEffect, useRef } from 'react'

/**
 * Un run armé ne suit pas le fil.
 *
 * Recette Z3 04/10, vu en passant : dans /chat, un Entrée après une réponse a navigué
 * vers `/projects/needs?q=…`. Cause : le lanceur est un état du fournisseur, plus haut que
 * le fil ; un exemple armé (« Besoin ») survivait au changement de conversation — dont le
 * passage au fil nouvellement créé, juste après la première réponse — et Entrée, qui OUVRE
 * quand un run est armé, partait chez l'écran du run au lieu d'envoyer à Laura.
 * Le changement de fil désarme : Entrée dans le compositeur envoie, sauf run armé DANS ce fil.
 */
export function useDisarmOnThreadChange(launcher: { disarm: () => void } | null, conversationId: unknown): void {
  const disarmRef = useRef(launcher?.disarm)
  disarmRef.current = launcher?.disarm
  const previous = useRef(conversationId)
  useEffect(() => {
    if (previous.current === conversationId) return
    previous.current = conversationId
    disarmRef.current?.()
  }, [conversationId])
}
