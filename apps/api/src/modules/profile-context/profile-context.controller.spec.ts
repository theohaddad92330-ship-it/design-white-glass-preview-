import { ConflictException } from '@nestjs/common'
import type { ProfileContext } from '@bellum/contracts'
import { ProfileContextController } from './profile-context.controller'
import type { ProfileContextService } from './profile-context.service'
import type { ProfileContextRevisionService } from './profile-context-revision.service'

const CONTEXT = { esnArchetype: 'boutiqueExpert', sellingPosture: 'expertiseRare' } as unknown as ProfileContext
const USER = { userId: 'u1', email: 'u1@example.com' }

function makeController(validate: jest.Mock, chooseEntryStrategy?: jest.Mock, recordAuditMoveDecision?: jest.Mock) {
  const profileContext = { validate, chooseEntryStrategy, recordAuditMoveDecision } as unknown as ProfileContextService
  const revisions = {} as unknown as ProfileContextRevisionService
  return new ProfileContextController(profileContext, revisions)
}

describe('ProfileContextController.validate', () => {
  it('#2075.B — POST /profile-context/validate délègue au service et rend son résultat', async () => {
    const validate = jest.fn(async () => ({
      type: 'success' as const,
      output: { profile_context: CONTEXT, status: 'validated' as const },
    }))
    const controller = makeController(validate)

    const response = await controller.validate(USER)

    expect(validate).toHaveBeenCalledWith('u1')
    expect(response).toEqual({ profile_context: CONTEXT, status: 'validated' })
  })

  it('#2075.B — traduit l’échec « aucun contexte » en ConflictException, jamais un corps vide', async () => {
    const validate = jest.fn(async () => ({
      type: 'failure' as const,
      problem: { code: 'no_profile_context' as const, message: 'Aucun contexte de profil généré : rien à valider.' },
    }))
    const controller = makeController(validate)

    await expect(controller.validate(USER)).rejects.toBeInstanceOf(ConflictException)
    await expect(controller.validate(USER)).rejects.toThrow('Aucun contexte de profil généré : rien à valider.')
  })
})

describe('ProfileContextController.chooseEntryStrategy (#2073.8)', () => {
  it('délègue au service avec l’utilisateur courant et la stratégie choisie', async () => {
    const chooseEntryStrategy = jest.fn(async () => ({
      profile_context: CONTEXT,
      status: 'succeeded' as const,
      validatedAt: null,
      withheld: null,
      chosenEntryStrategy: 'multiThread' as const,
    }))
    const controller = makeController(jest.fn(), chooseEntryStrategy)

    const response = await controller.chooseEntryStrategy(USER, { entryStrategy: 'multiThread' })

    expect(chooseEntryStrategy).toHaveBeenCalledWith('u1', 'multiThread')
    expect(response.chosenEntryStrategy).toBe('multiThread')
  })
})

describe('ProfileContextController.recordAuditMoveDecision (#2074.16)', () => {
  it('délègue au service avec l’utilisateur courant, le ruleId et le statut choisi', async () => {
    const recordAuditMoveDecision = jest.fn(async () => ({
      profile_context: CONTEXT,
      status: 'succeeded' as const,
      validatedAt: null,
      withheld: null,
      chosenEntryStrategy: null,
      auditMoveDecisions: { no_contact_reached: { status: 'valide' as const, decidedAt: '2026-09-22T20:00:00.000Z' } },
    }))
    const controller = makeController(jest.fn(), undefined, recordAuditMoveDecision)

    const response = await controller.recordAuditMoveDecision(USER, {
      ruleId: 'no_contact_reached',
      status: 'valide',
      subject: 'Joindre le DSI',
    })

    // #2074.16 — l'objet montré suit jusqu'au service (il devient la tâche).
    expect(recordAuditMoveDecision).toHaveBeenCalledWith('u1', 'no_contact_reached', 'valide', {
      subject: 'Joindre le DSI',
      reason: undefined,
      expectedResult: undefined,
    })
    expect(response.auditMoveDecisions.no_contact_reached?.status).toBe('valide')
  })
})
