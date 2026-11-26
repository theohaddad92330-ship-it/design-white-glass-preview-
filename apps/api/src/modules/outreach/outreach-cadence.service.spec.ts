/**
 * Lot L-B (#4165) — OutreachCadenceService : les gestes et balayages du socle
 * multicanal (issue déclarée, RDV pris, pause vacances, saut LinkedIn,
 * réordonnancement). Chaque mutation vérifie l'APPARTENANCE (user_id) ; chaque
 * lecture, l'ESPACE.
 */
import { IsNull } from 'typeorm'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import type { OutreachSequenceEntity } from '../../database/entities/outreach-sequence.entity'
import type { OutreachSequenceStepEntity } from '../../database/entities/outreach-sequence-step.entity'
import { createMockRepository } from '../../database/test-utils'
import { OutreachCadenceService } from './outreach-cadence.service'

const NOW = new Date('2026-10-14T08:00:00.000Z')

const seq = (over: Partial<OutreachSequenceEntity> = {}): OutreachSequenceEntity =>
  ({
    id: 'seq-1',
    workspace_id: 'ws-1',
    user_id: 'user-1',
    contact_id: 'c1',
    status: 'active',
    delay_unit: 'business_days',
    vacation_paused_at: null,
    vacation_until: null,
    ...over,
  }) as OutreachSequenceEntity

const step = (
  over: Partial<OutreachSequenceStepEntity> & { id: string; position: number },
): OutreachSequenceStepEntity =>
  ({
    sequence_id: 'seq-1',
    kind: 'email',
    status: 'pending',
    due_at: new Date('2026-10-20T07:00:00.000Z'),
    payload: {},
    done_at: null,
    ...over,
  }) as OutreachSequenceStepEntity

function build() {
  const sequences = createMockRepository<OutreachSequenceEntity>()
  const steps = createMockRepository<OutreachSequenceStepEntity>()
  const contacts = createMockRepository<never>()
  const accounts = createMockRepository<never>()
  const workspace = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'sales' }) }
  const service = new OutreachCadenceService(
    sequences as never,
    steps as never,
    contacts as never,
    accounts as never,
    workspace as never,
  )
  return { service, sequences, steps, contacts, accounts, workspace }
}

beforeEach(() => jest.useFakeTimers({ now: NOW }))
afterEach(() => jest.useRealTimers())

