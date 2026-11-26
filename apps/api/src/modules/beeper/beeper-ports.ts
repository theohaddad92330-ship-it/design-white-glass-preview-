/**
 * #4406 — les deux voisins dont Beeper a besoin, en PORTS (GA-07 : un service n'importe pas le
 * service d'un autre module). `beeper.module.ts` — la couche de composition — les branche sur les
 * vrais services (`useExisting`) : la porte d'écriture (`OutboundWriteService`) et le contexte
 * d'espace (`WorkspaceContextService`). Retirer Beeper ne touche ni l'un ni l'autre.
 */

export const BEEPER_SEND_GATE = Symbol('BEEPER_SEND_GATE')
export const BEEPER_WORKSPACE = Symbol('BEEPER_WORKSPACE')

/** La porte d'écriture — le sous-ensemble que l'envoi Beeper emprunte, rien de plus. */
export type BeeperSendGate = {
  request(input: {
    workspaceId: string
    userId: string
    provider: string
    kind: 'send_chat_message'
    payload: Record<string, unknown>
    origin: 'user' | 'system'
    idempotencyKey?: string | null
  }): Promise<{ decision: 'write_now' | 'pending' | 'already_done'; request: { id: string } }>
  recordOutcome(requestId: string, outcome: { ok: boolean; response?: string }): Promise<void>
  recordUnknown(requestId: string, response: string | null): Promise<void>
}

export type BeeperWorkspace = {
  isDemoWorkspace(userId: string): Promise<boolean>
  resolveActiveWorkspace(userId: string): Promise<{ workspaceId: string }>
}
