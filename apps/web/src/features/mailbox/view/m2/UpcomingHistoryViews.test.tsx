import type { MailThread, ScheduledMessageSendItem } from '@bellum/contracts'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

const snooze = vi.fn()
const setMark = vi.fn()
let sends: ScheduledMessageSendItem[] = []

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))
vi.mock('../ScheduledSendsPanel', () => ({ ScheduledSendsPanel: () => <div data-testid="programmed" /> }))
vi.mock('../../api', () => ({
  useScheduledSends: () => ({ data: { items: sends } }),
  useSnoozeThread: () => ({ mutate: snooze, isPending: false, error: null }),
  useSetThreadMark: () => ({ mutate: setMark, isPending: false }),
}))

const { UpcomingView } = await import('./UpcomingView')
const { HistoryView } = await import('./HistoryView')

const user = () => userEvent.setup({ pointerEventsCheck: 0 })
const gestures = { onPrepareDraft: vi.fn(), onSnooze: vi.fn(), onCreateTask: vi.fn(), onLinkAccount: vi.fn() }
const common = { timeZone: 'Europe/Paris', language: 'fr', mailboxAddress: 'theo@kalixa.example', gestures }

function thread(overrides: Partial<MailThread>): MailThread {
  return {
    threadId: 't1',
    subject: 'Re: Votre périmètre de reporting',
    counterpart: 'claire.martin@novasante.example',
    lastMessageAt: '2026-10-22T08:20:00.000Z',
    lastDirection: 'inbound',
    messageCount: 2,
    awaitingReply: false,
    daysSinceLastMessage: 0,
    unread: false,
    hasAttachments: false,
    otherParticipants: [],
    ...overrides,
  }
}

describe('UpcomingView — Préparations à venir (Théo B m2-brouillons.N3)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    snooze.mockReset()
    sends = []
  })

  it('un fil reporté revient à sa date, sans rappel externe, et se remet à traiter d’un clic', async () => {
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString()
    render(<UpcomingView threads={[thread({ snoozeUntil: future })]} {...common} />)
    // Théo B m2 — l'espace de travail de la page : la liste « Préparations à venir » et le fil ouvert à côté.
    const list = screen.getByRole('list', { name: 'Échanges reportés' })
    expect(within(list).getByText('claire.martin@novasante.example')).toBeTruthy()
    expect(within(list).getByText('Reporté')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Préparations à venir' })).toBeTruthy()
    expect(within(screen.getByTestId('mailbox-reader')).getByRole('heading', { level: 2 }).textContent).toBe(
      'Re: Votre périmètre de reporting',
    )
    expect(screen.getByText(/Revient dans « À traiter » le/)).toBeTruthy()
    expect(screen.getByText('Aucun e-mail ni rappel externe envoyé.')).toBeTruthy()
    await user().click(screen.getByRole('button', { name: 'Remettre à traiter' }))
    expect(snooze).toHaveBeenCalledWith({ threadId: 't1', until: null })
    // « Changer la date » ouvre le dialogue de report de la page, avec CE fil.
    await user().click(screen.getByRole('button', { name: 'Changer la date' }))
    expect(gestures.onSnooze).toHaveBeenCalledWith(expect.objectContaining({ threadId: 't1' }))
  })

  it('R5 — rien à venir : « Rien dans cette vue », l’invitation, et les envois à programmer restent proposés', () => {
    render(<UpcomingView threads={[]} {...common} />)
    expect(screen.getByText('Rien dans cette vue.')).toBeTruthy()
    expect(screen.getByTestId('programmed')).toBeTruthy()
  })
})

describe('HistoryView — Journal des échanges (Théo B m2-brouillons.N4 / A5)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    setMark.mockReset()
    sends = []
  })

  it('un échange traité se remet à traiter ; le corps est lu en direct, jamais conservé', async () => {
    render(
      <HistoryView
        threads={[thread({ state: 'treated', subject: 'Entretien technique — créneau confirmé' })]}
        {...common}
      />,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Journal des échanges' })).toBeTruthy()
    const list = screen.getByRole('list', { name: 'Échanges traités et messages envoyés' })
    expect(within(list).getByText('Entretien technique — créneau confirmé')).toBeTruthy()
    expect(within(list).getByText('Traité')).toBeTruthy()
    expect(screen.getByText(/jamais conservé/)).toBeTruthy()
    await user().click(screen.getByRole('button', { name: 'Remettre à traiter' }))
    expect(setMark).toHaveBeenCalledWith({ threadId: 't1', mark: null })
  })

  it('A5 — « Envoyé le … » n’apparaît qu’avec la preuve retrouvée dans les éléments envoyés', () => {
    sends = [
      {
        id: 's1',
        versionId: 'v1',
        contactId: 'c1',
        channel: 'email',
        subject: 'Proposition d’accompagnement',
        scheduledAt: '2026-10-13T08:00:00.000Z',
        timeZone: 'Europe/Paris',
        status: 'sent',
        attemptedAt: '2026-10-13T08:00:00.000Z',
        sentAt: '2026-10-13T08:00:00.000Z',
        proofSentAt: '2026-10-13T08:04:00.000Z',
        failureCode: null,
        createdAt: '2026-10-12T08:00:00.000Z',
      },
      {
        id: 's2',
        versionId: 'v2',
        contactId: 'c1',
        channel: 'email',
        subject: 'Sans preuve',
        scheduledAt: '2026-10-14T08:00:00.000Z',
        timeZone: 'Europe/Paris',
        status: 'sent',
        attemptedAt: '2026-10-14T08:00:00.000Z',
        sentAt: '2026-10-14T08:00:00.000Z',
        proofSentAt: null,
        failureCode: null,
        createdAt: '2026-10-12T08:00:00.000Z',
      },
    ]
    render(<HistoryView threads={[]} {...common} />)
    expect(screen.getAllByText('Proposition d’accompagnement').length).toBeGreaterThan(0)
    expect(screen.getByText(/Envoyé le/)).toBeTruthy()
    expect(screen.queryByText('Sans preuve')).toBeNull()
  })

  it('R5 — journal vide : « Rien dans cette vue »', () => {
    render(<HistoryView threads={[]} {...common} />)
    expect(screen.getByText('Rien dans cette vue.')).toBeTruthy()
  })
})
