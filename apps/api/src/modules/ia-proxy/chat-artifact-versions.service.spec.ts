import { BadRequestException, NotFoundException } from '@nestjs/common'
import type { ReplyBlock } from '@bellum/contracts'
import { ChatArtifactVersionsService } from './chat-artifact-versions.service'

const PLAN = {
  type: 'action_plan',
  title: 'Plan',
  steps: [{ label: 'Qualifier' }, { label: 'Proposer' }],
} as ReplyBlock
const VERDICT = {
  type: 'verdict',
  conclusion: 'Commence par le compte Alpha cette semaine.',
  reasons: ["Un appel d'offres est ouvert jusqu'au 30 septembre.", 'Deux consultants du vivier sont disponibles.'],
  limits: ["Le budget n'est pas confirmé."],
  route: 'Approche intermédiaire sur la BU concernée, puis recherche du sponsor budgétaire.',
  contact: { name: 'Julie Marchand', role: 'Head of Engineering', href: '/contacts/julie-marchand' },
  next_action: { label: 'Ouvrir le dossier', href: '/accounts/alpha-1' },
} as unknown as ReplyBlock
const fenced = (block: unknown) => '```bellum-block\n' + JSON.stringify(block) + '\n```'

const MESSAGE_ID = '11111111-1111-4111-8111-111111111111'

function build(message: Record<string, unknown> | null) {
  const rows: Array<Record<string, unknown>> = []
  const versions = {
    create: (row: Record<string, unknown>) => ({ created_at: new Date('2026-09-30T10:00:00Z'), ...row }),
    save: jest.fn(async (row: Record<string, unknown>) => {
      rows.push(row)
      return row
    }),
    findOne: jest.fn(async ({ where }: { where: { message_id: string; block_rank: number } }) => {
      const mine = rows.filter(r => r.message_id === where.message_id && r.block_rank === where.block_rank)
      return mine.sort((a, b) => Number(b.version) - Number(a.version))[0] ?? null
    }),
    find: jest.fn(async () => [...rows].sort((a, b) => Number(b.version) - Number(a.version))),
  }
  const messages = { findOne: jest.fn(async () => message), save: jest.fn(), update: jest.fn() }
  const service = new ChatArtifactVersionsService(versions as never, messages as never)
  return { service, versions, messages, rows }
}

const assistant = (over: Record<string, unknown> = {}) => ({
  id: MESSAGE_ID,
  workspace_id: 'ws-1',
  user_id: 'user-1',
  conversation_id: null,
  role: 'assistant',
  content: `Voici.\n\n${fenced(VERDICT)}\n\n${fenced(PLAN)}`,
  ...over,
})
const edited = { ...(PLAN as object), title: 'Plan révisé' } as ReplyBlock
const ARTIFACT = `${MESSAGE_ID}:1`

describe('ChatArtifactVersionsService (#2429.9)', () => {
  it('chaque modification ajoute une version (2, puis 3) — le message n’est JAMAIS réécrit', async () => {
    const { service, messages } = build(assistant())
    const v2 = await service.edit({
      workspaceId: 'ws-1',
      userId: 'user-1',
      input: { artifactId: ARTIFACT, block: edited },
    })
    const v3 = await service.edit({
      workspaceId: 'ws-1',
      userId: 'user-1',
      input: { artifactId: ARTIFACT, block: edited },
    })
    expect([v2.version, v3.version]).toEqual([2, 3])
    expect(v2.artifactId).toBe(ARTIFACT)
    expect(messages.save).not.toHaveBeenCalled()
    expect(messages.update).not.toHaveBeenCalled()
  })

  it('l’historique rend les versions de la plus récente à la plus ancienne', async () => {
    const { service } = build(assistant())
    await service.edit({ workspaceId: 'ws-1', userId: 'user-1', input: { artifactId: ARTIFACT, block: edited } })
    await service.edit({ workspaceId: 'ws-1', userId: 'user-1', input: { artifactId: ARTIFACT, block: edited } })
    const history = await service.history({ workspaceId: 'ws-1', artifactId: ARTIFACT })
    expect(history.map(v => v.version)).toEqual([3, 2])
  })

  it('refuse : message introuvable, question (pas une réponse), fil privé d’un autre', async () => {
    for (const message of [null, assistant({ role: 'user' }), assistant({ user_id: 'autre' })]) {
      const { service, rows } = build(message)
      await expect(
        service.edit({ workspaceId: 'ws-1', userId: 'user-1', input: { artifactId: ARTIFACT, block: edited } }),
      ).rejects.toBeInstanceOf(NotFoundException)
      expect(rows).toHaveLength(0)
    }
  })

  it('une conversation NOMMÉE est partagée par l’espace : un collègue peut modifier', async () => {
    const { service } = build(assistant({ user_id: 'autre', conversation_id: 'conv-1' }))
    const view = await service.edit({
      workspaceId: 'ws-1',
      userId: 'user-1',
      input: { artifactId: ARTIFACT, block: edited },
    })
    expect(view.editedBy).toBe('user-1')
  })

  it('refuse un type changé et un artefact non modifiable — rien n’est écrit', async () => {
    const { service, rows } = build(assistant())
    await expect(
      service.edit({ workspaceId: 'ws-1', userId: 'user-1', input: { artifactId: ARTIFACT, block: VERDICT } }),
    ).rejects.toBeInstanceOf(BadRequestException)
    await expect(
      service.edit({ workspaceId: 'ws-1', userId: 'user-1', input: { artifactId: `${MESSAGE_ID}:0`, block: VERDICT } }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(rows).toHaveLength(0)
  })

  it('latestFor garde la version la plus récente par artefact, en une requête', async () => {
    const { service, versions } = build(assistant())
    await service.edit({ workspaceId: 'ws-1', userId: 'user-1', input: { artifactId: ARTIFACT, block: edited } })
    await service.edit({ workspaceId: 'ws-1', userId: 'user-1', input: { artifactId: ARTIFACT, block: edited } })
    versions.find.mockClear()
    const latest = await service.latestFor('ws-1', [MESSAGE_ID])
    expect(versions.find).toHaveBeenCalledTimes(1)
    expect(latest.get(MESSAGE_ID)?.get(ARTIFACT)?.version).toBe(3)
    expect((await service.latestFor('ws-1', [])).size).toBe(0)
  })
})
