import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ConversationMenu } from './ConversationMenu'

/** #3775.1 — les trois anciens déclencheurs vivent désormais dans UN menu « Conversation » : on l'ouvre, puis l'onglet. */
async function openTab(name: string): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: 'Conversation' }))
  await userEvent.click(await screen.findByRole('tab', { name }))
}

/** Même faux `matchMedia` que `SidebarCollapse.test.tsx` — jsdom ne l'implémente pas. */
function stubMatchMedia(narrow: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: narrow && query.includes('max-width'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  )
}

const useWorkspaceMembersMock = vi.hoisted(() => vi.fn())
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => useWorkspaceMembersMock(),
}))

/**
 * #1940.3 — « Voir les participants » : le fil est team-scopé (pas de droit
 * sélectif par personne), donc ce panneau dit la chose vraie — tout l'espace
 * peut lire ce fil — et liste QUI ça désigne (`useWorkspaceMembers`, mocké ici
 * comme `ActionPlanBoard.test.tsx` le fait déjà pour le même hook).
 */
describe('ParticipantsPanel', () => {
  beforeEach(() => {
    useWorkspaceMembersMock.mockReset()
  })

  it('does not read the roster before the panel is opened', async () => {
    useWorkspaceMembersMock.mockReturnValue({ data: [], isLoading: false, isError: false })
    renderWithRouter(<ConversationMenu accountId={null} conversationId="c-1" hasExchange={false} sources={[]} />)
    await screen.findByRole('button', { name: 'Conversation' })
    expect(useWorkspaceMembersMock).not.toHaveBeenCalled()
  })

  it('lists the roster once opened, and marks the caller', async () => {
    useWorkspaceMembersMock.mockReturnValue({
      data: [
        { userId: 'u-1', email: 'alice@ex.com', fullName: 'Alice Martin', role: 'owner', isSelf: true },
        { userId: 'u-2', email: 'bob@ex.com', fullName: 'Bob Petit', role: 'member', isSelf: false },
      ],
      isLoading: false,
      isError: false,
    })
    renderWithRouter(<ConversationMenu accountId={null} conversationId="c-1" hasExchange={false} sources={[]} />)

    await openTab('Accès')

    expect(await screen.findByText('Alice Martin')).toBeInTheDocument()
    expect(screen.getByText('Bob Petit')).toBeInTheDocument()
    expect(screen.getByText('Toi')).toBeInTheDocument()
  })

  it('names a member with no profile row rather than showing a blank line', async () => {
    useWorkspaceMembersMock.mockReturnValue({
      data: [{ userId: 'u-3', email: null, fullName: null, role: 'member', isSelf: false }],
      isLoading: false,
      isError: false,
    })
    renderWithRouter(<ConversationMenu accountId={null} conversationId="c-1" hasExchange={false} sources={[]} />)
    await openTab('Accès')

    expect(await screen.findByText('Membre sans nom')).toBeInTheDocument()
  })

  it('says the read failed rather than showing an empty roster', async () => {
    useWorkspaceMembersMock.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    renderWithRouter(<ConversationMenu accountId={null} conversationId="c-1" hasExchange={false} sources={[]} />)
    await openTab('Accès')

    expect(
      await screen.findByText(
        'La liste des membres n’a pas pu être lue. La règle ne change pas : tous les membres de l’espace peuvent lire ce fil.',
      ),
    ).toBeInTheDocument()
  })
})

/**
 * #2112 — RECETTE IPHONE DU 25/09 : L'EN-TÊTE « RÉSUMÉ / PARTICIPANTS »
 * DÉBORDE À DROITE SOUS 768PX. Voir la note de tête sur ce même mécanisme
 * dans `ConversationSummaryPanel.test.tsx`.
 */
describe('#2112 — sous 768px, le déclencheur devient icône seule et nommée', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('garde son texte visible sous 768px (ligne du menu ⋯, revient sur #2112 par #5047)', async () => {
    stubMatchMedia(true)
    useWorkspaceMembersMock.mockReturnValue({ data: [], isLoading: false, isError: false })
    renderWithRouter(<ConversationMenu accountId={null} conversationId="c-1" hasExchange={false} sources={[]} />)

    const trigger = await screen.findByRole('button', { name: 'Conversation' })
    expect(trigger.textContent).toBe('Conversation')
  })

  it('garde son texte visible sur le bureau — non-régression', async () => {
    stubMatchMedia(false)
    useWorkspaceMembersMock.mockReturnValue({ data: [], isLoading: false, isError: false })
    renderWithRouter(<ConversationMenu accountId={null} conversationId="c-1" hasExchange={false} sources={[]} />)

    const trigger = await screen.findByRole('button', { name: 'Conversation' })
    expect(trigger.textContent).toBe('Conversation')
    expect(trigger).not.toHaveAttribute('aria-label')
  })
})
