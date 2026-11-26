import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ConnectedClientTool } from '@bellum/contracts'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@bellum/ui'
import { ComposerToolsChecklist } from './ComposerToolsChecklist'

const gmail: ConnectedClientTool = { provider: 'gmail', family: 'email', name: 'Gmail' }
const hubspot: ConnectedClientTool = { provider: 'hubspot', family: 'crm', name: 'HubSpot', needsReconnect: true }

function renderList(props: Partial<Parameters<typeof ComposerToolsChecklist>[0]> = {}) {
  const onToggle = vi.fn()
  render(
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger>+</DropdownMenuTrigger>
      <DropdownMenuContent>
        <ComposerToolsChecklist tools={[gmail, hubspot]} excludedProviders={[]} onToggle={onToggle} {...props} />
      </DropdownMenuContent>
    </DropdownMenu>,
  )
  return onToggle
}

/** #5048 — sous 768 px, fil commencé, les puces se taisent : leur geste se reprend dans le « + ». */
describe('ComposerToolsChecklist — #5048', () => {
  it('une case par outil lisible ; un outil à reconnecter n’en a pas', () => {
    renderList()
    expect(screen.getByText('Tes outils avec Laura')).toBeInTheDocument()
    expect(screen.getByRole('menuitemcheckbox', { name: 'Gmail' })).toBeChecked()
    expect(screen.queryByRole('menuitemcheckbox', { name: /HubSpot/ })).not.toBeInTheDocument()
  })

  it('cocher / décocher appelle la même bascule que les puces', () => {
    const onToggle = renderList()
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Gmail' }))
    expect(onToggle).toHaveBeenCalledExactlyOnceWith('gmail')
  })

  it('un outil exclu apparaît décoché', () => {
    renderList({ excludedProviders: ['gmail'] })
    expect(screen.getByRole('menuitemcheckbox', { name: 'Gmail' })).not.toBeChecked()
  })

  it('rien de branché : aucune entrée', () => {
    renderList({ tools: [] })
    expect(screen.queryByText('Tes outils avec Laura')).not.toBeInTheDocument()
  })
})
