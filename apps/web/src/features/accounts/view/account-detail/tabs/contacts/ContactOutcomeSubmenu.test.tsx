import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, vi } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@bellum/ui'
import { ContactOutcomeSubmenu } from './ContactOutcomeSubmenu'

const { mutate, mockHook } = vi.hoisted(() => ({ mutate: vi.fn(), mockHook: vi.fn() }))
vi.mock('@/features/contacts/hooks/useUpdateContactStatus', () => ({
  useUpdateContactStatus: () => mockHook(),
}))

// Radix menus need these pointer APIs, which jsdom doesn't implement.
beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  mutate.mockReset()
  mockHook.mockReset()
})

function contactWith(user_status: Contact['user_status']): Contact {
  return { id: 'c1', account_id: 'acc-1', full_name: 'Camille Roux', user_status } as Contact
}

/** Ouvre le menu, déplie le sous-menu, et rend l'item DEMANDÉ, fraîchement
 *  requêté.
 *
 *  ⚠️ Le clic passe par `fireEvent` et non par `userEvent` : la séquence de
 *  pointeur de ce dernier fait re-rendre le contenu du sous-menu Radix, si bien
 *  que le nœud trouvé juste avant est DÉTACHÉ quand le clic arrive — le geste
 *  semblait alors ne rien déclencher, alors que le composant était correct. */
async function openOutcome(contact: Contact, label: string): Promise<HTMLElement> {
  const user = userEvent.setup({ pointerEventsCheck: 0 })
  mockHook.mockReturnValue({ mutate, isPending: false })
  render(
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger>menu</DropdownMenuTrigger>
      <DropdownMenuContent>
        <ContactOutcomeSubmenu contact={contact} />
      </DropdownMenuContent>
    </DropdownMenu>,
  )
  await user.click(screen.getByText('Où en est ce contact ?'))
  await screen.findByText(label)
  return screen.getByRole('menuitem', { name: label })
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER GARDE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le geste qui manquait. `PATCH /contacts/:id/status` était livré et complet
 * côté serveur — il avance le statut, met en pause les séquences de relance,
 * pose le repère de replanification — `contactsApi.updateStatus` existait côté
 * client, et **aucun écran n'appelait ni l'un ni l'autre**.
 *
 * Faute de ce clic, les compteurs `response_received` / `rdv_obtained` — lus par
 * les statistiques de la semaine, les KPIs d'équipe et le flux d'activité — ne
 * pouvaient PAS être écrits. Leur « 0 » ne mesurait donc pas une
 * contre-performance : il mesurait une absence de moyen.
 *
 * Ce fichier vérifie que le chemin est réellement ATTEIGNABLE au clic.
 */
describe('ContactOutcomeSubmenu — le geste qui manquait', () => {
  it('déclare « a répondu » — le compteur `response_received` a enfin un écrivain', async () => {
    const item = await openOutcome(contactWith('contacted'), 'A répondu')
    fireEvent.click(item)

    expect(mutate).toHaveBeenCalledWith({
      id: 'c1',
      account_id: 'acc-1',
      full_name: 'Camille Roux',
      status: 'replied',
    })
  })

  it('déclare « rendez-vous décroché » — l’autre compteur sans écrivain', async () => {
    const item = await openOutcome(contactWith('replied'), 'Rendez-vous décroché')
    fireEvent.click(item)

    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ status: 'meeting' }))
  })

  it('n’offre pas de re-déclarer l’état déjà porté — un re-clic n’est pas un second RDV', async () => {
    // Sans cette garde, re-choisir « Rendez-vous » sur un contact déjà en
    // rendez-vous écrirait un événement de plus à chaque clic, et le compteur
    // deviendrait auto-gonflable. Radix marque l'item `aria-disabled` — un fait
    // du DOM, indépendant de la CSS que jsdom n'applique pas.
    const item = await openOutcome(contactWith('meeting'), 'Rendez-vous décroché')
    expect(item).toHaveAttribute('aria-disabled', 'true')
  })

  it('n’expose pas « Nouveau » : c’est l’état de départ, pas une issue qu’on déclare', async () => {
    await openOutcome(contactWith('contacted'), 'A répondu')
    expect(screen.queryByRole('menuitem', { name: 'Nouveau' })).not.toBeInTheDocument()
  })
})
