import { create } from 'zustand'
import { DEFAULT_LAURA_CONTEXT_MODE, type LauraContextMode } from '@bellum/contracts'

/**
 * #2451.6 / #2453 — LE MODE DE CONTEXTE, PAR CONVERSATION.
 *
 * « Le mode peut rester dans la conversation ; une nouvelle conversation revient
 * au défaut ; un mode ponctuel ne modifie pas le défaut global. » D'où une clé
 * par fil, et rien d'autre : une conversation neuve a un identifiant neuf, donc
 * repart sur « Mon activité » sans qu'aucune ligne n'ait à la remettre à zéro.
 *
 * En mémoire seulement (pas de `persist`), comme le contexte de travail actif
 * (`activeWorkContextStore`) : un mode « Neutre » oublié qui survivrait à un
 * rechargement ferait répondre Laura sans le profil sans que personne ne se
 * souvienne de l'avoir demandé. Rien n'est écrit côté serveur (#2453.1) : le
 * mode voyage avec CHAQUE tour (`laura-turn.ts`), le profil ne bouge pas.
 *
 * #2451.9 — `workspaceDefaultMode` : le mode réglé par l'espace
 * (`GET /workspaces/laura-mode`, lu par `ContextModeSelector`), qui remplace
 * la constante figée `DEFAULT_LAURA_CONTEXT_MODE` pour un fil SANS choix
 * explicite. Un mode déjà choisi pour un fil garde toujours la priorité — ce
 * champ ne rouvre jamais un choix déjà fait, il ne change que le repli.
 */
type ContextModeStore = {
  modes: Record<string, LauraContextMode>
  workspaceDefaultMode: LauraContextMode
  setMode: (conversationId: string, mode: LauraContextMode) => void
  setWorkspaceDefaultMode: (mode: LauraContextMode) => void
}

export const useContextModeStore = create<ContextModeStore>(set => ({
  modes: {},
  workspaceDefaultMode: DEFAULT_LAURA_CONTEXT_MODE,
  setMode: (conversationId, mode) => set(state => ({ modes: { ...state.modes, [conversationId]: mode } })),
  setWorkspaceDefaultMode: mode => set({ workspaceDefaultMode: mode }),
}))

/**
 * Le mode d'un fil — le repli pour un fil sans choix ou sans identifiant.
 * `workspaceDefaultMode` omis = `DEFAULT_LAURA_CONTEXT_MODE`, le comportement
 * d'avant #2451.9.
 */
export function contextModeFor(
  modes: Record<string, LauraContextMode>,
  conversationId: string | null | undefined,
  workspaceDefaultMode: LauraContextMode = DEFAULT_LAURA_CONTEXT_MODE,
): LauraContextMode {
  return (conversationId && modes[conversationId]) || workspaceDefaultMode
}
