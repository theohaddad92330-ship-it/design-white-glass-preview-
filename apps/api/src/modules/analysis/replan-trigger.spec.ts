import { shouldSuggestReplan } from './replan-trigger'

/**
 * « Le plan se replanifie après chaque réponse » (p27). On détecte l'événement
 * qui périme le plan ; le clic de l'utilisateur replanifie (règle « on prépare,
 * l'utilisateur déclenche » — jamais de dépense de crédit sans clic).
 */
describe('shouldSuggestReplan', () => {
  it('propose un replan quand un contact répond', () => {
    expect(shouldSuggestReplan('contacted', 'replied')).toBe(true)
  })

  it('propose un replan sur RDV, bounce et refus', () => {
    expect(shouldSuggestReplan('contacted', 'meeting')).toBe(true)
    expect(shouldSuggestReplan('contacted', 'bounced')).toBe(true)
    expect(shouldSuggestReplan('replied', 'not_interested')).toBe(true)
  })

  it('ne propose rien pour un statut neutre', () => {
    expect(shouldSuggestReplan('new', 'contacted')).toBe(false)
    expect(shouldSuggestReplan('new', 'new')).toBe(false)
  })

  it('ne propose rien si le statut ne change pas (double-clic idempotent)', () => {
    expect(shouldSuggestReplan('replied', 'replied')).toBe(false)
    expect(shouldSuggestReplan('meeting', 'meeting')).toBe(false)
  })

  it('gère l’absence de statut précédent', () => {
    expect(shouldSuggestReplan(null, 'replied')).toBe(true)
    expect(shouldSuggestReplan(undefined, 'contacted')).toBe(false)
  })
})
