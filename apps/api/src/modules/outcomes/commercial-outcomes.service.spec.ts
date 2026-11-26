import { NotFoundException } from '@nestjs/common'
import { CommercialOutcomesService } from './commercial-outcomes.service'

/**
 * #2126.47/.48/.50/.51/.53/.54/.55/.60 (épopée #2787) — le ledger APPEND-ONLY
 * des outcomes commerciaux. Voir le docblock du service : `record`/`list`/
 * `summary` sont les SEULES méthodes — aucune `update`/`delete`.
 */
describe('CommercialOutcomesService', () => {
  const WORKSPACE_ID = 'w-1'
  const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111'
  const CONTACT_ID = '22222222-2222-4222-8222-222222222222'
  const RECORDED_AT = new Date('2026-09-25T09:00:00.000Z')

  function build(over: Partial<Record<'outcomes' | 'accounts' | 'contacts', object>> = {}) {
    const outcomes = {
      create: jest.fn((row: object) => row),
      save: jest.fn(async (row: object) => ({
        id: 'o-neuf',
        recorded_at: RECORDED_AT,
        created_at: RECORDED_AT,
        ...row,
      })),
      find: jest.fn().mockResolvedValue([]),
      ...(over.outcomes ?? {}),
    }
    const accounts = { findOne: jest.fn().mockResolvedValue({ id: ACCOUNT_ID }), ...(over.accounts ?? {}) }
    const contacts = { findOne: jest.fn().mockResolvedValue({ id: CONTACT_ID }), ...(over.contacts ?? {}) }
    const service = new CommercialOutcomesService(outcomes as never, accounts as never, contacts as never)
    return { service, outcomes, accounts, contacts }
  }

  it('n’expose AUCUNE méthode de mise à jour ou de suppression — le ledger est append-only (#2126.60)', () => {
    const { service } = build()
    expect((service as unknown as Record<string, unknown>).update).toBeUndefined()
    expect((service as unknown as Record<string, unknown>).delete).toBeUndefined()
    expect((service as unknown as Record<string, unknown>).remove).toBeUndefined()
  })

  it('refuse un compte hors de l’espace — avant toute écriture', async () => {
    const { service, accounts } = build({ accounts: { findOne: jest.fn().mockResolvedValue(null) } })
    await expect(
      service.record(WORKSPACE_ID, ACCOUNT_ID, 'user-1', { type: 'message_replied' }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(accounts.findOne).toHaveBeenCalled()
  })

  it('enregistre un outcome de PORTÉE COMPTE (#2126.48/.54) — `contactId` reste `null`', async () => {
    const { service, outcomes } = build()
    const created = await service.record(WORKSPACE_ID, ACCOUNT_ID, 'user-1', {
      type: 'declined',
      reason: 'Budget déjà engagé ailleurs',
    })
    expect(outcomes.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: WORKSPACE_ID,
        account_id: ACCOUNT_ID,
        contact_id: null,
        outcome_type: 'declined',
        reason: 'Budget déjà engagé ailleurs',
        recorded_by: 'user-1',
      }),
    )
    expect(created.contactId).toBeNull()
    expect(created.type).toBe('declined')
  })

  it('refuse un contact qui n’appartient pas à CE compte, sur CET espace', async () => {
    const { service } = build({ contacts: { findOne: jest.fn().mockResolvedValue(null) } })
    await expect(
      service.record(WORKSPACE_ID, ACCOUNT_ID, 'user-1', { type: 'message_replied', contactId: CONTACT_ID }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('enregistre un outcome porté par un CONTACT (#2126.47/.50/.51/.53) sans raison', async () => {
    const { service, outcomes } = build()
    const created = await service.record(WORKSPACE_ID, ACCOUNT_ID, 'user-1', {
      type: 'consultant_positioned',
      contactId: CONTACT_ID,
    })
    expect(outcomes.create).toHaveBeenCalledWith(
      expect.objectContaining({ contact_id: CONTACT_ID, outcome_type: 'consultant_positioned', reason: null }),
    )
    expect(created.reason).toBeNull()
  })

  it('la synthèse (#2126.56/.58/.59) compte PAR TYPE et nomme les fiches `incorrect_contact`', async () => {
    const rows = [
      { outcome_type: 'incorrect_contact', contact_id: CONTACT_ID },
      { outcome_type: 'incorrect_contact', contact_id: CONTACT_ID },
      { outcome_type: 'message_replied', contact_id: 'c-2' },
      { outcome_type: 'declined', contact_id: null },
    ]
    const { service } = build({ outcomes: { find: jest.fn().mockResolvedValue(rows) } })
    const summary = await service.summary(WORKSPACE_ID, ACCOUNT_ID)
    expect(summary.counts.incorrect_contact).toBe(2)
    expect(summary.counts.message_replied).toBe(1)
    expect(summary.counts.qualified_relationship).toBe(0)
    expect(summary.incorrectContactIds).toEqual([CONTACT_ID])
  })

  it('`incorrectContactIds` déduplique et ignore les lignes de PORTÉE COMPTE (`contact_id: null`)', async () => {
    const rows = [{ contact_id: CONTACT_ID }, { contact_id: CONTACT_ID }, { contact_id: null }]
    const { service, outcomes } = build({ outcomes: { find: jest.fn().mockResolvedValue(rows) } })
    const ids = await service.incorrectContactIds(WORKSPACE_ID)
    expect([...ids]).toEqual([CONTACT_ID])
    expect(outcomes.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ outcome_type: 'incorrect_contact' }) }),
    )
  })
})
