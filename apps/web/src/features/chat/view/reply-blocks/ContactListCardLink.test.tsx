import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { StructuredReply } from '../StructuredReply'

const ID = '3d60b875-e3ba-4c00-992c-527302a9d8fb'

const fence = (block: unknown) => ['```bellum-block', JSON.stringify(block), '```'].join('\n')

// #4610 — l'APPELANT : le `href` posé par le serveur (`contact_card_fallback`) arrive jusqu'au rendu et fait du nom
// un lien vers la fiche ; une ligne sans fiche reste du texte (jamais un lien mort).
describe('#4610 — le nom d’un contact de la carte mène à sa fiche', () => {
  it('un contact avec `href` est un lien vers /contacts/:id, un contact sans fiche reste du texte', async () => {
    renderWithRouter(
      <StructuredReply
        text={fence({
          type: 'contact_list',
          title: 'Qui contacter',
          items: [
            { name: 'Caroline Jaouen', role: 'DSI', href: `/contacts/${ID}` },
            { name: 'Sans Fiche', role: 'DSI adjoint' },
          ],
        })}
      />,
    )
    const card = await screen.findByRole('group', { name: 'Qui contacter' })
    expect(within(card).getByRole('link', { name: 'Caroline Jaouen' })).toHaveAttribute('href', `/contacts/${ID}`)
    expect(within(card).queryByRole('link', { name: 'Sans Fiche' })).toBeNull()
    expect(within(card).getByText('Sans Fiche')).toBeInTheDocument()
  })

  // #4610 PARTIAL (prod 27/10, EXOTEC) — dix « Arnaud — nom à confirmer » sans aucun lien : une ligne non cliquable
  // DIT pourquoi (jamais un nom qui a l'air d'un lien et ne l'est pas), et une ligne à fiche est TOUJOURS un lien.
  it('une ligne à prénom seul sans lien dit pourquoi ; celle qui a sa fiche est un lien', async () => {
    renderWithRouter(
      <StructuredReply
        text={fence({
          type: 'contact_list',
          title: 'Interlocuteurs',
          items: [
            { name: 'Arnaud — nom à confirmer', role: 'DSI', href: `/contacts/${ID}` },
            { name: 'Arnaud — nom à confirmer', role: 'Achats' },
          ],
        })}
      />,
    )
    const card = await screen.findByRole('group', { name: 'Interlocuteurs' })
    expect(within(card).getAllByRole('link')).toHaveLength(1)
    // Chaque ligne annoncée est soit un lien, soit accompagnée de sa raison : le compte des deux fait le total.
    const reasons = within(card).getAllByText(/fiche/i)
    expect(reasons).toHaveLength(1)
  })

  it('un nom complet sans fiche ne porte pas de raison (on n’explique que ce qu’on sait expliquer)', async () => {
    renderWithRouter(
      <StructuredReply
        text={fence({ type: 'contact_list', title: 'Un seul', items: [{ name: 'Sans Fiche', role: 'DSI adjoint' }] })}
      />,
    )
    const card = await screen.findByRole('group', { name: 'Un seul' })
    expect(within(card).queryByText(/prénom seul/i)).toBeNull()
  })
})

// #4610.7 / #4610.4 — le COMPTE cité sur la ligne est un lien vers /accounts/:id (posé par le serveur), au clavier
// et au doigt : on TABULE d'une cible à l'autre et on lit la taille minimale qu'elles déclarent (jsdom ne mesure pas).
describe('#4610.7 — le compte cité dans la carte Contacts mène à sa fiche', () => {
  const ACCOUNT = '5e1b7a30-1111-4222-8333-444455556666'
  const card = {
    type: 'contact_list',
    title: 'Interlocuteurs',
    items: [
      {
        name: 'Caroline Jaouen',
        role: 'DSI',
        company: 'UNEO',
        href: `/contacts/${ID}`,
        company_href: `/accounts/${ACCOUNT}`,
      },
      { name: 'Sans Fiche', role: 'DSI adjoint', company: 'Libre' },
    ],
  }

  it('le nom du compte est un lien ; sans `company_href` il reste du texte', async () => {
    renderWithRouter(<StructuredReply text={fence(card)} />)
    const group = await screen.findByRole('group', { name: 'Interlocuteurs' })
    expect(within(group).getByRole('link', { name: 'UNEO' })).toHaveAttribute('href', `/accounts/${ACCOUNT}`)
    expect(within(group).queryByRole('link', { name: 'Libre' })).toBeNull()
    expect(within(group).getByText(/Libre/)).toBeInTheDocument()
  })

  it('se tabule dans l’ordre (contact puis compte) et déclare une cible ≥ 44 px au doigt', async () => {
    const user = userEvent.setup()
    renderWithRouter(<StructuredReply text={fence(card)} />)
    const group = await screen.findByRole('group', { name: 'Interlocuteurs' })
    const person = within(group).getByRole('link', { name: 'Caroline Jaouen' })
    const account = within(group).getByRole('link', { name: 'UNEO' })
    await user.tab()
    while (document.activeElement !== person && document.activeElement !== document.body) await user.tab()
    expect(person).toHaveFocus()
    await user.tab()
    expect(account).toHaveFocus()
    for (const link of [person, account]) expect(link.className).toContain('pointer-coarse:min-h-11')
  })

  it('aucune couleur hexadécimale dans la ligne rendue (GA-33) : les jetons de thème seulement', async () => {
    renderWithRouter(<StructuredReply text={fence(card)} />)
    const group = await screen.findByRole('group', { name: 'Interlocuteurs' })
    const className = within(group).getByRole('link', { name: 'UNEO' }).className
    expect(className).toContain('var(--bellum-')
    expect(className).not.toMatch(/#[0-9a-f]{3,8}/i)
  })
})