describe('declareOutcome', () => {
  it('refuse la séquence d’un autre utilisateur (appartenance)', async () => {
    const { service, sequences } = build()
    sequences.findOne.mockResolvedValue(null)
    await expect(service.declareOutcome('user-2', 'seq-1', 'st-1', 'accepted')).rejects.toThrow(NotFoundException)
    // #4804 — la clé est l'ESPACE de l'appelant ; la ligne ancienne reste à son propriétaire.
    expect(sequences.findOne).toHaveBeenCalledWith({
      where: [
        { id: 'seq-1', workspace_id: 'ws-1' },
        { id: 'seq-1', workspace_id: IsNull(), user_id: 'user-2' },
      ],
    })
  })

  it('#4804 — un coéquipier du MÊME espace agit sur la séquence d’un autre auteur', async () => {
    const { service, sequences } = build()
    // Le dépôt ne rend la ligne que si le `where` la désigne : on simule la base.
    sequences.findOne.mockImplementation(async ({ where }: { where: Array<Record<string, unknown>> }) =>
      where.some(w => w.workspace_id === 'ws-1') ? seq({ user_id: 'user-1', workspace_id: 'ws-1' }) : null,
    )
    const err = await service.declareOutcome('user-2', 'seq-1', 'st-1', 'accepted').then(
      () => null,
      (e: unknown) => e,
    )
    expect((err as Error | null)?.message).not.toBe('Séquence introuvable.')
  })

  it('#4804 — contrôle négatif : un utilisateur d’un AUTRE espace est refusé (404)', async () => {
    const { service, sequences, workspace } = build()
    workspace.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-OTHER', role: 'owner' })
    sequences.findOne.mockImplementation(async ({ where }: { where: Array<Record<string, unknown>> }) =>
      where.some(w => w.workspace_id === 'ws-1') ? seq({ workspace_id: 'ws-1' }) : null,
    )
    await expect(service.declareOutcome('user-9', 'seq-1', 'st-1', 'accepted')).rejects.toThrow(NotFoundException)
  })

  it('pose l’issue d’une invitation LinkedIn dans le payload', async () => {
    const { service, sequences, steps } = build()
    sequences.findOne.mockResolvedValue(seq())
    const target = step({
      id: 'st-1',
      position: 0,
      kind: 'linkedin_invite',
      status: 'done',
      payload: { label: 'Invitation' },
    })
    steps.findOne.mockResolvedValue(target)
    await service.declareOutcome('user-1', 'seq-1', 'st-1', 'accepted')
    expect(steps.save).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { label: 'Invitation', outcome: 'accepted', outcome_at: NOW.toISOString() } }),
    )
  })

  it('refuse une issue qui n’appartient pas à ce canal (appel ≠ invitation)', async () => {
    const { service, sequences, steps } = build()
    sequences.findOne.mockResolvedValue(seq())
    steps.findOne.mockResolvedValue(step({ id: 'st-1', position: 0, kind: 'linkedin_invite' }))
    await expect(service.declareOutcome('user-1', 'seq-1', 'st-1', 'voicemail')).rejects.toThrow(BadRequestException)
    expect(steps.save).not.toHaveBeenCalled()
  })

  it('refuse une issue sur un canal qui n’en porte pas', async () => {
    const { service, sequences, steps } = build()
    sequences.findOne.mockResolvedValue(seq())
    steps.findOne.mockResolvedValue(step({ id: 'st-1', position: 0, kind: 'email' }))
    await expect(service.declareOutcome('user-1', 'seq-1', 'st-1', 'accepted')).rejects.toThrow(BadRequestException)
  })

  it('null efface l’issue : une correction humaine gagne toujours', async () => {
    const { service, sequences, steps } = build()
    sequences.findOne.mockResolvedValue(seq())
    steps.findOne.mockResolvedValue(
      step({
        id: 'st-1',
        position: 0,
        kind: 'call',
        status: 'done',
        payload: { outcome: 'voicemail', label: 'Appel' },
      }),
    )
    await service.declareOutcome('user-1', 'seq-1', 'st-1', null)
    expect(steps.save).toHaveBeenCalledWith(expect.objectContaining({ payload: { label: 'Appel' } }))
  })
})

describe('meetingBooked', () => {
  it('termine la séquence avec la cause meeting_booked et saute les étapes restantes', async () => {
    const { service, sequences, steps } = build()
    sequences.findOne.mockResolvedValue(seq())
    await service.meetingBooked('user-1', 'seq-1')
    expect(sequences.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }))
    expect(steps.update).toHaveBeenCalledWith({ sequence_id: 'seq-1', status: 'pending' }, { status: 'skipped' })
    const insert = sequences.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO outreach_transitions'))
    expect(insert?.[1]).toEqual(['ws-1', 'user-1', 'seq-1', 'active', 'cancelled', 'user', 'meeting_booked'])
  })

  it('depuis une étape : cette étape est marquée faite avant l’arrêt', async () => {
    const { service, sequences, steps } = build()
    sequences.findOne.mockResolvedValue(seq())
    const target = step({ id: 'st-1', position: 1, kind: 'call' })
    steps.findOne.mockResolvedValue(target)
    await service.meetingBooked('user-1', 'seq-1', 'st-1')
    expect(steps.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'st-1', status: 'done', done_at: NOW }))
  })

  it('refuse la séquence d’un autre utilisateur', async () => {
    const { service, sequences } = build()
    sequences.findOne.mockResolvedValue(null)
    await expect(service.meetingBooked('user-2', 'seq-1')).rejects.toThrow(NotFoundException)
  })

  it('refuse une séquence déjà terminée', async () => {
    const { service, sequences } = build()
    sequences.findOne.mockResolvedValue(seq({ status: 'completed' }))
    await expect(service.meetingBooked('user-1', 'seq-1')).rejects.toThrow(BadRequestException)
  })
})

