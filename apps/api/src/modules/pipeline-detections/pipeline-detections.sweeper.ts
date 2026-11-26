import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { DataSource } from 'typeorm'
import { Correlated } from '../../correlation-id/background-correlation'
import { killSwitchCut } from '../../common/kill-switches'
import { PipelineDetectionsService } from './pipeline-detections.service'

/**
 * #4016 L6 — ce qui REMPLIT le pipe « détecté, à revoir », chaque matin.
 *
 * Ce balayeur n'a qu'une sortie : `PipelineDetectionsService.sweepWorkspace`,
 * qui n'écrit que des lignes `detected`. Il n'ouvre aucune affaire, ne
 * positionne personne, ne crée aucune mission (gardes
 * `project-creation-is-a-human-gesture`, `chaine-commerciale-interne-pas-de-
 * transition-automatique`). Jamais dans un espace de démonstration : la démo
 * est semée (`demo-dataset.ts`).
 *
 * **SANS VERROU :** et c'est voulu — chaque écriture est un `INSERT ...
 * ON CONFLICT DO NOTHING` sur la clé de la source — deux instances qui
 * balaient en même temps écrivent la même ligne une fois. Un verrou n'ajouterait
 * qu'une dépendance de module (GA-07) pour ne rien empêcher de plus.
 *
 * Interrupteur d'urgence : `PIPELINE_AUTO_DETECT_DISABLED=true`.
 */
@Injectable()
export class PipelineDetectionsSweeper {
  private readonly logger = new Logger(PipelineDetectionsSweeper.name)

  constructor(
    private readonly dataSource: DataSource,
    private readonly detections: PipelineDetectionsService,
  ) {}

  /** 05:50 Europe/Paris — après les doublons (05:40), avant la file d'intervention (06:10). */
  @Cron('50 5 * * *', { name: 'pipeline-auto-detect', timeZone: 'Europe/Paris' })
  @Correlated('cron:pipeline.auto_detect')
  async runDailySweep(): Promise<void> {
    await this.sweep()
  }

  /** Balaie chaque espace réel. Rend le nombre de lignes RÉELLEMENT écrites. */
  async sweep(): Promise<number> {
    if (killSwitchCut('pipeline.auto_detect')) {
      this.logger.log('Pipe « détecté » désactivé (PIPELINE_AUTO_DETECT_DISABLED=true)')
      return 0
    }
    const workspaces = await this.dataSource.query<{ id: string }[]>(`SELECT id FROM workspaces WHERE is_demo = false`)
    let written = 0
    for (const { id } of workspaces) {
      try {
        const result = await this.detections.sweepWorkspace(id)
        for (const count of Object.values(result)) written += count ?? 0
      } catch (error) {
        this.logger.error('Pipe « détecté » en échec pour un espace', { error, workspaceId: id })
      }
    }
    this.logger.log(`Pipe « détecté » — ${written} ligne(s) écrite(s)`)
    return written
  }
}
