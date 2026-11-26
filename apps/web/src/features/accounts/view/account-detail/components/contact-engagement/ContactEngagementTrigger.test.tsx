import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Contact } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { ContactEngagementTrigger } from './ContactEngagementTrigger'

// Radix tooltips/menus need these pointer APIs, which jsdom doesn't implement.
beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

const user = () => userEvent.setup({ pointerEventsCheck: 0 })

/** Aucun canal connu (pas d'email, ni téléphone, ni LinkedIn) : le trigger
 *  rend `EnrichOnlyButton`, jamais le menu `ContactChannelMenu`. */
const contactNoChannel = {
  id: 'c-1',
  account_id: 'acc-1',
  full_name: 'Alice Martin',
  email: null,
  phone: null,
  linkedin_url: null,
} as unknown as Contact

/** #2629.2 — seul LinkedIn est connu (ni email, ni téléphone) : le repli doit
 *  se NOMMER à l'écran, pas juste se déduire d'une liste à un seul item. */
const contactLinkedinOnly = {
  id: 'c-2',
  account_id: 'acc-1',
  full_name: 'Bruno Petit',
  email: null,
  phone: null,
  linkedin_url: 'https://www.linkedin.com/in/bruno-petit',
} as unknown as Contact

describe('ContactEngagementTrigger — EnrichOnlyButton', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  // #2091 — `enrichmentCredits` vient de `useCredits()`, `undefined` tant que
  // le solde n'est pas mesuré (jamais un `0` de repli). Avant ce lot, ce
  // composant traitait `undefined <= 0` comme faux (donc pas bloquant) MAIS
  // son appelant défautait déjà à `0` avant de le lui passer, ce qui affichait
  // la même infobulle mensongère « plus de crédits d'enrichissement ».
  it('#2091 — solde non mesuré : l’infobulle dit qu’on vérifie, jamais « plus de crédits »', async () => {
    render(
      <ContactEngagementTrigger
        contact={contactNoChannel}
        enrichmentCredits={undefined}
        isLoading={false}
        onChannelSelect={vi.fn()}
        onEnrich={vi.fn()}
      />,
    )
    const button = screen.getByRole('button', { name: 'Enrichir' })
    await user().hover(button)

    // Le contenu radix se rend deux fois (visible + accessible caché) : on
    // vérifie sa PRÉSENCE, pas l'unicité du nœud.
    expect((await screen.findAllByText('Vérification du solde…')).length).toBeGreaterThan(0)
    expect(screen.queryByText(/beaucoup utilisé/)).not.toBeInTheDocument()
  })

  it('#2091 — solde non mesuré : le clic n’enrichit pas', async () => {
    const onEnrich = vi.fn()
    render(
      <ContactEngagementTrigger
        contact={contactNoChannel}
        enrichmentCredits={undefined}
        isLoading={false}
        onChannelSelect={vi.fn()}
        onEnrich={onEnrich}
      />,
    )
    await user().click(screen.getByRole('button', { name: 'Enrichir' }))
    expect(onEnrich).not.toHaveBeenCalled()
  })

  it('solde MESURÉ à zéro : garde l’infobulle « plus de crédits »', async () => {
    render(
      <ContactEngagementTrigger
        contact={contactNoChannel}
        enrichmentCredits={0}
        isLoading={false}
        onChannelSelect={vi.fn()}
        onEnrich={vi.fn()}
      />,
    )
    const button = screen.getByRole('button', { name: 'Enrichir' })
    await user().hover(button)

    expect((await screen.findAllByText(/beaucoup utilisé/)).length).toBeGreaterThan(0)
  })
})

describe('ContactEngagementTrigger — #2629.2 le repli de canal se nomme', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it("nomme LinkedIn comme SEUL canal — pas juste un menu qui n'affiche que lui", async () => {
    render(
      <ContactEngagementTrigger
        contact={contactLinkedinOnly}
        enrichmentCredits={5}
        isLoading={false}
        onChannelSelect={vi.fn()}
        onEnrich={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /Contacter/ })).toBeInTheDocument()
    expect(screen.getByText('À approcher via LinkedIn — aucun e-mail ni téléphone connu')).toBeInTheDocument()
  })

  // #3064 (retour bêta, 26/09/2026) — Louis : « supprime » sur la mention
  // « Aucun canal connu pour ce contact ». Le bouton « Enrichir » reste le
  // seul geste proposé ; la redite disparaît.
  it("propose Enrichir sans redite quand aucun canal n'est connu", async () => {
    render(
      <ContactEngagementTrigger
        contact={contactNoChannel}
        enrichmentCredits={5}
        isLoading={false}
        onChannelSelect={vi.fn()}
        onEnrich={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Enrichir' })).toBeInTheDocument()
    expect(screen.queryByText('Aucun canal connu pour ce contact')).not.toBeInTheDocument()
  })

  // LUDOVIC-C LC.5 — la liste des contacts du compte n'offrait que « Voir la fiche » / « Enrichir » :
  // « Préparer mon appel » existait sur la fiche contact, pas dans la liste (même composant).
  it('LC.5 — sans aucun canal, « Préparer mon appel » est offert à côté d’Enrichir et ouvre le canal phone', async () => {
    const onChannelSelect = vi.fn()
    render(
      <ContactEngagementTrigger
        contact={contactNoChannel}
        enrichmentCredits={5}
        isLoading={false}
        onChannelSelect={onChannelSelect}
        onEnrich={vi.fn()}
      />,
    )
    await user().click(screen.getByRole('button', { name: 'Préparer mon appel' }))
    expect(onChannelSelect).toHaveBeenCalledWith('phone')
    expect(screen.getByRole('button', { name: 'Enrichir' })).toBeInTheDocument()
  })
})
