import { assertSuccess, success } from '@bellum/utils'
import { resolveBrand } from '@bellum/contracts'
import type { ConfigService } from '@nestjs/config'
import type { Repository } from 'typeorm'
import type { AnalysisRunEntity } from '../../database/entities/analysis-run.entity'
import type { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import type { OnboardingStageDefinitionEntity } from '../../database/entities/onboarding-stage-definition.entity'
import type { UserOnboardingStateEntity } from '../../database/entities/user-onboarding-state.entity'
import type { UserOnboardingTransitionEntity } from '../../database/entities/user-onboarding-transition.entity'
import type { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import type { ProfileContextService } from '../profile-context/profile-context.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { MailerService } from '../mailer/mailer.service'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceInvitationEntity } from '../../database/entities/workspace-invitation.entity'
import { PlanDefinitionEntity } from '../../database/entities/plan-definition.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { EsnProfileService } from '../esn-profile/esn-profile.service'
import { EsnProfileWorkspaceResolver } from '../esn-profile/esn-profile-workspace.resolver'
import { PlanCatalogService } from '../credits/plan-catalog.service'
import { WorkspaceTeamService } from '../workspace/workspace-team.service'
import { OnboardingService } from './onboarding.service'

/**
 * #2004.17 — REPRISE APRÈS INVITATION.
 *
 * Le registre marquait ce point « non prouvé » : personne n'avait écrit le
 * test qui montre qu'accepter une invitation à rejoindre un autre espace ne
 * touche pas au parcours d'onboarding de l'utilisateur invité.
 *
 * La preuve tient en une phrase : `WorkspaceTeamService` n'a AUCUNE dépendance
 * vers `user_onboarding_state` — ni dans son constructeur, ni transitivement.
 * `acceptInvitation` ne peut donc pas écrire dans cette table, par construction
 * et pas seulement « dans ce test ». Ce test le prouve par le comportement,
 * pas par lecture du code : un état d'onboarding avancé AVANT l'invitation est
 * relu à l'identique APRÈS.
 *
 * (`user_onboarding_state` est cloisonnée par `user_id`, pas par
 * `workspace_id` — voir le docblock de l'entité — donc changer d'espace actif
 * ne change jamais QUEL état on lit.)
 */

/** Minimal in-memory TypeORM repo — même forme que `onboarding.service.spec.ts`. */
function makeRepo<T extends object>(rows: T[], keyOf?: (r: T) => string) {
  const get = (r: T, k: string): unknown => (r as Record<string, unknown>)[k]
  return {
    find: jest.fn(async (opts?: { order?: { stage_order?: 'ASC' } }) => {
      const out = [...rows]
      if (opts?.order?.stage_order === 'ASC')
        out.sort((a, b) => Number(get(a, 'stage_order')) - Number(get(b, 'stage_order')))
      return out
    }),
    findOne: jest.fn(
      async ({ where }: { where: Record<string, unknown> }) =>
        rows.find(r => Object.entries(where).every(([k, v]) => get(r, k) === v)) ?? null,
    ),
    create: jest.fn((data: Partial<T>) => ({ ...data })),
    merge: jest.fn((target: T, ...sources: Partial<T>[]) => Object.assign(target, ...sources)),
    save: jest.fn(async (entity: T) => {
      if (keyOf) {
        const idx = rows.findIndex(r => keyOf(r) === keyOf(entity))
        if (idx >= 0) rows[idx] = entity
        else rows.push(entity)
      }
      return entity
    }),
  } as unknown as Repository<T> & { find: jest.Mock; findOne: jest.Mock; save: jest.Mock }
}

function makeStages() {
  return [
    { id: 's1', code: 'company_info', title: 'Votre ESN', stage_order: 2, is_required: true },
    { id: 's2', code: 'offer_expertise', title: 'Votre offre', stage_order: 3, is_required: true },
  ] as OnboardingStageDefinitionEntity[]
}

function makeOnboardingService(states: UserOnboardingStateEntity[]) {
  const statesRepo = makeRepo<UserOnboardingStateEntity>(states, r => r.user_id)
  const stagesRepo = makeRepo<OnboardingStageDefinitionEntity>(makeStages())
  const esnRepo = makeRepo<EsnProfileEntity>([], r => r.user_id)
  const runsRepo = { count: jest.fn(async () => 0) } as unknown as Repository<AnalysisRunEntity>
  const transitionsRepo = {
    create: jest.fn((data: Partial<UserOnboardingTransitionEntity>) => ({ ...data })),
    save: jest.fn(async (entity: UserOnboardingTransitionEntity) => entity),
    // #2021 — `getState` appelle désormais `firstOnboardingCompletionAt`
    // (déjà utilisée par `getRedesignBannerState`), qui lit ce dépôt. Sans
    // `findOne`, chaque `getState` de ce fichier levait.
    findOne: jest.fn(async () => null),
  } as unknown as Repository<UserOnboardingTransitionEntity>
  const noopProfileContext = { triggerGeneration: jest.fn() } as unknown as ProfileContextService
  const resolver = new EsnProfileWorkspaceResolver(
    esnRepo,
    makeRepo<WorkspaceEntity>([]),
    makeRepo<WorkspaceMemberEntity>([]),
    { findOne: async () => null } as never,
  )
  const esnProfile = new EsnProfileService(esnRepo, noopProfileContext, resolver)
  return new OnboardingService(statesRepo, stagesRepo, runsRepo, transitionsRepo, esnProfile)
}

function makeWorkspaceTeamService(deps: {
  invitations: MockRepository<WorkspaceInvitationEntity>
  members: MockRepository<WorkspaceMemberEntity>
  workspaces: MockRepository<WorkspaceEntity>
}) {
  const context = {
    resolveActiveWorkspace: jest.fn(),
    assertRole: jest.fn(),
    assertPermission: jest.fn(),
    switchWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', workspaceName: 'ESN Acme', role: 'member' }),
  } as unknown as WorkspaceContextService
  const config = { get: jest.fn().mockReturnValue('http://localhost:5173') } as unknown as ConfigService
  const mailer = { sendNotificationEmail: jest.fn().mockResolvedValue(undefined) } as unknown as MailerService
  const profiles = createMockRepository<ProfileEntity>()
  const subscriptions = createMockRepository<SubscriptionEntity>()
  const planCatalog = new PlanCatalogService(createMockRepository<PlanDefinitionEntity>() as never)
  const brands = {
    getForUser: jest.fn().mockResolvedValue(resolveBrand(null)),
    getForWorkspace: jest.fn().mockResolvedValue(resolveBrand(null)),
    getSendingAddress: jest.fn().mockResolvedValue(null),
  }
  return new WorkspaceTeamService(
    context,
    config,
    mailer,
    deps.workspaces as never,
    deps.members as never,
    deps.invitations as never,
    profiles as never,
    subscriptions as never,
    planCatalog,
    brands as never,
  )
}

describe('#2004.17 — reprise après invitation', () => {
  it("le parcours d'onboarding de l'invité survit, bit à bit, à l'acceptation d'une invitation", async () => {
    const states: UserOnboardingStateEntity[] = []
    const onboarding = makeOnboardingService(states)

    // L'invité a déjà avancé dans SON questionnaire avant de rejoindre l'ESN.
    assertSuccess(await onboarding.advanceStage('u-invitee', 'offer_expertise'))
    const before = assertSuccess(await onboarding.getState('u-invitee'))

    const invitations = createMockRepository<WorkspaceInvitationEntity>()
    const members = createMockRepository<WorkspaceMemberEntity>()
    const workspaces = createMockRepository<WorkspaceEntity>()
    workspaces.findOne.mockResolvedValue({ id: 'ws-1', name: 'ESN Acme', owner_user_id: 'owner-1' } as WorkspaceEntity)
    invitations.findOne.mockResolvedValue({
      token: 'tok',
      status: 'pending',
      email: 'invitee@acme.fr',
      role: 'member',
      workspace_id: 'ws-1',
      expires_at: new Date(Date.now() + 60_000),
    } as WorkspaceInvitationEntity)
    members.findOne.mockResolvedValue(null)

    const team = makeWorkspaceTeamService({ invitations, members, workspaces })
    await team.acceptInvitation('u-invitee', 'invitee@acme.fr', 'tok')

    const after = assertSuccess(await onboarding.getState('u-invitee'))
    expect(after).toEqual(before)
    expect(after.current_stage_code).toBe('offer_expertise')
  })
})
