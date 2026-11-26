import { benchPushRequestSchema } from '@bellum/contracts'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import { OutreachController } from './outreach.controller'

/**
 * #5029 — « Proposer ce profil » depuis le Reverse Market : UNE séquence
 * (playbook F) sur UN contact, rattachée au consultant, et TOUJOURS manuelle —
 * même quand l'espace a signé le mandat d'envoi automatique (#4016 L5 ne
 * s'applique pas ici, #5029.2).
 */

const user = { userId: 'user-1', email: 'rep@esn.fr' } as CurrentUserPayload
const REQUEST = { consultant_id: '11111111-1111-4111-8111-111111111111', contact_id: 'c1' }

function build() {
  const sequence = {
    id: 'seq-1',
    contact_id: 'c1',
    consultant_id: REQUEST.consultant_id,
    steps: [
      {
        id: 'st-0',
        position: 0,
        kind: 'email',
        due_at: '2026-11-02T08:00:00.000Z',
        payload: { email_draft: { subject: 'Un profil pour Thales', body: 'Bonjour' } },
      },
    ],
  }
  const service = { create: jest.fn().mockResolvedValue(sequence) }
  const messages = {
    create: jest.fn().mockResolvedValue({ id: 'msg-0' }),
    linkedStepIds: jest.fn().mockResolvedValue(new Set()),
  }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'sales' }),
    extraPermissionsOf: jest.fn().mockResolvedValue([]),
  }
  // Un mandat `workspace_sequences` SIGNÉ et vivant : il rattacherait le message s'il était sollicité.
  const delegations = { awaitIfMandated: jest.fn().mockResolvedValue(true) }
  const prepared = { contact_id: 'c1', name: 'Consultant en inter-contrat — Marie', steps: [] }
  const benchPush = { prepare: jest.fn().mockResolvedValue(prepared) }
  const controller = new OutreachController(
    service as never,
    { status: jest.fn().mockResolvedValue({ connected: true }) } as never,
    messages as never,
    workspaceContext as never,
    { stoppedAmong: jest.fn().mockResolvedValue(new Set()) } as never,
    { prepare: jest.fn() } as never,
    { sweep: jest.fn() } as never,
    delegations as never,
    { scheduleForContact: jest.fn() } as never,
    benchPush as never,
  )
  return { controller, service, messages, delegations, benchPush, prepared }
}

describe('POST outreach/sequences/bench-push (#5029)', () => {
  it('exige messages:send, comme toute création de séquence', () => {
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, OutreachController.prototype.benchPush)).toEqual([
      'messages:send',
    ])
  })

  it('#5029.1 — prépare dans l’ESPACE ACTIF et crée UNE séquence rattachée au consultant', async () => {
    const { controller, service, benchPush, prepared } = build()
    await controller.benchPush(REQUEST, user)
    expect(benchPush.prepare).toHaveBeenCalledWith('ws-1', REQUEST)
    expect(service.create).toHaveBeenCalledTimes(1)
    expect(service.create).toHaveBeenCalledWith(prepared, { userId: 'user-1', email: 'rep@esn.fr' }, true, {
      consultant_id: REQUEST.consultant_id,
    })
  })

  it('#5029.2 — le brouillon devient un message à relire, JAMAIS rattaché au mandat signé', async () => {
    const { controller, messages, delegations } = build()
    await controller.benchPush(REQUEST, user)
    expect(messages.create).toHaveBeenCalledTimes(1)
    expect(delegations.awaitIfMandated).not.toHaveBeenCalled()
  })

  it('#5029.3 — le schéma de la route refuse une liste de contacts', () => {
    expect(benchPushRequestSchema.safeParse({ ...REQUEST, contact_ids: ['a', 'b'] }).success).toBe(false)
  })
})
