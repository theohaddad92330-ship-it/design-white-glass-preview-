import type { Contact } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EngagementConversation } from './EngagementConversation'
import type { ConversationEntry } from './conversation'

vi.mock('@/features/laura/AiDisclosure', () => ({ AiDisclosure: () => <p>Assistante IA</p> }))

const contact = { id: 'c1', full_name: 'Sophie Coulon-Renouvel' } as unknown as Contact

// #4280 — panneau « Approche contact » : le message de l'utilisateur est dans une bulle, aucune barre parasite.
describe('EngagementConversation — mise en page du fil (#4280)', () => {
  const entries = [{ id: 'u1', role: 'user', text: 'Préparer un pitch d’appel court' }] as ConversationEntry[]
  const renderThread = () =>
    render(
      <EngagementConversation
        channel="phone"
        contact={contact}
        entries={entries}
        generationStep={null}
        onContextPreset={vi.fn()}
        onLinkedinDeclaredSent={vi.fn()}
        onLinkedinOpen={vi.fn()}
        onMessageCopy={vi.fn()}
        onDismiss={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

  it('le message de l’utilisateur est dans une bulle visible (surface distincte du fond du panneau)', () => {
    const { container } = renderThread()
    const bubble = container.querySelector('[data-user-bubble]')

    expect(bubble).toHaveTextContent('Préparer un pitch d’appel court')
    expect(bubble?.className).toMatch(/border/)
    expect(bubble?.className).toMatch(/bg-\[var\(--bellum-surface-2\)\]/)
    expect(bubble?.className).not.toMatch(/bg-\[var\(--bellum-bg-lighter\)\]/)
  })

  it('aucun séparateur flouté : les fondus ne portent pas de backdrop-blur', () => {
    const { container } = renderThread()

    expect(screen.getByText('Assistante IA')).toBeInTheDocument()
    expect(container.innerHTML).not.toMatch(/backdrop-blur/)
  })

  it('le fil garde une hauteur plancher sous le composer', () => {
    const { container } = renderThread()

    expect((container.firstElementChild as HTMLElement).className).toMatch(/min-h-\[12rem\]/)
  })
})
