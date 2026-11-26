import { MissionStatusController } from './mission-status.controller'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const MISSION = 'a0000000-0000-4000-8000-000000000001'

/**
 * #2193.50 (épopée #2953) — « qui a corrigé quoi sur cette mission ? » n'avait
 * aucun lecteur : `ProvenanceService.history()` sait déjà lire n'importe quel
 * `entity_type` (`'mission'` fait partie de `PROVENANCE_ENTITY_TYPES` depuis
 * #2407), mais rien ne l'appelait pour une mission — même défaut que
 * `record_field_audit` documente lui-même (« un correctif isolé serait
 * incohérent avec le reste du produit », #2953 lot g17) : la réponse est de
 * BRANCHER le lecteur générique déjà écrit pour compte/contact, pas d'en
 * inventer un second.
 */
function makeController() {
  const provenance = {
    history: jest.fn(async () => [{ id: 'audit-1', field: 'label' }]),
    commit: jest.fn(async () => undefined),
  }
  const workspaceContext = { resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WORKSPACE })) }
  const documents = {
    list: jest.fn(async () => [{ id: 'doc-1' }]),
    create: jest.fn(async () => ({ id: 'doc-neuf' })),
    updateStatus: jest.fn(async () => ({ id: 'doc-1', status: 'signed' })),
  }
  const businessUnit = {
    current: jest.fn(async () => ({ businessUnit: null, inherited: false })),
    // Rejoue le contrat réel : le service appelle le journal passé par le contrôleur.
    transfer: jest.fn(
      async (_ws: string, _user: string, missionId: string, _body: unknown, journal: (c: unknown) => Promise<void>) => {
        await journal({ field: 'business_unit_id', oldValue: 'BU Data', newValue: 'BU Cloud' })
        return { missionId, from: null, to: { id: 'bu-b', name: 'BU Cloud' } }
      },
    ),
  }
  const statuses = {
    changeMissionStatus: jest.fn(async (_ws: string, _u: string, _m: string, body: { to: string }) => ({
      from: 'ready_to_start',
      to: body.to,
      direction: 'forward' as const,
    })),
    lifecycleFacts: jest.fn(async () => ({
      status: 'active',
      endsOn: '2027-03-31',
      dailyRate: null,
      consultantIds: ['c-1'],
    })),
  }
  const engagement = { startEngagement: jest.fn(async () => [{ consultantId: 'c-1', outcome: 'written' }]) }
  const controller = new MissionStatusController(
    statuses as never,
    {} as never,
    workspaceContext as never,
    provenance as never,
    documents as never,
    businessUnit as never,
    engagement as never,
  )
  return { controller, provenance, documents, businessUnit, statuses, engagement }
}

const user = { userId: USER } as never

describe('MissionStatusController — historique des corrections (#2193.50)', () => {
  it("lit le journal générique avec entityType='mission', jamais une seconde classification", async () => {
    const { controller, provenance } = makeController()

    const result = await controller.history(user, MISSION)

    expect(provenance.history).toHaveBeenCalledWith(WORKSPACE, 'mission', MISSION)
    expect(result).toEqual({ items: [{ id: 'audit-1', field: 'label' }] })
  })
})

/**
 * #2193.51 (épopée #2953) — les DOCUMENTS d'une mission, branchés sur le même
 * contrôleur scopé (workspace + missionId) que l'historique juste au-dessus.
 */
describe('MissionStatusController — documents (#2193.51)', () => {
  it('liste les documents de la mission, dans l’espace actif', async () => {
    const { controller, documents } = makeController()

    const result = await controller.listMissionDocuments(user, MISSION)

    expect(documents.list).toHaveBeenCalledWith(WORKSPACE, MISSION)
    expect(result).toEqual({ items: [{ id: 'doc-1' }] })
  })

  it('crée un document sur la mission', async () => {
    const { controller, documents } = makeController()

    const result = await controller.createMissionDocument(user, MISSION, {
      kind: 'contract',
      name: 'Contrat.pdf',
    } as never)

    expect(documents.create).toHaveBeenCalledWith(WORKSPACE, MISSION, { kind: 'contract', name: 'Contrat.pdf' })
    expect(result).toEqual({ id: 'doc-neuf' })
  })

  it('change le statut d’un document de la mission', async () => {
    const { controller, documents } = makeController()

    const result = await controller.updateMissionDocumentStatus(user, MISSION, 'doc-1', { status: 'signed' } as never)

    expect(documents.updateStatus).toHaveBeenCalledWith(WORKSPACE, MISSION, 'doc-1', 'signed')
    expect(result).toEqual({ id: 'doc-1', status: 'signed' })
  })
})

describe('MissionStatusController — transfert de BU (#3413 « autre BU »)', () => {
  it('journalise le transfert : source humaine, règle nommée, qui = l’utilisateur', async () => {
    const { controller, provenance } = makeController()
    const missionId = '11111111-1111-4111-8111-111111111111'

    await controller.transferBusinessUnit(user, missionId, {
      targetBusinessUnitId: '33333333-3333-4333-8333-333333333333',
      confirm: true,
    })

    expect(provenance.commit).toHaveBeenCalledWith({
      workspaceId: expect.any(String),
      entityType: 'mission',
      entityId: missionId,
      source: 'human',
      actorId: USER,
      rule: 'mission_business_unit_transfer',
      changes: [{ field: 'business_unit_id', oldValue: 'BU Data', newValue: 'BU Cloud' }],
    })
  })
})

describe('MissionStatusController — le démarrage met le consultant « en mission » (#4196)', () => {
  it.each(['active', 'at_risk', 'renewal_pending', 'ending'])(
    'passage à « %s » : le consultant affecté suit',
    async to => {
      const { controller, engagement } = makeController()
      const result = await controller.changeMissionStatus(user, MISSION, { to } as never)
      expect(engagement.startEngagement).toHaveBeenCalledWith(WORKSPACE, USER, ['c-1'], '2027-03-31')
      expect(result.engagement).toEqual([{ consultantId: 'c-1', outcome: 'written' }])
    },
  )

  it('un statut d’avant démarrage ne touche à aucune fiche', async () => {
    const { controller, engagement } = makeController()
    const result = await controller.changeMissionStatus(user, MISSION, { to: 'onboarding' } as never)
    expect(engagement.startEngagement).not.toHaveBeenCalled()
    expect(result.engagement).toBeUndefined()
  })

  it('un changement « same » ou un retour arrière n’écrit rien sur la fiche', async () => {
    const { controller, statuses, engagement } = makeController()
    statuses.changeMissionStatus.mockResolvedValueOnce({ from: 'active', to: 'active', direction: 'same' as never })
    await controller.changeMissionStatus(user, MISSION, { to: 'active' } as never)
    statuses.changeMissionStatus.mockResolvedValueOnce({ from: 'ending', to: 'active', direction: 'backward' as never })
    await controller.changeMissionStatus(user, MISSION, { to: 'active', reason: 'erreur' } as never)
    expect(engagement.startEngagement).not.toHaveBeenCalled()
  })

  it('deux statuts de démarrage de suite (active → at_risk) ne rejouent pas l’écriture', async () => {
    const { controller, statuses, engagement } = makeController()
    statuses.changeMissionStatus.mockResolvedValueOnce({ from: 'active', to: 'at_risk', direction: 'forward' as never })
    await controller.changeMissionStatus(user, MISSION, { to: 'at_risk' } as never)
    expect(engagement.startEngagement).not.toHaveBeenCalled()
  })
})
