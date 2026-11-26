import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Cron } from '@nestjs/schedule'
import { Repository } from 'typeorm'
import { DECIDED_STAGES, projectStageInSql, shouldReevaluateDiagnosis } from '@bellum/contracts'
import { Correlated } from '../../correlation-id/background-correlation'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WeakestLinkDiagnosisEntity } from '../../database/entities/weakest-link-diagnosis.entity'
import { WeakestLinkDiagnosisService } from './weakest-link-diagnosis.service'
import { SINGLETON_LOCK, type UnderSingletonLock } from './module-tokens'

interface ReevaluationSweepReport {
  /** Espaces examinés ce passage. */
  examined: number
  /** Combien avaient une réévaluation hebdomadaire légère due (`diagnoseFor` rappelé). */
  reevaluated: number
}

/**
 * BEL-SC-224 (#3253.c) — LE PASSAGE QUI REJOUE LE DIAGNOSTIC SANS QUE
 * PERSONNE N'AIT ROUVERT L'ÉCRAN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL CÂBLE, ET CE QU'IL NE CÂBLE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * `shouldReevaluateDiagnosis` (`@bellum/contracts`) porte déjà les deux
 * cadences de la doctrine du ticket : légère hebdomadaire, complète après un
 * événement significatif. Ce passage cadence la branche HEBDOMADAIRE — la
 * seule des deux qui a une horloge, pas un événement métier, pour la
 * déclencher. La branche « événement significatif » reste HORS de ce lot :
 * le dépôt n'a pas aujourd'hui de bus d'événements métier (compte perdu,
 * opportunité gagnée…) à qui s'abonner sans en inventer un — câbler cette
 * moitié sur un signal deviné serait exactement le défaut que la doctrine du
 * dépôt nomme.
 *
 * `diagnoseFor` fait le calcul ET la persistance (voir
 * `WeakestLinkDiagnosisService.compute`) — ce passage ne réimplémente rien,
 * il rappelle le même appelant qu'un écran qui se rouvrirait.
 *
 * Un espace SANS aucun diagnostic antérieur est traité comme dû : établir la
 * première ligne d'historique ne demande jamais qu'un commercial ouvre
 * l'écran en premier.
 */
@Injectable()
export class WeakestLinkDiagnosisReevaluationSweepService {
  private readonly logger = new Logger(WeakestLinkDiagnosisReevaluationSweepService.name)

  constructor(
    @InjectRepository(WorkspaceEntity) private readonly workspaces: Repository<WorkspaceEntity>,
    @InjectRepository(WeakestLinkDiagnosisEntity) private readonly diagnoses: Repository<WeakestLinkDiagnosisEntity>,
    private readonly diagnosisService: WeakestLinkDiagnosisService,
    @Inject(SINGLETON_LOCK) private readonly underLock: UnderSingletonLock,
  ) {}

  /** Chaque jour 06:00 Europe/Paris — avant l'ouverture de la première fenêtre de
   *  bureau. Le passage est QUOTIDIEN depuis #3294 pour qu'un événement significatif
   *  n'attende pas lundi ; la cadence hebdomadaire légère reste portée par
   *  `shouldReevaluateDiagnosis` (un espace réévalué il y a moins de sept jours,
   *  sans événement, est sauté). */
  @Cron('0 6 * * *', { name: 'weakest-link-diagnosis-reevaluation-sweep', timeZone: 'Europe/Paris' })
  @Correlated('cron:weakest_link_diagnosis.reevaluation_sweep')
  async runWeeklySweep(): Promise<void> {
    await this.underLock('weakest-link-diagnosis-reevaluation-sweep', async () => {
      await this.sweep()
    })
  }

  async sweep(now: Date = new Date()): Promise<ReevaluationSweepReport> {
    const workspaces = await this.workspaces.find({ select: ['id'] })
    let reevaluated = 0

    for (const workspace of workspaces) {
      const history = await this.diagnoses.find({
        where: { workspace_id: workspace.id },
        order: { computed_at: 'DESC' },
        take: 1,
      })
      const lastComputedAt = history[0]?.computed_at ?? new Date(0)
      // #3294 (#3253.c) — l'événement significatif n'a pas de bus : on le LIT dans les faits
      // horodatés, depuis le dernier diagnostic. Sans diagnostic antérieur, le passage est dû de toute façon.
      const significantEventOccurred = history[0]
        ? await this.significantEventSince(workspace.id, lastComputedAt)
        : false
      const due = shouldReevaluateDiagnosis({ lastComputedAt, now, significantEventOccurred })
      if (due === 'not_due') continue

      await this.diagnosisService.diagnoseFor(workspace.id)
      reevaluated += 1
    }

    this.logger.log(`weakest-link: réévaluation — ${reevaluated}/${workspaces.length} espace(s) rejoué(s)`)
    return { examined: workspaces.length, reevaluated }
  }

  /**
   * #3294 — « événement significatif » = un FAIT commercial ou de delivery, daté, survenu
   * depuis le dernier diagnostic : une affaire gagnée ou perdue, une mission terminée.
   * Lu des colonnes `updated_at` existantes (aucun bus, aucun événement inventé) : une
   * retouche d'une affaire déjà gagnée relance aussi le calcul — c'est idempotent et sans
   * effet de bord (une ligne d'historique). Illisible = pas d'événement : le passage
   * hebdomadaire rattrape.
   */
  private async significantEventSince(workspaceId: string, since: Date): Promise<boolean> {
    try {
      const rows = await this.diagnoses.manager.query<{ happened: boolean }[]>(
        `SELECT (EXISTS (SELECT 1 FROM missions
                          WHERE workspace_id = $1::uuid AND status IN ('ended', 'terminated') AND updated_at > $2)
             OR EXISTS (SELECT 1 FROM opportunities
                          WHERE workspace_id = $1::uuid AND ${projectStageInSql('stage', DECIDED_STAGES)} AND updated_at > $2)) AS happened`,
        [workspaceId, since],
      )
      return rows?.[0]?.happened === true
    } catch (error) {
      this.logger.warn(`weakest-link: événements significatifs illisibles (${(error as Error).message})`)
      return false
    }
  }
}
