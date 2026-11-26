import { BadRequestException } from '@nestjs/common'
import type { WorkspaceMemberView } from '../workspace/workspace-context.service'
import { EsnProfileCorrectionRequestService } from './esn-profile-correction-request.service'

const WS = 'ws-1'
const REPORTER = 'user-member'
const OWNER = 'user-owner'
const OTHER_ADMIN = 'user-sales-ops'
const OTHER_MEMBER = 'user-member-2'

function fakeRepo() {
  const rows: Record<string, unknown>[] = []
  return {
    rows,
    create: jest.fn((input: Record<string, unknown>) => ({ ...input })),
    save: jest.fn(async (input: Record<string, unknown>) => {
      if (!input.id) input.id = `row-${rows.length + 1}`
      if (!input.created_at) input.created_at = new Date('2026-09-18T10:00:00.000Z')
      rows.push(input)
      return input
    }),
  }
}

function build(opts: { members?: WorkspaceMemberView[]; createNotification?: jest.Mock } = {}) {
  const repo = fakeRepo()
  const members: WorkspaceMemberView[] = opts.members ?? [
    { userId: OWNER, email: 'owner@acme.fr', fullName: 'Owner', role: 'owner', isSelf: false },
    { userId: OTHER_ADMIN, email: 'sales-ops@acme.fr', fullName: 'Sales Ops', role: 'sales_ops', isSelf: false },
    { userId: REPORTER, email: 'member@acme.fr', fullName: 'Member', role: 'member', isSelf: true },
    { userId: OTHER_MEMBER, email: 'member2@acme.fr', fullName: 'Member 2', role: 'sales', isSelf: false },
  ]
  const resolveActiveWorkspace = jest.fn().mockResolvedValue({ workspaceId: WS, role: 'member' })
  const listMembers = jest.fn().mockResolvedValue(members)
  const workspaceContext = { resolveActiveWorkspace, listMembers } as never
  const createNotification = opts.createNotification ?? jest.fn().mockResolvedValue(undefined)
  const notifications = { createNotification } as never
  const service = new EsnProfileCorrectionRequestService(repo as never, workspaceContext, notifications)
  return { service, repo, resolveActiveWorkspace, listMembers, createNotification }
}

// #2018.7 — signaler une information d'entreprise fausse, sans l'écraser.
describe('EsnProfileCorrectionRequestService', () => {
  it('persiste la demande — champ, raison, statut pending, espace résolu', async () => {
    const { service, repo } = build()
    const result = await service.create(REPORTER, { fieldKey: 'esn_name', reason: 'Ancienne raison sociale' })

    expect(repo.rows).toHaveLength(1)
    expect(repo.rows[0]).toMatchObject({
      workspace_id: WS,
      reporter_user_id: REPORTER,
      field_key: 'esn_name',
      reason: 'Ancienne raison sociale',
      status: 'pending',
    })
    expect(result.status).toBe('pending')
    expect(result.fieldKey).toBe('esn_name')
    expect(result.resolvedAt).toBeNull()
  })

  it("sait dire NON à une clé de champ qui n'existe pas dans le contrat — rien n'est écrit", async () => {
    const { service, repo } = build()
    await expect(service.create(REPORTER, { fieldKey: 'ceci_n_existe_pas', reason: 'Raison' })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(repo.rows).toHaveLength(0)
  })

  it('notifie chaque administrateur (team:manage) de l’espace, jamais le rapporteur lui-même', async () => {
    const { service, createNotification } = build()
    await service.create(REPORTER, { fieldKey: 'esn_name', reason: 'Raison' })

    expect(createNotification).toHaveBeenCalledTimes(2)
    const notified = createNotification.mock.calls.map(call => call[0])
    expect(notified.sort()).toEqual([OTHER_ADMIN, OWNER].sort())
  })

  it('ne notifie jamais un membre sans team:manage', async () => {
    const { service, createNotification } = build()
    await service.create(REPORTER, { fieldKey: 'esn_name', reason: 'Raison' })

    const notified = createNotification.mock.calls.map(call => call[0])
    expect(notified).not.toContain(OTHER_MEMBER)
    expect(notified).not.toContain(REPORTER)
  })

  it('la notification porte le type system, un lien, et jamais l’origin proactive (une décision ne doit pas être avalée par le plafond)', async () => {
    const { service, createNotification } = build()
    await service.create(REPORTER, { fieldKey: 'esn_name', reason: 'Raison' })

    const [, payload] = createNotification.mock.calls[0] as [string, Record<string, unknown>]
    expect(payload.type).toBe('system')
    expect(payload.origin).toBe('user_triggered')
    expect(typeof payload.link).toBe('string')
  })

  it('zéro administrateur (hors soi-même) → la demande est quand même persistée, sans notification', async () => {
    const { service, repo, createNotification } = build({
      members: [{ userId: REPORTER, email: 'member@acme.fr', fullName: 'Member', role: 'owner', isSelf: true }],
    })
    const result = await service.create(REPORTER, { fieldKey: 'esn_name', reason: 'Raison' })

    expect(repo.rows).toHaveLength(1)
    expect(result.status).toBe('pending')
    expect(createNotification).not.toHaveBeenCalled()
  })

  it('un échec de notification ne fait jamais échouer le signalement (best-effort)', async () => {
    const createNotification = jest.fn().mockRejectedValue(new Error('boom'))
    const { service, repo } = build({ createNotification })
    await expect(service.create(REPORTER, { fieldKey: 'esn_name', reason: 'Raison' })).resolves.toMatchObject({
      status: 'pending',
    })
    expect(repo.rows).toHaveLength(1)
  })

  // #2010.15 — signaler une INTERPRÉTATION de l'audit (déduite/recommandée),
  // distinct de #2018.7 (une réponse déclarée). `AUDIT_INTERPRETATION_FIELD_KEY`
  // n'est PAS une clé d'`EsnAnswers` : le service doit l'accepter sans casser
  // la garde contre une clé de champ fabriquée.
  it('accepte le signalement d’une interprétation de l’audit — clé hors EsnAnswers, à dessein', async () => {
    const { service, repo } = build()
    const result = await service.create(REPORTER, {
      fieldKey: 'audit:interpretation',
      reason: 'Le verdict ne correspond pas à ce que je vis sur le terrain.',
    })

    expect(repo.rows).toHaveLength(1)
    expect(result.fieldKey).toBe('audit:interpretation')
    expect(result.status).toBe('pending')
  })

  it('refuse toujours une clé fabriquée qui n’est ni une réponse ni l’interprétation de l’audit', async () => {
    const { service, repo } = build()
    await expect(service.create(REPORTER, { fieldKey: 'audit:autre_chose', reason: 'Raison' })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(repo.rows).toHaveLength(0)
  })
})
