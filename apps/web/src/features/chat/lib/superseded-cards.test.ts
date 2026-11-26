import { describe, expect, it } from 'vitest'
import { supersededCardKeys } from './superseded-cards'

const card = (cardId: string | null, title = 'Priorités du portefeuille') =>
  '```bellum-block\n' +
  JSON.stringify({
    type: 'account_ranking',
    title,
    ...(cardId ? { card_id: cardId } : {}),
    axes: ['Niveau'],
    items: [{ name: 'Alpha', why: ['Signal daté.'] }],
  }) +
  '\n```'

describe('#3769 — une carte actualisée remplace la précédente', () => {
  it('la première carte est remplacée par la dernière de même identifiant', () => {
    const keys = supersededCardKeys([
      { id: 'm1', role: 'assistant', content: card('portfolio_priorities') },
      { id: 'm2', role: 'user', content: 'seulement en Occitanie' },
      {
        id: 'm3',
        role: 'assistant',
        content: card('portfolio_priorities', 'Priorités du portefeuille · Zone : Occitanie'),
      },
    ])
    expect(keys.has('m1:portfolio_priorities')).toBe(true)
    expect(keys.has('m3:portfolio_priorities')).toBe(false)
  })

  it('sait dire NON : sans identifiant, ou avec des identifiants différents, rien n’est remplacé', () => {
    const keys = supersededCardKeys([
      { id: 'm1', role: 'assistant', content: card(null) },
      { id: 'm2', role: 'assistant', content: card(null) },
      { id: 'm3', role: 'assistant', content: card('autre') },
    ])
    expect(keys.size).toBe(0)
  })

  it('une carte de la même réponse n’en remplace pas une autre de la même réponse', () => {
    const keys = supersededCardKeys([
      { id: 'm1', role: 'assistant', content: `${card('portfolio_priorities')}\n${card('portfolio_priorities')}` },
    ])
    expect(keys.size).toBe(0)
  })
})
