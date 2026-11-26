import { z } from 'zod'
import { chatArtifactId, parseChatArtifactId } from './chat-reply-envelope.js'
import { replyBlockSchema, splitReplyBlocks, type ReplyBlock } from './reply-blocks.js'

/**
 * #2429.9 (épopée #2852, lot P07 30/09) — UN ARTEFACT MODIFIÉ CRÉE UNE NOUVELLE
 * VERSION, JAMAIS UNE RÉÉCRITURE SILENCIEUSE.
 *
 * Jusqu'ici un bloc était un fragment IMMUABLE du texte du message : aucun
 * concept d'édition n'existait. Le texte reste immuable (c'est la version 1,
 * celle que Laura a écrite) ; chaque modification humaine ajoute une LIGNE à
 * `chat_artifact_versions` (version 2, 3…), et la lecture montre la plus
 * récente en disant laquelle. Rien n'est effacé : l'historique complet se lit.
 *
 * Quels artefacts sont modifiables ? Ceux dont le contenu est un PLAN que la
 * personne ajuste — pour l'instant `action_plan` (les étapes). Les blocs qui
 * rapportent une MESURE (classement, comparaison, comptage…) ne se modifient
 * pas : les éditer ferait dire à Laura un chiffre qu'elle n'a pas calculé.
 */
export const EDITABLE_ARTIFACT_TYPES = ['action_plan'] as const

export function isEditableArtifactType(type: string): boolean {
  return (EDITABLE_ARTIFACT_TYPES as readonly string[]).includes(type)
}

/** Le corps d'une modification : l'adresse de l'artefact et son NOUVEAU contenu, validé comme un bloc de Laura. */
export const chatArtifactVersionInputSchema = z.object({
  artifactId: z.string().min(3),
  block: replyBlockSchema,
})
export type ChatArtifactVersionInput = z.infer<typeof chatArtifactVersionInputSchema>

export interface ChatArtifactVersionView {
  artifactId: string
  version: number
  block: ReplyBlock
  editedBy: string
  editedAt: string
}

export type ArtifactEditRefusal = 'unknown_artifact' | 'type_changed' | 'not_editable'

/**
 * Le contrôle PUR d'une modification, partagé par l'API (qui l'applique) et
 * l'écran (qui le dit avant d'envoyer) : l'artefact existe dans le texte du
 * message, son type est modifiable, et le nouveau contenu garde le même type
 * (un plan ne devient jamais un classement).
 */
export function checkArtifactEdit(
  messageContent: string,
  artifactId: string,
  next: ReplyBlock,
): { ok: true; original: ReplyBlock } | { ok: false; reason: ArtifactEditRefusal } {
  const address = parseChatArtifactId(artifactId)
  if (!address) return { ok: false, reason: 'unknown_artifact' }
  let rank = 0
  for (const segment of splitReplyBlocks(messageContent)) {
    if (segment.kind !== 'block') continue
    if (chatArtifactId(address.messageId, rank) === artifactId) {
      if (!isEditableArtifactType(segment.block.type)) return { ok: false, reason: 'not_editable' }
      if (next.type !== segment.block.type) return { ok: false, reason: 'type_changed' }
      return { ok: true, original: segment.block }
    }
    rank += 1
  }
  return { ok: false, reason: 'unknown_artifact' }
}
