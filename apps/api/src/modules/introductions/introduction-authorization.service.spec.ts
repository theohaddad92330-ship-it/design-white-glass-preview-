import { IntroductionAuthorizationEntity } from '../../database/entities/introduction-authorization.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { IntroductionAuthorizationService } from './introduction-authorization.service'

function row(partial: Partial<IntroductionAuthorizationEntity>): IntroductionAuthorizationEntity {
  return {
    id: 'ia-1',
    workspace_id: 'ws-1',
    target_contact_id: 'contact-1',
    referrer_contact_id: 'contact-2',
    referrer_label: null,
    granted: true,
    channel: 'email',
    text: 'Oui, vas-y.',
    scope: null,
    restrictions: null,
    authorized_at: new Date('2026-09-20T09:00:00.000Z'),
    recorded_by: 'u-1',
    link_kind: null,
    verified: false,
    warmth: null,
    created_at: new Date('2026-09-22T10:00:00.000Z'),
    ...partial,
  } as IntroductionAuthorizationEntity
}

describe('#2373.9 — IntroductionAuthorizationService', () => {
  let repo: MockRepository<IntroductionAuthorizationEntity>
  let service: IntroductionAuthorizationService

  beforeEach(() => {
    repo = createMockRepository<IntroductionAuthorizationEntity>()
    service = new IntroductionAuthorizationService(repo as never)
  })

  it('record stamps identity from the caller (JWT/workspace), never the body', async () => {
    repo.save.mockImplementation(async (e: Partial<IntroductionAuthorizationEntity>) => ({
      ...e,
      id: 'ia-9',
      created_at: new Date('2026-09-22T10:00:00.000Z'),
    }))
    const item = await service.record({
      workspaceId: 'ws-1',
      targetContactId: 'contact-1',
      referrerContactId: 'contact-2',
      granted: true,
      channel: 'email',
      text: '  Oui, vas-y.  ',
      authorizedAt: '2026-09-20T09:00:00.000Z',
      recordedBy: 'u-1',
    })
    expect(repo.create).toHaveBeenCalledWith({
      workspace_id: 'ws-1',
      target_contact_id: 'contact-1',
      referrer_contact_id: 'contact-2',
      referrer_label: null,
      granted: true,
      channel: 'email',
      text: 'Oui, vas-y.',
      scope: null,
      restrictions: null,
      authorized_at: new Date('2026-09-20T09:00:00.000Z'),
      recorded_by: 'u-1',
      link_kind: null,
      verified: false,
      warmth: null,
    })
    expect(item.id).toBe('ia-9')
    expect(item.granted).toBe(true)
  })

  it('#3403.7 — persiste le type de lien et son statut vérifié quand ils sont fournis', async () => {
    repo.save.mockImplementation(async (e: Partial<IntroductionAuthorizationEntity>) => ({
      ...e,
      id: 'ia-11',
      created_at: new Date('2026-09-22T10:00:00.000Z'),
    }))
    const item = await service.record({
      workspaceId: 'ws-1',
      targetContactId: 'contact-1',
      granted: true,
      channel: 'linkedin',
      authorizedAt: '2026-09-20T09:00:00.000Z',
      recordedBy: 'u-1',
      linkKind: 'former_colleague',
      verified: true,
    })
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ link_kind: 'former_colleague', verified: true }))
    expect(item.linkKind).toBe('former_colleague')
    expect(item.verified).toBe(true)
  })

  it('record conserve aussi un REFUS — une preuve, pas moins qu’un accord', async () => {
    repo.save.mockImplementation(async (e: Partial<IntroductionAuthorizationEntity>) => ({
      ...e,
      id: 'ia-10',
      created_at: new Date('2026-09-22T10:00:00.000Z'),
    }))
    const item = await service.record({
      workspaceId: 'ws-1',
      targetContactId: 'contact-1',
      granted: false,
      channel: 'verbal',
      authorizedAt: '2026-09-21T09:00:00.000Z',
      recordedBy: 'u-1',
    })
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ granted: false }))
    expect(item.granted).toBe(false)
  })

  it('listFor scopes by target contact AND workspace (never another team)', async () => {
    repo.find.mockResolvedValue([row({})])
    const items = await service.listFor('contact-1', 'ws-1')
    expect(repo.find).toHaveBeenCalledWith({
      where: { target_contact_id: 'contact-1', workspace_id: 'ws-1' },
      order: { authorized_at: 'DESC' },
    })
    expect(items).toHaveLength(1)
    expect(items[0]?.channel).toBe('email')
    // Pas de fuite d'identifiants internes vers le wire.
    expect(items[0]).not.toHaveProperty('workspace_id')
    expect(items[0]).not.toHaveProperty('recorded_by')
  })

  it('#3403.12 — persiste la chaleur déclarée, null sinon', async () => {
    repo.save.mockImplementation(async (e: Partial<IntroductionAuthorizationEntity>) => ({
      ...e,
      id: 'ia-10',
      created_at: new Date('2026-09-22T10:00:00.000Z'),
    }))
    const withWarmth = await service.record({
      workspaceId: 'ws-1',
      targetContactId: 'contact-1',
      granted: true,
      channel: 'email',
      authorizedAt: '2026-09-01T00:00:00.000Z',
      recordedBy: 'u-1',
      warmth: 'cordial',
    })
    expect(repo.create).toHaveBeenLastCalledWith(expect.objectContaining({ warmth: 'cordial' }))
    expect(withWarmth.warmth).toBe('cordial')
  })
})
