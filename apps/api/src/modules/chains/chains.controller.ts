import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { chainKeySchema, chainSubjectTypeSchema } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { ChainsService } from './chains.service'

class ToggleMarkDto extends createZodDto(
  z
    .object({
      chainKey: chainKeySchema,
      subjectId: z.string().guid(),
      position: z.number().int().min(1),
      marked: z.boolean(),
    })
    .strict(),
) {}

/**
 * Les parcours, DÉRIVÉS (#1503).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI A DISPARU, ET CE QUE ÇA VEUT DIRE
 * ─────────────────────────────────────────────────────────────────────────
 * `POST /chains/runs` et `POST /chains/runs/:id/advance` n'existent plus. Ce
 * n'est pas un déplacement de code : **il n'y a plus rien à avancer à la main**.
 * Une position se calcule depuis l'objet métier, et c'est la seule façon de ne
 * pas porter deux vérités sur le même dossier.
 *
 * La seule écriture qui reste est la checklist des gestes hors outil, et elle ne
 * peut toucher aucune position du flux dérivé — le service refuse.
 */
@Controller('chains')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class ChainsController {
  constructor(
    private readonly chains: ChainsService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  private async scope(userId: string): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return workspaceId
  }

  /** Le catalogue : sept parcours, leurs étapes, leurs portes. */
  @Get('catalog')
  catalog() {
    return { chains: this.chains.catalog() }
  }

  /** Les pistes avec leurs compteurs — l'écran du §6.3. */
  @Get('board')
  async board(@CurrentUser() user: CurrentUserPayload) {
    return { lanes: await this.chains.board(await this.scope(user.userId)) }
  }

  /**
   * Les blocages, regroupés — ce que « Aujourd'hui » affiche et ce que Laura
   * lit (#1506).
   *
   * Une LECTURE : rien n'est créé, rien n'est envoyé. C'est le commercial qui
   * ouvre le dossier depuis là.
   */
  @Get('blockers')
  async blockers(@CurrentUser() user: CurrentUserPayload) {
    return { blockers: await this.chains.blockers(await this.scope(user.userId)) }
  }

  /** Le parcours d'UN dossier, pour sa fiche (#1505). */
  @Get('subject/:subjectType/:subjectId')
  async forSubject(
    @CurrentUser() user: CurrentUserPayload,
    @Param('subjectType') subjectType: string,
    @Param('subjectId') subjectId: string,
  ) {
    const parsed = chainSubjectTypeSchema.safeParse(subjectType)
    const id = z.string().guid().safeParse(subjectId)
    // Une clé inconnue rend une liste vide plutôt que d'interroger une table
    // devinée : c'est la seule réponse honnête à « le parcours de quoi ? ».
    if (!parsed.success || !id.success) return { chains: [] }
    return { chains: await this.chains.forSubject(await this.scope(user.userId), parsed.data, id.data) }
  }

  /** Les dossiers arrêtés à une position, ou ceux qu'on ne sait pas placer. */
  @Get(':chainKey/position/:position')
  async atPosition(
    @CurrentUser() user: CurrentUserPayload,
    @Param('chainKey') chainKey: string,
    @Param('position') position: string,
    @Query('undetermined') undetermined?: string,
  ) {
    const parsed = chainKeySchema.safeParse(chainKey)
    if (!parsed.success) return { items: [] }
    const workspaceId = await this.scope(user.userId)
    if (undetermined === 'true') {
      return { items: await this.chains.undetermined(workspaceId, parsed.data) }
    }
    const index = Number(position)
    if (!Number.isFinite(index) || index < 1) return { items: [] }
    return { items: await this.chains.atPosition(workspaceId, parsed.data, index) }
  }

  /**
   * Coche ou décoche un geste hors outil.
   *
   * ⚠️ La seule écriture de ce contrôleur, et elle ne peut atteindre aucune
   * position dérivée : ce n'est pas une convention d'écran, c'est le service qui
   * refuse.
   */
  @Post('marks')
  @RequirePermission('records:write')
  async toggleMark(@CurrentUser() user: CurrentUserPayload, @Body() body: ToggleMarkDto) {
    try {
      return await this.chains.toggleManualMark(
        await this.scope(user.userId),
        user.userId,
        body.chainKey,
        body.subjectId,
        body.position,
        body.marked,
      )
    } catch (error) {
      throw new BadRequestException((error as Error).message)
    }
  }
}
