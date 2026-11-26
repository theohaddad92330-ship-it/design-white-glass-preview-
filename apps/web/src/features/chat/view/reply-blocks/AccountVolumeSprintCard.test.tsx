import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { StructuredReply } from '../StructuredReply'

const fence = (block: unknown) => ['```bellum-block', JSON.stringify(block), '```'].join('\n')

function renderReply(text: string) {
  return renderWithRouter(<StructuredReply text={text} />)
}

/**
 * #3392 / #3428 (reste, recette prod 30/09) — « la carte Découvrir n'a pas le
 * filtre région AURA » / « le sprint 10 dont 3 n'est pas produit ». Cette
 * carte prouve que les TROIS champs demandés par l'issue (pourquoi maintenant,
 * porte d'entrée, premier mouvement) atteignent l'écran pour chacun des
 * comptes du focus — jamais seulement le prompt.
 */
const sprint = {
  type: 'account_volume_sprint',
  title: 'Sprint sur tes 100 comptes AURA',
  full_list_count: 100,
  sprint: [
    { name: 'Alpha Industrie', href: '/accounts/alpha-1' },
    { name: 'Beta Services' },
    { name: 'Gamma Tech' },
    { name: 'Delta Corp' },
    { name: 'Epsilon SA' },
  ],
  focus: [
    {
      name: 'Alpha Industrie',
      href: '/accounts/alpha-1',
      why_now: "Appel d'offres cloud ouvert jusqu'au 30 septembre.",
      entry_point: 'Camille Martin, DSI, déjà identifiée sur ce compte.',
      first_move: "Envoyer un message référant l'appel d'offres avant la clôture.",
    },
    {
      name: 'Beta Services',
      why_now: 'Recrutement de trois profils cloud publié cette semaine.',
      entry_point: 'Responsable technique, à qualifier.',
      first_move: 'Proposer un premier échange court sur le sujet cloud.',
    },
  ],
}

describe('#3392 / #3428 — le sprint 10 dont 3', () => {
  it('nomme la mémoire de marché complète et la liste du sprint', async () => {
    renderReply(fence(sprint))
    const card = await screen.findByRole('group', { name: 'Sprint sur tes 100 comptes AURA' })
    expect(within(card).getByText('100')).toBeInTheDocument()
    // #3392 — « Alpha Industrie » apparaît deux fois : dans le sprint ET dans
    // le focus (le focus est un sous-ensemble du sprint, jamais une liste à part).
    expect(within(card).getAllByText('Alpha Industrie').length).toBeGreaterThan(0)
    expect(within(card).getByText('Gamma Tech')).toBeInTheDocument()
  })

  it('chaque compte du focus porte ses trois champs — pourquoi maintenant, porte d’entrée, premier mouvement', async () => {
    renderReply(fence(sprint))
    const card = await screen.findByRole('group', { name: 'Sprint sur tes 100 comptes AURA' })
    expect(within(card).getByText(/Appel d'offres cloud ouvert/)).toBeInTheDocument()
    expect(within(card).getByText(/Camille Martin, DSI/)).toBeInTheDocument()
    expect(within(card).getByText(/Envoyer un message référant/)).toBeInTheDocument()
    expect(within(card).getByText(/Recrutement de trois profils/)).toBeInTheDocument()
    expect(within(card).getByText(/Responsable technique, à qualifier/)).toBeInTheDocument()
    expect(within(card).getByText(/Proposer un premier échange/)).toBeInTheDocument()
  })

  it('le sprint au-delà de trois comptes se replie derrière « voir les autres »', async () => {
    const user = userEvent.setup()
    renderReply(fence(sprint))
    const card = await screen.findByRole('group', { name: 'Sprint sur tes 100 comptes AURA' })
    expect(within(card).queryByText('Delta Corp')).not.toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: /autres/i }))
    expect(within(card).getByText('Delta Corp')).toBeInTheDocument()
    expect(within(card).getByText('Epsilon SA')).toBeInTheDocument()
  })

  it('lot Q02 — sans porte d’entrée vérifiée, le focus vide se NOMME et la carte reste une carte', async () => {
    renderReply(fence({ ...sprint, focus: [] }))
    const card = await screen.findByRole('group', { name: 'Sprint sur tes 100 comptes AURA' })
    expect(within(card).getByText(/Aucun compte n’a encore de porte d’entrée vérifiée/)).toBeInTheDocument()
  })

  it('lot Q02 — un focus renseigné ne porte PAS ce message', async () => {
    renderReply(fence(sprint))
    const card = await screen.findByRole('group', { name: 'Sprint sur tes 100 comptes AURA' })
    expect(within(card).queryByText(/Aucun compte n’a encore de porte d’entrée vérifiée/)).toBeNull()
  })

  it('#3428 — la liste complète est atteignable : un lien vers Découvrir porte les critères, sans lien il n’y a rien', async () => {
    renderReply(fence({ ...sprint, full_list_href: '/discover?region=84&sectors=industry&laura=1' }))
    const card = await screen.findByRole('group', { name: 'Sprint sur tes 100 comptes AURA' })
    const link = within(card).getByRole('link', { name: /Ouvrir la liste complète/ })
    expect(link.getAttribute('href')).toContain('/discover')
    expect(link.getAttribute('href')).toContain('region=84')
  })

  it('#3428 — sans full_list_href, aucun lien « liste complète » n’est inventé', async () => {
    renderReply(fence(sprint))
    const card = await screen.findByRole('group', { name: 'Sprint sur tes 100 comptes AURA' })
    expect(within(card).queryByRole('link', { name: /Ouvrir la liste complète/ })).toBeNull()
  })
})
