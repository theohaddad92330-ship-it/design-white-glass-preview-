import { ConflictException, NotFoundException } from '@nestjs/common'
import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import type { PipelineDetectionRecord } from './pipeline-detections.service'
import { PipelineDetectionsController } from './pipeline-detections.controller'

const USER = { userId: 'user-1' } as never

function detection(overrides: Partial<PipelineDetectionRecord> = {}): PipelineDetectionRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    kind: 'interest_to_opportunity',
    status: 'detected',
    accountId: '22222222-2222-4222-8222-222222222222',
    accountName: 'Banque Exemple',
    label: 'Claire Martin',
    sourceId: '33333333-3333-4333-8333-333333333333',
    sourceCallId: null,
    projectId: null,
    needId: null,
    consultantId: null,
    submissionId: null,
    createdObjectId: null,
    detectedAt: '2026-10-11T05:50:00.000Z',
    decidedAt: null,
    ...overrides,
  }
}

function build(row: PipelineDetectionRecord, autoDetectCut = false) {
  if (autoDetectCut) process.env.PIPELINE_AUTO_DETECT_DISABLED = 'true'
  const detections = {
    listDetected: jest.fn().mockResolvedValue([row]),
    getDetected: jest.fn().mockResolvedValue(row),
    decide: jest.fn().mockImplementation(async (_ws, _id, _user, decision) => ({ ...row, status: decision.status })),
  }
  const projects = { createForWorkspace: jest.fn().mockResolvedValue({ id: 'opp-1' }) }
  const submissions = { create: jest.fn().mockResolvedValue({ id: 'sub-1' }) }
  // #2152.13 — le besoin `to_qualify` est écrit par le service qui POSSÈDE la table (`addNeedForAccount`).
  const pipeline = {
    listNeeds: jest.fn().mockResolvedValue([]),
    addNeedForAccount: jest.fn().mockResolvedValue({ id: 'need-1' }),
  }
  const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) }
  const controller = new PipelineDetectionsController(
    detections as never,
    workspaceContext as never,
    projects as never,
    submissions as never,
    pipeline as never,
  )
  return { controller, detections, projects, submissions, pipeline }
}

