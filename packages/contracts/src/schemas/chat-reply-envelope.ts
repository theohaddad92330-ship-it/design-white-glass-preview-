import { z } from 'zod'
import { persistedChatContextSchema } from './chat-message-context.js'
import { replyBlockSchema, splitReplyBlocks } from './reply-blocks.js'

/**
 * #2429.2 / #2429.4 / #2429.9 — L'ENVELOPPE DE RÉPONSE, COMME UNE VUE.
 *
 * Sept vérifications indépendantes (23→27/09) ont montré la même chose : chaque
 * brique que #2429 demande existe déjà, séparément — `sources`/`reply_options`
 * (`chat-message-context.ts`), `laura_job` (#2276.62, sa propre porte), les blocs
 * `reply-blocks.ts`. Les réunir sous un second champ PERSISTÉ romprait deux
 * décisions déjà prises (un bloc voyage dans le texte pour ne jamais diverger
 * du fil relu ; `permissions` ne se fige pas). Ce fichier NOMME donc les mêmes
 * briques sous une forme unique, recalculée à la lecture — jamais une seconde
 * écriture, jamais une seconde source de vérité (GA-26).
 *
 * `artifacts` est la seule chose neuve : chaque bloc gagne une ADRESSE stable
 * (`chatArtifactId`), pas une identité — composée du message qui le porte et de
 * son rang parmi les blocs de CE message. Rien n'est inventé : un bloc que le
 * texte ne contient pas ne reçoit aucune adresse.
 */

/** `<message_id>:<rang du bloc>` — stable tant que le message et son texte le sont. */
export function chatArtifactId(messageId: string, blockIndex: number): string {
  return `${messageId}:${blockIndex}`
}

const CHAT_ARTIFACT_ID = /^(.+):(\d+)$/

/** L'inverse de {@link chatArtifactId}. `null` sur une adresse mal formée — jamais un rang deviné. */
export function parseChatArtifactId(id: string): { messageId: string; blockIndex: number } | null {
  const match = CHAT_ARTIFACT_ID.exec(id)
  if (!match) return null
  return { messageId: match[1] as string, blockIndex: Number(match[2]) }
}

/**
 * #2429.1 (StructuredReply.tsx:229) — la MÊME adresse stable, pour une section
 * Markdown reconnue (Verdict / Pourquoi / Objectif…) plutôt qu'un bloc
 * `bellum-block`. Préfixe `s` : un espace de numérotation SÉPARÉ de
 * {@link chatArtifactId}, pour qu'une carte déjà adressée ne change jamais de
 * rang le jour où une section markdown en gagne un — les deux comptent chacune
 * dans son propre ordre, jamais un rang partagé qui pourrait diverger entre le
 * texte et son rendu.
 */
export function chatStructuredSectionId(messageId: string, sectionIndex: number): string {
  return `${messageId}:s${sectionIndex}`
}

const CHAT_STRUCTURED_SECTION_ID = /^(.+):s(\d+)$/

/** L'inverse de {@link chatStructuredSectionId}. `null` sur une adresse mal formée. */
export function parseChatStructuredSectionId(id: string): { messageId: string; sectionIndex: number } | null {
  const match = CHAT_STRUCTURED_SECTION_ID.exec(id)
  if (!match) return null
  return { messageId: match[1] as string, sectionIndex: Number(match[2]) }
}

/**
 * #2429.4 (lot P07 30/09) — le contrat d'un artefact. Au-delà de l'adresse
 * (`id`) et du contenu (`block`), chaque artefact dit ce qu'il EST (`type`), à
 * quel message et quel rang il appartient, et à QUELLE VERSION il en est :
 * `version` vaut 1 tant que personne ne l'a modifié, et N quand la N-ième
 * version écrite par un humain est celle que l'écran montre (#2429.9). Tout se
 * DÉRIVE : `type` du bloc, `message_id`/`rank` de l'adresse, `version` de
 * l'historique — aucune colonne de plus sur le message.
 */
