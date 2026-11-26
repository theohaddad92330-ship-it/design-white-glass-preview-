import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { ObjectPrivacyService, type PrivacyActor } from './object-privacy.service'

type Row = { id: string; workspace_id: string; owner_id: string | null; is_private: boolean }

// #4158.34 — le geste qui marque un projet / besoin / mission « privé ».
function setup(row: Row | null) {
  const repo = {
    findOne: jest.fn(async ({ where }: { where: { id: string; workspace_id: string } }) =>
      row && row.id === where.id && row.workspace_id === where.workspace_id ? { ...row } : null,
    ),
    update: jest.fn(async () => ({ affected: 1 })),
  }
  const service = new ObjectPrivacyService(repo as never, repo as never, repo as never)
  return { service, repo }
}

const actor = (over: Partial<PrivacyActor> = {}): PrivacyActor => ({
  userId: 'u-owner',
  workspaceId: 'w1',
  role: 'sales',
  ...over,
})
const row = (over: Partial<Row> = {}): Row => ({
  id: 'p1',
  workspace_id: 'w1',
  owner_id: 'u-owner',
  is_private: false,
  ...over,
})

describe('ObjectPrivacyService.setPrivate', () => {
  it('le porteur marque son objet privé', async () => {
    const { service, repo } = setup(row())
    await expect(service.setPrivate('project', 'p1', true, actor())).resolves.toEqual({ id: 'p1', is_private: true })
    expect(repo.update).toHaveBeenCalledWith({ id: 'p1', workspace_id: 'w1' }, { is_private: true })
  })

  it('qui gère l’équipe peut le faire sur l’objet d’un autre', async () => {
    const { service } = setup(row({ owner_id: 'u-other' }))
    await expect(service.setPrivate('need', 'p1', true, actor({ role: 'admin' }))).resolves.toEqual({
      id: 'p1',
      is_private: true,
    })
  })

  it('un collègue qui n’est ni porteur ni gestionnaire reçoit 403 et rien n’est écrit', async () => {
    const { service, repo } = setup(row({ owner_id: 'u-other' }))
    await expect(service.setPrivate('mission', 'p1', true, actor())).rejects.toBeInstanceOf(ForbiddenException)
    expect(repo.update).not.toHaveBeenCalled()
  })

  it('un objet sans porteur ne se privatise que par qui gère l’équipe', async () => {
    const { service } = setup(row({ owner_id: null }))
    await expect(service.setPrivate('project', 'p1', true, actor())).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('un utilisateur d’un AUTRE espace reçoit 404, même admin', async () => {
    const { service, repo } = setup(row())
    await expect(
      service.setPrivate('project', 'p1', true, actor({ workspaceId: 'w2', role: 'owner' })),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(repo.update).not.toHaveBeenCalled()
  })

  it('repasser en partagé est permis au porteur', async () => {
    const { service, repo } = setup(row({ is_private: true }))
    await service.setPrivate('project', 'p1', false, actor())
    expect(repo.update).toHaveBeenCalledWith({ id: 'p1', workspace_id: 'w1' }, { is_private: false })
  })
})
