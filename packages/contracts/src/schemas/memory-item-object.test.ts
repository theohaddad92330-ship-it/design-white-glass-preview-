import { describe, expect, it } from 'vitest'
import {
  createMemoryItemSchema,
  memoryItemObjectRefSchema,
  memoryItemObjectTypeSchema,
  memoryItemSchema,
} from './memory-item.js'

/**
 * #2260.7 — L'OBJET VISÉ par un élément de mémoire : contact, besoin,
 * consultant ou mission, à CÔTÉ de `accountId` (le dossier auquel l'élément
 * est attaché, #1918.1). Mesure du 17/09/2026 : `memory-item.ts:183` ne
 * portait que `accountId` comme lien d'objet — aucun `contactId`, `needId`,
 * `consultantId`, `missionId`.
 *
 * Un élément vise UN SEUL objet, jamais quatre à la fois — modélisé comme une
 * union discriminée (`type` + `id`), pas quatre colonnes optionnelles qu'un
 * appelant pourrait remplir ensemble en silence.
 */
describe('l’objet visé par un élément de mémoire (#2260.7)', () => {
  it('nomme les QUATRE natures, dans l’ordre où elles s’ajoutent (GA-08)', () => {
    expect(memoryItemObjectTypeSchema.options).toEqual(['contact', 'need', 'consultant', 'mission'])
  })

  it('refuse une nature inconnue plutôt que de stocker du texte libre', () => {
    expect(() => memoryItemObjectTypeSchema.parse('account')).toThrow()
    expect(() => memoryItemObjectTypeSchema.parse('opportunity')).toThrow()
  })

  it('le corps d’épinglage accepte un objet visé, désigné par son type ET son id', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const parsed = createMemoryItemSchema.parse({ fact: 'x', object: { type: 'contact', id } })
    expect(parsed.object).toEqual({ type: 'contact', id })
  })

  it('un objet SANS id est refusé — la désignation exige les deux', () => {
    expect(() => createMemoryItemSchema.parse({ fact: 'x', object: { type: 'contact' } })).toThrow()
  })

  it('un identifiant qui n’est pas un uuid est refusé', () => {
    expect(() => createMemoryItemSchema.parse({ fact: 'x', object: { type: 'need', id: 'pas-un-uuid' } })).toThrow()
  })

  it('absent : aucun objet visé — le comportement historique, aucun onglet ouvert avant ce lot n’en envoie', () => {
    expect(createMemoryItemSchema.parse({ fact: 'x' }).object).toBeUndefined()
  })

  it('null : explicitement aucun objet visé — distinct de « absent »', () => {
    expect(createMemoryItemSchema.parse({ fact: 'x', object: null }).object).toBeNull()
  })

  it('la réponse de l’API porte l’objet RÉSOLU : type, id et son NOM — jamais deviné, jamais le corps d’un message', () => {
    const ref = memoryItemObjectRefSchema.parse({ type: 'mission', id: 'm-1', name: 'Refonte SI paiement' })
    expect(ref).toEqual({ type: 'mission', id: 'm-1', name: 'Refonte SI paiement' })
  })

  it('un nom introuvable (objet hors espace, ligne disparue) est DIT — `null`, jamais tu', () => {
    const ref = memoryItemObjectRefSchema.parse({ type: 'consultant', id: 'c-1', name: null })
    expect(ref.name).toBeNull()
  })

  it('un élément SANS objet visé le dit : `object: null` sur la réponse API, jamais un champ tu', () => {
    const base = {
      id: 'f-1',
      fact: 'x',
      accountId: null,
      kind: 'fact' as const,
      origin: 'manual' as const,
      scope: 'user' as const,
      ownedByMe: true,
      canForget: true,
      expiresAt: null,
      createdAt: '2026-09-18T00:00:00.000Z',
    }
    expect(memoryItemSchema.parse({ ...base, object: null }).object).toBeNull()
    // Absent : une API plus ancienne que ce champ — pas d’objet AFFIRMÉ, pas d’erreur non plus.
    expect(memoryItemSchema.parse(base).object).toBeUndefined()
  })
})
