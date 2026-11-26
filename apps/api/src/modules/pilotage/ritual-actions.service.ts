import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { RitualActionsCreated, RitualKey } from '@bellum/contracts'
import { TaskEntity } from '../../database/entities/task.entity'

/**
 * #3271.8 reste (épopée #3298) — « actions créées » par rituel. Une LECTURE
 * des tâches taguées à leur création (`tasks.ritual_key`), jamais un journal :
 * un rituel sans action taguée n'a aucune ligne (une absence ne fait pas « 0 »,
 * les tâches antérieures au geste n'étant pas rattachables).
 */
@Injectable()
export class RitualActionsService {
  constructor(@InjectRepository(TaskEntity) private readonly tasks: Repository<TaskEntity>) {}

  async forWorkspace(workspaceId: string): Promise<RitualActionsCreated[]> {
    const rows = await this.tasks.query(
      `SELECT ritual_key, count(*)::int AS count
         FROM tasks
        WHERE workspace_id = $1 AND ritual_key IS NOT NULL
        GROUP BY ritual_key
        ORDER BY ritual_key`,
      [workspaceId],
    )
    return (rows as Array<{ ritual_key: string; count: number | string }>)
      .map(row => ({ ritualKey: row.ritual_key as RitualKey, count: Number(row.count) }))
      .filter(row => row.count >= 1)
  }
}
