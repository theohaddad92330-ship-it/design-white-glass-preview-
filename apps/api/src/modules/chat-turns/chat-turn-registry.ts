import { Injectable } from '@nestjs/common'

/** Ce que l'écran relit d'un tour encore en cours — jamais son texte. */
export interface RunningChatTurn {
  turnId: string
  conversationId: string | null
  startedAt: string
}

interface Entry {
  turnId: string
  userId: string
  workspaceId: string
  conversationId: string | null
  startedAt: Date
  abort: AbortController
}

/**
 * #4967 (lot L6) — LES RECHERCHES DE LAURA QUI TOURNENT CÔTÉ SERVEUR.
 *
 * Un tour `/ia/chat` lancé en arrière-plan ne meurt plus quand le navigateur s'en va (changement
 * d'écran, de fil, onglet fermé) : seul « Arrêter » l'abolit. Ce registre est ce qui rend ce geste
 * possible SANS la connexion d'origine — et ce qui permet à l'écran qui revient de savoir qu'un tour
 * de CE fil tourne encore.
 *
 * Mémoire du PROCESSUS, à dessein : un tour vit dans la requête HTTP qui l'a lancé ; si le processus
 * redémarre, le tour meurt avec lui et le registre le dit (plus rien « en cours »), jamais un état
 * gardé qui mentirait. Les tours sont PRIVÉS à leur auteur : aucune lecture ni aucun arrêt pour un autre.
 */
@Injectable()
export class ChatTurnRegistry {
  private readonly turns = new Map<string, Entry>()

  constructor(private readonly clock: () => Date = () => new Date()) {}

  begin(input: Omit<Entry, 'startedAt'>): void {
    this.turns.set(input.turnId, { ...input, startedAt: this.clock() })
  }

  end(turnId: string): void {
    this.turns.delete(turnId)
  }

  /** « Arrêter » — `true` seulement si CE tour de CET auteur tournait encore. */
  stop(userId: string, turnId: string): boolean {
    const entry = this.turns.get(turnId)
    if (!entry || entry.userId !== userId) return false
    entry.abort.abort()
    return true
  }

  /** Les tours en cours de l'auteur, sur un fil précis ou tous. */
  running(userId: string, conversationId?: string): RunningChatTurn[] {
    return this.own(userId)
      .filter(entry => conversationId === undefined || entry.conversationId === conversationId)
      .map(entry => ({
        turnId: entry.turnId,
        conversationId: entry.conversationId,
        startedAt: entry.startedAt.toISOString(),
      }))
  }

  /** #4611 — la mesure lue par « où en est le travail lancé » : SEUL « en cours » se compte ici. */
  measure(userId: string): { running: number; since: string | null; lastActivityAt: string | null } {
    const starts = this.own(userId)
      .map(entry => entry.startedAt.getTime())
      .sort((a, b) => a - b)
    return {
      running: starts.length,
      since: starts.length ? new Date(starts[0]!).toISOString() : null,
      lastActivityAt: starts.length ? new Date(starts[starts.length - 1]!).toISOString() : null,
    }
  }

  private own(userId: string): Entry[] {
    return [...this.turns.values()].filter(entry => entry.userId === userId)
  }
}
