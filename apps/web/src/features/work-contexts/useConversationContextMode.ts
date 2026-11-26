import { useEffect } from 'react'
import type { LauraContextMode } from '@bellum/contracts'
import { contextModeFor, useContextModeStore } from './contextModeStore'
import { useWorkspaceDefaultContextMode } from './useWorkspaceDefaultContextMode'

/**
 * Le mode de contexte d'UN fil : lecture + écriture dans `contextModeStore`, avec le défaut d'espace
 * (#2451.9) rafraîchi. Le seul appel que partagent le sélecteur et l'interrupteur « Mon profil »
 * (#5048) : un réglage, un endroit (GA-26).
 */
export function useConversationContextMode(conversationId: string | null) {
  const modes = useContextModeStore(s => s.modes)
  const setMode = useContextModeStore(s => s.setMode)
  const workspaceDefaultMode = useContextModeStore(s => s.workspaceDefaultMode)
  const setWorkspaceDefaultMode = useContextModeStore(s => s.setWorkspaceDefaultMode)
  const current = contextModeFor(modes, conversationId, workspaceDefaultMode)

  // #2451.9 — le mode réglé par l'espace remplace la constante figée pour un fil SANS choix explicite.
  const workspaceDefaultFromApi = useWorkspaceDefaultContextMode()
  useEffect(() => {
    if (workspaceDefaultFromApi) setWorkspaceDefaultMode(workspaceDefaultFromApi)
  }, [workspaceDefaultFromApi, setWorkspaceDefaultMode])

  function choose(mode: LauraContextMode) {
    if (conversationId) setMode(conversationId, mode)
  }

  return { current, choose }
}
