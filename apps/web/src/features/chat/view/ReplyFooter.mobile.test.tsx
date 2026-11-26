import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ChatResponseContext } from './ContextDisclosure'

// #5032.2 — sur mobile (≤ 768 px, la borne de GA-28) la rangée n'est visible que sous la DERNIÈRE réponse ;
// toucher une réponse plus ancienne affiche la sienne (`revealed`, posé par `Chat.tsx`).
vi.mock('@/features/mobile/useIsMobile', () => ({ useIsMobile: () => true, MOBILE_BREAKPOINT: 768 }))
vi.mock('./SaveReply', () => ({ SaveReply: () => null }))
vi.mock('./ReplyFeedback', () => ({ ReplyFeedback: () => null }))

const { ReplyFooter } = await import('./ReplyFooter')

const context = { active: {}, sources: [], not_consulted: [] } as unknown as ChatResponseContext

describe('ReplyFooter — #5032.2 mobile : la rangée suit la dernière réponse', () => {
  it('sous la dernière réponse (ou une réponse touchée), la rangée est là', () => {
    render(<ReplyFooter context={context} text="Réponse." accountId={null} timestamp={null} revealed />)
    const row = screen.getByTestId('reply-footer-row')
    expect(row).not.toHaveClass('hidden')
    expect(screen.getByRole('button', { name: 'Copier la réponse' })).toBeInTheDocument()
  })

  it('sous une réponse plus ancienne et non touchée, la rangée est masquée', () => {
    render(<ReplyFooter context={context} text="Réponse." accountId={null} timestamp={null} revealed={false} />)
    expect(screen.getByTestId('reply-footer-row')).toHaveClass('hidden')
  })
})
