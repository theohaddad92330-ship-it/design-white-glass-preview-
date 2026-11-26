import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { contextModeSchema, contextSurfaceSchema, type SurfaceContextContract } from '@bellum/contracts'
import type { Repository } from 'typeorm'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import { JwtGuard } from '../auth/jwt.guard'
import { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import { ProfileContextService } from '../profile-context/profile-context.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspaceLauraModeService } from '../workspace/workspace-laura-mode.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'
import { buildSurfaceContextContract } from './surface-context-contract'

/**
 * #2454 — `GET /context-contract?surface=discover|analyze&mode=my_activity|one_off_mission|neutral`.
 *
 * Le contrat de contexte d'une surface hors conversation (LAU-FINAL-167) : ce
 * qu'elle lit, ce qu'elle ignore, ce qui n'est pas branché. Lecture seule, sans
 * crédit. L'orchestration vit ICI (le contrôleur), le calcul dans la fonction
 * pure `buildSurfaceContextContract` — aucun service d'un autre module n'est
 * appelé depuis un service (GA-07).
 */
@Controller('context-contract')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class ContextContractController {
  constructor(
    // Le MÊME lecteur de profil que Découvrir / Analyser / Laura : le contrat
    // décrit le profil qu'ils lisent, pas une copie.
    private readonly esnProfile: EsnProfileReader,
    // #2889 — le PÉRIMÈTRE (`idealAccountProfile`) vit dans le profileur, pas
    // dans `AnalysisProfileData` : `getMe` est aussi la lecture GARDÉE (elle
    // retient un `profile_context` dont le schéma a dérivé, `withheldStoredContext`)
    // — la dupliquer ici rouvrirait exactement le risque qu'elle ferme.
    private readonly profileContext: ProfileContextService,
    private readonly workspace: WorkspaceContextService,
    @InjectRepository(CrmConnectionEntity) private readonly crmConnections: Repository<CrmConnectionEntity>,
    // #2451.1 — le défaut de l'ESPACE, lu par l'unique méthode serveur (GA-26).
    private readonly lauraMode: WorkspaceLauraModeService,
  ) {}

  @Get()
  // GA-05 : posé APRÈS le verbe — la segmentation part du verbe HTTP.
  @WorkspaceRead()
  async get(
    @CurrentUser() user: CurrentUserPayload,
    @Query('surface') rawSurface: string,
    @Query('mode') rawMode: string | undefined,
  ): Promise<SurfaceContextContract> {
    const surface = contextSurfaceSchema.safeParse(rawSurface)
    if (!surface.success) throw new BadRequestException('surface inconnue')
    // #2451.1 — sans mode dans l'appel, le contrat décrit le défaut de l'espace :
    // celui que Découvrir et Analyser appliqueront, jamais « Mon activité » figé.
    const mode = contextModeSchema.safeParse(rawMode ?? (await this.lauraMode.resolveForUser(user.userId)))
    if (!mode.success) throw new BadRequestException('mode inconnu')

    const [profile, versions, crmConnected, profileContextSnapshot] = await Promise.all([
      this.esnProfile.resolveProfileData(user.userId),
      this.esnProfile.getProfileVersions(user.userId),
      this.resolveCrmConnected(user.userId),
      this.profileContext.getMe(user.userId),
    ])
    return buildSurfaceContextContract({
      surface: surface.data,
      mode: mode.data,
      profilePresent: Object.keys(profile ?? {}).length > 0,
      profileName: profile?.companyName ?? null,
      profileVersion: versions?.esnProfileVersion ?? null,
      profilePerimeter: profileContextSnapshot.profile_context?.idealAccountProfile ?? null,
      crmConnected,
    })
  }

  /**
   * Même lecture que la transparence de Laura (`chat-context.service.ts`
   * `resolveCrmState`) : une ligne `crm_connections` sur l'espace ACTIF. Une
   * erreur de lecture vaut « non branché » — on ne prétend jamais une connexion
   * fantôme.
   */
  private async resolveCrmConnected(userId: string): Promise<boolean> {
    try {
      const { workspaceId } = await this.workspace.resolveActiveWorkspace(userId)
      const connection = await this.crmConnections.findOne({ where: workspaceScopeWhere(workspaceId) })
      return connection !== null && connection !== undefined
    } catch {
      return false
    }
  }
}
