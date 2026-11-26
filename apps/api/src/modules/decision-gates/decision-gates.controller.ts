import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common'
import { GATE_SUBJECTS, type GateSubject } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { DecisionGatesService } from './decision-gates.service'

/**
 * Le journal des portes de décision, en LECTURE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IL S'ÉCRIVAIT ET NE SE RELISAIT NULLE PART
 * ─────────────────────────────────────────────────────────────────────────────
 * `decision_gate_crossings` existe depuis le PDF 1 : chaque geste que le produit
 * ne franchit jamais seul y laisse ce qui MANQUAIT au moment de décider. Le
 * champ `missing` est ce qui justifie la table — « savoir six mois plus tard
 * qu'on a clos une affaire sans budget, sans décideur et sans date est la seule
 * chose qui explique le résultat ».
 *
 * Sauf que le module n'avait **aucun contrôleur**. `forSubject` était écrit,
 * testé, sans appelant. Un journal d'audit qu'on ne peut pas relire ne remplit
 * pas sa fonction : il ne fait qu'occuper de la place.
 *
 * ⚠️ Ce qui existait déjà, et qui n'est pas la même chose : chaque franchissement
 * dépose une trace sur la TIMELINE de l'objet, avec ses manques en clair. Cette
 * trace-là se lit. Ce qui manquait est la lecture STRUCTURÉE — celle qui répond
 * à « combien d'affaires closes sans budget ce trimestre », la question qui a
 * fait créer la table.
 *
 * `team:manage` : relire les décisions d'une équipe est un geste d'encadrement.
 */
@Controller('decision-gates')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
@RequirePermission('team:manage')
export class DecisionGatesController {
  constructor(
    private readonly gates: DecisionGatesService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /** Ce qui a été décidé sur un objet, le plus récent d'abord. */
  @Get(':subject/:subjectId')
  async forSubject(
    @CurrentUser() user: CurrentUserPayload,
    @Param('subject') subject: string,
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // Un sujet inconnu se refuse AVANT la lecture : rendre une liste vide sur
    // une faute de frappe se lirait « aucune décision », ce qui est faux.
    if (!(GATE_SUBJECTS as readonly string[]).includes(subject)) {
      return { crossings: [], unknownSubject: subject }
    }
    return { crossings: await this.gates.forSubject(workspaceId, subject as GateSubject, subjectId) }
  }

  /**
   * Le RÉCAPITULATIF : ce qui manquait, et combien de fois.
   *
   * C'est la lecture qui justifie la table. Une liste vide y dit « rien ne
   * manquait » ; « on n'a pas regardé » n'a délibérément aucune représentation,
   * parce que le journal est écrit ou l'appel échoue.
   */
  @Get()
  async recent(@CurrentUser() user: CurrentUserPayload, @Query('days') days?: string) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const parsed = Number.parseInt(days ?? '', 10)
    const window = Number.isFinite(parsed) && parsed > 0 && parsed <= 365 ? parsed : 90
    return this.gates.summary(workspaceId, window)
  }
}