describe('pause vacances', () => {
  it('met en pause TOUTES les séquences actives de l’utilisateur jusqu’à la date, et seulement elles', async () => {
    const { service, sequences } = build()
    const a = seq({ id: 'a' })
    const b = seq({ id: 'b' })
    sequences.find.mockResolvedValue([a, b])
    const until = new Date('2026-10-28T07:00:00.000Z')
    const count = await service.startVacation('user-1', 'ws-1', until)
    expect(count).toBe(2)
    expect(sequences.find).toHaveBeenCalledWith({
      where: { user_id: 'user-1', workspace_id: 'ws-1', status: 'active' },
    })
    expect(sequences.save).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'a', status: 'paused', vacation_paused_at: NOW, vacation_until: until }),
      expect.objectContaining({ id: 'b', status: 'paused', vacation_paused_at: NOW, vacation_until: until }),
    ])
  })

  it('refuse une reprise dans le passé', async () => {
    const { service } = build()
    await expect(service.startVacation('user-1', 'ws-1', new Date('2026-10-01T00:00:00Z'))).rejects.toThrow(
      BadRequestException,
    )
  })

  it('à la reprise, décale les échéances restantes de la durée de pause (pas de rafale) et réactive', async () => {
    const { service, steps } = build()
    const paused = seq({
      status: 'paused',
      delay_unit: 'calendar_days',
      vacation_paused_at: new Date('2026-10-07T08:00:00.000Z'), // 7 jours avant NOW
      vacation_until: new Date('2026-10-14T08:00:00.000Z'),
    })
    const s1 = step({ id: 's1', position: 0, due_at: new Date('2026-10-16T07:00:00.000Z') })
    const s2 = step({ id: 's2', position: 1, due_at: new Date('2026-10-23T07:00:00.000Z') })
    const done = step({ id: 's0', position: 0, status: 'done', due_at: new Date('2026-10-05T07:00:00.000Z') })
    steps.find.mockResolvedValue([done, s1, s2])
    const resumed = await service.releaseVacation([paused])
    expect(resumed).toBe(1)
    expect(s1.due_at.toISOString()).toBe('2026-10-23T07:00:00.000Z')
    expect(s2.due_at.toISOString()).toBe('2026-10-30T07:00:00.000Z')
    expect(done.due_at.toISOString()).toBe('2026-10-05T07:00:00.000Z')
    expect(paused.status).toBe('active')
    expect(paused.vacation_paused_at).toBeNull()
    expect(paused.vacation_until).toBeNull()
  })

  it('ignore une séquence qui n’est pas en pause vacances (pause manuelle)', async () => {
    const { service, steps } = build()
    const manual = seq({ status: 'paused' })
    expect(await service.releaseVacation([manual])).toBe(0)
    expect(steps.find).not.toHaveBeenCalled()
    expect(manual.status).toBe('paused')
  })

  it('resumeAllMine reprend les séquences en pause vacances de l’utilisateur', async () => {
    const { service, sequences, steps } = build()
    sequences.find.mockResolvedValue([
      seq({
        status: 'paused',
        vacation_paused_at: new Date('2026-10-13T08:00:00Z'),
        vacation_until: new Date('2026-10-20T08:00:00Z'),
      }),
    ])
    steps.find.mockResolvedValue([])
    expect(await service.resumeAllMine('user-1', 'ws-1')).toBe(1)
    const where = sequences.find.mock.calls[0]?.[0] as { where: Record<string, unknown> }
    expect(where.where).toMatchObject({ user_id: 'user-1', workspace_id: 'ws-1', status: 'paused' })
  })
})

