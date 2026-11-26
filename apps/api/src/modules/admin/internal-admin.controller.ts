import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { DemoSeedService, type DemoWorkspaceResult } from '../demo/demo-seed.service'
import {
  AdminService,
  type AdminOverview,
  type AdminPlan,
  type AdminUser,
  type AdminWorkspace,
  type AdminWorkspaceDetail,
  type AdminWorkspaceMember,
} from './admin.service'
import { ReflagService, type FlagState } from '../reflag/reflag.service'
import { AddMemberDto } from './dto/add-member.dto'
import { AssignPlanDto } from './dto/assign-plan.dto'
import { CreateDemoWorkspaceDto } from './dto/create-demo-workspace.dto'
import { CreateWorkspaceDto } from './dto/create-workspace.dto'
import { ListQueryDto } from './dto/list-query.dto'
import { RenameWorkspaceDto } from './dto/rename-workspace.dto'
import { SendOwnerInvitationDto } from './dto/send-owner-invitation.dto'
import { UpdatePlanDto } from './dto/update-plan.dto'

/**
 * Super-admin backoffice API. Consumed server-side by the standalone
 * `dashboard-manager` (Next.js) app, which proxies these routes with the shared
 * internal secret so it never reaches the browser — same pattern as
 * `/internal/telemetry` and `/internal/feedback`. Everything here is
 * cross-tenant by design (the operator manages ALL users/workspaces), so the
 * guard is the only thing standing between this and the whole database. It must
 * never be removed.
 */
@Controller('internal/admin')
@UseGuards(InternalSecretGuard)
export class InternalAdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly demoSeed: DemoSeedService,
    private readonly reflag: ReflagService,
  ) {}

  /**
   * Feature flags as Reflag evaluates them, for an OPTIONAL user/workspace.
   *
   * A flag's value only means something for someone, so this reports an
   * evaluation, not a definition — with no context it shows the default
   * rollout. Flags are CREATED and targeted in the Reflag dashboard; this
   * screen answers the operator's real question, "is feature X actually on for
   * this customer?", without leaving the backoffice.
   *
   * `configured: false` distinguishes "no flags exist" from "Reflag isn't
   * connected" — the two look identical otherwise.
   */
  @Get('flags')
  getFlags(
    @Query('userId') userId?: string,
    @Query('workspaceId') workspaceId?: string,
  ): { configured: boolean; flags: FlagState[] } {
    return {
      configured: this.reflag.isConfigured(),
      flags: this.reflag.listFlags({ userId, companyId: workspaceId }),
    }
  }

  @Get('overview')
  getOverview(): Promise<AdminOverview> {
    return this.admin.getOverview()
  }

  @Get('plans')
  async getPlans(): Promise<{ plans: AdminPlan[] }> {
    return { plans: await this.admin.getPlans() }
  }

  /** Edit an existing plan's template (name / price / caps / seats). v1 = edit
   *  only; creating/deleting a plan is out of scope. Changes the template used by
   *  the NEXT checkout/assign — never rewrites existing subscribers' stored caps. */
  @Patch('plans/:key')
  updatePlan(@Param('key') key: string, @Body() dto: UpdatePlanDto): Promise<AdminPlan> {
    return this.admin.updatePlan(key, dto)
  }

  @Get('users')
  listUsers(@Query() query: ListQueryDto): Promise<{ users: AdminUser[]; total: number }> {
    return this.admin.listUsers(query)
  }

  @Get('workspaces')
  listWorkspaces(@Query() query: ListQueryDto): Promise<{ workspaces: AdminWorkspace[]; total: number }> {
    return this.admin.listWorkspaces(query)
  }

  @Get('workspaces/:id')
  getWorkspace(@Param('id') id: string): Promise<AdminWorkspaceDetail> {
    return this.admin.getWorkspaceDetail(id)
  }

  /**
   * #2643.1 — L'ENVOI, sur ce SEUL clic. `actorEmail` vient de la session du
   * back-office (`avecAuteur` côté `dashboard-manager`), jamais deviné : un
   * e-mail RÉEL part vers un vrai client, il lui faut un auteur attribuable.
   */
  @Post('workspaces/:id/owner-invitation/send')
  sendOwnerInvitation(@Param('id') id: string, @Body() dto: SendOwnerInvitationDto) {
    return this.admin.sendOwnerInvitation(id, dto.actorEmail)
  }

  @Patch('users/:userId/plan')
  assignPlan(@Param('userId') userId: string, @Body() dto: AssignPlanDto): Promise<AdminUser> {
    return this.admin.assignPlan(userId, dto.plan)
  }

  @Post('workspaces')
  createWorkspace(@Body() dto: CreateWorkspaceDto): Promise<AdminWorkspace> {
    return this.admin.createWorkspace(dto.name, dto.ownerUserId)
  }

  /** Provision a DEMO workspace (demo mode C1): flags the owner's workspace
   *  `is_demo` (or creates one) and seeds the golden fictional dossiers.
   *  Idempotent — re-calling never duplicates the seed. 409 when the owner's
   *  workspace already holds real dossiers (use a dedicated demo user). */
  @Post('workspaces/demo')
  createDemoWorkspace(@Body() dto: CreateDemoWorkspaceDto): Promise<DemoWorkspaceResult> {
    return this.demoSeed.createDemoWorkspace(dto.ownerUserId, dto.name, { ensureProfile: dto.ensureProfile })
  }

  @Patch('workspaces/:id')
  renameWorkspace(@Param('id') id: string, @Body() dto: RenameWorkspaceDto): Promise<AdminWorkspace> {
    return this.admin.renameWorkspace(id, dto.name)
  }

  @Post('workspaces/:id/members')
  addMember(@Param('id') id: string, @Body() dto: AddMemberDto): Promise<AdminWorkspaceMember> {
    return this.admin.addMember(id, dto.userId, dto.role ?? 'member')
  }

  @Delete('workspaces/:id/members/:userId')
  removeMember(@Param('id') id: string, @Param('userId') userId: string): Promise<{ removed: true }> {
    return this.admin.removeMember(id, userId)
  }
}
