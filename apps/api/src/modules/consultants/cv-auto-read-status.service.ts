import { InjectQueue } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Queue } from 'bullmq'
import { Repository } from 'typeorm'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { CV_AUTO_PARSE_QUEUE, type CvAutoParseJobData } from './cv-auto-parse.queue'
import { CvAutoParseService, UNREAD_WHERE } from './cv-auto-parse.service'

/** Combien de jobs en échec la lecture de l'état parcourt, au plus — la file
 *  garde ses échecs 7 jours (`CV_AUTO_PARSE_JOB_OPTIONS.removeOnFail`). */
const FAILED_SCAN_MAX = 2_000

/** La progression d'un lot ne remonte pas plus loin : une fiche jamais lue
 *  d'il y a trois mois ne fait pas de « 2 000 / 5 000 lus ». */
const PROGRESS_WINDOW = `interval '24 hours'`

type CvAutoReadFailure = {
  consultantId: string
  /** Le nom de la fiche, sinon le nom du fichier déposé ; `null` si aucun des deux. */
  label: string | null
  /** La raison LISIBLE du dernier échec (le message que la lecture a levé). */
  reason: string
  failedAt: string | null
}

export type CvAutoReadStatusPayload = {
  unread: number
  /** `null` quand il n'y a rien en cours de lecture — jamais « 0 / 0 ». */
  progress: { read: number; total: number } | null
  failed: CvAutoReadFailure[]
  /** « CV lu = fiche qualifiée » : les CV lus depuis 7 jours, nommés ; `null` si aucun — jamais « 0 ». */
  readThisWeek: { count: number; names: string[] } | null
}

/** Combien de noms le bandeau cite, au plus. */
const WEEK_NAMES_MAX = 5

/**
 * Lot BATCH-CV (Louis 12/10/2026, #3935) — ce que le vivier montre pendant un
 * import de centaines de CV : « N / total lus », et les fiches dont la lecture
 * a ÉCHOUÉ, chacune avec sa raison, relançables d'un geste.
 *
 * Aucun stockage neuf : la progression se lit sur les fiches
 * (`cv_auto_read_at`), les échecs sur la file (BullMQ garde un job en échec
 * 7 jours, avec son `failedReason`). Au-delà, la fiche reste « non lue » et
 * comptée — jamais perdue en silence.
 *
 * #3947 (Louis 08/10) tient : AUCUN bouton « Lire les CV non lus » — la lecture
 * est automatique. Le seul geste est « Relancer les échecs ».
 */
@Injectable()
export class CvAutoReadStatusService {
  constructor(
    @InjectQueue(CV_AUTO_PARSE_QUEUE) private readonly queue: Queue<CvAutoParseJobData>,
    @InjectRepository(ConsultantEntity) private readonly consultants: Repository<ConsultantEntity>,
    private readonly autoParse: CvAutoParseService,
  ) {}

  async status(workspaceId: string): Promise<CvAutoReadStatusPayload> {
    const [counts] = await this.consultants.manager.query<{ unread: string; read: string }[]>(
      // La fenêtre du lot : depuis la plus ancienne fiche encore non lue (bornée à 24 h).
      `WITH unread_cte AS (SELECT c.created_at FROM consultants c WHERE ${UNREAD_WHERE}),
            since_cte AS (SELECT GREATEST(min(created_at), now() - ${PROGRESS_WINDOW}) AS since FROM unread_cte)
       SELECT (SELECT count(*) FROM unread_cte)::text AS unread,
              (SELECT count(*) FROM consultants r, since_cte s
                WHERE r.workspace_id = $1 AND r.archived_at IS NULL AND r.cv_auto_read_at IS NOT NULL
                  AND s.since IS NOT NULL AND r.created_at >= s.since)::text AS read`,
      [workspaceId],
    )
    const unread = Number(counts?.unread ?? 0)
    const read = Number(counts?.read ?? 0)
    return {
      unread,
      progress: unread > 0 ? { read, total: read + unread } : null,
      failed: (await this.failures(workspaceId)).map(({ ownerId: _ownerId, ...failure }) => failure),
      readThisWeek: await this.readThisWeek(workspaceId),
    }
  }

  private async readThisWeek(workspaceId: string): Promise<CvAutoReadStatusPayload['readThisWeek']> {
    const rows = await this.consultants.manager.query<{ full_name: string | null; total: string }[]>(
      `/* read_this_week */
       SELECT c.full_name, count(*) OVER ()::text AS total
         FROM consultants c
        WHERE c.workspace_id = $1 AND c.archived_at IS NULL
          AND c.cv_auto_read_at >= now() - interval '7 days'
        ORDER BY c.cv_auto_read_at DESC
        LIMIT ${WEEK_NAMES_MAX}`,
      [workspaceId],
    )
    const count = Number(rows[0]?.total ?? 0)
    if (count === 0) return null
    const names = rows.map(row => row.full_name?.trim() ?? '').filter(name => name.length > 0)
    return { count, names }
  }

  /** « Relancer les échecs » : chaque fiche en échec de l'espace repart, au nom
   *  de son propriétaire d'origine. `enqueue` retire le job en échec avant. */
  async retryFailed(workspaceId: string): Promise<{ queued: number }> {
    let queued = 0
    for (const failure of await this.failures(workspaceId)) {
      if (await this.autoParse.enqueue(workspaceId, failure.ownerId, failure.consultantId)) queued += 1
    }
    return { queued }
  }

  private async failures(workspaceId: string): Promise<Array<CvAutoReadFailure & { ownerId: string }>> {
    const jobs = (await this.queue.getFailed(0, FAILED_SCAN_MAX - 1)).filter(
      job => job?.data?.workspaceId === workspaceId,
    )
    // Le plus récent échec d'une fiche fait foi.
    const latest = new Map<string, (typeof jobs)[number]>()
    for (const job of jobs) {
      const previous = latest.get(job.data.consultantId)
      if (!previous || (job.finishedOn ?? 0) > (previous.finishedOn ?? 0)) latest.set(job.data.consultantId, job)
    }
    if (latest.size === 0) return []
    const rows = await this.consultants.manager.query<
      { id: string; full_name: string | null; filename: string | null; cv_auto_read_at: string | Date | null }[]
    >(
      `SELECT c.id, c.full_name, d.filename, c.cv_auto_read_at
         FROM consultants c
         LEFT JOIN LATERAL (
           SELECT cd.filename FROM consultant_documents cd
            WHERE cd.consultant_id = c.id ORDER BY cd.created_at DESC LIMIT 1
         ) d ON true
        WHERE c.workspace_id = $1 AND c.id = ANY($2) AND c.archived_at IS NULL`,
      [workspaceId, [...latest.keys()]],
    )
    const failures: Array<CvAutoReadFailure & { ownerId: string }> = []
    for (const row of rows) {
      const job = latest.get(row.id)
      if (!job) continue
      // Relue avec succès DEPUIS l'échec : ce n'est plus un échec.
      const readAt = row.cv_auto_read_at ? new Date(row.cv_auto_read_at).getTime() : null
      if (readAt !== null && job.finishedOn !== undefined && readAt >= job.finishedOn) continue
      failures.push({
        consultantId: row.id,
        ownerId: job.data.userId,
        label: row.full_name?.trim() || row.filename || null,
        reason: job.failedReason || 'Lecture en échec, sans raison transmise.',
        failedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
      })
    }
    return failures
  }
}
