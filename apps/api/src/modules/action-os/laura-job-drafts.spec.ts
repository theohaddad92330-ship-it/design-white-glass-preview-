import { lauraJobDraftsFrom } from './laura-job-drafts'

/**
 * #4016 L5 (reprise 20/10) — le job composite de Laura garde ses brouillons
 * comme messages canoniques (#2276). Un brouillon E-MAIL est proposé au mandat
 * `laura_send` : le service des mandats ne le rattache que si un mandat est
 * signé et vivant. Sans mandat, ou sur un autre canal, il reste un brouillon
 * ordinaire en relecture (c82 inchangée). Rien ne part ici.
 */
const INPUT = {
  userId: 'u-theo',
  workspaceId: 'ws',
  contactId: 'c-1',
  channel: 'email' as const,
  subject: 'Suite',
  body: 'Bonjour',
}

function build() {
  const create = jest.fn(async () => ({ id: 'msg-1' }))
  const awaitIfMandated = jest.fn(async () => true)
  const drafts = lauraJobDraftsFrom({ create } as never, { awaitIfMandated } as never)
  return { drafts, create, awaitIfMandated }
}

describe('lauraJobDraftsFrom — #4016 L5, Laura sous mandat', () => {
  it('garde le brouillon (source laura, né en relecture) et le propose au mandat `laura_send`', async () => {
    const { drafts, create, awaitIfMandated } = build()
    expect(await drafts.keep(INPUT)).toBe('msg-1')
    expect(create).toHaveBeenCalledWith(
      { userId: 'u-theo', workspaceId: 'ws', role: 'member' },
      expect.objectContaining({ contact_id: 'c-1', channel: 'email', source: 'laura', body: 'Bonjour' }),
      expect.any(Function),
      'model',
    )
    expect(awaitIfMandated).toHaveBeenCalledWith('ws', 'msg-1', 'laura_send', expect.any(Date))
  })

  it('LinkedIn ou téléphone : aucun mandat — seul l’e-mail a un connecteur d’envoi', async () => {
    const { drafts, awaitIfMandated } = build()
    await drafts.keep({ ...INPUT, channel: 'linkedin' })
    await drafts.keep({ ...INPUT, channel: 'phone' })
    expect(awaitIfMandated).not.toHaveBeenCalled()
  })

  it('la relecture du mandat échoue : le brouillon est gardé quand même, jamais perdu', async () => {
    const { drafts, awaitIfMandated } = build()
    awaitIfMandated.mockRejectedValueOnce(new Error('base indisponible'))
    expect(await drafts.keep(INPUT)).toBe('msg-1')
  })
})
