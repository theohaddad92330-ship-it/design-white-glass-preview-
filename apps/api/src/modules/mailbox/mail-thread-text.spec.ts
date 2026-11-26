import type { MailMessage } from '@bellum/contracts'
import { MAIL_THREAD_MAX_MESSAGES, pickThreadMessages } from './mail-thread-text'

const msg = (id: string, threadId: string | null, date: string): MailMessage => ({
  id,
  threadId,
  subject: 'S',
  from: 'a@b.fr',
  to: [],
  cc: [],
  date,
  snippet: null,
  unread: false,
  hasAttachments: false,
  direction: 'inbound',
})

describe('pickThreadMessages', () => {
  it('ne garde que le fil demandé, du plus ancien au plus récent', () => {
    const { picked, truncated } = pickThreadMessages(
      [
        msg('3', 't1', '2026-10-03T00:00:00Z'),
        msg('x', 't2', '2026-10-02T00:00:00Z'),
        msg('1', 't1', '2026-10-01T00:00:00Z'),
      ],
      't1',
    )
    expect(picked.map(m => m.id)).toEqual(['1', '3'])
    expect(truncated).toBe(false)
  })
  it('borne aux derniers messages et le dit', () => {
    const many = Array.from({ length: MAIL_THREAD_MAX_MESSAGES + 3 }, (_v, i) =>
      msg(String(i), 't1', `2026-10-${String(i + 1).padStart(2, '0')}T00:00:00Z`),
    )
    const { picked, truncated } = pickThreadMessages(many, 't1')
    expect(picked).toHaveLength(MAIL_THREAD_MAX_MESSAGES)
    expect(picked.at(-1)?.id).toBe(String(MAIL_THREAD_MAX_MESSAGES + 2))
    expect(truncated).toBe(true)
  })
  it('un message sans fil n’est jamais rattaché au hasard', () => {
    expect(pickThreadMessages([msg('1', null, '2026-10-01T00:00:00Z')], 't1').picked).toEqual([])
  })
})
