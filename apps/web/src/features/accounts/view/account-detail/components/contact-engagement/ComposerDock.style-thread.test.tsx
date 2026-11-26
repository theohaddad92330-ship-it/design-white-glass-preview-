import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { messageStyleThreadKey } from '@bellum/contracts'

vi.mock('./ApprovedTemplatePicker', () => ({ ApprovedTemplatePicker: () => null }))

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }))
vi.mock('@/features/message-style/hooks/useMessageStyle', () => ({
  useCreateMessageStyleTemplate: () => ({ mutateAsync, isPending: false }),
}))
vi.mock('@/features/memory/hooks/useMemoryScopeOptions', async () => {
  const { offerableMemoryScopes } = await import('@bellum/contracts')
  return {
    useMemoryScopeOptions: (conversationId?: string | null) => offerableMemoryScopes({ conversationId }),
  }
})

import { ComposerDock } from './ComposerDock'

/**
 * #2204.65 — le fil du composer : « Créer un style pour ce fil » ouvre le formulaire de style
 * DANS le fil de ce contact, la portée « Ce fil » y est offerte et son identifiant est celui du contact.
 */
function renderDock() {
  render(
    <ComposerDock
      channel="email"
      channels={['email']}
      contactId="c1"
      context=""
      hasObjections={false}
      objections={[]}
      showObjections={false}
      onChannelChange={vi.fn()}
      onContextChange={vi.fn()}
      onGenerate={vi.fn()}
      parameters={{}}
      onParametersChange={vi.fn()}
      onToggleObjections={vi.fn()}
      styleOptions={[]}
      styleTemplateId={null}
      onStyleTemplateIdChange={vi.fn()}
      onUseApprovedTemplate={vi.fn()}
    />,
  )
}

describe('ComposerDock — créer un style pour ce fil (#2204.65)', () => {
  beforeEach(() => mutateAsync.mockReset().mockResolvedValue({}))

  it('le sélecteur de style est là même sans style actif : c’est la porte pour en créer un pour ce fil', async () => {
    renderDock()
    await userEvent.click(screen.getByRole('button', { name: /Aucun style/ }))
    expect(screen.getByRole('menuitem', { name: 'Créer un style pour ce fil' })).toBeInTheDocument()
  })

  it('le formulaire s’ouvre dans le fil du contact, et la portée « Ce fil » envoie la clé du contact', async () => {
    renderDock()
    await userEvent.click(screen.getByRole('button', { name: /Aucun style/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Créer un style pour ce fil' }))
    await userEvent.type(await screen.findByLabelText('Objectif'), 'Relancer')
    await userEvent.type(screen.getByLabelText('Persona'), 'DSI')
    await userEvent.click(screen.getByRole('combobox', { name: 'Portée' }))
    await userEvent.click(screen.getByRole('option', { name: 'Ce fil' }))
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le style' }))
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'conversation', conversationId: messageStyleThreadKey('c1') }),
    )
  })
})
