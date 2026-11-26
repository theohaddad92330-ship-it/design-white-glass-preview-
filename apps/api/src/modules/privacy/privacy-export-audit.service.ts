import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { ExportHistoryEntry, PortableFormat } from '@bellum/contracts'
import { PrivacyExportAuditLogEntity } from '../../database/entities/privacy-export-audit-log.entity'

/** #2439.7/.8/.17 — la catégorie « exports » du NO-GO ne montre pas un journal sans fin. */
const HISTORY_LIMIT = 20

/**
 * #2439.15 — journalise chaque export personnel : « un export respecte …
 * l'audit » (LAU-FINAL-152). Un export RGPD lit la TOTALITÉ des données
 * personnelles d'un compte ; rien n'en gardait la trace avant cette table
 * (`privacy_export_audit_log`, migration `1796321386200-PrivacyExportAuditLog`).
 *
 * #2439.7/.8/.17 — `listRecentForUser` est le lecteur qui manquait : la
 * catégorie « exports » du NO-GO (mémoire/fichiers/EXPORTS/marché), rendue
 * avec exactement ce que cette table journalise, jamais une ligne inventée
 * pour un compte qui n'a encore rien exporté.
 */
@Injectable()
export class PrivacyExportAuditService {
  constructor(
    @InjectRepository(PrivacyExportAuditLogEntity)
    private readonly log: Repository<PrivacyExportAuditLogEntity>,
  ) {}

  async recordFullExport(userId: string): Promise<void> {
    await this.log.insert({ user_id: userId, kind: 'full', object_key: null, format: null })
  }

  async recordObjectExport(userId: string, objectKey: string, format: string): Promise<void> {
    await this.log.insert({ user_id: userId, kind: 'object', object_key: objectKey, format })
  }

  /** Les exports les plus RÉCENTS d'abord, bornés à {@link HISTORY_LIMIT} — jamais un journal sans fin. */
  async listRecentForUser(userId: string): Promise<ExportHistoryEntry[]> {
    const rows = await this.log.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      take: HISTORY_LIMIT,
    })
    return rows.map(row => ({
      kind: row.kind as ExportHistoryEntry['kind'],
      objectKey: row.object_key,
      format: row.format as PortableFormat | null,
      createdAt: row.created_at.toISOString(),
    }))
  }
}
