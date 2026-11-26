import {
  Controller,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import type { AccountListResponse, PaginatedResult } from '@bellum/contracts'
import { unwrap } from '@bellum/utils'
import { AccountsService, type AccountFailure } from '../accounts/accounts.service'
import { ApiKeyScopeGuard, RequireApiScope } from './api-key-scope.guard'
import { ApiKeyThrottlerGuard } from './api-key-throttler.guard'
import { ApiKeyGuard, CurrentApiKey } from './api-key.guard'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { RequireFeature } from '../plan-features/require-feature.decorator'
import type { ApiKeyPrincipal } from '../api-keys/api-keys.service'
import { PublicApiService } from './public-api.service'
import {
  V1AccountDetailDto,
  V1AccountListResponseDto,
  V1ContactListResponseDto,
  V1ListAccountsQueryDto,
  V1ListQueryDto,
  V1RunListResponseDto,
  type PublicAccountDetail,
  type PublicContact,
  type PublicRun,
} from './public-api.schemas'

/** Same mapping as the MCP surface so both agree on failure semantics. */
function throwAccountFailure(failure: AccountFailure): never {
  if (failure.code === 'not_found') throw new NotFoundException(failure.message)
  throw new InternalServerErrorException(failure.message)
}

/** Dedicated per-key budget for the public surface (the ApiKeyThrottlerGuard
 *  keys the counter on the API key id, not the caller's IP). */
const V1_RATE_LIMIT = { 'default-1m': { limit: 120, ttl: 60_000 } }

/**
 * PUBLIC API v1 — READ-ONLY. The only controller that accepts an API key
 * (`Authorization: Bearer blm_live_…`), and API keys are accepted ONLY here:
 * `ApiKeyGuard` is opt-in per controller, so a leaked key can never reach
 * billing, deletion, admin or the key-management endpoints (all JwtGuard).
 *
 * Every read is scoped by the key's workspace (resolved server-side from the
 * key row — the caller never supplies a workspace id) and gated by the key's
 * scopes (`read:accounts` / `read:contacts`).
 *
 * This controller is the ONLY one included in the OpenAPI document served at
 * `/v1/openapi.json` + `/v1/docs` (see `main.ts`) — the internal API stays out.
 */
@ApiTags('Bellum Public API v1')
@ApiBearerAuth('api-key')
@ApiUnauthorizedResponse({ description: 'Missing, unknown or revoked API key.' })
@ApiForbiddenResponse({ description: 'The API key does not carry the required scope.' })
@ApiTooManyRequestsResponse({ description: 'Rate limit exceeded (120 requests/min per key).' })
@Controller('v1')
// L'API publique est une feature de palier. Le principal ici est une CLÉ (pas un
// utilisateur) : le guard résout alors le palier par le workspace de la clé.
@RequireFeature('public_api')
@UseGuards(ApiKeyGuard, ApiKeyThrottlerGuard, ApiKeyScopeGuard, PlanFeatureGuard)
@Throttle(V1_RATE_LIMIT)
export class V1Controller {
  constructor(
    private readonly accounts: AccountsService,
    private readonly publicApi: PublicApiService,
  ) {}

  @Get('accounts')
  @RequireApiScope('read:accounts')
  @ApiOperation({
    summary: 'List accounts',
    description:
      'Paginated list of the workspace’s analysed accounts (dossiers). Supports the same server-side filters as the app: `q` (company name search), `status`, `lifecycle`, `sector`, `score`, `sort`, `limit`/`offset`.',
  })
  @ApiOkResponse({ type: V1AccountListResponseDto })
  listAccounts(
    @CurrentApiKey() key: ApiKeyPrincipal,
    @Query() query: V1ListAccountsQueryDto,
  ): Promise<AccountListResponse> {
    return this.accounts.findAccountsByWorkspace(key.workspaceId, query)
  }

  @Get('accounts/:id')
  @RequireApiScope('read:accounts')
  @ApiOperation({
    summary: 'Get one account',
    description:
      'Full dossier for one account of the workspace: registry facts, priority score, challenges and buy signals.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: V1AccountDetailDto })
  @ApiNotFoundResponse({ description: 'No account with this id in the workspace.' })
  async getAccount(
    @CurrentApiKey() key: ApiKeyPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PublicAccountDetail> {
    return unwrap(await this.publicApi.getAccount(key.workspaceId, id), throwAccountFailure)
  }

  @Get('accounts/:id/contacts')
  @RequireApiScope('read:contacts')
  @ApiOperation({
    summary: 'List an account’s contacts',
    description: 'Identified contacts of one dossier — identity, decision role, reach info and lifecycle state.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: V1ContactListResponseDto })
  @ApiNotFoundResponse({ description: 'No account with this id in the workspace.' })
  async listAccountContacts(
    @CurrentApiKey() key: ApiKeyPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: V1ListQueryDto,
  ): Promise<PaginatedResult<PublicContact>> {
    // 404 for an account outside the workspace (vs an empty page) — but the
    // contact read below stays workspace-scoped regardless.
    unwrap(await this.publicApi.getAccount(key.workspaceId, id), throwAccountFailure)
    return this.publicApi.listContacts(key.workspaceId, { ...query, account_id: id })
  }

  @Get('contacts')
  @RequireApiScope('read:contacts')
  @ApiOperation({
    summary: 'List contacts',
    description: 'Paginated list of the workspace’s contacts. Optional `account_id` filter narrows to one dossier.',
  })
  @ApiOkResponse({ type: V1ContactListResponseDto })
  listContacts(
    @CurrentApiKey() key: ApiKeyPrincipal,
    @Query() query: V1ListQueryDto,
  ): Promise<PaginatedResult<PublicContact>> {
    return this.publicApi.listContacts(key.workspaceId, query)
  }

  @Get('runs')
  @RequireApiScope('read:accounts')
  @ApiOperation({
    summary: 'List analysis runs',
    description:
      'Append-only history of analysis runs across the workspace, newest first. Optional `account_id` filter.',
  })
  @ApiOkResponse({ type: V1RunListResponseDto })
  listRuns(@CurrentApiKey() key: ApiKeyPrincipal, @Query() query: V1ListQueryDto): Promise<PaginatedResult<PublicRun>> {
    return this.publicApi.listRuns(key.workspaceId, query)
  }
}