describe('PipelineDetectionsController (#4016 L6)', () => {
  afterEach(() => {
    delete process.env.PIPELINE_AUTO_DETECT_DISABLED
  })

  it('la liste dit si le balayage est coupé', async () => {
    const { controller } = build(detection(), true)
    await expect(controller.list(USER)).resolves.toMatchObject({ autoDetect: 'off' })
  })

  it('confirmer un intérêt OUVRE l’affaire — à la première colonne du pipe, au nom de celui qui clique', async () => {
    const { controller, projects, detections } = build(detection())
    const result = await controller.confirm(USER, detection().id)
    expect(projects.createForWorkspace).toHaveBeenCalledWith('ws-1', {
      accountId: detection().accountId,
      label: 'Claire Martin',
      stage: 'qualified',
      ownerId: 'user-1',
    })
    expect(detections.decide).toHaveBeenCalledWith('ws-1', detection().id, 'user-1', {
      status: 'confirmed',
      createdObjectId: 'opp-1',
    })
    expect(result.status).toBe('confirmed')
  })

  it('confirmer une shortlist POSITIONNE le profil, sans l’envoyer', async () => {
    const row = detection({ kind: 'shortlist_to_submission', projectId: 'p-1', needId: 'n-1', consultantId: 'c-1' })
    const { controller, submissions } = build(row)
    await controller.confirm(USER, row.id)
    expect(submissions.create).toHaveBeenCalledWith('user-1', {
      projectId: 'p-1',
      consultantId: 'c-1',
      needId: 'n-1',
      stage: 'shortlisted',
      proposedRateCents: null,
    })
  })

  it('confirmer un entretien positif ne crée AUCUNE mission (#2320.21) — la ligne est prise en main', async () => {
    const row = detection({ kind: 'interview_to_mission', submissionId: 's-1' })
    const { controller, projects, submissions, detections } = build(row)
    await controller.confirm(USER, row.id)
    expect(projects.createForWorkspace).not.toHaveBeenCalled()
    expect(submissions.create).not.toHaveBeenCalled()
    expect(detections.decide).toHaveBeenCalledWith('ws-1', row.id, 'user-1', {
      status: 'confirmed',
      createdObjectId: null,
    })
  })

  it('une affaire que la base refuse n’est PAS dite confirmée', async () => {
    const { controller, projects, detections } = build(detection())
    projects.createForWorkspace.mockResolvedValueOnce(null)
    await expect(controller.confirm(USER, detection().id)).rejects.toBeInstanceOf(ConflictException)
    expect(detections.decide).not.toHaveBeenCalled()
  })

  it('écarter ne crée rien et porte son auteur', async () => {
    const { controller, projects, detections } = build(detection())
    await controller.dismiss(USER, detection().id)
    expect(projects.createForWorkspace).not.toHaveBeenCalled()
    expect(detections.decide).toHaveBeenCalledWith('ws-1', detection().id, 'user-1', { status: 'dismissed' })
  })

  // #2152.13 — la confirmation HUMAINE d'une piste crée AUSSI un besoin `to_qualify` rattaché au compte.
  describe('besoin à qualifier (#2152.13)', () => {
    it('confirmer un intérêt crée le besoin `to_qualify` du compte, rattaché à l’affaire ouverte', async () => {
      const { controller, pipeline } = build(detection())
      await controller.confirm(USER, detection().id)
      expect(pipeline.addNeedForAccount).toHaveBeenCalledTimes(1)
      expect(pipeline.addNeedForAccount).toHaveBeenCalledWith(
        'ws-1',
        detection().accountId,
        expect.objectContaining({ title: 'Claire Martin', provenance: 'pipeline', project_id: 'opp-1' }),
        'user-1',
      )
      // Jamais un statut posé par la routine : le défaut du service est `to_qualify`, on n'y touche pas.
      const input = pipeline.addNeedForAccount.mock.calls[0][2] as Record<string, unknown>
      expect(input).not.toHaveProperty('status')
    })

    it('idempotent — un besoin déjà posé pour cette piste n’est pas redoublé', async () => {
      const { controller, pipeline } = build(detection())
      pipeline.listNeeds.mockResolvedValueOnce([{ id: 'need-0', title: 'Claire Martin', provenance: 'pipeline' }])
      await controller.confirm(USER, detection().id)
      expect(pipeline.addNeedForAccount).not.toHaveBeenCalled()
    })

    it('une 2e confirmation (ligne déjà tranchée) ne crée ni affaire ni besoin', async () => {
      const { controller, detections, projects, pipeline } = build(detection())
      detections.getDetected.mockRejectedValueOnce(new NotFoundException())
      await expect(controller.confirm(USER, detection().id)).rejects.toBeInstanceOf(NotFoundException)
      expect(projects.createForWorkspace).not.toHaveBeenCalled()
      expect(pipeline.addNeedForAccount).not.toHaveBeenCalled()
    })

    it('jamais à la détection seule : écarter ne crée aucun besoin', async () => {
      const { controller, pipeline } = build(detection())
      await controller.dismiss(USER, detection().id)
      expect(pipeline.addNeedForAccount).not.toHaveBeenCalled()
    })

    it('une affaire refusée ne laisse aucun besoin', async () => {
      const { controller, projects, pipeline } = build(detection())
      projects.createForWorkspace.mockResolvedValueOnce(null)
      await expect(controller.confirm(USER, detection().id)).rejects.toBeInstanceOf(ConflictException)
      expect(pipeline.addNeedForAccount).not.toHaveBeenCalled()
    })

    it('les autres passages (shortlist, entretien) ne créent pas de besoin', async () => {
      for (const kind of ['shortlist_to_submission', 'interview_to_mission'] as const) {
        const row = detection({ kind, projectId: 'p-1', needId: 'n-1', consultantId: 'c-1', submissionId: 's-1' })
        const { controller, pipeline } = build(row)
        await controller.confirm(USER, row.id)
        expect(pipeline.addNeedForAccount).not.toHaveBeenCalled()
      }
    })

    it('confirmer exige `records:write` : un rôle sans ce droit est arrêté par la garde, avant tout besoin', () => {
      const required = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, PipelineDetectionsController.prototype.confirm)
      expect(required).toEqual(['records:write'])
    })
  })
})
