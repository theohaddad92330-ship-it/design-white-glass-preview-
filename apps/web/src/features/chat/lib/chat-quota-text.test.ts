import { beforeAll, describe, expect, it } from 'vitest'
import type { TFunction } from 'i18next'
import { i18n } from '@/i18n'
import { chatQuotaReachedText, chatQuotaReopening } from './chat-quota-text'

/**
 * #1957.8 → .10 — ce que l'écran dit au plafond de Laura.
 *
 * Les heures sont construites en heure LOCALE (`new Date(2026, 8, 13, 14, 32)`) :
 * le texte est formaté dans le fuseau du navigateur, et un test écrit en UTC
 * mentirait selon la machine qui le lance.
 */
describe('chatQuotaReachedText', () => {
  let fr: TFunction<'chat'>
  let en: TFunction<'chat'>

  beforeAll(async () => {
    await i18n.loadNamespaces('chat')
    fr = i18n.getFixedT('fr', 'chat') as TFunction<'chat'>
    en = i18n.getFixedT('en', 'chat') as TFunction<'chat'>
  })

  const now = new Date(2026, 8, 13, 10, 0)

  it('dit QUAND le plafond se rouvre, dans le fuseau du navigateur', () => {
    const text = chatQuotaReachedText(
      fr,
      { limit: 50, reopensAt: new Date(2026, 8, 13, 14, 32) },
      { language: 'fr', now, billingLink: true },
    )
    expect(text).toContain('50 demandes')
    expect(text).toContain('Il se rouvre vers 14:32.')
  })

  it('dit « demain » quand l’heure tombe le lendemain', () => {
    expect(
      chatQuotaReopening(fr, new Date(2026, 8, 14, 9, 14), { language: 'fr', now: new Date(2026, 8, 13, 23, 0) }),
    ).toBe('Il se rouvre demain vers 09:14.')
  })

  it('sans instant calculé : aucune heure, jamais une heure devinée', () => {
    const text = chatQuotaReopening(fr, null, { language: 'fr', now })
    expect(text).toContain('au fil des heures')
    expect(text).not.toMatch(/\d{2}:\d{2}/)
  })

  it('un instant déjà passé (horloge décalée) ne s’affiche pas comme une heure à venir', () => {
    expect(chatQuotaReopening(fr, new Date(2026, 8, 13, 9, 0), { language: 'fr', now })).toContain('au fil des heures')
  })

  it('nomme ce qui reste utilisable', () => {
    const text = chatQuotaReachedText(fr, { limit: 50, reopensAt: null }, { language: 'fr', now, billingLink: false })
    for (const usable of [
      'écrans',
      'recherche',
      'fiches',
      'analyses',
      'enrichissements',
      'exports',
      'actions déjà préparées',
    ]) {
      expect(text).toContain(usable)
    }
  })

  // décision Louis 13/09 batch 13 — plafond selon le plan
  it('plafond du PLAN : le dit, avec ce que comprend le plan — sans rien vendre', () => {
    const text = chatQuotaReachedText(
      fr,
      { limit: 50, reopensAt: null, limitSource: 'plan' },
      { language: 'fr', now, billingLink: true },
    )
    expect(text).toContain('50 demandes')
    expect(text).toContain('C’est le plafond de ton plan')
    expect(text).toContain('](/billing)')
    expect(text).not.toContain('même sur tous les plans')
    expect(text).not.toMatch(/passe[rz]? à|abonne|upgrade|offre supérieure|débloque/i)
  })

  it('sans lien quand la surface ne rend pas le markdown (la bulle)', () => {
    const text = chatQuotaReachedText(
      fr,
      { limit: 50, reopensAt: null, limitSource: 'plan' },
      { language: 'fr', now, billingLink: false },
    )
    expect(text).toContain('C’est le plafond de ton plan.')
    expect(text).not.toContain('](')
  })

  it.each([
    ['plafond de sécurité de l’opérateur', 'operator' as const],
    ['API d’avant, sans la source', undefined],
  ])('%s : ne prétend rien sur le plan', (_label, limitSource) => {
    const text = chatQuotaReachedText(
      fr,
      { limit: 50, reopensAt: null, limitSource },
      { language: 'fr', now, billingLink: true },
    )
    expect(text).toContain('50 demandes')
    expect(text).not.toMatch(/\bplans?\b/i)
    expect(text).not.toContain('](')
  })

  it('en anglais aussi', () => {
    const text = chatQuotaReachedText(
      en,
      { limit: 50, reopensAt: new Date(2026, 8, 13, 14, 32), limitSource: 'plan' },
      { language: 'en', now, billingLink: true },
    )
    expect(text).toContain('50 requests')
    expect(text).toContain('It reopens around 14:32.')
    expect(text).toContain('That’s your plan’s limit')
    expect(text).toContain('](/billing)')
    expect(text).not.toContain('same on every plan')
  })
})
