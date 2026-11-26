import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import {
  keepCrmValueSchema,
  startSyncSchema,
  type CrmFirstImportResponse,
  type CrmReadStatus,
  type IntegrationExchange,
  type SyncOutcome,
  type SyncRun,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { CrmFirstImportEnqueuer } from '../crm-first-import/crm-first-import.enqueuer'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { CrmAdapterRegistry } from './adapter/crm-adapter.registry'
import { demoCrmFirstImport } from './crm-first-import-demo'
import { CrmImportService } from './crm-import.service'
import { CrmReadSyncService } from './crm-read-sync.service'
import { CrmService } from './crm.service'
import { hubspotCompanySource, hubspotContactSource } from './crm-sources'

class StartSyncDto extends createZodDto(startSyncSchema) {}
class KeepCrmValueDto extends createZodDto(keepCrmValueSchema) {}

/**
 * La REPRISE d'un CRM existant.
 *
 * La route d'import demande `records:write` et non `integrations:manage` :
 * connecter un CRM et déverser trois mille contacts dans la base ne se
 * délèguent pas au même siège.
 */
@Controller('crm/import')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class CrmImportController {
  constructor(
    private readonly imports: CrmImportService,
    private readonly crm: CrmService,
    private readonly readSync: CrmReadSyncService,
    private readonly firstImport: CrmFirstImportEnqueuer,
    private readonly adapters: CrmAdapterRegistry,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /**
   * #4189 — par CRM branché : ce qui est réellement lu, sur quoi se cale la synchro, la date de
   * dernière synchro, la dernière erreur et les fiches modifiées des deux côtés au dernier passage.
   */
  @Get('status')
  async status(@CurrentUser() user: CurrentUserPayload): Promise<{ items: CrmReadStatus[] }> {
    return { items: await this.readSync.status(user.userId) }
  }

  /** Théo D settings-integrations.N4 — l'historique des échanges avec les outils branchés (jamais une ligne inventée). */
  @Get('exchanges')
  @RequirePermission('records:write')
  async exchanges(@CurrentUser() user: CurrentUserPayload): Promise<{ items: IntegrationExchange[] }> {
    return { items: await this.readSync.exchanges(user.userId) }
  }

  /** SYNC-B — la première reprise de chaque CRM branché : progression par objet, résumé, erreurs nommées. */
  @Get('first-import')
  async firstImportStatus(@CurrentUser() user: CurrentUserPayload): Promise<CrmFirstImportResponse> {
    const connected = await this.adapters.connected(user.userId)
    if (connected.length === 0) {
      // B.6 — la salle de démonstration MONTRE une reprise terminée (données fictives, `demo: true`).
      const demo = await this.workspaceContext.isDemoWorkspace(user.userId)
      return { items: demo ? [demoCrmFirstImport(new Date())] : [] }
    }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return {
      items: await this.firstImport.states(
        workspaceId,
        connected.map(({ adapter }) => adapter.provider),
      ),
    }
  }

  /**
   * #4189.9 — « Garder la valeur du CRM » : un geste utilisateur, auto-approuvé, tracé dans l'historique de la
   * fiche. Une correction humaine postérieure au passage n'est jamais réécrasée (409).
   */
  @Post('conflicts/keep-crm')
  @RequirePermission('records:write')
  async keepCrmValue(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: KeepCrmValueDto,
  ): Promise<{ field: string; value: string }> {
    return this.imports.keepCrmValue(user.userId, body)
  }

  /** Théo D settings-integrations.N3 — « Garder la valeur Bellum » : le choix est retenu sur l'écart, rien n'est réécrit. */
  @Post('conflicts/keep-bellum')
  @RequirePermission('records:write')
  async keepBellumValue(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: KeepCrmValueDto,
  ): Promise<{ field: string }> {
    return this.imports.keepBellumValue(user.userId, body)
  }

  /** L'historique des imports, SIMULATIONS COMPRISES. */
  @Get('runs')
  async runs(@CurrentUser() user: CurrentUserPayload): Promise<{ items: SyncRun[] }> {
    return { items: await this.imports.listRuns(user.userId) }
  }

  /**
   * Lance un import. En simulation par défaut : rien n'est écrit tant que
   * `dryRun: false` n'est pas explicitement demandé, APRÈS avoir vu le
   * compte-rendu.
   *
   * Un CRM autre que HubSpot passe par `CrmReadSyncService` (curseur, conflits comptés).
   *
   * #2388.24 — `entityType` route désormais VRAIMENT vers la bonne reprise :
   * avant cette tranche, une demande `account` était silencieusement traitée
   * comme un import de contacts (le corps était lu mais jamais consulté).
   */
  @Post()
  @RequirePermission('records:write')
  run(@CurrentUser() user: CurrentUserPayload, @Body() body: StartSyncDto): Promise<SyncOutcome> {
    // #4189 — tous les autres CRM relisent par l'adaptateur commun, depuis leur curseur ;
    // HubSpot garde ses sources dédiées (lecture vérifiée sur un portail réel).
    if (body.provider !== 'hubspot') return this.readSync.run(user.userId, body)
    if (body.entityType === 'account') {
      const source = this.imports.assertSource(body.provider === 'hubspot' ? hubspotCompanySource(this.crm) : undefined)
      return this.imports.importAccounts(user.userId, source, body)
    }
    const source = this.imports.assertSource(body.provider === 'hubspot' ? hubspotContactSource(this.crm) : undefined)
    return this.imports.importContacts(user.userId, source, body)
  }
}
