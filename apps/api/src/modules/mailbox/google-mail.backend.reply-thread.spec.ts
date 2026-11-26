/**
 * #4417.1 — « réponds à ce mail » : le brouillon de réponse est déposé DANS le fil d'origine.
 * Le chat ne transmet que le `threadId` (jamais le Message-ID) : sans `In-Reply-To` / `References`,
 * Gmail ouvre une nouvelle conversation chez le destinataire. Le backend les lit donc au fil.
 */
import { GoogleMailBackend } from './google-mail.backend'

const BASE = {
  to: 'jean@acme.com',
  cc: [],
  subject: 'Re: Mission data',
  body: 'Bonjour Jean, merci pour votre retour.',
  documentIds: [],
  appendSignature: false,
}

function build(anchor: { messageId: string | null; references: string | null } | Error) {
  const createDraftInThread = jest.fn().mockResolvedValue({ id: 'd1', messageId: 'm2', threadId: 'th-1' })
  const getThreadReplyAnchor = jest.fn(async () => {
    if (anchor instanceof Error) throw anchor
    return anchor
  })
  const google = {
    authorizeWrite: jest.fn().mockResolvedValue({
      client: { createDraftInThread, getThreadReplyAnchor },
      accessToken: 'tok',
    }),
  }
  return { backend: new GoogleMailBackend(google as never), createDraftInThread, getThreadReplyAnchor }
}

const decode = (raw: string): string => Buffer.from(raw, 'base64url').toString('utf8')

describe('GoogleMailBackend.createDraft — réponse dans le fil (#4417.1)', () => {
  it('threadId seul : lit le dernier Message-ID du fil et pose In-Reply-To + References', async () => {
    const { backend, createDraftInThread, getThreadReplyAnchor } = build({
      messageId: '<m1@acme.com>',
      references: '<m0@acme.com>',
    })
    await backend.createDraft('u1', { ...BASE, threadId: 'th-1' } as never, null)
    expect(getThreadReplyAnchor).toHaveBeenCalledWith('tok', 'th-1')
    const [, raw, threadId] = createDraftInThread.mock.calls[0]
    expect(threadId).toBe('th-1')
    const mime = decode(raw)
    expect(mime).toContain('In-Reply-To: <m1@acme.com>')
    expect(mime).toContain('References: <m0@acme.com> <m1@acme.com>')
  })

  it('inReplyTo déjà fourni : aucune lecture du fil', async () => {
    const { backend, getThreadReplyAnchor } = build({ messageId: '<x@y>', references: null })
    await backend.createDraft('u1', { ...BASE, threadId: 'th-1', inReplyTo: '<m9@acme.com>' } as never, null)
    expect(getThreadReplyAnchor).not.toHaveBeenCalled()
  })

  it('sait dire NON : fil illisible → brouillon quand même déposé dans le fil, sans en-tête inventé', async () => {
    const { backend, createDraftInThread } = build(new Error('404'))
    await backend.createDraft('u1', { ...BASE, threadId: 'th-1' } as never, null)
    const [, raw, threadId] = createDraftInThread.mock.calls[0]
    expect(threadId).toBe('th-1')
    expect(decode(raw)).not.toContain('In-Reply-To')
  })

  it('sans threadId : nouveau message, aucune lecture', async () => {
    const { backend, getThreadReplyAnchor } = build({ messageId: '<x@y>', references: null })
    await backend.createDraft('u1', BASE as never, null)
    expect(getThreadReplyAnchor).not.toHaveBeenCalled()
  })
})
