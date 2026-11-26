import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { ATS_EXPORT_MAX_ROWS, type AtsExportReport } from '@bellum/contracts'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { toAtsExportRow } from './ats-export'

/**
 * #2326.8 (épopée #2794) — le vivier ENTIER de l'espace, jamais le filtre
 * courant d'un écran : même règle que `TalentPoolService`/`stats` (« compte
 * sur tout l'espace »). Les fiches archivées n'en sortent pas — un ATS
 * externe qui reçoit un consultant parti sans le savoir en fait un contact
 * mort, jamais un signal utile.
 */
@Injectable()
export class AtsExportService {
  constructor(
    @InjectRepository(ConsultantEntity)
    private readonly repo: Repository<ConsultantEntity>,
  ) {}

  async export(workspaceId: string): Promise<AtsExportReport> {
    const rows = await this.repo.find({
      where: { workspace_id: workspaceId, archived_at: IsNull() },
      select: [
        'id',
        'full_name',
        'email',
        'phone',
        'title',
        'seniority',
        'availability',
        'availability_checked_at',
        'available_from',
        'tjm',
        'engagement_kind',
        'source',
      ],
      take: ATS_EXPORT_MAX_ROWS + 1,
      order: { full_name: 'ASC' },
    })
    const truncated = rows.length > ATS_EXPORT_MAX_ROWS
    const now = new Date()
    return {
      items: rows.slice(0, ATS_EXPORT_MAX_ROWS).map(row => toAtsExportRow(row, now)),
      truncated,
    }
  }
}
