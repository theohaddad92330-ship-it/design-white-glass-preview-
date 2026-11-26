import { describe, expect, it } from 'vitest'
import { CHAT_QUOTA_REACHED_CODE, chatQuotaRefusalSchema, chatQuotaStatusSchema } from './chat-quota.js'

/**
 * #1957.5 / #1957.8 — ce que le serveur dit du plafond quotidien de Laura, en
 * DONNÉES : le navigateur formate l'heure dans SON fuseau et dans SA langue,
 * l'API n'a ni l'un ni l'autre.
 */
describe('refus au plafond (429)', () => {
  it('porte le code, le plafond et l’heure de réouverture calculée par le serveur', () => {
    const body = {
      statusCode: 429,
      message: 'Plafond du copilote atteint (50 messages sur 24 h glissantes).',
      code: CHAT_QUOTA_REACHED_CODE,
      limit: 50,
      reopensAt: '2026-09-13T14:32:00.000Z',
    }
    expect(chatQuotaRefusalSchema.parse(body)).toMatchObject({ limit: 50, reopensAt: '2026-09-13T14:32:00.000Z' })
  })

  it('une heure que le serveur n’a pas pu calculer vaut null — jamais une heure inventée', () => {
    const parsed = chatQuotaRefusalSchema.safeParse({ code: CHAT_QUOTA_REACHED_CODE, limit: 50, reopensAt: null })
    expect(parsed.success).toBe(true)
  })

  it('un autre 429 (limiteur de débit générique) n’est PAS un refus de plafond', () => {
    expect(chatQuotaRefusalSchema.safeParse({ statusCode: 429, message: 'ThrottlerException' }).success).toBe(false)
  })
})

describe('état du plafond (GET /ia/chat/quota)', () => {
  it('mesuré : ce qui reste, et si c’est peu', () => {
    const status = chatQuotaStatusSchema.parse({
      state: 'measured',
      limit: 50,
      remaining: 4,
      low: true,
      reopensAt: null,
    })
    expect(status.state).toBe('measured')
  })

  it('sans borne (plafond désactivé, espace de démonstration) : aucun chiffre', () => {
    expect(chatQuotaStatusSchema.parse({ state: 'unbounded' })).toEqual({ state: 'unbounded' })
  })

  it('non mesuré : aucun chiffre non plus — « non mesuré » n’est jamais « 0 restant »', () => {
    expect(chatQuotaStatusSchema.parse({ state: 'unmeasured' })).toEqual({ state: 'unmeasured' })
    // Un « 0 restant » glissé à côté d'un état non mesuré ne traverse pas.
    expect(chatQuotaStatusSchema.parse({ state: 'unmeasured', remaining: 0 })).toEqual({ state: 'unmeasured' })
  })

  it('refuse un restant négatif', () => {
    expect(
      chatQuotaStatusSchema.safeParse({ state: 'measured', limit: 50, remaining: -1, low: true, reopensAt: null })
        .success,
    ).toBe(false)
  })
})
