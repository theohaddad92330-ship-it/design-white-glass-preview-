import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@bellum/ui'
import { contextModeFor, useContextModeStore } from '@/features/work-contexts/contextModeStore'

vi.mock('@/features/work-contexts/useWorkspaceDefaultContextMode', () => ({
  useWorkspaceDefaultContextMode: () => undefined,
}))

const { ComposerProfileMenu } = await import('./ComposerProfileMenu')

/** #5048 — sous 768 px, fil commencé : « Mon profil » se reprend dans le « + » (déplacé, jamais perdu). */
describe('ComposerProfileMenu — #5048', () => {
  beforeEach(() => {
    useContextModeStore.setState({ modes: {}, workspaceDefaultMode: 'my_activity' })
  })

  function renderMenu(conversationId: string | null) {
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>+</DropdownMenuTrigger>
        <DropdownMenuContent>
          <ComposerProfileMenu conversationId={conversationId} />
        </DropdownMenuContent>
      </DropdownMenu>,
    )
  }

  it('nomme « Mon profil » et coche Mon activité', () => {
    renderMenu('conv-1')
    expect(screen.getByRole('menuitemcheckbox', { name: 'Mon profil : Mon activité' })).toBeChecked()
  })

  it('le décocher écrit Neutre dans le même magasin que le composeur', () => {
    renderMenu('conv-1')
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Mon profil/ }))
    const { modes, workspaceDefaultMode } = useContextModeStore.getState()
    expect(contextModeFor(modes, 'conv-1', workspaceDefaultMode)).toBe('neutral')
  })

  it('en Mission ponctuelle : non cochée et nommée', () => {
    useContextModeStore.setState({ modes: { 'conv-1': 'one_off_mission' } })
    renderMenu('conv-1')
    expect(screen.getByRole('menuitemcheckbox', { name: 'Mon profil : Mission ponctuelle' })).not.toBeChecked()
  })

  it('sans fil créé, rien à régler : aucune entrée', () => {
    renderMenu(null)
    expect(screen.queryByText(/Mon profil/)).not.toBeInTheDocument()
  })
})
