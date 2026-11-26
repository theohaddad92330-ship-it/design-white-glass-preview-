import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  DEAL_STAGE_SLA_BOUNDS,
  DEAL_STAGE_SLA_DEFAULTS,
  PIPELINE_STAGES,
  dealStageAging,
  effectiveStageSla,
  isPipelineStage,
  type DealStageAging,
  type DealStageSlaOverrides,
  type PipelineStage,
} from '@bellum/contracts'
import { DealStageSlaEntity } from '../../database/entities/deal-stage-sla.entity'

/** Une étape, sa durée cible en vigueur, et d'où elle vient. */
export type StageSlaRow = { stage: PipelineStage; slaDays: number | null; isDefault: boolean }

/**
 * LE SLA D'ÉTAPE DU PIPE — PDF 3 §3.5, ticket `BEL-CRM-203` PR5.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN RÉGLAGE VIT À UN SEUL ENDROIT (GA-26)
 * ─────────────────────────────────────────────────────────────────────────────
 * Le DÉFAUT est dans `@bellum/contracts` (`DEAL_STAGE_SLA_DEFAULTS`), le
 * RÉGLAGE dans `deal_stage_sla`, et ce service est la seule porte des deux. Ni
 * variable d'environnement, ni constante recopiée : « une valeur par défaut
 * dont on a perdu la raison redevient une loterie ».
 *
 * ⚠️ Ce service ne DÉCLENCHE rien. La ligne d'intervention au-delà du seuil
 * existe déjà, sous son nom anglais `project_no_decision`
 * (`INTERVENTION_KINDS`) — c'est le `deal_stage_aging` de la source. Ce service
 * donne la MESURE et le réglage ; le geste appartient à la file du responsable.
 */
@Injectable()
export class DealStageSlaService {
  private readonly logger = new Logger(DealStageSlaService.name)

  constructor(
    @InjectRepository(DealStageSlaEntity)
    private readonly slas: Repository<DealStageSlaEntity>,
  ) {}

  /**
   * Les réglages BRUTS d'un espace, tels qu'ils sont en base.
   *
   * Une lecture ratée rend `{}` : on retombe alors sur les défauts du produit,
   * ce qui est le comportement PRUDENT — jamais « aucun seuil », qui ferait
   * taire le signal sans que personne le voie.
   */
  async overridesOf(workspaceId: string): Promise<DealStageSlaOverrides> {
    try {
      const rows = await this.slas.find({ where: { workspace_id: workspaceId } })
      const out: DealStageSlaOverrides = {}
      for (const row of rows) {
        if (isPipelineStage(row.stage)) out[row.stage] = row.sla_days
      }
      return out
    } catch (error) {
      this.logger.error('deal stage SLA read failed', { error })
      return {}
    }
  }

  /** Les cinq étapes, leur durée cible EN VIGUEUR, et si c'est le défaut. */
  async effectiveFor(workspaceId: string): Promise<StageSlaRow[]> {
    const overrides = await this.overridesOf(workspaceId)
    return PIPELINE_STAGES.map(stage => {
      const sla = effectiveStageSla(stage, overrides)
      return { stage, slaDays: sla.days, isDefault: sla.isDefault }
    })
  }

  /**
   * L'âge d'étape d'une affaire, mesuré contre le réglage de l'espace.
   *
   * ⚠️ `stageEnteredAt` absente ne vaut PAS « 0 jour » : le contrat rend `null`
   * partout, et l'écran écrit « non mesuré ». Un zéro se lirait « elle vient
   * d'arriver », c'est-à-dire l'inverse de ce qu'on sait.
   */
  async agingOf(
    workspaceId: string,
    stage: PipelineStage,
    stageEnteredAt: Date | string | null,
    now: Date = new Date(),
  ): Promise<DealStageAging> {
    return dealStageAging({ stage, stageEnteredAt, now, overrides: await this.overridesOf(workspaceId) })
  }

  /**
   * Régler la durée cible d'une étape. `null` REMET le défaut plutôt que de
   * poser un zéro — et remettre le défaut doit rester possible sans passer par
   * la base, exactement comme pour un libellé d'étape vidé.
   */
  async setStageSla(workspaceId: string, stage: string, days: number | null): Promise<StageSlaRow[]> {
    if (!isPipelineStage(stage)) throw new BadRequestException(`Étape inconnue : ${stage}`)
    // Une étape SANS durée cible par défaut (`won`) n'en accepte pas : lui en
    // donner une ferait apparaître « en retard » sur une affaire signée.
    if (DEAL_STAGE_SLA_DEFAULTS[stage] === null) {
      throw new BadRequestException(`L'étape « ${stage} » n'a pas de durée cible : une affaire gagnée ne vieillit pas.`)
    }

    if (days === null) {
      await this.slas.delete({ workspace_id: workspaceId, stage })
      return this.effectiveFor(workspaceId)
    }

    const value = Math.trunc(days)
    if (!Number.isFinite(value) || value < DEAL_STAGE_SLA_BOUNDS.min || value > DEAL_STAGE_SLA_BOUNDS.max) {
      throw new BadRequestException(
        `Une durée cible se règle entre ${DEAL_STAGE_SLA_BOUNDS.min} et ${DEAL_STAGE_SLA_BOUNDS.max} jours.`,
      )
    }

    await this.slas.manager.query(
      `INSERT INTO deal_stage_sla (workspace_id, stage, sla_days, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (workspace_id, stage) DO UPDATE SET sla_days = EXCLUDED.sla_days, updated_at = now()`,
      [workspaceId, stage, value],
    )
    return this.effectiveFor(workspaceId)
  }
}
