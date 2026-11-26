import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Contact } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { ContactChannelMenu } from './ContactChannelMenu'

// Radix menus need these pointer APIs, which jsdom doesn't implement.
beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

const user = () => userEvent.setup({ pointerEventsCheck: 0 })

const DAY_MS = 86_400_000
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString()

/** Contact joignable par email, mais sans téléphone ni LinkedIn — le cas exact
 *  du bug de prod (Apollo remplit l'email et jamais le reste). */
const contact = {
  id: 'c-1',
  account_id: 'acc-1',
  full_name: 'Alice Martin',
  email: 'alice@acme.co',
  phone: null,
  linkedin_url: null,
} as unknown as Contact

const openMenu = async () => {
  await user().click(screen.getByRole('button', { name: /Contacter/ }))
}

describe('ContactChannelMenu', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  // Théo B C5.A24 — SMS, WhatsApp et message vocal sont retirés du menu « Contacter ».
  it('#2370 — propose la note LinkedIn même sans coordonnée, et plus ni SMS, ni WhatsApp, ni message vocal', async () => {
    render(<ContactChannelMenu contact={contact} enrichmentCredits={5} isLoading={false} onChannelSelect={vi.fn()} />)
    await openMenu()
    expect(await screen.findByRole('menuitem', { name: /note de connexion|invitation/i })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /SMS/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /WhatsApp/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /message vocal/i })).not.toBeInTheDocument()
  })

  it('offers the completion action and reports the chosen force flag', async () => {
    const onEnrich = vi.fn()
    render(
      <ContactChannelMenu
        contact={contact}
        enrichmentCredits={5}
        isLoading={false}
        onChannelSelect={vi.fn()}
        onEnrich={onEnrich}
      />,
    )
    await openMenu()

    const item = await screen.findByText('Compléter les infos manquantes')
    await user().click(item)
    // Le menu ne débite pas : il demande à l'appelant d'ouvrir la confirmation.
    expect(onEnrich).toHaveBeenCalledWith({ force: false })
  })

  it('greys the completion out when the enrichment balance is empty', async () => {
    const onEnrich = vi.fn()
    render(
      <ContactChannelMenu
        contact={contact}
        enrichmentCredits={0}
        isLoading={false}
        onChannelSelect={vi.fn()}
        onEnrich={onEnrich}
      />,
    )
    await openMenu()

    const item = await screen.findByText(/beaucoup utilisé/)
    expect(item.closest('[role="menuitem"]')).toHaveAttribute('aria-disabled', 'true')
    await user().click(item)
    expect(onEnrich).not.toHaveBeenCalled()
  })

  // #2091 — le solde arrive par `useCredits()`, `undefined` tant qu'il n'est
  // pas chargé (jamais `0` — voir sa JSDoc « never a zero »). Avant ce lot, le
  // menu recevait ce `undefined` défauté à `0` par l'appelant et affichait
  // « Plus de crédits d'enrichissement » PENDANT le chargement — une fausse
  // affirmation, pas une mesure.
  it('#2091 — solde non mesuré (chargement) : dit qu’on vérifie, jamais « plus de crédits »', async () => {
    const onEnrich = vi.fn()
    render(
      <ContactChannelMenu
        contact={contact}
        enrichmentCredits={undefined}
        isLoading={false}
        onChannelSelect={vi.fn()}
        onEnrich={onEnrich}
      />,
    )
    await openMenu()

    expect(screen.queryByText(/beaucoup utilisé/)).not.toBeInTheDocument()
    const item = await screen.findByText('Vérification du solde…')
    expect(item.closest('[role="menuitem"]')).toHaveAttribute('aria-disabled', 'true')
    await user().click(item)
    expect(onEnrich).not.toHaveBeenCalled()
  })

  it('stops re-inviting to pay after a recent attempt that found nothing', async () => {
    const onEnrich = vi.fn()
    render(
      <ContactChannelMenu
        contact={
          {
            ...contact,
            last_enrichment_at: daysAgo(3),
            last_enrichment_result: 'no_new_data',
            last_enrichment_missing: ['linkedin', 'phone'],
          } as unknown as Contact
        }
        enrichmentCredits={5}
        isLoading={false}
        onChannelSelect={vi.fn()}
        onEnrich={onEnrich}
      />,
    )
    await openMenu()

    // Libellé explicite + grisé : on dit POURQUOI c'est inutile.
    const spent = await screen.findByText(/Déjà enrichi le/)
    expect(spent.closest('[role="menuitem"]')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.queryByText('Compléter les infos manquantes')).not.toBeInTheDocument()

    // …mais jamais un cul-de-sac : la relance explicite reste offerte, coût annoncé.
    await user().click(screen.getByText('Réessayer quand même'))
    expect(onEnrich).toHaveBeenCalledWith({ force: true })
  })

  it('keeps proposing enrichment when the last attempt DID find something', async () => {
    render(
      <ContactChannelMenu
        contact={
          {
            ...contact,
            last_enrichment_at: daysAgo(1),
            last_enrichment_result: 'matched',
            last_enrichment_missing: ['linkedin', 'phone'],
          } as unknown as Contact
        }
        enrichmentCredits={5}
        isLoading={false}
        onChannelSelect={vi.fn()}
        onEnrich={vi.fn()}
      />,
    )
    await openMenu()

    expect(await screen.findByText('Compléter les infos manquantes')).toBeInTheDocument()
  })

  it('hides the completion entirely once every channel is filled', async () => {
    render(
      <ContactChannelMenu
        contact={{ ...contact, phone: '+33600000000', linkedin_url: 'https://li/x' } as unknown as Contact}
        enrichmentCredits={5}
        isLoading={false}
        onChannelSelect={vi.fn()}
        onEnrich={vi.fn()}
      />,
    )
    await openMenu()

    expect(await screen.findByText(/Canaux disponibles/)).toBeInTheDocument()
    expect(screen.queryByText('Compléter les infos manquantes')).not.toBeInTheDocument()
  })

  // #2629.2 — LinkedIn seul ne se lit plus comme un menu « Canaux
  // disponibles » ordinaire : le libellé nomme le repli.
  it('#2629.2 — nomme LinkedIn comme SEUL canal, au lieu du libellé générique', async () => {
    render(
      <ContactChannelMenu
        contact={{ ...contact, email: null, linkedin_url: 'https://li/alice' } as unknown as Contact}
        enrichmentCredits={5}
        isLoading={false}
        onChannelSelect={vi.fn()}
        onEnrich={vi.fn()}
      />,
    )
    await openMenu()

    expect(await screen.findByText('Seul canal disponible : LinkedIn')).toBeInTheDocument()
    expect(screen.queryByText('Canaux disponibles')).not.toBeInTheDocument()
  })

  // #3693.2 — « Compléter les infos manquantes » sort du menu Contacter de la
  // fiche : l'appelant qui ne fournit pas `onEnrich` n'a pas l'item, Enrichir
  // reste un geste distinct (bouton dédié).
  it('#3693.2 — sans `onEnrich`, le menu ne propose aucun enrichissement', async () => {
    render(<ContactChannelMenu contact={contact} enrichmentCredits={5} isLoading={false} onChannelSelect={vi.fn()} />)
    await openMenu()

    expect(await screen.findByText(/Canaux disponibles/)).toBeInTheDocument()
    expect(screen.queryByText('Compléter les infos manquantes')).not.toBeInTheDocument()
  })

  // #3693.1 — préparer un appel / un message nomment ce qu'ils font.
  it('#3693.1 — libellés fidèles : « Préparer un email », « Préparer mon appel », « Préparer un message LinkedIn »', async () => {
    render(
      <ContactChannelMenu
        contact={{ ...contact, phone: '+33102030405', linkedin_url: 'https://li/alice' } as unknown as Contact}
        enrichmentCredits={5}
        isLoading={false}
        onChannelSelect={vi.fn()}
      />,
    )
    await openMenu()

    expect(await screen.findByText('Préparer un email')).toBeInTheDocument()
    expect(screen.getByText('Préparer un message LinkedIn')).toBeInTheDocument()
    expect(screen.getByText('Préparer mon appel')).toBeInTheDocument()
  })

  // #3693.1 — « Ajouter à une séquence » ne fait qu'OUVRIR le choix : le menu
  // n'inscrit ni n'active rien lui-même.
  it('#3693.1 — « Ajouter à une séquence » appelle uniquement `onAddToSequence`', async () => {
    const onAddToSequence = vi.fn()
    const onChannelSelect = vi.fn()
    render(
      <ContactChannelMenu
        contact={contact}
        enrichmentCredits={5}
        isLoading={false}
        onChannelSelect={onChannelSelect}
        onAddToSequence={onAddToSequence}
      />,
    )
    await openMenu()
    await user().click(await screen.findByText('Ajouter à une séquence'))

    expect(onAddToSequence).toHaveBeenCalledTimes(1)
    expect(onChannelSelect).not.toHaveBeenCalled()
  })

  it('#3693.1 — sans `onAddToSequence`, l’item n’existe pas (liste de contacts du compte inchangée)', async () => {
    render(<ContactChannelMenu contact={contact} enrichmentCredits={5} isLoading={false} onChannelSelect={vi.fn()} />)
    await openMenu()
    await screen.findByText(/Canaux disponibles/)
    expect(screen.queryByText('Ajouter à une séquence')).not.toBeInTheDocument()
  })

  // Théo B c5-fiche-contact.A8 — « Ajouter au plan » vit dans le menu « Contacter » ; il pose la ligne, rien d'autre.
  it('A8 — « Ajouter au plan » appelle uniquement `onAddToPlan` ; absent sans le prop', async () => {
    const onAddToPlan = vi.fn()
    const onChannelSelect = vi.fn()
    const { unmount } = render(
      <ContactChannelMenu
        contact={contact}
        enrichmentCredits={5}
        isLoading={false}
        onChannelSelect={onChannelSelect}
        onAddToPlan={onAddToPlan}
      />,
    )
    await openMenu()
    await user().click(await screen.findByText('Ajouter au plan'))
    expect(onAddToPlan).toHaveBeenCalledTimes(1)
    expect(onChannelSelect).not.toHaveBeenCalled()
    unmount()

    render(<ContactChannelMenu contact={contact} enrichmentCredits={5} isLoading={false} onChannelSelect={vi.fn()} />)
    await openMenu()
    await screen.findByText(/Canaux disponibles/)
    expect(screen.queryByText('Ajouter au plan')).not.toBeInTheDocument()
  })

  it("#4474 — l'icône ne chevauche pas le libellé : bouton, icône et chevron ne rétrécissent pas, un écart réel les sépare", () => {
    render(<ContactChannelMenu contact={contact} enrichmentCredits={5} isLoading={false} onChannelSelect={vi.fn()} />)
    const button = screen.getByRole('button', { name: /Contacter/ })
    expect(button.className).toContain('shrink-0')
    expect(button.className).toContain('gap-2')
    const [leading, chevron] = Array.from(button.querySelectorAll('svg'))
    expect(leading?.getAttribute('class')).toContain('shrink-0')
    expect(chevron?.getAttribute('class')).toContain('shrink-0')
  })
})