describe('sweep', () => {
  it('reprend automatiquement les pauses vacances dont la date est atteinte', async () => {
    const { service, sequences, steps } = build()
    const due = seq({
      status: 'paused',
      vacation_paused_at: new Date('2026-10-07T08:00:00Z'),
      vacation_until: new Date('2026-10-14T07:00:00Z'),
    })
    sequences.find.mockResolvedValueOnce([due]).mockResolvedValue([])
    steps.find.mockResolvedValue([])
    await service.sweep('ws-1')
    expect(due.status).toBe('active')
  })

  it('saute une étape message LinkedIn échue si l’invitation n’est pas acceptée, et JOURNALISE la transition', async () => {
    const { service, sequences, steps } = build()
    const active = seq({ id: 'seq-9' })
    sequences.find.mockResolvedValueOnce([]).mockResolvedValueOnce([active])
    const invite = step({
      id: 'inv',
      position: 0,
      kind: 'linkedin_invite',
      status: 'done',
      payload: { outcome: 'pending' },
    })
    const message = step({ id: 'msg', position: 1, kind: 'linkedin_message', due_at: new Date('2026-10-13T07:00:00Z') })
    steps.find.mockResolvedValue([invite, message])
    await service.sweep('ws-1')
    expect(steps.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'msg',
        status: 'skipped',
        payload: expect.objectContaining({ skip_reason: 'linkedin_invite_not_accepted' }),
      }),
    )
    const insert = sequences.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO outreach_transitions'))
    expect(insert?.[1]).toEqual([
      'ws-1',
      'user-1',
      'seq-9',
      'pending',
      'step_skipped',
      'system',
      'linkedin_invite_not_accepted',
    ])
  })

  it('ne saute rien quand l’invitation est acceptée', async () => {
    const { service, sequences, steps } = build()
    sequences.find.mockResolvedValueOnce([]).mockResolvedValueOnce([seq()])
    steps.find.mockResolvedValue([
      step({ id: 'inv', position: 0, kind: 'linkedin_invite', status: 'done', payload: { outcome: 'accepted' } }),
      step({ id: 'msg', position: 1, kind: 'linkedin_message', due_at: new Date('2026-10-13T07:00:00Z') }),
    ])
    await service.sweep('ws-1')
    expect(steps.save).not.toHaveBeenCalled()
  })

  it('une panne ne fait jamais échouer la lecture', async () => {
    const { service, sequences } = build()
    sequences.find.mockRejectedValue(new Error('db down'))
    await expect(service.sweep('ws-1')).resolves.toBeUndefined()
  })
})

describe('reorder', () => {
  it('redistribue les MÊMES créneaux dans le nouvel ordre', async () => {
    const { service, sequences, steps } = build()
    sequences.findOne.mockResolvedValue(seq())
    const a = step({ id: 'a', position: 0, kind: 'email', due_at: new Date('2026-10-15T07:00:00Z') })
    const b = step({ id: 'b', position: 1, kind: 'call', due_at: new Date('2026-10-20T07:00:00Z') })
    const c = step({ id: 'c', position: 2, kind: 'reminder', due_at: new Date('2026-10-27T07:00:00Z') })
    steps.find.mockResolvedValue([a, b, c])
    await service.reorder('user-1', 'seq-1', ['c', 'a', 'b'])
    expect([c.position, a.position, b.position]).toEqual([0, 1, 2])
    expect(c.due_at.toISOString()).toBe('2026-10-15T07:00:00.000Z')
    expect(a.due_at.toISOString()).toBe('2026-10-20T07:00:00.000Z')
    expect(b.due_at.toISOString()).toBe('2026-10-27T07:00:00.000Z')
    expect(steps.save).toHaveBeenCalled()
  })

  it('refuse une liste qui n’est pas EXACTEMENT les étapes à faire', async () => {
    const { service, sequences, steps } = build()
    sequences.findOne.mockResolvedValue(seq())
    steps.find.mockResolvedValue([
      step({ id: 'a', position: 0 }),
      step({ id: 'b', position: 1 }),
      step({ id: 'd', position: 2, status: 'done' }),
    ])
    await expect(service.reorder('user-1', 'seq-1', ['a', 'zzz'])).rejects.toThrow(BadRequestException)
    await expect(service.reorder('user-1', 'seq-1', ['a', 'd'])).rejects.toThrow(BadRequestException)
    expect(steps.save).not.toHaveBeenCalled()
  })

  it('refuse la séquence d’un autre utilisateur', async () => {
    const { service, sequences } = build()
    sequences.findOne.mockResolvedValue(null)
    await expect(service.reorder('user-2', 'seq-1', ['a', 'b'])).rejects.toThrow(NotFoundException)
  })

  it('refuse un ordre qui rapprocherait deux messages sous le plancher d’espacement', async () => {
    const { service, sequences, steps } = build()
    sequences.findOne.mockResolvedValue(seq())
    const a = step({ id: 'a', position: 0, kind: 'email', due_at: new Date('2026-10-15T07:00:00Z') })
    const b = step({ id: 'b', position: 1, kind: 'email', due_at: new Date('2026-10-15T09:00:00Z') })
    steps.find.mockResolvedValue([a, b])
    await expect(service.reorder('user-1', 'seq-1', ['b', 'a'])).rejects.toThrow(BadRequestException)
  })
})

