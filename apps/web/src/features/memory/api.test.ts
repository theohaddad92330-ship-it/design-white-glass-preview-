import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/api'
import { memoryApi } from './api'

/**
 * #1955.30 / #1955.31 — le client web du résumé roulant d'UN fil : le lire
 * avec sa date, et le corriger (« une correction humaine gagne toujours »,
 * CLAUDE.md).
 */
describe('memoryApi.getConversationSummary', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset()
  })

  it('reads the default thread with no query string', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ summary: { summary: 'Le résumé', updatedAt: '2026-09-16T10:00:00Z' } })
    const result = await memoryApi.getConversationSummary({})
    expect(apiFetch).toHaveBeenCalledWith({ path: '/memory/summary' })
    expect(result).toEqual({ summary: 'Le résumé', updatedAt: '2026-09-16T10:00:00Z' })
  })

  it('carries conversationId and accountId in the query string when given', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ summary: null })
    await memoryApi.getConversationSummary({ conversationId: 'general', accountId: 'a-1' })
    expect(apiFetch).toHaveBeenCalledWith({ path: '/memory/summary?conversationId=general&accountId=a-1' })
  })

  it('renders null — not an empty string — when the thread has no live summary', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ summary: null })
    expect(await memoryApi.getConversationSummary({})).toBeNull()
  })

  it('renders null on a benign demo-mode fallback ({})', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({})
    expect(await memoryApi.getConversationSummary({})).toBeNull()
  })
})

/**
 * #1962.19 — CONFIRMER une note de Laura sans réécrire son texte : un geste
 * dédié, au même endroit que la réécriture (`PATCH /memory/facts/:id`).
 */
describe('memoryApi.updateFact', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset()
  })

  it('sends only the confirm flag when nothing else is patched', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ fact: { id: 'f-1', fact: 'x' } })
    await memoryApi.updateFact('f-1', { confirm: true })
    expect(apiFetch).toHaveBeenCalledWith({
      path: '/memory/facts/f-1',
      method: 'PATCH',
      body: { confirm: true },
    })
  })

  it('still sends only the present keys — a text edit never carries `confirm`', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ fact: { id: 'f-1', fact: 'x' } })
    await memoryApi.updateFact('f-1', { fact: 'x' })
    expect(apiFetch).toHaveBeenCalledWith({ path: '/memory/facts/f-1', method: 'PATCH', body: { fact: 'x' } })
  })
})

describe('memoryApi.correctConversationSummary', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset()
  })

  it('sends the corrected text with the same scope as the read', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      summary: { summary: 'Le bon résumé', updatedAt: '2026-09-16T11:00:00Z' },
    })
    const result = await memoryApi.correctConversationSummary({
      conversationId: 'general',
      accountId: 'a-1',
      summary: 'Le bon résumé',
    })
    expect(apiFetch).toHaveBeenCalledWith({
      path: '/memory/summary',
      method: 'PATCH',
      body: { summary: 'Le bon résumé', conversationId: 'general', accountId: 'a-1' },
    })
    expect(result).toEqual({ summary: 'Le bon résumé', updatedAt: '2026-09-16T11:00:00Z' })
  })

  it('omits conversationId/accountId from the body when absent — never a guessed key', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ summary: null })
    await memoryApi.correctConversationSummary({ summary: 'Le bon résumé' })
    expect(apiFetch).toHaveBeenCalledWith({
      path: '/memory/summary',
      method: 'PATCH',
      body: { summary: 'Le bon résumé' },
    })
  })
})
