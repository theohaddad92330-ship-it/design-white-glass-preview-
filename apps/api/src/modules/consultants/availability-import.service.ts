import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import ExcelJS from 'exceljs'
import type { AvailabilityImportOutcome, AvailabilityImportReport } from '@bellum/contracts'
import { summariseAvailabilityImport } from '@bellum/contracts'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { parseAvailabilityCsv, parseAvailabilityRows, type AvailabilityImportPreview } from './availability-import'

/**
 * #2326.7/.9 (épopée #2794) — ÉCRITURE : rapproche chaque ligne contre le
 * vivier existant (e-mail d'abord, puis nom, exact et non ambigu) et met à
 * jour `available_from`/`tjm`. NE CRÉE JAMAIS de fiche — une ligne qui ne
 * rapproche personne reste `unmatched`, listée pour l'humain.
 *
 * `availability_checked_at` est revalidée à chaque écriture — même règle
 * que `consultants.service.ts` (patch builder) : une disponibilité tout
 * juste reconfirmée n'a aucune raison de repasser « à confirmer »
 * (`declared-availability.ts`) le jour même.
 */
@Injectable()
export class AvailabilityImportService {
  constructor(
    @InjectRepository(ConsultantEntity)
    private readonly repo: Repository<ConsultantEntity>,
  ) {}

  async importCsv(workspaceId: string, content: string): Promise<AvailabilityImportReport> {
    return this.apply(workspaceId, parseAvailabilityCsv(content))
  }

  /** `fileB64` : le classeur XLSX encodé, même convention que `intake/zip`
   *  (`CvZipImportDto.fileB64`) pour tout fichier binaire posté en JSON. */
  async importXlsx(workspaceId: string, fileB64: string): Promise<AvailabilityImportReport> {
    const buffer = Buffer.from(fileB64, 'base64')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)
    const sheet = workbook.worksheets[0]
    const cells: string[][] = []
    sheet?.eachRow(row => {
      const line: string[] = []
      // `row.values` est 1-indexé côté exceljs (index 0 vide) — décalé ici
      // pour que la colonne 0 du tableau corresponde à la première colonne.
      const values = row.values as Array<string | number | null | undefined>
      for (let i = 1; i < values.length; i++) {
        const value = values[i]
        line.push(value === null || value === undefined ? '' : String(value).trim())
      }
      cells.push(line)
    })
    return this.apply(workspaceId, parseAvailabilityRows(cells))
  }

  private async apply(workspaceId: string, preview: AvailabilityImportPreview): Promise<AvailabilityImportReport> {
    const consultants = await this.repo.find({
      where: { workspace_id: workspaceId },
      select: ['id', 'full_name', 'email'],
    })
    const byEmail = new Map<string, ConsultantEntity>()
    const byName = new Map<string, ConsultantEntity[]>()
    for (const consultant of consultants) {
      if (consultant.email) byEmail.set(consultant.email.trim().toLowerCase(), consultant)
      if (consultant.full_name) {
        const key = normalizeName(consultant.full_name)
        byName.set(key, [...(byName.get(key) ?? []), consultant])
      }
    }

    const outcomes: AvailabilityImportOutcome[] = []
    for (const row of preview.rows) {
      let match: ConsultantEntity | undefined
      let matchedOn: 'email' | 'name' | undefined

      if (row.email) match = byEmail.get(row.email)
      if (match) matchedOn = 'email'

      if (!match && row.fullName) {
        const candidates = byName.get(normalizeName(row.fullName)) ?? []
        if (candidates.length === 1) {
          match = candidates[0]
          matchedOn = 'name'
        } else if (candidates.length > 1) {
          outcomes.push({ status: 'unmatched', line: row.line, identity: row.fullName, reason: 'ambiguous_name' })
          continue
        }
      }

      if (!match) {
        outcomes.push({
          status: 'unmatched',
          line: row.line,
          identity: row.email ?? row.fullName ?? '',
          reason: 'not_found',
        })
        continue
      }

      const fields: Array<'available_from' | 'tjm'> = []
      const patch: Partial<ConsultantEntity> = {}
      if (row.availableFrom !== null) {
        patch.available_from = row.availableFrom
        fields.push('available_from')
      }
      if (row.tjm !== null) {
        patch.tjm = row.tjm
        fields.push('tjm')
      }
      patch.availability_checked_at = new Date()
      await this.repo.update({ id: match.id }, patch)
      outcomes.push({ status: 'updated', line: row.line, consultantId: match.id, matchedOn: matchedOn!, fields })
    }

    for (const skip of preview.skipped) {
      outcomes.push({ status: 'skipped', line: skip.line, reason: skip.reason })
    }
    outcomes.sort((a, b) => a.line - b.line)

    return {
      total: preview.rows.length + preview.skipped.length,
      summary: summariseAvailabilityImport(outcomes),
      outcomes,
      mappedColumns: preview.mappedColumns,
      ignoredColumns: preview.ignoredColumns,
      truncated: preview.truncated,
    }
  }
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}
