import type { OutreachSequence } from '@bellum/contracts'
import { OutreachAutomationAdapter } from './outreach-automation.adapter'

/**
 * Lot L-D1 (#4167) — l'adaptateur par lequel une règle inscrit et prépare : mêmes portes
 * que le geste manuel, aucun forçage, aucun envoi.
 */

const CONTACT = { id: 'c1', full_name: 'Pierre Palmieri', account_id: 'a1', user_id: 'u1' }

function build(opts: { sprint?: string | null; generate?: () => Promise<unknown> } = {}) {
  const sequence = {
    id: 's1',
    steps: [
      { id: 'st0', kind: 'email', position: 0, due_at: '2026-10-08T07:00:00.000Z' },
      { id: 'st1', kind: 'linkedin_invite', position: 1 },
      { id: 'st2', kind: 'linkedin_message', position: 2 },
      { id: 'st3', kind: 'call', position: 3 },
      { id: 'st4', kind: 'email', position: 4, due_at: '2026-10-15T07:00:00.000Z' },
    ],
  } as unknown as OutreachSequence
  const outreach = { create: jest.fn().mockResolvedValue(sequence) }
  const messages = {
    create: jest.fn().mockImplementation(async (_ctx, dto) => ({ id: `m-${dto.body.length}` })),
    createCallTask: jest.fn().mockResolvedValue({ id: 'call1' }),
  }
  const cadence = {
    eligibility: jest
      .fn()
      .mockResolvedValue([{ contact_id: 'c1', exclusions: [{ code: 'active_sequence', forceable: true }] }]),
  }
  const contacts = { findOne: jest.fn().mockResolvedValue(CONTACT) }
  const accounts = { findOne: jest.fn().mockResolvedValue({ sprint: opts.sprint ?? null, sprint_reason: null }) }
  const stops = { find: jest.fn().mockResolvedValue([{ contact_id: 'c9' }]) }
  const delegations = { awaitIfMandated: jest.fn().mockResolvedValue(true) }
  const ia = {
    generateMessage:
      opts.generate ??
      jest.fn().mockResolvedValue({ success: true, data: { subject: 'Objet', body: 'Corps du message' } }),
  }
  const adapter = new OutreachAutomationAdapter(
    outreach as never,
    messages as never,
    cadence as never,
    contacts as never,
    accounts as never,
    stops as never,
    ia as never,
    delegations as never,
  )
  return { adapter, outreach, messages, cadence, ia, stops, delegations }
}

const input = {
  userId: 'u1',
  email: 'u1@example.com',
  workspaceId: 'w1',
  role: 'member' as const,
  contactId: 'c1',
  signal: 'tender' as const,
  evidence: 'Appel d’offres publié chez Acme',
}

describe('OutreachAutomationAdapter', () => {
  it('l’éligibilité est CELLE de l’outreach, avec l’opposition RGPD lue dans la liste d’arrêt', async () => {
    const { adapter, cadence } = build()
    const map = await adapter.eligibility({ userId: 'u1', workspaceId: 'w1', contactIds: ['c1', 'c1'] })
    expect(cadence.eligibility).toHaveBeenCalledWith('u1', 'w1', ['c1'], new Set(['c9']))
    expect(map.get('c1')).toEqual([{ code: 'active_sequence', forceable: true }])
  })

  it('inscrit dans la séquence du modèle, SANS forçage, en portant l’espace de la règle', async () => {
    const { adapter, outreach } = build()
    await adapter.enroll({ ...input, playbook: 'tender' })
    const [request, principal, canSend, origin] = outreach.create.mock.calls[0]
    expect(request.override_exclusions).toBeUndefined()
    expect(request.force_justification).toBeUndefined()
    expect(request.name).toBe('Appel d’offres — Pierre Palmieri')
    expect(principal).toEqual({ userId: 'u1', email: 'u1@example.com' })
    expect(canSend).toBe(false)
    expect(origin).toEqual({ expected_workspace_id: 'w1' })
  })

  it('Laura prépare chaque étape qui s’écrit (e-mail, message LinkedIn, appel), pas l’invitation ni la tâche', async () => {
    const { adapter, ia } = build()
    await adapter.enroll({ ...input, playbook: 'hiring_signal' })
    const channels = (ia.generateMessage as jest.Mock).mock.calls.map(call => call[0].channel)
    expect(channels).toEqual(['email', 'linkedin', 'phone', 'email'])
  })

  it('chaque message préparé naît « automation », avec le signal en « pourquoi maintenant », jamais envoyé', async () => {
    const { adapter, messages } = build()
    const result = await adapter.enroll({ ...input, playbook: 'hiring_signal' })
    expect(result.sequenceId).toBe('s1')
    expect(messages.create).toHaveBeenCalledTimes(2)
    for (const call of messages.create.mock.calls) {
      expect(call[1]).toMatchObject({ source: 'automation', reason: input.evidence, channel: 'email' })
      expect(call[3]).toBe('system')
    }
  })

  // #4016 L5 (reprise 20/10) — une séquence inscrite par une règle est une séquence de l'espace : ses
  // e-mails sont proposés au mandat `workspace_sequences`, datés de l'échéance de leur étape.
  it('chaque e-mail d’étape est proposé au mandat `workspace_sequences`, daté de son échéance', async () => {
    const { adapter, delegations } = build()
    const result = await adapter.enroll({ ...input, playbook: 'hiring_signal' })
    expect(delegations.awaitIfMandated.mock.calls).toEqual([
      ['w1', result.messageIds[0], 'workspace_sequences', new Date('2026-10-08T07:00:00.000Z')],
      ['w1', result.messageIds[1], 'workspace_sequences', new Date('2026-10-15T07:00:00.000Z')],
    ])
  })

  it('un compte en NO-GO ne reçoit aucun brouillon : l’étape reste vide, la règle n’invente rien', async () => {
    const { adapter, ia, messages } = build({ sprint: 'no_go' })
    await adapter.enroll({ ...input, playbook: 'tender' })
    expect(ia.generateMessage).not.toHaveBeenCalled()
    expect(messages.create).not.toHaveBeenCalled()
  })

  it('un échec du moteur laisse l’étape vide, l’inscription existe quand même', async () => {
    const { adapter, messages, outreach } = build({ generate: () => Promise.reject(new Error('moteur en panne')) })
    const result = await adapter.enroll({ ...input, playbook: 'tender' })
    expect(outreach.create).toHaveBeenCalledTimes(1)
    expect(messages.create).not.toHaveBeenCalled()
    expect(result.messageIds).toEqual([])
  })

  it('prépare UN e-mail à relire, source automation', async () => {
    const { adapter, messages } = build()
    const result = await adapter.prepareEmail(input)
    expect(result).toEqual({ messageId: expect.any(String) })
    expect(messages.create.mock.calls[0][1]).toMatchObject({ source: 'automation', intent: 'qualify_context' })
  })

  it('prépare un e-mail : si Laura ne rédige rien, rien n’est créé (null)', async () => {
    const { adapter, messages } = build({ generate: () => Promise.resolve({ success: false, data: {} }) })
    expect(await adapter.prepareEmail(input)).toBeNull()
    expect(messages.create).not.toHaveBeenCalled()
  })

  it('propose un appel avec sa trame, source automation', async () => {
    const { adapter, messages } = build()
    await adapter.prepareCall(input)
    expect(messages.createCallTask.mock.calls[0][1]).toMatchObject({ source: 'automation', contact_id: 'c1' })
    expect(messages.createCallTask.mock.calls[0][1].pitch).toBe('Corps du message')
  })
})
