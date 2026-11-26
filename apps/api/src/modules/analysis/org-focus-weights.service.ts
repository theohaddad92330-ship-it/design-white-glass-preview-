import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  ORG_FOCUS_AXES,
  ORG_FOCUS_DEFAULT_WEIGHTS,
  resolveOrgFocusWeights,
  type OrgFocusAxis,
  type OrgFocusWeights,
} from '@bellum/contracts'
import { OrgFocusWeightsEntity } from '../../database/entities/org-focus-weights.entity'

/** Ce que l'écran de réglage lit : les défauts, l'écart réglé, et l'effectif. */
type OrgFocusWeightsView = {
  /** Les valeurs EN VIGUEUR du contrat — l'écran doit pouvoir les MONTRER,
   *  sinon un champ vide se lit « zéro » au lieu de « valeur par défaut ». */
  defaults: Record<OrgFocusAxis, number>
  /** Ce que CET espace a réglé, et lui seul. `{}` = rien réglé. */
  overrides: OrgFocusWeights
  /** Ce qui s'applique réellement — la dérivation, à un seul endroit. */
  effective: Record<OrgFocusAxis, number>
}

/**
 * Le focus du plan d'action, réglé par espace.
 *
 * Ne stocke QUE l'écart au défaut. Semer une ligne par espace avec les défauts
 * recopiés créerait autant de copies d'un réglage, et le jour où le défaut
 * bouge aucune ne suivrait — un réglage vit à un seul endroit (GA-26), et cet
 * endroit est le contrat.
 *
 * « Jamais un prisme IT par défaut » : un espace qui ne vend pas d'IT peut
 * mettre `itChallenges` à 0 et voir l'axe disparaître de son plan.
 */
@Injectable()
export class OrgFocusWeightsService {
  private readonly logger = new Logger(OrgFocusWeightsService.name)

  constructor(
    @InjectRepository(OrgFocusWeightsEntity)
    private readonly weights: Repository<OrgFocusWeightsEntity>,
  ) {}

  async view(workspaceId: string): Promise<OrgFocusWeightsView> {
    const overrides = await this.overridesFor(workspaceId)
    return {
      defaults: { ...ORG_FOCUS_DEFAULT_WEIGHTS },
      overrides,
      effective: resolveOrgFocusWeights(overrides),
    }
  }

  /**
   * L'écart réglé par cet espace. `{}` quand rien n'est réglé OU quand la
   * lecture échoue : le pipeline d'analyse ne doit JAMAIS s'arrêter parce qu'un
   * réglage optionnel est illisible — il retombe sur les valeurs en vigueur,
   * qui sont le comportement documenté, pas une valeur inventée.
   */
  async overridesFor(workspaceId: string | null | undefined): Promise<OrgFocusWeights> {
    if (!workspaceId) return {}
    try {
      const row = await this.weights.findOne({ where: { workspace_id: workspaceId } })
      return row?.weights ?? {}
    } catch (err) {
      this.logger.warn('Focus du plan illisible — repli sur les valeurs en vigueur', { workspaceId, error: err })
      return {}
    }
  }

  /**
   * Enregistre l'écart. Un axe réglé à SA VALEUR PAR DÉFAUT est RETIRÉ de
   * l'écart plutôt que stocké : sinon l'espace se retrouve à figer un défaut
   * sans le savoir, et il ne suivrait plus le jour où celui-ci change.
   */
  async save(workspaceId: string, overrides: OrgFocusWeights): Promise<OrgFocusWeightsView> {
    const kept: Record<string, number> = {}
    for (const axis of ORG_FOCUS_AXES) {
      const value = overrides[axis]
      if (typeof value !== 'number') continue
      if (value === ORG_FOCUS_DEFAULT_WEIGHTS[axis]) continue
      kept[axis] = value
    }

    await this.weights.upsert({ workspace_id: workspaceId, weights: kept }, ['workspace_id'])
    return this.view(workspaceId)
  }
}
