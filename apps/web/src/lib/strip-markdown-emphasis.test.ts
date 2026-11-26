import { describe, expect, it } from 'vitest'
import { stripMarkdownEmphasis } from './strip-markdown-emphasis'

describe('stripMarkdownEmphasis', () => {
  it('strips double-asterisk bold markers, keeping the inner text', () => {
    expect(stripMarkdownEmphasis('Règle métier « **contact_fit_score_100** »')).toBe(
      'Règle métier « contact_fit_score_100 »',
    )
  })

  it('strips single-asterisk italic markers', () => {
    expect(stripMarkdownEmphasis('Site de *l’entreprise*')).toBe('Site de l’entreprise')
  })

  it('strips inline code backticks', () => {
    expect(stripMarkdownEmphasis('voir `method_corpus.ts`')).toBe('voir method_corpus.ts')
  })

  it('leaves plain text untouched', () => {
    expect(stripMarkdownEmphasis('Playbook secteur retail')).toBe('Playbook secteur retail')
  })

  it('never touches underscores in snake_case identifiers', () => {
    expect(stripMarkdownEmphasis('search_market_memory')).toBe('search_market_memory')
  })

  it('handles several markers in the same label', () => {
    expect(stripMarkdownEmphasis('**Playbook** secteur `retail` — méthode Bellum')).toBe(
      'Playbook secteur retail — méthode Bellum',
    )
  })
})
