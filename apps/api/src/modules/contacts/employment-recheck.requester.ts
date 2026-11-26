import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { type Queue } from 'bullmq'
import {
  EMPLOYMENT_RECHECK_QUEUE,
  type EmploymentRecheckJobData,
  employmentCheckIsDue,
  employmentRecheckJobId,
} from '../routines/employment-check'

/**
 * #4286.13 — l'OUVERTURE d'une fiche demande la relecture de l'employeur, EN ASYNCHRONE : la fiche n'attend rien,
 * le résultat arrive par le refetch habituel. Ici on décide seulement « est-ce dû ? » et on enfile ; la relecture
 * elle-même est celle de la routine (`RoutineExecutors.rereadContactEmployment`), jamais un second chemin.
 */
@Injectable()
export class EmploymentRecheckRequester {
  private readonly logger = new Logger(EmploymentRecheckRequester.name)

  constructor(@InjectQueue(EMPLOYMENT_RECHECK_QUEUE) private readonly queue: Queue<EmploymentRecheckJobData>) {}

  /** `true` si une relecture a été demandée. Jamais fatal : une file en panne ne casse pas l'ouverture de la fiche. */
  async requestIfDue(
    workspaceId: string,
    contact: { id: string; raw_data: Record<string, unknown> | null },
    now: Date = new Date(),
  ): Promise<boolean> {
    if (!workspaceId || !employmentCheckIsDue(contact.raw_data, now)) return false
    try {
      // Même `jobId` ⇒ BullMQ ignore un second `add` tant que le premier existe : une seule relecture en vol.
      await this.queue.add(
        EMPLOYMENT_RECHECK_QUEUE,
        { workspaceId, contactId: contact.id },
        {
          jobId: employmentRecheckJobId(contact.id),
          // Jamais de retry : un annuaire se relit, il ne se martèle pas (même posture que l'enrichissement).
          attempts: 1,
          removeOnComplete: { age: 600 },
          removeOnFail: { age: 3_600 },
        },
      )
      return true
    } catch (error) {
      this.logger.warn('Relecture d’employeur non enfilée (non fatal)', {
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }
}
