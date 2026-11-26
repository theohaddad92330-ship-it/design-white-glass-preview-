import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  DEFAULT_MAX_OPEN_NEEDS,
  type CommercialLoadSettings,
  type UpdateCommercialLoadSettings,
} from '@bellum/contracts'
import { WorkspaceCommercialLoadSettingsEntity } from '../../database/entities/workspace-commercial-load-settings.entity'

/**
 * `#2035.11` — LA CHARGE COMMERCIALE : LE SEUL SERVICE DU SUJET.
 *
 * ⚠️ #2035.10 / #2035.11 — fusionné le 21/09, deux implémentations concurrentes.
 * Il y avait DEUX services pour ce sujet : celui-ci (vague 3 :
 * `maxTrackedAccounts` + `maxOpenNeeds` sur une table `..._capacity_settings`)
 * et `CommercialLoadSettingsService` (vague 2, module `projects` :
 * `maxOpenNeeds` sur la table de PRODUCTION, lu par `OpenNeedsService.list`).
 * `max_open_needs` était donc défini DES DEUX CÔTÉS — exactement ce que GA-26
 * interdit. Celui-ci absorbe l'autre, sur la table de production ; le plafond
 * de besoins n'a pas bougé de place.
 *
 * Ce service pose deux plafonds CONFIGURÉS, sur des colonnes qui existent déjà
 * — `accounts.assigned_to` (dossiers suivis par un commercial) et
 * `project_needs.status` (besoins ouverts) — et n'invente aucun autre concept :
 * pas de score de priorité, pas de pondération. Le défaut « jamais réglé » est
 * ici, jamais recopié.
 *
 * `maxTrackedAccounts: null` = « non renseigné », jamais zéro dossier
 * (GA-18/GA-19). `maxOpenNeeds` est NOT NULL en base et a toujours une valeur :
 * celle de la ligne, ou `DEFAULT_MAX_OPEN_NEEDS` si l'espace n'a jamais réglé.
 */
const UNSET_SETTINGS: CommercialLoadSettings = {
  maxTrackedAccounts: null,
  maxOpenNeeds: DEFAULT_MAX_OPEN_NEEDS,
  weeklyAvailableHours: null,
  cadenceWeekday: null,
}

@Injectable()
export class WorkspaceCommercialLoadSettingsService {
  private readonly logger = new Logger(WorkspaceCommercialLoadSettingsService.name)

  constructor(
    @InjectRepository(WorkspaceCommercialLoadSettingsEntity)
    private readonly settings: Repository<WorkspaceCommercialLoadSettingsEntity>,
  ) {}

  /** Les plafonds en vigueur pour un espace, ou le défaut « jamais réglé ». */
  async effectiveFor(workspaceId: string): Promise<CommercialLoadSettings> {
    try {
      const row = await this.settings.findOne({ where: { workspace_id: workspaceId } })
      if (!row) return UNSET_SETTINGS
      return {
        maxTrackedAccounts: row.max_tracked_accounts ?? null,
        maxOpenNeeds: row.max_open_needs ?? DEFAULT_MAX_OPEN_NEEDS,
        // #3245 (reste de #3209.3) — même convention : NULL = non renseigné,
        // jamais 0 heure (GA-18/GA-19).
        weeklyAvailableHours: row.weekly_available_hours ?? null,
        // #3289.29 — le jour imposé à la cadence : NULL = non renseigné.
        cadenceWeekday: row.cadence_weekday ?? null,
      }
    } catch (error) {
      // Une lecture ratée retombe sur le défaut, jamais sur un plafond inventé
      // qui bloquerait un commercial sans qu'il sache pourquoi.
      this.logger.error('commercial load settings read failed', { error })
      return UNSET_SETTINGS
    }
  }

  /**
   * Le plafond EFFECTIF de besoins ouverts — l'unique méthode que
   * `OpenNeedsService.list` appelle pour reprioriser (GA-26).
   */
  async maxOpenNeedsFor(workspaceId: string): Promise<number> {
    const settings = await this.effectiveFor(workspaceId)
    return settings.maxOpenNeeds
  }

  /**
   * Régler la charge commerciale d'un espace. `undefined` = ne touche pas,
   * `null` = repasse le plafond de dossiers à « non renseigné ».
   */
  async update(workspaceId: string, patch: UpdateCommercialLoadSettings): Promise<CommercialLoadSettings> {
    const current = await this.effectiveFor(workspaceId)
    const maxTrackedAccounts =
      patch.maxTrackedAccounts !== undefined ? patch.maxTrackedAccounts : current.maxTrackedAccounts
    const maxOpenNeeds = patch.maxOpenNeeds !== undefined ? patch.maxOpenNeeds : current.maxOpenNeeds
    const weeklyAvailableHours =
      patch.weeklyAvailableHours !== undefined ? patch.weeklyAvailableHours : current.weeklyAvailableHours
    const cadenceWeekday = patch.cadenceWeekday !== undefined ? patch.cadenceWeekday : (current.cadenceWeekday ?? null)

    await this.settings.manager.query(
      `INSERT INTO workspace_commercial_load_settings
         (workspace_id, max_tracked_accounts, max_open_needs, weekly_available_hours, cadence_weekday, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (workspace_id) DO UPDATE
         SET max_tracked_accounts = EXCLUDED.max_tracked_accounts,
             max_open_needs = EXCLUDED.max_open_needs,
             weekly_available_hours = EXCLUDED.weekly_available_hours,
             cadence_weekday = EXCLUDED.cadence_weekday,
             updated_at = now()`,
      [workspaceId, maxTrackedAccounts, maxOpenNeeds, weeklyAvailableHours, cadenceWeekday],
    )
    return { maxTrackedAccounts, maxOpenNeeds, weeklyAvailableHours, cadenceWeekday }
  }
}
