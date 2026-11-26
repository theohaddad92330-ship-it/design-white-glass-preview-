import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { StructuredReply } from '../StructuredReply'

const fence = (block: unknown) => ['```bellum-block', JSON.stringify(block), '```'].join('\n')

// #5013 — « les comptes les plus faciles où entrer » : l'écran garde l'ordre REÇU (A, B, C), il ne le re-trie pas.
describe('#5013 — la carte de classement garde l’ordre de classe reçu', () => {
  it('rend les comptes dans l’ordre du bloc, la classe d’accès lisible sur chaque carte', async () => {
    const block = {
      type: 'account_ranking',
      title: 'Les comptes les plus faciles où entrer',
      axes: ['Classe d’accès'],
      items: [
        { name: 'ASSURANCES 2000', why: ['Classe d’accès A — Ouvert probable'] },
        { name: 'BIOGROUP PARIS OUEST', why: ['Classe d’accès B — Ouvert par une entité'] },
        { name: 'CANSSM', why: ['Classe d’accès C — Semi-ouvert'] },
      ],
    }
    renderWithRouter(<StructuredReply text={fence(block)} />)
    const card = await screen.findByRole('group', { name: 'Les comptes les plus faciles où entrer' })
    const names = within(card)
      .getAllByRole('article')
      .map(article => ['ASSURANCES 2000', 'BIOGROUP PARIS OUEST', 'CANSSM'].find(n => article.textContent?.includes(n)))
    expect(names).toEqual(['ASSURANCES 2000', 'BIOGROUP PARIS OUEST', 'CANSSM'])
    expect(within(card).getByText('Classe d’accès C — Semi-ouvert')).toBeInTheDocument()
  })
})
