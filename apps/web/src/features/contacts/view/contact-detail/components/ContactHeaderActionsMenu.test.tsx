import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Contact } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { useCredits } from '@/features/credits/hooks/useCredits'
import { useEnrichContact } from '@/features/contacts/hooks/useEnrichContact'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ContactHeader } from './ContactHeader'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn(), warning: vi.fn() } }))
vi.mock('@/features/credits/hooks/useCredits', () => ({ useCredits: vi.fn() }))
vi.mock('@/features/contacts/hooks/useEnrichContact', () => ({ useEnrichContact: vi.fn() }))

const { hideMutate, addAction } = vi.hoisted(() => ({ hideMutate: vi.fn(), addAction: vi.fn() }))
vi.mock('@/features/contacts/hooks/useHideContact', () => ({
  useHideContact: () => ({ mutate: hideMutate, isPending: false }),
}))
vi.mock('@/features/accounts/hooks/usePersistAccountPlan', () => ({
  usePersistAccountPlan: () => ({ addAction, isPending: false }),
}))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => ({ data: [] }) }))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

const user = () => userEvent.setup({ pointerEventsCheck: 0 })

const contact = {
  id: 'c-1',
  account_id: 'acc-1',
  full_name: 'Alice Martin',
  title: 'DSI',
  entity: 'ACME',
  decision_role: 'technical',
  email: 'alice@acme.co',
  phone: null,
  linkedin_url: 'https://www.linkedin.com/in/alice-martin',
} as unknown as Contact

/** Les actions d'AUJOURD'HUI de la pile (inventaire #4331.2) : aucune ne disparaît. */
const OTHER_ACTIONS = [/^Notes$/, /Plan d'action/, /Voir sur LinkedIn/, /Masquer/] as const

describe('#4331 — fiche contact : 1 bouton principal « Contacter » + un menu « … »', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    hideMutate.mockClear()
    addAction.mockReset().mockResolvedValue(undefined)
    vi.mocked(useEnrichContact).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      variables: undefined,
    } as unknown as ReturnType<typeof useEnrichContact>)
    vi.mocked(useCredits).mockReturnValue({
      data: { enrichment_credits: 5, credits_remaining: 5 },
      isLoading: false,
    } as unknown as ReturnType<typeof useCredits>)
  })

  it('#4331.1 — l’en-tête n’expose que « Contacter » et « Autres actions » : plus de pile', async () => {
    renderWithRouter(<ContactHeader contact={contact} onGenerateMessage={vi.fn()} onOpenNotes={vi.fn()} />)
    await screen.findByRole('button', { name: /Contacter/ })
    expect(screen.getByRole('button', { name: 'Autres actions' })).toBeInTheDocument()
    for (const name of OTHER_ACTIONS) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument()
    }
  })

  it('#4331.2 — chaque action d’aujourd’hui est atteignable dans « Autres actions »', async () => {
    renderWithRouter(<ContactHeader contact={contact} onGenerateMessage={vi.fn()} onOpenNotes={vi.fn()} />)
    await user().click(await screen.findByRole('button', { name: 'Autres actions' }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: /^Notes$/ })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: /Plan d'action/ })).toBeInTheDocument()
    // #4404.1 — « Compléter » n'est plus dans le menu : il vit à côté de « Contacter » (GA-26).
    expect(within(menu).queryByRole('menuitem', { name: /Enrichir/ })).not.toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: /Masquer/ })).toBeInTheDocument()
    const linkedin = within(menu).getByRole('menuitem', { name: /Voir sur LinkedIn/ })
    expect(linkedin).toHaveAttribute('href', 'https://www.linkedin.com/in/alice-martin')
    expect(linkedin).toHaveAttribute('target', '_blank')
    expect(linkedin).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('#4331.2 — chaque item fait son geste (notes, plan, masquer, compléter)', async () => {
    const onOpenNotes = vi.fn()
    renderWithRouter(<ContactHeader contact={contact} onGenerateMessage={vi.fn()} onOpenNotes={onOpenNotes} />)
    const open = async () => user().click(await screen.findByRole('button', { name: 'Autres actions' }))

    await open()
    await user().click(await screen.findByRole('menuitem', { name: /^Notes$/ }))
    expect(onOpenNotes).toHaveBeenCalledTimes(1)

    await open()
    await user().click(await screen.findByRole('menuitem', { name: /Plan d'action/ }))
    expect(addAction).toHaveBeenCalledTimes(1)

    await open()
    await user().click(await screen.findByRole('menuitem', { name: /Masquer/ }))
    expect(hideMutate).toHaveBeenCalledWith(expect.objectContaining({ contact, hidden: true }))

    // Compléter ouvre la confirmation de coût (portée), il ne débite pas.
    await user().click(await screen.findByRole('button', { name: /Enrichir/ }))
    expect(await screen.findByRole('button', { name: 'Email seulement' })).toBeInTheDocument()
  })

  it('#4331.2 — accessible au clavier : Entrée ouvre, flèches parcourent, Échap ferme et rend le focus', async () => {
    renderWithRouter(<ContactHeader contact={contact} onGenerateMessage={vi.fn()} onOpenNotes={vi.fn()} />)
    const trigger = await screen.findByRole('button', { name: 'Autres actions' })
    trigger.focus()
    await user().keyboard('{Enter}')
    expect(await screen.findByRole('menu')).toBeInTheDocument()
    await user().keyboard('{ArrowDown}')
    expect(screen.getAllByRole('menuitem').some(item => item === document.activeElement)).toBe(true)
    await user().keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('#4331.2 — rien ne disparaît sans l’objet : pas de LinkedIn, pas de Notes, pas d’item', async () => {
    renderWithRouter(
      <ContactHeader contact={{ ...contact, linkedin_url: null } as unknown as Contact} onGenerateMessage={vi.fn()} />,
    )
    await user().click(await screen.findByRole('button', { name: 'Autres actions' }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).queryByRole('menuitem', { name: /LinkedIn/ })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: /^Notes$/ })).not.toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: /Masquer/ })).toBeInTheDocument()
  })

  it('#4331.3 — déclencheur ≥ 44 px, menu borné à la fenêtre, libellés sur une ligne', async () => {
    renderWithRouter(<ContactHeader contact={contact} onGenerateMessage={vi.fn()} onOpenNotes={vi.fn()} />)
    const trigger = await screen.findByRole('button', { name: 'Autres actions' })
    expect(trigger.className).toMatch(/min-h-11/)
    await user().click(trigger)
    const menu = await screen.findByRole('menu')
    expect(menu.className).toMatch(/max-w-\[calc\(100vw-/)
    for (const item of within(menu).getAllByRole('menuitem')) {
      expect(item.className).toMatch(/min-h-11/)
      expect(item.className).toMatch(/whitespace-nowrap/)
    }
  })
})
