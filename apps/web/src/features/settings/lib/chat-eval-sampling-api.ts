import type { ChatEvalSamplingSetting, UpdateChatEvalSampling } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/** #2899 — l'échantillonnage opt-in des conversations pour les évals, côté client. UN seul appelant : `ChatEvalSamplingSection`. */
export const CHAT_EVAL_SAMPLING_KEY = ['settings', 'chat-eval-sampling'] as const

export const chatEvalSamplingApi = {
  get(): Promise<ChatEvalSamplingSetting> {
    return apiFetch<ChatEvalSamplingSetting>({ path: '/workspaces/chat-eval-sampling' })
  },
  update(patch: UpdateChatEvalSampling): Promise<ChatEvalSamplingSetting> {
    return apiFetch<ChatEvalSamplingSetting, UpdateChatEvalSampling>({
      path: '/workspaces/chat-eval-sampling',
      method: 'PATCH',
      body: patch,
    })
  },
}
