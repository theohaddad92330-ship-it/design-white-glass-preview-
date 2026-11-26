import type { ChatArtifactVersionView, ReplyBlock } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * #2429.9 (épopée #2852, lot P07 30/09) — modifier un artefact de chat CRÉE une
 * version (`POST /ia/chat/artifacts/versions`) ; le texte du message n'est
 * jamais réécrit. Le premier appelant est `ArtifactVersionBar`.
 */
export const chatArtifactApi = {
  edit: (artifactId: string, block: ReplyBlock): Promise<ChatArtifactVersionView> =>
    apiFetch<ChatArtifactVersionView, { artifactId: string; block: ReplyBlock }>({
      path: '/ia/chat/artifacts/versions',
      method: 'POST',
      body: { artifactId, block },
    }),
}
