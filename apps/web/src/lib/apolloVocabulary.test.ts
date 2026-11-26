import { afterEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { apolloLabel, humanizeApolloValue, normalizeApolloValue } from './apolloVocabulary'

/** `t` bound to the apollo namespace, like `useApolloLabel()` does at runtime. */
function t() {
  return i18n.getFixedT(null, 'apollo')
}

describe('normalizeApolloValue', () => {
  it('lowercases and trims', () => {
    expect(normalizeApolloValue('  Construction  ')).toBe('construction')
  })

  it('turns underscores into spaces (Apollo machine values)', () => {
    expect(normalizeApolloValue('information_technology')).toBe('information technology')
  })

  it('spells out "&" so the key stays alphanumeric', () => {
    expect(normalizeApolloValue('Food & Beverages')).toBe('food and beverages')
  })

  it('collapses separators i18next would misread as key/namespace delimiters', () => {
    expect(normalizeApolloValue('Transportation/Trucking/Railroad')).toBe('transportation trucking railroad')
    expect(normalizeApolloValue('Health, Wellness & Fitness')).toBe('health wellness and fitness')
    expect(normalizeApolloValue('E-Learning')).toBe('e learning')
    expect(normalizeApolloValue('Primary/Secondary  Education')).toBe('primary secondary education')
  })

  it('returns an empty string for a blank value', () => {
    expect(normalizeApolloValue('   ')).toBe('')
  })
})

describe('humanizeApolloValue', () => {
  it('is cosmetic only: underscores out, first letter up, value otherwise intact', () => {
    expect(humanizeApolloValue('information_technology')).toBe('Information technology')
    expect(humanizeApolloValue('c_suite')).toBe('C suite')
    expect(humanizeApolloValue('  ')).toBe('')
  })
})

describe('apolloLabel', () => {
  afterEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('translates a known industry in FR', () => {
    expect(apolloLabel(t(), 'industry', 'environmental services')).toBe('Services à l’environnement')
  })

  it('translates the same industry in EN', async () => {
    await i18n.changeLanguage('en')
    expect(apolloLabel(t(), 'industry', 'environmental services')).toBe('Environmental services')
  })

  it('matches whatever casing / separator Apollo sent', () => {
    expect(apolloLabel(t(), 'industry', 'Information Technology & Services')).toBe(
      apolloLabel(t(), 'industry', 'information technology and services'),
    )
  })

  it('translates a funding stage', () => {
    expect(apolloLabel(t(), 'fundingStage', 'series_a')).toBe('Série A')
  })

  it('translates a seniority level', () => {
    expect(apolloLabel(t(), 'seniority', 'c_suite')).toBe('Direction générale')
  })

  it('translates a department, a function and a headcount key from the same table', () => {
    expect(apolloLabel(t(), 'department', 'information_technology')).toBe('Informatique')
    expect(apolloLabel(t(), 'department', 'engineering')).toBe('Ingénierie')
    expect(apolloLabel(t(), 'department', 'business_development')).toBe('Développement commercial')
  })

  it('falls back to the raw Apollo value when the key is unknown — never blank, never guessed', () => {
    expect(apolloLabel(t(), 'industry', 'quantum yak shaving')).toBe('quantum yak shaving')
    expect(apolloLabel(t(), 'department', 'yak_shaving')).toBe('yak_shaving')
  })

  it('uses the caller fallback (cosmetic humanisation) when provided', () => {
    expect(apolloLabel(t(), 'department', 'yak_shaving', 'Yak shaving')).toBe('Yak shaving')
  })

  it('never translates across fields: an industry key does not leak into seniority', () => {
    expect(apolloLabel(t(), 'seniority', 'construction')).toBe('construction')
  })

  it('returns the value untouched when it is blank', () => {
    expect(apolloLabel(t(), 'industry', '   ')).toBe('   ')
  })
})
