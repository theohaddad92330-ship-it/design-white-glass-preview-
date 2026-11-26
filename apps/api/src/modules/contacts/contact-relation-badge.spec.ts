import type { Repository } from 'typeorm'
import type { ActivityEntity } from '../../database/entities/activity.entity'
import { readContactRelationBadge } from './contact-relation-badge'

function repoReturning(rows: Partial<ActivityEntity>[]) {
  const find = jest.fn().mockResolvedValue(rows)
  return { repo: { find } as unknown as Repository<ActivityEntity>, find }
}

const inbound = {
  id: 'a1',
  kind: 'email',
  direction: 'inbound',
  occurred_at: new Date('2026-10-12T09:00:00Z'),
  verdict: null,
  call_outcome: null,
}

describe('readContactRelationBadge — Théo B C5.R2', () => {
  it('lit les activités du contact DANS la requête, bornées à l’espace', async () => {
    const { repo, find } = repoReturning([])
    await readContactRelationBadge(repo, { workspace_id: 'ws-1' }, 'c-1', null)
    expect(find.mock.calls[0][0].where).toEqual({ workspace_id: 'ws-1', contact_id: 'c-1' })
  })

  it('une réponse entrante dérive « échange engagé »', async () => {
    const { repo } = repoReturning([inbound])
    const badge = await readContactRelationBadge(repo, { workspace_id: 'ws-1' }, 'c-1', 'new')
    expect(badge?.shown).toEqual({ source: 'derived', relation: 'engaged' })
  })

  it('la déclaration humaine gagne', async () => {
    const { repo } = repoReturning([inbound])
    const badge = await readContactRelationBadge(repo, { workspace_id: 'ws-1' }, 'c-1', 'silence')
    expect(badge?.shown).toEqual({ source: 'declared', status: 'silence' })
  })

  it('sans dépôt : aucun badge, jamais un badge inventé', async () => {
    expect(await readContactRelationBadge(undefined, { workspace_id: 'ws-1' }, 'c-1', null)).toBeNull()
  })
})
