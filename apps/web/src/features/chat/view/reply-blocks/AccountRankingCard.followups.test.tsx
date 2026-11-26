import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { StructuredReply } from '../StructuredReply'
import { ReplyFollowUpProvider } from '../reply-follow-up'

const fence = (block: unknown) => ['```bellum-block', JSON.stringify(block), '```'].join('\n')

const TALENT_ID = '34f4c624-1111-4222-8333-444455556666'
const ASK = 'Lance l’analyse du compte Sopra Steria pour y placer Marie Dupont.'
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const ranking = {
  type: 'account_ranking',
  title: 'Comptes où placer Marie Dupont',
  axes: ['Compétences de la fiche demandées sur la zone'],
  items: [
    {
      name: 'Sopra Steria',
      why: ['Compétences de la fiche demandées sur le 69 : Java.'],
      follow_ups: [
        { label: 'Lancer l’analyse', ask: ASK, talent_id: TALENT_ID },
        { label: 'Préparer le message', ask: 'Prépare un message — je l’enverrai moi-même.' },
      ],
    },
    { name: 'Alten', why: ['Java demandé sur le 69.'] },
  ],
}

/**
 * #3816.2 — « missions pour ce profil » : depuis un compte, enchaîner l'analyse, les
 * contacts et le message SANS ressaisir le profil. Cliquer envoie la phrase complète
 * (`ask`, qui porte le profil) à Laura — jamais un envoi à un tiers.
 */
describe('#3816.2 — les suites d’un compte classé', () => {
  it('cliquer une suite envoie sa phrase complète à Laura, pas son libellé', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    renderWithRouter(
      <ReplyFollowUpProvider onSend={onSend}>
        <StructuredReply text={fence(ranking)} />
      </ReplyFollowUpProvider>,
    )
    const card = await screen.findByRole('group', { name: 'Comptes où placer Marie Dupont' })
    await user.click(within(card).getByRole('button', { name: 'Lancer l’analyse' }))
    // #4397 — le texte envoyé ne porte aucun identifiant ; il voyage en métadonnée.
    expect(onSend).toHaveBeenCalledWith(ASK, { talentId: TALENT_ID })
    expect(ASK).not.toMatch(UUID)
    expect(within(card).getByRole('button', { name: 'Préparer le message' })).toBeInTheDocument()
  })

  it('NON : une suite sans identifiant envoie la phrase seule, sans métadonnée', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    const noId = { ...ranking, items: [{ ...ranking.items[0], follow_ups: [{ label: 'Lancer l’analyse', ask: ASK }] }] }
    renderWithRouter(
      <ReplyFollowUpProvider onSend={onSend}>
        <StructuredReply text={fence(noId)} />
      </ReplyFollowUpProvider>,
    )
    const card = await screen.findByRole('group', { name: 'Comptes où placer Marie Dupont' })
    await user.click(within(card).getByRole('button', { name: 'Lancer l’analyse' }))
    expect(onSend).toHaveBeenCalledWith(ASK)
  })

  it('NON : un compte sans suite n’affiche aucun bouton de suite', async () => {
    renderWithRouter(
      <ReplyFollowUpProvider onSend={vi.fn()}>
        <StructuredReply text={fence({ ...ranking, items: [ranking.items[1]] })} />
      </ReplyFollowUpProvider>,
    )
    const card = await screen.findByRole('group', { name: 'Comptes où placer Marie Dupont' })
    expect(within(card).queryByRole('button', { name: 'Lancer l’analyse' })).not.toBeInTheDocument()
  })

  it('NON : sans fil actif (fil relu, partagé), le libellé reste du texte — jamais un bouton qui ne fait rien', async () => {
    renderWithRouter(<StructuredReply text={fence(ranking)} />)
    const card = await screen.findByRole('group', { name: 'Comptes où placer Marie Dupont' })
    expect(within(card).getByText('Lancer l’analyse')).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Lancer l’analyse' })).not.toBeInTheDocument()
  })
})
