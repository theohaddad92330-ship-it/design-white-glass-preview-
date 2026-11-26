import { Controller, Get, UseGuards } from '@nestjs/common'
import type { ConnectedTool } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { ToolRegistryService } from './tool-registry.service'

/**
 * The unified Tool Registry read surface. `GET /tool-registry` returns every
 * tool BellumAI can be wired to — CRM, chat/webhooks, MCP and modeled-but-not-
 * connected tools — each with its real status, granted scopes and last activity,
 * aggregated from the three underlying stores. Read-only and JWT-guarded; CRM
 * status is resolved against the caller's active workspace, the rest per user.
 *
 * This is the single source of truth the copilot and the analysis engine should
 * query to know which tools exist and are connected — they never guess.
 */
@Controller('tool-registry')
@UseGuards(JwtGuard)
export class ToolRegistryController {
  constructor(private readonly toolRegistry: ToolRegistryService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserPayload): Promise<ConnectedTool[]> {
    return this.toolRegistry.list(user.userId)
  }
}
