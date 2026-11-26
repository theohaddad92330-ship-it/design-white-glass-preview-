/**
 * #3419.1 — les variables d'une VERSION de message : annotées pour l'auteur
 * dans son espace, rattachées à la version COURANTE, jamais sur le message d'un
 * autre espace.
 */
import { NotFoundException } from '@nestjs/common'
import type { SetOutreachMessageVariableRequest } from '@bellum/contracts'
import { OutreachMessageVariablesService } from './outreach-message-variables.service'

const WS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const USER = '11111111-1111-4111-8111-111111111111'
const MESSAGE = '99999999-9999-4999-8999-999999999999'
const ctx = { userId: USER, workspaceId: WS, role: 'sales' as const }

const INPUT: SetOutreachMessageVariableRequest = {
  name: 'Technologie data',
  value: 'Snowflake',
  source: 'Site client',
  as_of: '2026-09-12',
  confidence: 'probable',
  external_use: 'allowed',
}

function build(opts: { existing?: Record<string, unknown> | null; messageWorkspace?: string } = {}) {
  const message = { id: MESSAGE, workspace_id: opts.messageWorkspace ?? WS, current_version: 3 }
  const messages = {
    findOne: jest.fn(async (o: { where: { id: string; workspace_id?: string } }) =>
      o.where.id === message.id && o.where.workspace_id === message.workspace_id ? message : null,
    ),
  }
  const variables = {
    findOne: jest.fn(async () => opts.existing ?? null),
    find: jest.fn(async () => []),
    create: jest.fn((v: Record<string, unknown>) => v),
    save: jest.fn(async (v: Record<string, unknown>) => ({
      id: 'v-1',
      declared_at: new Date('2026-10-04T09:00:00Z'),
      ...v,
    })),
  }
  return { service: new OutreachMessageVariablesService(messages as never, variables as never), variables }
}

describe('OutreachMessageVariablesService (#3419.1)', () => {
  it('écrit la variable sur la version COURANTE, avec son auteur', async () => {
    const { service, variables } = build()
    const saved = await service.set(ctx, MESSAGE, INPUT)
    expect(variables.save).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_id: WS, message_id: MESSAGE, version: 3, declared_by: USER, ...INPUT }),
    )
    expect(saved).toMatchObject({ version: 3, name: 'Technologie data', declared_at: '2026-10-04T09:00:00.000Z' })
  })

  it('re-déclarer le même nom sur la même version MET À JOUR la ligne (pas de doublon)', async () => {
    const { service, variables } = build({
      existing: { id: 'v-0', message_id: MESSAGE, version: 3, name: 'Technologie data', value: 'Old' },
    })
    await service.set(ctx, MESSAGE, INPUT)
    expect(variables.create).not.toHaveBeenCalled()
    expect(variables.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'v-0', value: 'Snowflake' }))
  })

  it('NON — le message d’un autre espace est introuvable, rien n’est écrit', async () => {
    const { service, variables } = build({ messageWorkspace: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })
    await expect(service.set(ctx, MESSAGE, INPUT)).rejects.toBeInstanceOf(NotFoundException)
    expect(variables.save).not.toHaveBeenCalled()
  })

  it('lit les variables de la version courante seulement', async () => {
    const { service, variables } = build()
    await service.list(ctx, MESSAGE)
    expect(variables.find).toHaveBeenCalledWith({
      where: { workspace_id: WS, message_id: MESSAGE, version: 3 },
      order: { name: 'ASC' },
    })
  })
})
