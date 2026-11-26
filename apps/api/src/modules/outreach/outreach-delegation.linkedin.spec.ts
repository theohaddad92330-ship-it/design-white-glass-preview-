import type { Repository } from 'typeorm'
import type { OutreachDelegationEntity } from '../../database/entities/outreach-delegation.entity'
import { OutreachDelegationService } from './outreach-delegation.service'

const NOW = new Date('2026-10-29T10:00:00.000Z')

function row(id: string, scope: string): OutreachDelegationEntity {
  return {
    id,
    workspace_id: 'ws',
    user_id: 'u',
    scope,
    renewed_from: null,
    campaign_label: scope,
    contact_ids: [],
    channels: [],
    sender_mailbox_id: 'x',
    messages: [],
    content_hash: null,
    window_start_hour: 0,
    window_end_hour: 24,
    starts_at: NOW,
    expires_at: new Date('2026-11-29T10:00:00.000Z'),
    max_messages: 10,
    sent_count: 0,
    daily_limit: scope === 'linkedin_send' ? 25 : null,
    validated_by: ['u'],
    validated_at: NOW,
    revoked_at: null,
    paused_at: null,
    created_at: NOW,
  } as OutreachDelegationEntity
}

function build(rows: OutreachDelegationEntity[]) {
  const repo = {
    find: jest.fn().mockResolvedValue(rows),
    findOne: jest.fn(async ({ where }: { where: { id: string } }) => rows.find(r => r.id === where.id) ?? null),
    save: jest.fn(async (r: OutreachDelegationEntity) => r),
  } as unknown as Repository<OutreachDelegationEntity>
  return new OutreachDelegationService(repo, {} as never, {} as never, {} as never)
}

describe('#4737 K2 — une notion de délégation, deux portes : l’e-mail ne voit pas le mandat LinkedIn', () => {
  const ctx = { workspaceId: 'ws', userId: 'u' } as never

  it('la liste des délégations d’envoi e-mail n’affiche pas la ligne LinkedIn', async () => {
    const out = await build([row('mail', 'laura_send'), row('li', 'linkedin_send')]).list(ctx, NOW)
    expect(out.map(v => v.id)).toEqual(['mail'])
  })

  it('pause / révocation e-mail ne touchent pas un mandat LinkedIn : introuvable de ce côté', async () => {
    const svc = build([row('li', 'linkedin_send')])
    await expect(svc.revoke(ctx, 'li', NOW)).rejects.toThrow('introuvable')
    await expect(svc.pause(ctx, 'li', NOW)).rejects.toThrow('introuvable')
  })
})
