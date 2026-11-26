import { z } from 'zod'
import { memoryItemKindSchema, memoryItemOriginSchema, memoryItemScopeSchema } from './memory-item.js'

/**
 * #1916.18 / #1916.24 — LA TRACE, RÉPONSE PAR RÉPONSE, DES ÉLÉMENTS DE MÉMOIRE
 * ENVOYÉS À LAURA.
 *
 * Décision de Louis du 13/09/2026 : tracer maintenant (contre la recommandation
 * « plus tard »), et l'afficher sous la réponse et dans Réglages › Mémoire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ON SAIT PROUVER, ET CE QU'ON NE DIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * On prouve qu'un élément était DANS LE CONTEXTE envoyé au modèle pour une
 * réponse. On ne prouve PAS qu'elle s'en est « servie » : aucun mécanisme
 * structuré ne fait citer un élément de mémoire par le modèle (les citations
 * structurées portent sur les documents et le CRM, `context_transparency.py`).
 * Les écrans disent donc « consulté pour cette réponse » / « Laura avait ces
 * éléments en tête », jamais « utilisé » ni « a compté ».
 *
 * Aucun CONTENU n'est recopié : la trace ne porte que des identifiants. Le texte
 * affiché est relu sur l'élément vivant ; un élément supprimé depuis ne se
 * retrouve plus, et se dit « retiré depuis ».
 */

/**
 * La borne du prompt : `_MEMORY_ITEMS_MAX` de `apps/ia/app/prompts/
 * bellum_advisor.py`. Au-delà, un élément n'entre pas dans le prompt — le
 * tracer mentirait. L'API applique la borne AVANT d'envoyer, pour que ce qui
 * part et ce qui est tracé soient la MÊME liste ; une garde relit la valeur
 * Python (`chat-context-memory-sent.spec.ts`).
 */
export const MEMORY_ITEMS_SENT_MAX = 20

/**
 * CE QUI PART AU MODÈLE — la dérivation, écrite une fois (GA-26).
 *
 * La lecture de la mémoire (`MemoryService.listFacts`) a déjà appliqué la portée
 * (« Toi uniquement » d'un collègue écarté), l'échéance et le compte. Il reste ce
 * que le prompt fait lui-même : un texte vide n'est pas lu
 * (`_pinned_memory_fields` rend `None`), et seuls les
 * {@link MEMORY_ITEMS_SENT_MAX} premiers entrent.
 */
export function memoryItemsSentToModel<T extends { fact: string }>(items: readonly T[]): T[] {
  return items.filter(item => item.fact.trim().length > 0).slice(0, MEMORY_ITEMS_SENT_MAX)
}

/** Un élément consulté, tel que le LECTEUR a le droit de le voir. */
export const replyMemoryUseItemSchema = z
  .object({
    id: z.string().min(1),
    /** Relu sur l'élément vivant — jamais une copie prise au moment du tour. */
    text: z.string().min(1),
    scope: memoryItemScopeSchema,
    kind: memoryItemKindSchema,
    origin: memoryItemOriginSchema,
    accountId: z.string().nullable(),
    expiresAt: z.string().nullable(),
  })
  .strict()

/**
 * Sous une réponse : `GET /memory/reply-uses/:messageId`.
 *
 * ⚠️ `.strict()` n'est pas décoratif. Un élément « Toi uniquement » d'un
 * collègue n'est qu'un COMPTE (`privateCount`) : le contrat n'a aucun champ où
 * son texte, son identifiant ou son auteur pourraient voyager, et en refuse un
 * ajouté par erreur.
 */
export const replyMemoryUsesSchema = z
  .object({
    consulted: z.array(replyMemoryUseItemSchema),
    /** Éléments « Toi uniquement » d'un autre membre : comptés, jamais montrés. */
    privateCount: z.number().int().min(0),
    /** Éléments supprimés depuis la réponse : la trace a perdu son lien. */
    removedCount: z.number().int().min(0),
  })
  .strict()
export type ReplyMemoryUses = z.infer<typeof replyMemoryUsesSchema>

/**
 * Dans Réglages › Mémoire de Laura, pour un élément : « consulté dans N
 * réponses, la dernière le … » et la conversation la plus récente que le
 * LECTEUR peut ouvrir (`null` quand il n'y en a pas : réponse d'un assistant
 * externe, qui n'est pas un fil).
 *
 * `replies: 0` = mesuré, jamais consulté : ni date, ni conversation. ABSENT sur
 * la ligne = non mesuré (API plus ancienne, lecture en échec) — l'écran ne dit
 * alors ni « consulté » ni « pas encore ».
 */
export const memoryConsultationsSchema = z
  .object({
    replies: z.number().int().min(0),
    lastAt: z.string().nullable(),
    lastConversation: z
      .object({
        accountId: z.string().nullable(),
        conversationId: z.string().nullable(),
      })
      .nullable(),
  })
  .refine(value => value.replies > 0 || (value.lastAt === null && value.lastConversation === null), {
    message: 'Un élément jamais consulté ne porte ni date ni conversation.',
  })
export type MemoryConsultations = z.infer<typeof memoryConsultationsSchema>
