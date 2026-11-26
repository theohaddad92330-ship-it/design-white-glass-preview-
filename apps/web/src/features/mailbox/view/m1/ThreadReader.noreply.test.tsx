import type { MailThread } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))
vi.mock('../../api', () => ({
  useSetThreadMark: () => ({ mutate: vi.fn() }),
  useSnoozeThread: () => ({ mutate: vi.fn() }),
}))

const { ThreadReader } = await import('./ThreadReader')

const thread = (counterpart: string): MailThread => ({
  threadId: 't1',
  subject: 'Votre facture',
  counterpart,
  lastMessageAt: null,
  lastDirection: 'inbound',
  messageCount: 1,
  awaitingReply: false,
  daysSinceLastMessage: 1,
  unread: false,
  hasAttachments: false,
  otherParticipants: [],
})

function renderReader(counterpart: string) {
  return render(
    <ThreadReader
      thread={thread(counterpart)}
      foundBy={null}
      language="fr"
      mailboxAddress={null}
      onBack={vi.fn()}
      onPrepareDraft={vi.fn()}
      onLinkAccount={vi.fn()}
      onSnooze={vi.fn()}
      onCreateTask={vi.fn()}
    />,
  )
}

// #4405.1 — pas de « Préparer la réponse » sur un fil système ; sur un fil humain, le geste reste.
describe('ThreadReader — fil système (#4405.1)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('no-reply : le bouton ne se propose pas et la ligne le dit', () => {
    renderReader('noreply@github.com')
    expect(screen.queryByRole('button', { name: /préparer la réponse/i })).toBeNull()
    expect(screen.getByTestId('no-reply-note')).toBeInTheDocument()
  })

  it('fil humain : le bouton est là', () => {
    renderReader('marie@acme.fr')
    expect(screen.getByRole('button', { name: /préparer la réponse/i })).toBeEnabled()
    expect(screen.queryByTestId('no-reply-note')).toBeNull()
  })
})
