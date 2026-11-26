import { beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActionExecuteMenu } from './ActionExecuteMenu'
import type { WorkspaceMember } from '@/features/chat/hooks/useWorkspaceMembers'

// sonner renders portals/toasts we don't care about here — stub it.
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// Radix menus need these pointer APIs, which jsdom doesn't implement.
beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

const members: WorkspaceMember[] = [
  { userId: 'u1', email: 'a@b.co', fullName: 'Alice Martin', role: 'owner', isSelf: true },
  { userId: 'u2', email: 'c@d.co', fullName: 'Bob Durand', role: 'member', isSelf: false },
]

function setClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return writeText
}

const user = () => userEvent.setup({ pointerEventsCheck: 0 })

async function openMenu(u: ReturnType<typeof userEvent.setup>) {
  await u.click(screen.getByRole('button', { name: 'Actions exécutables' }))
}

describe('ActionExecuteMenu', () => {
  it('copies the message to the clipboard', async () => {
    // NB: create the userEvent session *first* — its setup installs its own
    // navigator.clipboard stub, so our spy must be defined afterwards to win.
    const u = user()
    const writeText = setClipboard()
    render(<ActionExecuteMenu copyText="Bonjour Marc, disponible mardi ?" onMarkDone={vi.fn()} />)

    await openMenu(u)
    await u.click(await screen.findByText('Copier le message'))

    expect(writeText).toHaveBeenCalledWith('Bonjour Marc, disponible mardi ?')
  })

  it('fires onMarkDone with the chosen outcome, from the "Marquer fait" submenu (#2396.2/.5)', async () => {
    setClipboard()
    const onMarkDone = vi.fn()
    const u = user()
    render(<ActionExecuteMenu status="todo" copyText="x" onMarkDone={onMarkDone} />)

    await openMenu(u)
    await u.click(await screen.findByText('Marquer fait'))
    await screen.findByText('Positif')
    // #2396 — clic via fireEvent : la séquence pointeur de userEvent re-rend le
    // sous-menu Radix, détachant le nœud trouvé juste avant (même piège que
    // ContactOutcomeSubmenu.test.tsx).
    fireEvent.click(screen.getByRole('menuitem', { name: 'Positif' }))

    expect(onMarkDone).toHaveBeenCalledTimes(1)
    expect(onMarkDone).toHaveBeenCalledWith('positive')
  })

  it('fires onUndoDone (no outcome asked) when the action is already done (#2396.2)', async () => {
    setClipboard()
    const onUndoDone = vi.fn()
    const u = user()
    render(<ActionExecuteMenu status="done" copyText="x" onMarkDone={vi.fn()} onUndoDone={onUndoDone} />)

    await openMenu(u)
    await u.click(await screen.findByText('Annuler « fait »'))

    expect(onUndoDone).toHaveBeenCalledTimes(1)
  })

  it('#2317.12 — marque obsolète, puis bascule vers « remettre à faire » une fois obsolète', async () => {
    setClipboard()
    const onMarkObsolete = vi.fn()
    const u = user()
    const { rerender } = render(
      <ActionExecuteMenu status="todo" copyText="x" onMarkDone={vi.fn()} onMarkObsolete={onMarkObsolete} />,
    )

    await openMenu(u)
    await u.click(await screen.findByText('Marquer obsolète'))
    expect(onMarkObsolete).toHaveBeenCalledTimes(1)

    rerender(<ActionExecuteMenu status="obsolete" copyText="x" onMarkDone={vi.fn()} onMarkObsolete={onMarkObsolete} />)
    await openMenu(u)
    expect(await screen.findByText('Remettre à faire')).toBeInTheDocument()
    expect(screen.queryByText('Marquer obsolète')).not.toBeInTheDocument()
  })

  it('adapte les issues proposées à un rendez-vous (#2396.6)', async () => {
    setClipboard()
    const u = user()
    render(<ActionExecuteMenu status="todo" copyText="x" onMarkDone={vi.fn()} targetKind="meeting" />)

    await openMenu(u)
    await u.click(await screen.findByText('Marquer fait'))

    expect(screen.queryByText('Qualifié')).not.toBeInTheDocument()
    expect(await screen.findByText('Report')).toBeInTheDocument()
  })

  it('renders the snooze and assign entries when wired', async () => {
    setClipboard()
    const u = user()
    render(
      <ActionExecuteMenu
        status="todo"
        copyText="x"
        onMarkDone={vi.fn()}
        onSnooze={vi.fn()}
        onAssign={vi.fn()}
        members={members}
      />,
    )

    await openMenu(u)
    expect(await screen.findByText('Snooze')).toBeInTheDocument()
    expect(screen.getByText('Assigner à…')).toBeInTheDocument()
  })

  it('keeps CRM export disabled with a reason when no CRM is connected', async () => {
    setClipboard()
    const onExport = vi.fn()
    const u = user()
    render(
      <ActionExecuteMenu
        copyText="x"
        onMarkDone={vi.fn()}
        crm={{ onExport, connected: false, disabledReason: 'CRM non connecté' }}
      />,
    )

    await openMenu(u)
    const crmItem = await screen.findByText('Exporter CRM')
    const menuItem = crmItem.closest('[role="menuitem"]')
    expect(menuItem).toHaveAttribute('title', 'CRM non connecté')
    expect(menuItem).toHaveAttribute('data-disabled')

    await u.click(crmItem)
    expect(onExport).not.toHaveBeenCalled()
  })

  it('exports to CRM when connected', async () => {
    setClipboard()
    const onExport = vi.fn()
    const u = user()
    render(<ActionExecuteMenu copyText="x" crm={{ onExport, connected: true }} />)

    await openMenu(u)
    await u.click(await screen.findByText('Exporter CRM'))

    expect(onExport).toHaveBeenCalledTimes(1)
  })

  it('disables the lifecycle actions (with a hint) when they are not wired', async () => {
    setClipboard()
    const u = user()
    render(<ActionExecuteMenu copyText="x" lifecycleHint="Disponible dans le plan d'action" />)

    await openMenu(u)
    const markDone = (await screen.findByText('Marquer fait')).closest('[role="menuitem"]')
    expect(markDone).toHaveAttribute('data-disabled')
    expect(markDone).toHaveAttribute('title', "Disponible dans le plan d'action")
  })
})
