import 'reflect-metadata'
import { PATH_METADATA } from '@nestjs/common/constants'
import { REQUIRE_PERMISSION_KEY } from './require-permission.decorator'
import type { WorkspaceActivityService } from './workspace-activity.service'
import type { WorkspaceContextService } from './workspace-context.service'
import type { WorkspaceLauraModeService } from './workspace-laura-mode.service'
import type { WorkspaceMarketService } from './workspace-market.service'
import type { WorkspacePortfolioHandoverService } from './workspace-portfolio-handover.service'
import type { WorkspaceTeamService } from './workspace-team.service'
import type { WorkspaceTimezoneService } from './workspace-timezone.service'
import type { WorkspaceHiddenSectionsService } from './workspace-hidden-sections.service'
import { WorkspaceController } from './workspace.controller'

/**
 * Regression guard for the members route.
 *
 * The web client shipped `GET /workspace/members` (singular) against a route
 * that never existed. The 404 was swallowed by `?? []` in the consumers, so the
 * action-plan "assign to…" picker — a fully built delegation feature — was
 * permanently empty with no error anywhere. These tests pin BOTH halves: the
 * controller prefix and the route path, because only the pair is the bug.
 */
describe('WorkspaceController — members route', () => {
  const members = [
    { userId: 'u1', email: 'alice@esn.fr', fullName: 'Alice Martin', role: 'owner' as const, isSelf: true },
    { userId: 'u2', email: 'bob@esn.fr', fullName: null, role: 'sales' as const, isSelf: false },
  ]

  const build = () => {
    const workspaceContext = { listMembers: jest.fn().mockResolvedValue(members) }
    const controller = new WorkspaceController(
      {} as WorkspaceTeamService,
      {} as WorkspaceMarketService,
      {} as WorkspaceTimezoneService,
      {} as WorkspaceHiddenSectionsService,
      // #2451.9 — le réglage d'espace du mode par défaut : ce test ne l'appelle
      // pas, mais le constructeur la réclame depuis 5b05c73f4.
      {} as WorkspaceLauraModeService,
      {} as WorkspaceActivityService,
      workspaceContext as unknown as WorkspaceContextService,
      // La reprise de portefeuille : ce test ne l'appelle pas, mais le
      // constructeur la réclame — un double vide suffit et dit que la route
      // `members` n'en dépend pas.
      {} as WorkspacePortfolioHandoverService,
    )
    return { controller, workspaceContext }
  }

  it('is mounted at the plural `workspaces` prefix', () => {
    expect(Reflect.getMetadata(PATH_METADATA, WorkspaceController)).toBe('workspaces')
  })

  it('exposes the route as `members`', () => {
    const handler = WorkspaceController.prototype.listMembers
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('members')
  })

  it('returns the active workspace members for the calling user', async () => {
    const { controller, workspaceContext } = build()
    const result = await controller.listMembers({ userId: 'u1' } as never)

    expect(workspaceContext.listMembers).toHaveBeenCalledWith('u1')
    expect(result).toEqual(members)
  })

  // Any member must be able to read the roster — gating this would leave the
  // rep-side assignment pickers empty, i.e. reintroduce the original bug.
  it('carries no @RequirePermission metadata (readable by any member)', () => {
    const permission = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, WorkspaceController.prototype.listMembers)
    expect(permission).toBeUndefined()
  })
})
