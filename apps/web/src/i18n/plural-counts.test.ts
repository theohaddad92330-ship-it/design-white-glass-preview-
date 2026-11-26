import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'

// LOIC-FIX2 ACCORD — « 1 personnes dans le brief » (recette 20/10) : un compte à un seul élément s'accorde.
describe('LOIC-FIX2 ACCORD — les chaînes « {{count}} personnes / contacts / comptes » ont une forme singulière', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('fr : « 1 personne dans le brief », jamais « 1 personnes »', () => {
    expect(i18n.t('accounts:commercialBrief.people.title', { count: 1 })).toBe('1 personne dans le brief')
    expect(i18n.t('accounts:commercialBrief.people.title', { count: 5 })).toBe('5 personnes dans le brief')
  })

  it('en : « 1 person in the brief »', async () => {
    await i18n.changeLanguage('en')
    expect(i18n.t('accounts:commercialBrief.people.title', { count: 1 })).toBe('1 person in the brief')
    expect(i18n.t('accounts:commercialBrief.people.title', { count: 3 })).toBe('3 people in the brief')
  })

  it('fr : comptes et contacts accordés au singulier', () => {
    expect(i18n.t('briefing:agenda.brief.missingParticipants.title', { count: 1 })).toBe(
      '1 contact connu du compte, non invité',
    )
    expect(i18n.t('dashboard:perspective.population', { count: 1 })).toBe('sur 1 compte')
    expect(i18n.t('chat:disclosure.portfolioPartial', { count: 1, total: 4, list: 'ACME' })).toBe(
      '1 compte sur 4 : ACME',
    )
  })
})
