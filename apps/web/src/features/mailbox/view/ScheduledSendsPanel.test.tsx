import type { MyMessageDraftItem, ScheduledMessageSendItem } from '@bellum/contracts'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { useMyMessageDrafts, useScheduleSendActions, useScheduledSends } from '../api'
import { ScheduledSendsPanel } from './ScheduledSendsPanel'

vi.mock('../api', () => ({
  useScheduledSends: vi.fn(),
  useMyMessageDrafts: vi.fn(),
  useScheduleSendActions: vi.fn(),
}))

// Théo M2 — envoi programmé — la Messagerie « À venir » : programmer un brouillon VALIDÉ, voir, annuler.
const user = () => userEvent.setup({ pointerEventsCheck: 0 })
const schedule = vi.fn()
const reschedule = vi.fn()
const cancel = vi.fn()

const SEND: ScheduledMessageSendItem = {
  id: '00000000-0000-4000-8000-000000000001',
  versionId: '00000000-0000-4000-8000-000000000002',
  contactId: '00000000-0000-4000-8000-000000000003',
  channel: 'email',
  subject: 'Point rapide',
  scheduledAt: '2026-10-23T07:30:00.000Z',
  timeZone: 'Europe/Paris',
  status: 'scheduled',
  attemptedAt: null,
  sentAt: null,
  proofSentAt: null,
  failureCode: null,
  createdAt: '2026-10-22T10:00:00.000Z',
}

function draft(overrides: Partial<MyMessageDraftItem>): MyMessageDraftItem {
  return {
    id: '00000000-0000-4000-8000-0000000000d1',
    contactId: SEND.contactId,
    channel: 'email',
    subject: 'Relance comité',
    body: 'Bonjour',
    editedSubject: null,
    editedBody: null,
    usedTemplateSource: null,
    usedTemplateVersion: null,
    usedStyleId: null,
    unchanged: false,
    angle: null,
    createdAt: '2026-10-22T09:00:00.000Z',
    validatedAt: '2026-10-22T09:05:00.000Z',
    contactName: 'Julie Perrin',
    contactEmail: 'julie.perrin@opaline-retail.example',
    accountId: null,
    accountName: 'Opaline Retail',
    versionCount: 1,
    ...overrides,
  }
}

function setData(sends: ScheduledMessageSendItem[], drafts: MyMessageDraftItem[]) {
  vi.mocked(useScheduledSends).mockReturnValue({ data: { items: sends } } as unknown as ReturnType<
    typeof useScheduledSends
  >)
  vi.mocked(useMyMessageDrafts).mockReturnValue({
    data: { items: drafts, total: drafts.length },
  } as unknown as ReturnType<typeof useMyMessageDrafts>)
}

describe('ScheduledSendsPanel', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    for (const fn of [schedule, reschedule, cancel]) fn.mockReset()
    vi.mocked(useScheduleSendActions).mockReturnValue({
      schedule: { mutate: schedule, isPending: false, error: null },
      reschedule: { mutate: reschedule, isPending: false, error: null },
      cancel: { mutate: cancel, isPending: false, error: null },
    } as unknown as ReturnType<typeof useScheduleSendActions>)
  })

  it('rien à venir, rien à programmer : aucune section (on n’affiche pas ce qu’on n’a pas)', () => {
    setData([], [draft({ validatedAt: null })])
    const { container } = render(<ScheduledSendsPanel timeZone="Europe/Paris" />)
    expect(container).toBeEmptyDOMElement()
  })

  // Théo B m1.R2 — dans l'onglet « À venir », « rien n'est programmé » se DIT (un onglet ouvert ne reste pas blanc).
  it('onglet « À venir » ouvert sur rien : dit qu’aucun envoi n’est programmé', () => {
    setData([], [])
    render(<ScheduledSendsPanel timeZone="Europe/Paris" showEmpty />)
    expect(screen.getByText('Aucun envoi programmé')).toBeInTheDocument()
  })

  it('liste l’envoi programmé avec son heure dans le fuseau de l’utilisateur, et l’annule', async () => {
    setData([SEND], [])
    render(<ScheduledSendsPanel timeZone="Europe/Paris" />)
    const list = screen.getByRole('list', { name: 'Envois programmés' })
    expect(within(list).getByText('Point rapide')).toBeInTheDocument()
    expect(within(list).getByText(/Programmé pour le .*09:30/)).toBeInTheDocument()
    await user().click(within(list).getByRole('button', { name: 'Annuler l’envoi' }))
    expect(cancel).toHaveBeenCalledWith(SEND.id)
  })

  it('« Envoyé le … » seulement avec la preuve ; sinon l’état le dit', () => {
    setData(
      [
        { ...SEND, id: '00000000-0000-4000-8000-0000000000a1', status: 'sent', sentAt: SEND.scheduledAt },
        {
          ...SEND,
          id: '00000000-0000-4000-8000-0000000000a2',
          subject: 'Prouvé',
          status: 'sent',
          sentAt: SEND.scheduledAt,
          proofSentAt: '2026-10-23T07:30:04.000Z',
        },
        { ...SEND, id: '00000000-0000-4000-8000-0000000000a3', subject: 'Muet', status: 'unknown' },
      ],
      [],
    )
    render(<ScheduledSendsPanel timeZone="Europe/Paris" />)
    expect(screen.getByText('Parti, pas encore retrouvé dans tes éléments envoyés')).toBeInTheDocument()
    expect(screen.getByText(/Envoyé le .*09:30/)).toBeInTheDocument()
    expect(screen.getByText(/Issue inconnue/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Annuler l’envoi' })).not.toBeInTheDocument()
  })

  it('programme un brouillon VALIDÉ à l’heure choisie, lue dans le fuseau de l’utilisateur', async () => {
    const validated = draft({})
    setData(
      [],
      [validated, draft({ id: '00000000-0000-4000-8000-0000000000d2', validatedAt: null, subject: 'À relire' })],
    )
    render(<ScheduledSendsPanel timeZone="Europe/Paris" />)
    expect(screen.queryByText('À relire')).not.toBeInTheDocument()
    await user().click(screen.getByRole('button', { name: 'Programmer l’envoi' }))
    const picker = screen.getByLabelText('Date et heure d’envoi')
    await user().type(picker, '2026-10-23T09:30')
    await user().click(screen.getByRole('button', { name: 'Programmer' }))
    expect(schedule).toHaveBeenCalledWith(
      { versionId: validated.id, scheduledAt: '2026-10-23T07:30:00.000Z', timeZone: 'Europe/Paris' },
      expect.anything(),
    )
  })

  it('un brouillon déjà programmé ne se propose plus à programmer', () => {
    setData([{ ...SEND, versionId: draft({}).id }], [draft({})])
    render(<ScheduledSendsPanel timeZone="Europe/Paris" />)
    expect(screen.queryByRole('button', { name: 'Programmer l’envoi' })).not.toBeInTheDocument()
  })
})
