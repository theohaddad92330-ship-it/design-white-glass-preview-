import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { StructuredReply } from '../StructuredReply'

const fence = (block: unknown) => ['```bellum-block', JSON.stringify(block), '```'].join('\n')

// #5013 (5e tour) — la pastille à gauche d'une carte ne se lit jamais comme une classe d'accès.
describe('#5013 — pastille d’un compte portant une classe d’accès', () => {
  it('n’affiche pas l’initiale seule (« C » pour CANSSM, classe B) mais deux lettres', async () => {
    const block = {
      type: 'account_ranking',
      title: 'Les comptes les plus faciles où entrer',
      axes: ['Classe d’accès'],
      items: [{ name: 'CANSSM', why: ['Classe d’accès B — Ouvert par une entité'] }],
    }
    renderWithRouter(<StructuredReply text={fence(block)} />)
    await screen.findByRole('group', { name: 'Les comptes les plus faciles où entrer' })
    expect(screen.queryByText('C', { exact: true })).not.toBeInTheDocument()
    expect(screen.getByText('CA')).toBeInTheDocument()
  })

  it('garde l’initiale pour un compte sans classe d’accès', async () => {
    const block = {
      type: 'account_ranking',
      title: 'Comptes',
      axes: ['Zone'],
      items: [{ name: 'CANSSM', why: ['Paris'] }],
    }
    renderWithRouter(<StructuredReply text={fence(block)} />)
    await screen.findByRole('group', { name: 'Comptes' })
    expect(screen.getByText('C', { exact: true })).toBeInTheDocument()
  })
})
