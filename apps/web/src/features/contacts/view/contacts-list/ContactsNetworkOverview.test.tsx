import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ContactsNetworkOverview } from './ContactsNetworkOverview'

const base = {
  total: 79,
  counts: { withEmail: 22, withPhone: 9, unattached: 0 },
  channel: null,
  unattachedActive: false,
  onChannelChange: () => {},
  onUnattachedChange: () => {},
}

// Théo B c1-repertoire.R5 — « Un réseau à faire vivre » : le total + trois tuiles qui filtrent au clic.
describe('ContactsNetworkOverview — c1-repertoire.R5', () => {
  it('titre, total et trois tuiles chiffrées', () => {
    render(<ContactsNetworkOverview {...base} />)
    expect(screen.getByText('Un réseau à faire vivre')).toBeInTheDocument()
    expect(screen.getByText('79')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Avec e-mail/ })).toHaveTextContent('22')
    expect(screen.getByRole('button', { name: /Avec téléphone/ })).toHaveTextContent('9')
  })

  it('D-3 — jamais « 00 » ni « 09 » : 9 s’écrit 9, un vrai zéro s’écrit 0', () => {
    render(<ContactsNetworkOverview {...base} />)
    expect(screen.queryByText('09')).not.toBeInTheDocument()
    expect(screen.queryByText('00')).not.toBeInTheDocument()
    // Théo `.v13-stat` — le chiffre est suivi de sa légende (« Compte à préciser »).
    expect(screen.getByRole('button', { name: /À rattacher/ })).toHaveTextContent(/À rattacher0Compte à préciser/)
  })

  it('un compte non connu (page partielle) ne s’affiche pas, et n’est jamais « 0 »', () => {
    render(
      <ContactsNetworkOverview
        {...base}
        counts={{ withEmail: undefined, withPhone: undefined, unattached: undefined }}
      />,
    )
    const tile = screen.getByRole('button', { name: /Avec e-mail/ })
    expect(tile).not.toHaveTextContent(/\d/)
  })

  it('le clic filtre : e-mail, téléphone, à rattacher — un second clic retire le filtre', async () => {
    const onChannelChange = vi.fn()
    const onUnattachedChange = vi.fn()
    const { rerender } = render(
      <ContactsNetworkOverview {...base} onChannelChange={onChannelChange} onUnattachedChange={onUnattachedChange} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /Avec e-mail/ }))
    expect(onChannelChange).toHaveBeenLastCalledWith('with_email')
    await userEvent.click(screen.getByRole('button', { name: /Avec téléphone/ }))
    expect(onChannelChange).toHaveBeenLastCalledWith('with_phone')
    await userEvent.click(screen.getByRole('button', { name: /À rattacher/ }))
    expect(onUnattachedChange).toHaveBeenLastCalledWith(true)

    rerender(
      <ContactsNetworkOverview
        {...base}
        channel="with_email"
        onChannelChange={onChannelChange}
        onUnattachedChange={onUnattachedChange}
      />,
    )
    expect(screen.getByRole('button', { name: /Avec e-mail/ })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: /Avec e-mail/ }))
    expect(onChannelChange).toHaveBeenLastCalledWith(null)
  })

  it('total inconnu : le total ne s’affiche pas', () => {
    render(<ContactsNetworkOverview {...base} total={undefined} />)
    expect(screen.queryByText('79')).not.toBeInTheDocument()
  })

  // #4601 — « 5727 » faisait 121 px dans une boîte de 93 px (le chiffre, élément flex rétrécissable, était écrasé
  // par le texte voisin) : le chiffre ne rétrécit JAMAIS, c'est la boîte qui s'élargit à son contenu.
  it('#4601 — le grand chiffre ne rétrécit pas : cinq chiffres tiennent dans leur boîte', () => {
    render(<ContactsNetworkOverview {...base} total={5727} />)
    expect(screen.getByTestId('contacts-overview-total').className).toContain('shrink-0')
  })

  // #4601 — l'en-tête dit de quoi il parle : tout le répertoire, ou la vue filtrée.
  it('#4601 — la légende du chiffre nomme la population comptée', () => {
    const { rerender } = render(<ContactsNetworkOverview {...base} />)
    expect(screen.getByTestId('contacts-overview-total')).toHaveAccessibleName('79 contacts dans tout le répertoire')
    expect(screen.getByText('dans tout le répertoire')).toBeInTheDocument()
    rerender(<ContactsNetworkOverview {...base} filtered />)
    expect(screen.getByTestId('contacts-overview-total')).toHaveAccessibleName(
      '79 contacts correspondant à tes filtres',
    )
    expect(screen.getByText('correspondant à tes filtres')).toBeInTheDocument()
  })

  // #4493.4 — quatre compteurs cliquables : le total est un BOUTON comme les trois tuiles (focus clavier, GA-35).
  it('#4493.4 — les quatre compteurs sont des boutons focusables au clavier', async () => {
    const onTotalSelect = vi.fn()
    render(<ContactsNetworkOverview {...base} onTotalSelect={onTotalSelect} />)
    const buttons = screen.getByTestId('contacts-network-overview').querySelectorAll('button')
    expect(buttons).toHaveLength(4)
    for (const button of buttons) expect(button.tabIndex).toBeGreaterThanOrEqual(0)
    const total = screen.getByTestId('contacts-overview-total')
    expect(total.tagName).toBe('BUTTON')
    total.focus()
    expect(total).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(onTotalSelect).toHaveBeenCalledTimes(1)
  })

  // #4503.2 — « 828 dans tout le répertoire » contredisait « Tous 66746 / Recommandés 828 » sur le même écran.
  it('#4503.2 — le total des recommandés ne se dit JAMAIS « tout le répertoire »', () => {
    render(<ContactsNetworkOverview {...base} total={828} scope="recommended" />)
    expect(screen.queryByText(/tout le répertoire/)).not.toBeInTheDocument()
    expect(screen.getByTestId('contacts-overview-total')).toHaveAccessibleName(/828 contacts recommandés/)
  })

  // #4613 — cinq pastilles d'initiales sans libellé ni règle : un échantillon sans règle dite se lit comme un classement.
  it('#4613 — aucune pastille d’initiales sans nom accessible : elles ne sont pas rendues', () => {
    render(<ContactsNetworkOverview {...base} />)
    expect(screen.queryByTestId('contacts-overview-people')).not.toBeInTheDocument()
    const section = screen.getByTestId('contacts-network-overview')
    for (const image of section.querySelectorAll('img, [role="img"]')) {
      expect(image.getAttribute('aria-label') ?? image.getAttribute('alt')).toBeTruthy()
    }
  })
})
