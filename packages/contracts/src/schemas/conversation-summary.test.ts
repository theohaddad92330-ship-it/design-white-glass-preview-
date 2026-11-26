import { describe, expect, it } from 'vitest'
import {
  CONVERSATION_SUMMARY_MAX_CHARS,
  conversationSummaryQuerySchema,
  correctConversationSummarySchema,
} from './conversation-summary.js'

// #1955.30 / #1955.31 — la porte d'entrée de la lecture et de la correction du
// résumé roulant d'un fil.
describe('conversationSummaryQuerySchema', () => {
  it('accepts an empty query — the default thread sends neither id', () => {
    expect(conversationSummaryQuerySchema.parse({})).toEqual({})
  })

  it('accepts a conversationId and/or an accountId', () => {
    expect(conversationSummaryQuerySchema.parse({ conversationId: 'general', accountId: null })).toEqual({
      conversationId: 'general',
      accountId: null,
    })
  })

  it('rejects a malformed accountId rather than guessing it is meant to be absent', () => {
    expect(() => conversationSummaryQuerySchema.parse({ accountId: 'not-a-uuid' })).toThrow()
  })
})

describe('correctConversationSummarySchema', () => {
  it('requires a non-empty, trimmed summary — a blank correction is not a correction', () => {
    expect(() => correctConversationSummarySchema.parse({ summary: '   ' })).toThrow()
  })

  it('trims the text', () => {
    expect(correctConversationSummarySchema.parse({ summary: '  Le bon résumé  ' }).summary).toBe('Le bon résumé')
  })

  it('refuses a correction longer than the generated summary would ever be', () => {
    const tooLong = 'a'.repeat(CONVERSATION_SUMMARY_MAX_CHARS + 1)
    expect(() => correctConversationSummarySchema.parse({ summary: tooLong })).toThrow()
  })

  it('accepts exactly the ceiling', () => {
    const atCeiling = 'a'.repeat(CONVERSATION_SUMMARY_MAX_CHARS)
    expect(correctConversationSummarySchema.parse({ summary: atCeiling }).summary).toHaveLength(
      CONVERSATION_SUMMARY_MAX_CHARS,
    )
  })
})
