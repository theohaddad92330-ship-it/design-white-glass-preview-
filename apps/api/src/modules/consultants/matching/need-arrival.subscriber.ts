import { Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import type {
  DataSource,
  EntitySubscriberInterface,
  InsertEvent,
  QueryRunner,
  TransactionCommitEvent,
  TransactionRollbackEvent,
} from 'typeorm'
import { ProjectNeedEntity } from '../../../database/entities/project-need.entity'
import { AutoNeedMatchingService } from './auto-need-matching.service'

/**
 * #2916 / #2399.2 — L'ARRIVÉE D'UN BESOIN, QUELLE QUE SOIT SA PORTE
 * (`c93_matching_auto_besoin_entrant`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN ABONNÉ ORM ET PAS UN APPEL DANS CHAQUE PORTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un besoin naît par deux écrivains : `ProjectPipelineService.saveNeed` (saisie,
 * besoin d'un compte, compte-rendu de rendez-vous, appel d'offres, Laura,
 * proposition acceptée) et `ImportWriterService.writeNeeds` (import de fichier).
 * Appeler l'automatisation dans chacun obligerait le module d'import à importer
 * le vivier (règle n°7, GA-07) — et la TROISIÈME porte, celle qui n'existe pas
 * encore, l'oublierait. L'abonné voit TOUTE insertion de `project_needs` par
 * l'ORM ; seul le SQL brut le contourne, et la garde
 * `matching-auto-seul-ecrit-sans-geste.spec.ts` le refuse hors démo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * APRÈS LE COMMIT, JAMAIS AVANT
 * ─────────────────────────────────────────────────────────────────────────────
 * `afterInsert` tourne DANS la transaction de `save()` : un job lancé là
 * pourrait lire la base avant que le besoin y soit visible. Les besoins sont
 * donc gardés par transaction et annoncés à son commit — oubliés à son
 * annulation.
 */
@Injectable()
export class NeedArrivalSubscriber implements EntitySubscriberInterface<ProjectNeedEntity> {
  private readonly logger = new Logger(NeedArrivalSubscriber.name)
  private readonly pending = new WeakMap<QueryRunner, ProjectNeedEntity[]>()

  constructor(
    @InjectDataSource() dataSource: DataSource,
    private readonly autoMatching: AutoNeedMatchingService,
  ) {
    dataSource.subscribers.push(this)
  }

  listenTo(): typeof ProjectNeedEntity {
    return ProjectNeedEntity
  }

  afterInsert(event: InsertEvent<ProjectNeedEntity>): void {
    const { entity, queryRunner } = event
    if (!entity?.id) return
    if (!queryRunner?.isTransactionActive) {
      this.announce([entity])
      return
    }
    const list = this.pending.get(queryRunner) ?? []
    list.push(entity)
    this.pending.set(queryRunner, list)
  }

  afterTransactionCommit(event: TransactionCommitEvent): void {
    const list = this.pending.get(event.queryRunner)
    if (!list) return
    this.pending.delete(event.queryRunner)
    this.announce(list)
  }

  afterTransactionRollback(event: TransactionRollbackEvent): void {
    this.pending.delete(event.queryRunner)
  }

  /** Hors du chemin de l'écriture : jamais attendu, jamais une exception qui remonte. */
  private announce(needs: ProjectNeedEntity[]): void {
    void (async () => {
      for (const need of needs) {
        try {
          await this.autoMatching.onNeedCreated(need)
        } catch (error) {
          this.logger.warn(`Arrivée de besoin non traitée (${need.id}) : ${(error as Error).message}`)
        }
      }
    })()
  }
}
