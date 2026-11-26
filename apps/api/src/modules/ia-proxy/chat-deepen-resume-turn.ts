import { Injectable } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import type { Response } from 'express'
import type { ChatMessagesService } from './chat-messages.service'
import { IaProxyController } from './ia-proxy.controller'

/** Ce que la reprise sait d'une étude interrompue — rien de plus que la ligne `chat_deepen_jobs`. */
export interface DeepenResumeTarget {
  user_id: string
  conversation_id: string
  label: string
}

/** Le message que la reprise « écrit » à la place de la personne — la même demande que le bandeau lui suggérait. */
export const DEEPEN_RESUME_MESSAGE = 'Continue l’étude interrompue.'

/**
 * #3236 (lot W2) — UN tour de reprise d'une étude Approfondie, joué hors de tout navigateur.
 *
 * Il passe par LE MÊME chemin que le tour d'une personne (`IaProxyController.chat` : plafond quotidien,
 * contexte, outils, mémoire, cartes) — aucun second chemin vers le modèle (GA-26). Seules les deux
 * moitiés que le navigateur faisait sont faites ici : écrire la demande de la personne, puis écrire la
 * réponse. Le flux SSE n'a pas de lecteur : il est recueilli en mémoire, seul le `done` final compte.
 *
 * Que l'étude aille au bout (l'IA referme la ligne : `done`) ou s'interrompe encore (l'IA la
 * re-signale : `queued`), c'est l'orchestrateur qui l'écrit, comme pour un tour tapé.
 *
 * Fonction pure sur ses dépendances (le contrôleur la compose, GA-07 : un service ne va pas chercher
 * un service d'un autre module).
 */
export async function runDeepenResumeTurn(
  job: DeepenResumeTarget,
  deps: {
    workspaceId: string
    chat: (
      user: { userId: string; email: string },
      dto: { message: string; conversationId: string; mode: 'approfondi' },
      res: Response,
    ) => Promise<void>
    messages: Pick<ChatMessagesService, 'create'>
  },
): Promise<void> {
  const thread = {
    userId: job.user_id,
    workspaceId: deps.workspaceId,
    accountId: null,
    conversationId: job.conversation_id,
  }
  await deps.messages.create({ ...thread, role: 'user', content: DEEPEN_RESUME_MESSAGE })
  const sink = collectStream()
  await deps.chat(
    { userId: job.user_id, email: '' },
    { message: DEEPEN_RESUME_MESSAGE, conversationId: job.conversation_id, mode: 'approfondi' },
    sink.response,
  )
  const done = sink.done()
  const reply = typeof done?.data?.['reply'] === 'string' ? (done.data['reply'] as string) : ''
  if (!done?.success || !reply.trim()) throw new Error('Le tour de reprise n’a rien rendu.')
  const turnId = typeof done.data['turn_id'] === 'string' ? (done.data['turn_id'] as string) : null
  await deps.messages.create({ ...thread, role: 'assistant', content: reply, turnId, context: done.data })
}

/** Le fournisseur injectable de la reprise : il délègue au contrôleur, qui possède le chemin du chat. */
@Injectable()
export class DeepenResumeTurnRunner {
  constructor(private readonly modules: ModuleRef) {}

  run(job: DeepenResumeTarget): Promise<void> {
    return this.modules.get(IaProxyController, { strict: false }).resumeDeepenTurn(job)
  }
}

type Done = { success: boolean; data: Record<string, unknown> }

/** Un `Response` qui n'écrit nulle part : il garde le dernier événement `done` du flux SSE. */
function collectStream(): { response: Response; done: () => Done | null } {
  let last: Done | null = null
  let ended = false
  const response = {
    setHeader: () => response,
    flushHeaders: () => undefined,
    on: () => response,
    get writableEnded() {
      return ended
    },
    write: (chunk: string) => {
      for (const line of String(chunk).split('\n')) {
        if (!line.startsWith('data: ')) continue
        try {
          const event = JSON.parse(line.slice(6)) as {
            type?: string
            success?: boolean
            data?: Record<string, unknown>
          }
          if (event.type === 'done' && event.data) last = { success: event.success === true, data: event.data }
        } catch {
          // une ligne illisible n'est pas un `done` : on l'ignore
        }
      }
      return true
    },
    end: () => {
      ended = true
    },
  } as unknown as Response
  return { response, done: () => last }
}
