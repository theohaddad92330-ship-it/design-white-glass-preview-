import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  DEFAULT_MAX_RECRUITERS_SHOWN,
  type ReverseMarketSettings,
  type UpdateReverseMarketSettings,
} from '@bellum/contracts'
import { WorkspaceReverseMarketSettingsEntity } from '../../database/entities/workspace-reverse-market-settings.entity'

/**
 * `#2035.10` — LE MARCHÉ INVERSÉ : LE SEUL SERVICE DU SUJET.
 *
 * ⚠️ #2035.10 / #2035.11 — fusionné le 21/09, deux implémentations concurrentes.
 * Il y avait DEUX services pour ce sujet : celui-ci (vague 3 :
 * `enabled`, `responseCapacityPerWeek`) et `ReverseMarketSettingsService`
 * (vague 2, module `consultants/matching` : `maxRecruitersShown`, lu par
 * `ReverseMarketService.forTalent`). Ils écrivaient deux tables différentes
 * pour le même sujet. Celui-ci absorbe l'autre, sur la table de PRODUCTION
 * `workspace_reverse_market_settings` — un réglage vit à un seul endroit
 * (GA-26).
 *
 * Le défaut (« jamais réglé ») est ici même, dans `effectiveFor`, jamais
 * recopié ailleurs. Une ligne absente rend `{ enabled: false,
 * responseCapacityPerWeek: null, maxRecruitersShown: DEFAULT_MAX_RECRUITERS_SHOWN }`
 * — la capacité NON DÉCLARÉE, jamais zéro (GA-18/GA-19).
 *
 * 🔴 `responseCapacityPerWeek` nomme une CAPACITÉ CONFIGURÉE — combien de
 * sollicitations l'espace accepte de traiter par semaine — jamais une chance
 * estimée. Ce service ne calcule rien : il lit et écrit ce qu'un
 * administrateur a posé, point.
 */
@Injectable()
export class WorkspaceReverseMarketSettingsService {
  private readonly logger = new Logger(WorkspaceReverseMarketSettingsService.name)

  constructor(
    @InjectRepository(WorkspaceReverseMarketSettingsEntity)
    private readonly settings: Repository<WorkspaceReverseMarketSettingsEntity>,
  ) {}

  /** Le réglage en vigueur pour un espace, ou le défaut « jamais réglé ». */
  async effectiveFor(workspaceId: string): Promise<ReverseMarketSettings> {
    try {
      const row = await this.settings.findOne({ where: { workspace_id: workspaceId } })
      if (!row) {
        return { enabled: false, responseCapacityPerWeek: null, maxRecruitersShown: DEFAULT_MAX_RECRUITERS_SHOWN }
      }
      return {
        enabled: row.enabled ?? false,
        responseCapacityPerWeek: row.response_capacity_per_week ?? null,
        maxRecruitersShown: row.max_recruiters_shown ?? DEFAULT_MAX_RECRUITERS_SHOWN,
      }
    } catch (error) {
      // Le côté prudent de l'erreur : une lecture ratée retombe sur le défaut
      // désactivé, jamais sur une capacité inventée.
      this.logger.error('reverse market settings read failed', { error })
      return { enabled: false, responseCapacityPerWeek: null, maxRecruitersShown: DEFAULT_MAX_RECRUITERS_SHOWN }
    }
  }

  /**
   * Le plafond EFFECTIF de recruteurs affichés — l'unique méthode que
   * `ReverseMarketService.forTalent` appelle. Aucun autre chemin ne doit
   * connaître le défaut ni la borne (GA-26).
   */
  async maxRecruitersShownFor(workspaceId: string): Promise<number> {
    const settings = await this.effectiveFor(workspaceId)
    return settings.maxRecruitersShown
  }

  /**
   * Régler le marché inversé d'un espace. `undefined` = ne touche pas,
   * `null` (sur la capacité) = repasse à « non renseigné » — les deux gestes
   * existent, ils ne s'écrivent pas pareil.
   */
  async update(workspaceId: string, patch: UpdateReverseMarketSettings): Promise<ReverseMarketSettings> {
    const current = await this.effectiveFor(workspaceId)
    const enabled = patch.enabled !== undefined ? patch.enabled : current.enabled
    const responseCapacityPerWeek =
      patch.responseCapacityPerWeek !== undefined ? patch.responseCapacityPerWeek : current.responseCapacityPerWeek
    const maxRecruitersShown =
      patch.maxRecruitersShown !== undefined ? patch.maxRecruitersShown : current.maxRecruitersShown

    await this.settings.manager.query(
      `INSERT INTO workspace_reverse_market_settings
         (workspace_id, enabled, response_capacity_per_week, max_recruiters_shown, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (workspace_id) DO UPDATE
         SET enabled = EXCLUDED.enabled,
             response_capacity_per_week = EXCLUDED.response_capacity_per_week,
             max_recruiters_shown = EXCLUDED.max_recruiters_shown,
             updated_at = now()`,
      [workspaceId, enabled, responseCapacityPerWeek, maxRecruitersShown],
    )
    return { enabled, responseCapacityPerWeek, maxRecruitersShown }
  }
}
