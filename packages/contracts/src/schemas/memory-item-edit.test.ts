import { describe, expect, it } from 'vitest'
import { MEMORY_ITEM_EVENTS, memoryItemHistorySchema, updateMemoryItemSchema } from './memory-item.js'
import { MEMORY_SURFACES, memoryLedgerEntrySchema } from './memory-ledger.js'

/**
 * #1916.19 / #1916.22 / #1916.23 — MODIFIER, DATER APRÈS COUP, RELIRE L'HISTOIRE.
 */
describe('corps de modification d’un élément de mémoire (#1916.19, #1916.22)', () => {
  it('accepte le texte seul, l’échéance seule, ou le retrait de l’échéance (`null`)', () => {
    expect(updateMemoryItemSchema.parse({ fact: '  Nouveau texte  ' })).toEqual({ fact: 'Nouveau texte' })
    expect(updateMemoryItemSchema.parse({ expiresAt: '2026-12-31T23:59:59.999Z' })).toEqual({
      expiresAt: '2026-12-31T23:59:59.999Z',
    })
    expect(updateMemoryItemSchema.parse({ expiresAt: null })).toEqual({ expiresAt: null })
  })

  it('refuse un corps VIDE — un geste qui ne change rien ne s’écrit pas', () => {
    expect(() => updateMemoryItemSchema.parse({})).toThrow()
  })

  it('refuse un texte blanc et une date illisible', () => {
    expect(() => updateMemoryItemSchema.parse({ fact: '   ' })).toThrow()
    expect(() => updateMemoryItemSchema.parse({ expiresAt: 'fin octobre' })).toThrow()
  })

  it('ne réécrit ni la portée, ni la nature, ni l’origine : ces clés sont refusées', () => {
    expect(() => updateMemoryItemSchema.parse({ fact: 'x', scope: 'user' })).toThrow()
    expect(() => updateMemoryItemSchema.parse({ fact: 'x', kind: 'correction' })).toThrow()
    expect(() => updateMemoryItemSchema.parse({ fact: 'x', origin: 'manual' })).toThrow()
  })

  // #1962.19 — CONFIRMER une note de Laura est un geste DÉDIÉ, distinct de la
  // réécriture de son texte (Q1 du 13/09 ne couvrait que ce second cas).
  it('accepte `confirm: true` seul — un geste dédié, sans réécrire le texte', () => {
    expect(updateMemoryItemSchema.parse({ confirm: true })).toEqual({ confirm: true })
  })

  it('refuse `confirm: false` — ce geste ne se rétracte pas par ce corps', () => {
    expect(() => updateMemoryItemSchema.parse({ confirm: false })).toThrow()
  })
})

describe('historique d’un élément (#1916.23)', () => {
  it('journalise trois gestes — la création se lit sur la ligne elle-même, elle ne se recopie pas', () => {
    expect(MEMORY_ITEM_EVENTS).toEqual(['text_changed', 'scope_changed', 'expiry_changed'])
  })

  it('une entrée porte son auteur en prénom + avatar, jamais un identifiant ni une adresse', () => {
    const parsed = memoryItemHistorySchema.parse({
      entries: [
        {
          event: 'created',
          at: '2026-09-01T09:00:00.000Z',
          author: { firstName: 'Julie', avatarUrl: null, userId: 'u-1', email: 'j@x.test' },
          previousValue: null,
          newValue: 'Texte d’origine',
        },
      ],
    })
    expect(parsed.entries[0]?.author).toEqual({ firstName: 'Julie', avatarUrl: null })
  })
})

describe('une ligne du registre dit d’où elle vient et où Laura s’en sert (#1916.13, .16, .18)', () => {
  it('nomme les surfaces que le code prouve — et seulement elles', () => {
    expect(MEMORY_SURFACES).toEqual(['chat', 'externalAssistant'])
  })

  it('l’auteur se sert sans identifiant ni adresse, et `null` dit « inconnu », jamais un prénom deviné', () => {
    const base = {
      id: 'f-1',
      layer: 'facts',
      text: 'x',
      recordedAt: '2026-09-10T09:00:00.000Z',
      accountId: null,
      detail: null,
      expiresAt: null,
    }
    expect(
      memoryLedgerEntrySchema.parse({ ...base, author: { firstName: 'Théo', avatarUrl: null, userId: 'u-2' } }).author,
    ).toEqual({ firstName: 'Théo', avatarUrl: null })
    expect(memoryLedgerEntrySchema.parse({ ...base, author: null }).author).toBeNull()
    expect(memoryLedgerEntrySchema.parse({ ...base, surfaces: [] }).surfaces).toEqual([])
    expect(() => memoryLedgerEntrySchema.parse({ ...base, surfaces: ['discover'] })).toThrow()
  })

  // #1962.22 — la date de PROMOTION (confirmation d'une note de Laura) se sert
  // au même titre que le confirmateur (`confirmedBy`, déjà là) : sans elle,
  // l'écran ne peut dire QUAND une note a été confirmée.
  it('porte la date de confirmation — `null` quand rien n’a encore été confirmé', () => {
    const base = {
      id: 'f-1',
      layer: 'facts',
      text: 'x',
      recordedAt: '2026-09-10T09:00:00.000Z',
      accountId: null,
      detail: null,
      expiresAt: null,
    }
    expect(memoryLedgerEntrySchema.parse({ ...base, confirmedAt: '2026-09-15T10:00:00.000Z' }).confirmedAt).toBe(
      '2026-09-15T10:00:00.000Z',
    )
    expect(memoryLedgerEntrySchema.parse({ ...base, confirmedAt: null }).confirmedAt).toBeNull()
    expect(memoryLedgerEntrySchema.parse(base).confirmedAt).toBeUndefined()
  })
})
