import { describe, expect, it } from 'vitest'
import { memoryLedgerEntrySchema } from './memory-ledger.js'
import {
  MEMORY_ITEMS_SENT_MAX,
  memoryConsultationsSchema,
  memoryItemsSentToModel,
  replyMemoryUsesSchema,
} from './memory-reply-uses.js'

/**
 * #1916.18 / #1916.24 — « cet élément de mémoire était dans le contexte de
 * telle réponse ».
 *
 * Ce que le contrat doit tenir :
 *  · ce qui part au modèle se dérive à UN endroit (textes vides écartés, puis
 *    la borne du prompt) — c'est cette liste, et elle seule, qui est tracée ;
 *  · la lecture sous une réponse ne peut PAS porter le texte d'un élément privé
 *    d'un collègue : il n'existe qu'un compte, aucun champ où glisser un texte ;
 *  · « jamais consulté » n'a ni date ni conversation.
 */
describe('memoryItemsSentToModel — la liste exacte qui part dans le prompt', () => {
  it('écarte un texte vide (le prompt ne le lit pas) et garde l’ordre', () => {
    const sent = memoryItemsSentToModel([
      { id: 'a', fact: 'Budget voté' },
      { id: 'b', fact: '   ' },
      { id: 'c', fact: 'Ne propose plus de régie' },
    ])
    expect(sent.map(item => item.id)).toEqual(['a', 'c'])
  })

  it('coupe à la borne du prompt — un élément au-delà n’a jamais été envoyé', () => {
    const items = Array.from({ length: MEMORY_ITEMS_SENT_MAX + 5 }, (_, index) => ({
      id: `f-${index}`,
      fact: `Élément ${index}`,
    }))
    const sent = memoryItemsSentToModel(items)
    expect(sent).toHaveLength(MEMORY_ITEMS_SENT_MAX)
    expect(sent.at(-1)?.id).toBe(`f-${MEMORY_ITEMS_SENT_MAX - 1}`)
  })

  it('la borne est celle du prompt de Laura (20)', () => {
    expect(MEMORY_ITEMS_SENT_MAX).toBe(20)
  })
})

describe('replyMemoryUsesSchema — ce qu’un lecteur voit sous une réponse', () => {
  const visible = {
    id: 'f-1',
    text: 'Budget IT voté en Q2',
    scope: 'workspace' as const,
    kind: 'fact' as const,
    origin: 'manual' as const,
    accountId: null,
    expiresAt: null,
  }

  it('accepte des éléments visibles, un compte d’éléments privés et un compte d’éléments retirés', () => {
    expect(replyMemoryUsesSchema.parse({ consulted: [visible], privateCount: 1, removedCount: 2 })).toEqual({
      consulted: [visible],
      privateCount: 1,
      removedCount: 2,
    })
  })

  it('NON — refuse tout champ en plus : le texte d’un élément privé n’a aucun endroit où voyager', () => {
    expect(() =>
      replyMemoryUsesSchema.parse({
        consulted: [],
        privateCount: 1,
        removedCount: 0,
        privateItems: [{ text: 'Mon objectif perso' }],
      }),
    ).toThrow()
  })

  it('NON — un compte négatif n’est pas un compte', () => {
    expect(() => replyMemoryUsesSchema.parse({ consulted: [], privateCount: -1, removedCount: 0 })).toThrow()
  })
})

describe('memoryConsultationsSchema — « consulté dans N réponses, la dernière le … »', () => {
  it('accepte un élément consulté, avec sa date et la conversation la plus récente', () => {
    const value = {
      replies: 3,
      lastAt: '2026-09-12T10:00:00.000Z',
      lastConversation: { accountId: null, conversationId: 'general' },
    }
    expect(memoryConsultationsSchema.parse(value)).toEqual(value)
  })

  it('accepte un élément consulté dont aucune conversation n’est ouvrable (assistant externe)', () => {
    expect(
      memoryConsultationsSchema.parse({ replies: 1, lastAt: '2026-09-12T10:00:00.000Z', lastConversation: null }),
    ).toMatchObject({ replies: 1, lastConversation: null })
  })

  it('NON — « jamais consulté » ne porte ni date ni conversation', () => {
    expect(() =>
      memoryConsultationsSchema.parse({ replies: 0, lastAt: '2026-09-12T10:00:00.000Z', lastConversation: null }),
    ).toThrow()
    expect(() =>
      memoryConsultationsSchema.parse({
        replies: 0,
        lastAt: null,
        lastConversation: { accountId: null, conversationId: 'general' },
      }),
    ).toThrow()
  })

  it('une ligne du registre porte les consultations en option — absentes = non mesurées', () => {
    const base = {
      id: 'f-1',
      layer: 'facts' as const,
      text: 'x',
      recordedAt: '2026-09-10T09:00:00.000Z',
      accountId: null,
      detail: null,
      expiresAt: null,
    }
    expect(memoryLedgerEntrySchema.parse(base)).not.toHaveProperty('consultations')
    expect(
      memoryLedgerEntrySchema.parse({ ...base, consultations: { replies: 0, lastAt: null, lastConversation: null } })
        .consultations,
    ).toEqual({ replies: 0, lastAt: null, lastConversation: null })
  })
})
