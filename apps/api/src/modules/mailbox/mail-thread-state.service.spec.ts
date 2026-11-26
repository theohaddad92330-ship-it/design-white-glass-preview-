import { BadRequestException } from '@nestjs/common'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { MailThreadMarkEntity } from '../../database/entities/mail-thread-mark.entity'
import { createMockRepository } from '../../database/test-utils'
import { MailThreadStateService } from './mail-thread-state.service'

const NOW = new Date('2026-10-22T10:00:00Z')

describe('Théo B M1.N1-N3/N6 — MailThreadStateService', () => {
  const marks = createMockRepository<MailThreadMarkEntity>()
  const contacts = createMockRepository<ContactEntity>()
  let service: MailThreadStateService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new MailThreadStateService(marks as never, contacts as never)
  })

  it('reporte un fil jusqu’à une date future, sans toucher la marque ni le compte', async () => {
    const result = await service.snooze('u-1', 't-1', '2026-10-30T08:00:00Z', NOW)
    expect(marks.upsert).toHaveBeenCalledWith(
      { user_id: 'u-1', thread_id: 't-1', snooze_until: new Date('2026-10-30T08:00:00Z') },
      { conflictPaths: ['user_id', 'thread_id'] },
    )
    expect(result).toEqual({ snoozeUntil: '2026-10-30T08:00:00.000Z' })
  })

  it('refuse un report dans le passé : reporter, c’est repousser', async () => {
    await expect(service.snooze('u-1', 't-1', '2026-10-01T08:00:00Z', NOW)).rejects.toBeInstanceOf(BadRequestException)
    expect(marks.upsert).not.toHaveBeenCalled()
  })

  it('null retire le report', async () => {
    await service.snooze('u-1', 't-1', null, NOW)
    expect(marks.upsert).toHaveBeenCalledWith(
      { user_id: 'u-1', thread_id: 't-1', snooze_until: null },
      { conflictPaths: ['user_id', 'thread_id'] },
    )
  })

  it('pose ou retire la priorité manuelle', async () => {
    await service.setPriority('u-1', 't-1', true)
    expect(marks.upsert).toHaveBeenCalledWith(
      { user_id: 'u-1', thread_id: 't-1', priority_manual: true },
      { conflictPaths: ['user_id', 'thread_id'] },
    )
  })

  it('ne rattache qu’un contact de l’espace actif', async () => {
    contacts.findOne.mockResolvedValue(null)
    await expect(service.linkContact('u-1', 'ws-1', 't-1', 'c-9')).rejects.toBeInstanceOf(BadRequestException)
    expect(contacts.findOne).toHaveBeenCalledWith({ where: { id: 'c-9', workspace_id: 'ws-1' } })
    expect(marks.upsert).not.toHaveBeenCalled()

    contacts.findOne.mockResolvedValue({ id: 'c-2' } as ContactEntity)
    await expect(service.linkContact('u-1', 'ws-1', 't-1', 'c-2')).resolves.toEqual({ contactId: 'c-2' })
    expect(marks.upsert).toHaveBeenCalledWith(
      { user_id: 'u-1', thread_id: 't-1', contact_id: 'c-2' },
      { conflictPaths: ['user_id', 'thread_id'] },
    )
  })

  it('compte les fils par état, pour CET utilisateur seulement', async () => {
    marks.count.mockImplementation(async (options: { where: Record<string, unknown> }) => {
      const where = options.where
      expect(where.user_id).toBe('u-1')
      if (where.state === 'treated') return 4
      if (where.state === 'irrelevant') return 1
      if (where.state === 'archived') return 2
      if (where.snooze_until !== undefined) return 3
      if (where.priority_manual === true) return 5
      return -1
    })
    await expect(service.counts('u-1', NOW)).resolves.toEqual({
      treated: 4,
      irrelevant: 1,
      archived: 2,
      snoozed: 3,
      prioritized: 5,
    })
  })
})
