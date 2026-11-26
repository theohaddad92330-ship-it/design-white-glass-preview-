import { describe, expect, it } from 'vitest'
import fr from '@/i18n/locales/fr/accounts.json'
import en from '@/i18n/locales/en/accounts.json'

/**
 * #2155.8 / #2155.22 — la page Comptes dit QUI la remplit.
 *
 * Le geste empêché : confondre Comptes avec un moteur de recherche du marché.
 * Un résultat de Découvrir n'y entre pas tout seul (#2155.9, déjà là) ; le
 * titre et le sous-titre le disent au lieu de le laisser deviner.
 *
 * `ScreenIntro` choisit `introTitle` quand le prénom est connu et
 * `introTitleWithoutName` sinon : les DEUX portent le titre exact, sinon la
 * moitié des utilisateurs verrait l'ancien.
 */
describe('Comptes — titre et sous-titre (#2155.8/.22)', () => {
  it('porte « Tes comptes » (refonte Théo), avec ou sans prénom', () => {
    expect(fr.page.introTitle).toBe('Tes comptes')
    expect(fr.page.introTitleWithoutName).toBe('Tes comptes')
  })

  // Tutoiement tenu (lexicon.test.ts) : « toi ou ton équipe avez » se lit au pluriel.
  it('dit que ce sont les entreprises que toi ou ton équipe avez décidé de suivre', () => {
    expect(fr.page.introSubtitle).toBe('Les entreprises que tu suis, toi ou quelqu’un de ton équipe.')
  })

  it('a son équivalent anglais, rédigé et non recopié', () => {
    expect(en.page.introTitle).toBe('Your accounts')
    expect(en.page.introTitleWithoutName).toBe('Your accounts')
    expect(en.page.introSubtitle).toBe('The companies you or your team follow.')
  })
})