const chatReplyArtifactSchema = z.object({
  id: z.string(),
  type: z.string(),
  message_id: z.string(),
  rank: z.number().int().min(0),
  /** 1 = le bloc tel que Laura l'a écrit ; N = la N-ième version (jamais une réécriture silencieuse). */
  version: z.number().int().min(1),
  /** Quand `version > 1` : qui a écrit cette version et quand. `null` = version d'origine. */
  edited_at: z.string().nullable(),
  edited_by: z.string().nullable(),
  block: replyBlockSchema,
})
type ChatReplyArtifact = z.infer<typeof chatReplyArtifactSchema>

/**
 * #2429.9 — la version la PLUS RÉCENTE d'un artefact, telle que l'historique la
 * rend (`chat_artifact_versions`). Le texte du message, lui, n'est JAMAIS
 * réécrit : il reste la version 1.
 */
export interface ChatArtifactLatestVersion {
  version: number
  block: z.infer<typeof replyBlockSchema>
  editedAt: string
  editedBy: string
}

export const chatReplyEnvelopeSchema = z.object({
  message: z.string(),
  artifacts: z.array(chatReplyArtifactSchema),
  // #1998 — la carte GOUVERNÉE d'une action prime sur sa proposition brute,
  // exactement l'ordre déjà rendu par `ContextDisclosure.tsx` : ce champ NOMME
  // ce choix, il ne le refait pas. Chacune est déjà validée à SA porte (carte
  // gouvernée ou proposition brute) — ce n'est pas une troisième forme.
  actions: z.array(z.unknown()).optional(),
  clarification: persistedChatContextSchema.shape.reply_options,
  sources: persistedChatContextSchema.shape.sources,
  warnings: z.array(persistedChatContextSchema.shape.partial.unwrap()).optional(),
  job: z.unknown().optional(),
})
export type ChatReplyEnvelope = z.infer<typeof chatReplyEnvelopeSchema>

interface ChatReplyEnvelopeInput {
  messageId: string
  content: string
  sources?: z.infer<typeof persistedChatContextSchema.shape.sources>
  replyOptions?: z.infer<typeof persistedChatContextSchema.shape.reply_options>
  partial?: z.infer<typeof persistedChatContextSchema.shape.partial>
  actions?: ChatReplyEnvelope['actions']
  job?: unknown
  /** #2429.9 — les versions les plus récentes, par adresse d'artefact. Absent = tout est en version 1. */
  versions?: ReadonlyMap<string, ChatArtifactLatestVersion>
}

/**
 * Construit l'enveloppe à partir de ce que l'appelant a DÉJÀ — jamais une
 * seconde lecture, jamais une donnée devinée. `artifacts` traverse le texte
 * dans l'ordre avec le MÊME découpage que le rendu (`splitReplyBlocks`) : une
 * adresse copiée pointe donc exactement le bloc que l'écran a rendu.
 */
export function buildChatReplyEnvelope(input: ChatReplyEnvelopeInput): ChatReplyEnvelope {
  const artifacts: ChatReplyArtifact[] = []
  let blockIndex = 0
  for (const segment of splitReplyBlocks(input.content)) {
    if (segment.kind !== 'block') continue
    const id = chatArtifactId(input.messageId, blockIndex)
    const latest = input.versions?.get(id)
    // Une version écrite ne change JAMAIS le type : le contrôle est à l'écriture
    // (`ChatArtifactVersionsService.edit`), et le `type` affiché reste celui du
    // bloc montré.
    const block = latest?.block ?? segment.block
    artifacts.push({
      id,
      type: block.type,
      message_id: input.messageId,
      rank: blockIndex,
      version: latest?.version ?? 1,
      edited_at: latest?.editedAt ?? null,
      edited_by: latest?.editedBy ?? null,
      block,
    })
    blockIndex += 1
  }
  return {
    message: input.content,
    artifacts,
    ...(input.actions?.length ? { actions: input.actions } : {}),
    ...(input.replyOptions?.length ? { clarification: input.replyOptions } : {}),
    sources: input.sources ?? [],
    ...(input.partial ? { warnings: [input.partial] } : {}),
    ...(input.job !== undefined ? { job: input.job } : {}),
  }
}
