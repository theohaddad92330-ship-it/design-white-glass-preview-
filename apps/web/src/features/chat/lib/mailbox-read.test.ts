import { describe, expect, it } from 'vitest'
import { threadMailboxRead } from './mailbox-read'

const reader = { reasoning_trace: { tools_called: ['search_mailbox', 'read_mail_thread'] } }
const self = { firstName: 'Louis', avatarUrl: null }

/** #5032.9 — la lecture d'un fil de la boîte ne se dit qu'à l'auteur du tour. */
describe('threadMailboxRead', () => {
  it('vrai quand mon tour a lu un fil de la boîte', () => {
    expect(
      threadMailboxRead(
        [
          { role: 'user', content: 'q' },
          { role: 'assistant', context: reader },
        ] as never,
        self,
      ),
    ).toBe(true)
  })

  it('sait dire NON : pas de lecture, tour d’un collègue, ou auteur non résolu', () => {
    expect(
      threadMailboxRead(
        [{ role: 'user' }, { role: 'assistant', context: { reasoning_trace: { tools_called: ['search_mailbox'] } } }],
        self,
      ),
    ).toBe(false)
    expect(
      threadMailboxRead(
        [
          { role: 'user', author: { firstName: 'Camille', avatarUrl: null } },
          { role: 'assistant', context: reader },
        ],
        self,
      ),
    ).toBe(false)
    expect(
      threadMailboxRead(
        [
          { role: 'user', author: null },
          { role: 'assistant', context: reader },
        ],
        self,
      ),
    ).toBe(false)
    expect(threadMailboxRead([], self)).toBe(false)
  })
})