describe('eligibility', () => {
  it('ne rend QUE les contacts possédés par l’utilisateur dans son espace', async () => {
    const { service, contacts, sequences, accounts } = build()
    contacts.find.mockResolvedValue([{ id: 'c1', full_name: 'Jean', account_id: 'acc-1', user_id: 'user-1' }] as never)
    sequences.find.mockResolvedValue([])
    sequences.query.mockResolvedValue([])
    accounts.find.mockResolvedValue([])
    const out = await service.eligibility('user-1', 'ws-1', ['c1', 'foreign'], new Set())
    expect(contacts.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ user_id: 'user-1' }) }),
    )
    expect(out.map(c => c.contact_id)).toEqual(['c1'])
  })

  it('nomme les exclusions contact par contact (séquence active, contacté récemment, RGPD)', async () => {
    const { service, contacts, sequences, accounts } = build()
    contacts.find.mockResolvedValue([
      { id: 'c1', full_name: 'Jean', account_id: 'acc-1' },
      { id: 'c2', full_name: 'Marie', account_id: null },
    ] as never)
    sequences.find.mockResolvedValue([seq({ contact_id: 'c1' })])
    sequences.query.mockResolvedValue([{ contact_id: 'c2', last_sent_at: new Date('2026-10-01T08:00:00Z') }])
    accounts.find.mockResolvedValue([])
    const out = await service.eligibility('user-1', 'ws-1', ['c1', 'c2'], new Set(['c2']))
    expect(out.find(c => c.contact_id === 'c1')?.exclusions.map(e => e.code)).toEqual(['active_sequence'])
    expect(out.find(c => c.contact_id === 'c2')?.exclusions.map(e => e.code)).toEqual([
      'recently_contacted',
      'rgpd_opposition',
    ])
  })

  it('compte client : lu quand l’information existe, sinon inconnu et jamais deviné', async () => {
    const { service, contacts, sequences, accounts } = build()
    contacts.find.mockResolvedValue([
      { id: 'c1', full_name: 'A', account_id: 'acc-client' },
      { id: 'c2', full_name: 'B', account_id: 'acc-vide' },
    ] as never)
    sequences.find.mockResolvedValue([])
    sequences.query.mockResolvedValue([])
    accounts.find.mockResolvedValue([
      { id: 'acc-client', raw_analysis: {}, commercial_status: 'customer' },
      { id: 'acc-vide', raw_analysis: {}, commercial_status: 'inbox' },
    ] as never)
    const out = await service.eligibility('user-1', 'ws-1', ['c1', 'c2'], new Set())
    const c1 = out.find(c => c.contact_id === 'c1')
    const c2 = out.find(c => c.contact_id === 'c2')
    expect(c1?.exclusions.map(e => e.code)).toEqual(['already_client'])
    expect(c1?.client_status_known).toBe(true)
    expect(c2?.exclusions).toEqual([])
    expect(c2?.client_status_known).toBe(false)
  })
})
