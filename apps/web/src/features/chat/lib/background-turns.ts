import { create } from 'zustand'
import { chatTurnsApi } from '@/features/chat/api/chatTurnsApi'

/**
 * #4967 — UNE RECHERCHE DE LAURA QUI CONTINUE QUAND ON CHANGE D'ÉCRAN.
 *
 * Le flux n'est pas coupé au démontage de l'écran (seul « Arrêter » ou un
 * changement de fil l'abolit) ; la réponse finie est persistée dans le fil
 * (`persistTurn`) : le FIL PERSISTÉ reste l'unique source de vérité du contenu.
 * Ce magasin ne garde donc AUCUN texte : seulement l'état par fil, pour que
 *  · l'écran qui revient sache qu'un tour tourne encore (« Laura cherche… ») ;
 *  · la navigation sache qu'une réponse attend (pastille).
 * Mémoire de SESSION, jamais persistée : un rechargement relit le fil.
 */
type TurnState = 'running' | 'ready'

type BackgroundTurnsStore = {
  turns: Readonly<Record<string, TurnState>>
  begin: (conversationId: string) => void
  /** `visible` : la personne regarde ce fil à l'instant — rien à signaler. */
  finish: (conversationId: string, options: { visible: boolean }) => void
  /** Arrêt ou échec : le tour disparaît, sans jamais se dire « prêt ». */
  discard: (conversationId: string) => void
  /** La réponse prête a été vue. Ne touche jamais un tour encore en cours. */
  acknowledge: (conversationId: string) => void
  readyIds: () => string[]
  reset: () => void
}

function without(turns: Readonly<Record<string, TurnState>>, id: string): Record<string, TurnState> {
  const { [id]: _removed, ...rest } = turns
  return rest
}

export const useBackgroundTurnsStore = create<BackgroundTurnsStore>((set, get) => ({
  turns: {},
  begin: id => set(state => ({ turns: { ...state.turns, [id]: 'running' } })),
  finish: (id, { visible }) =>
    set(state => ({ turns: visible ? without(state.turns, id) : { ...state.turns, [id]: 'ready' } })),
  discard: id => set(state => ({ turns: without(state.turns, id) })),
  acknowledge: id => set(state => (state.turns[id] === 'ready' ? { turns: without(state.turns, id) } : state)),
  readyIds: () =>
    Object.entries(get().turns)
      .filter(([, value]) => value === 'ready')
      .map(([id]) => id),
  reset: () => set({ turns: {} }),
}))

/**
 * Les contrôleurs des tours en vol, PAR FIL, hors du composant : l'écran qui
 * revient peut ainsi « Arrêter » un tour lancé par son prédécesseur. Seul ce
 * geste (ou un changement de fil) abolit un tour — jamais le démontage.
 *
 * #4967 (lot L6) — avec l'identifiant du tour : depuis que la recherche vit côté
 * serveur, abolir la connexion ne l'arrête plus (le serveur la DÉTACHE et finit
 * seul) ; « Arrêter » la désigne donc AUSSI au serveur.
 */
const controllers = new Map<string, { controller: AbortController; turnId: string | null }>()

export function registerTurnController(
  conversationId: string,
  controller: AbortController,
  turnId: string | null = null,
): void {
  controllers.set(conversationId, { controller, turnId })
}

export function releaseTurnController(conversationId: string, controller: AbortController): void {
  if (controllers.get(conversationId)?.controller === controller) controllers.delete(conversationId)
}

/**
 * « Arrêter » : abolit le tour en vol de ce fil, s'il y en a un, et l'arrête côté
 * serveur — le tour de cet écran, ou `serverTurnId` (un tour que le serveur dit
 * encore en cours sur ce fil : rechargement, retour après un changement de fil).
 */
export function stopTurn(conversationId: string | null, serverTurnId: string | null = null): void {
  const local = conversationId ? controllers.get(conversationId) : undefined
  local?.controller.abort()
  const turnId = local?.turnId ?? serverTurnId
  // Un arrêt qui échoue côté serveur ne se rattrape pas en silence : le tour finira, son écriture le dira.
  if (turnId)
    void Promise.resolve()
      .then(() => chatTurnsApi.stop(turnId))
      .catch(() => undefined)
}
