import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { StructuredReply } from '../StructuredReply'

const fence = (block: unknown) => ['```bellum-block', JSON.stringify(block), '```'].join('\n')

const ranking = {
  type: 'account_ranking',
  title: 'Quatre comptes où un profil Data a sa place',
  axes: ['Signal daté', 'Relation'],
  items: [
    {
      name: 'Banque Valmont',
      href: '/accounts/a1',
      verdict: 'Appel d’offres publié le 14 oct.',
      why: ['Tu as déjà deux consultants chez eux.'],
      limits: ['Le lot Data reste à confirmer.'],
      action: { label: 'Appeler Karim Benali', href: '/contacts/c1' },
    },
    { name: 'NovaSanté', why: ['Chantier de reporting décrit.'] },
  ],
}

describe('refonte Théo L1 — la carte de classement de Laura est une grille de cartes', () => {
  it('chaque compte est une carte (un article) dans une liste à deux colonnes', async () => {
    renderWithRouter(<StructuredReply text={fence(ranking)} />)
    const card = await screen.findByRole('group', { name: 'Quatre comptes où un profil Data a sa place' })
    expect(within(card).getAllByRole('article')).toHaveLength(2)
    expect(within(card).getAllByRole('listitem')[0]!.closest('ol')).toHaveClass('md:grid-cols-2')
  })

  it('met le prochain geste en évidence, sous son intitulé', async () => {
    renderWithRouter(<StructuredReply text={fence(ranking)} />)
    const card = await screen.findByRole('group', { name: 'Quatre comptes où un profil Data a sa place' })
    expect(within(card).getByText('Prochain geste')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Appeler Karim Benali' })).toHaveAttribute('href', '/contacts/c1')
  })

  it('« Voir le dossier » n’existe que pour un compte qui a un dossier — jamais un bouton mort', async () => {
    renderWithRouter(<StructuredReply text={fence(ranking)} />)
    const card = await screen.findByRole('group', { name: 'Quatre comptes où un profil Data a sa place' })
    expect(within(card).getAllByRole('link', { name: 'Voir le dossier' })).toHaveLength(1)
  })

  it('ne cache JAMAIS ce qui manque : les limites restent lisibles sur la carte', async () => {
    renderWithRouter(<StructuredReply text={fence(ranking)} />)
    expect(await screen.findByText('Le lot Data reste à confirmer.')).toBeInTheDocument()
  })

  it('une carte sans geste ne montre pas d’intitulé « Prochain geste » vide', async () => {
    renderWithRouter(
      <StructuredReply
        text={fence({ ...ranking, items: [{ name: 'NovaSanté', why: ['Chantier de reporting décrit.'] }] })}
      />,
    )
    await screen.findByText('NovaSanté')
    expect(screen.queryByText('Prochain geste')).not.toBeInTheDocument()
  })
})
