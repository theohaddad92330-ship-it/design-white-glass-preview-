import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import ExcelJS from 'exceljs'
import {
  ESN_TARGET_LEVELS_FED_TO_PERSONAS,
  ESN_TARGET_PERSONAS_MAX_ROWS,
  type EsnTargetLevel,
  type EsnTargetPersona,
  type EsnTargetPersonasImportReport,
} from '@bellum/contracts'
import { EsnTargetPersonaEntity } from '../../database/entities/esn-target-persona.entity'
import { normalizeRoleTitle } from '../contacts/target-persona-match'
import { EsnProfileWorkspaceResolver } from './esn-profile-workspace.resolver'
import { EsnProfileService } from './esn-profile.service'
import {
  parseTargetPersonasCells,
  parseTargetPersonasCsv,
  type ParsedTargetPersona,
  type ParsedTargetPersonas,
} from './esn-target-personas-import'

const INSERT_CHUNK = 500

/**
 * #3754 — les postes cibles de l'ESN : import csv/xlsx, lecture. Un réimport
 * REMPLACE l'ensemble de l'espace (transaction) — il ne s'accumule pas.
 */
@Injectable()
export class EsnTargetPersonasService {
  constructor(
    @InjectRepository(EsnTargetPersonaEntity)
    private readonly personas: Repository<EsnTargetPersonaEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly resolver: EsnProfileWorkspaceResolver,
    private readonly profile: EsnProfileService,
  ) {}

  private async workspaceOf(userId: string): Promise<string> {
    const { workspaceId } = await this.resolver.resolveContext(userId)
    if (!workspaceId) throw new BadRequestException('Aucun espace actif : importez depuis un espace de travail.')
    return workspaceId
  }

  async list(userId: string): Promise<EsnTargetPersona[]> {
    const workspaceId = await this.workspaceOf(userId)
    const rows = await this.personas.find({
      where: { workspace_id: workspaceId },
      order: { decision_level: 'ASC', title: 'ASC' },
    })
    return rows.map(row => ({
      id: row.id,
      category: row.category,
      title: row.title,
      decision_level: row.decision_level as EsnTargetLevel,
    }))
  }

  async importFile(
    userId: string,
    format: 'csv' | 'xlsx',
    content: string,
    sheet?: string,
  ): Promise<EsnTargetPersonasImportReport> {
    const workspaceId = await this.workspaceOf(userId)
    const parsed = format === 'xlsx' ? await this.readXlsx(content, sheet) : parseTargetPersonasCsv(content)
    if (parsed.truncated) {
      throw new BadRequestException(
        `Le fichier dépasse ${ESN_TARGET_PERSONAS_MAX_ROWS} lignes : rien n'a été importé, découpez-le.`,
      )
    }
    const report: EsnTargetPersonasImportReport = {
      imported: 0,
      rejected: parsed.rejected,
      fed_to_personas: 0,
      missing_columns: parsed.missingColumns,
    }
    // Colonne absente ou aucune ligne valide : on ne remplace PAS l'existant.
    if (parsed.missingColumns.length > 0 || parsed.personas.length === 0) return report

    await this.dataSource.transaction(async manager => {
      await manager.delete(EsnTargetPersonaEntity, { workspace_id: workspaceId })
      for (let i = 0; i < parsed.personas.length; i += INSERT_CHUNK) {
        const chunk = parsed.personas.slice(i, i + INSERT_CHUNK).map(persona => ({
          workspace_id: workspaceId,
          user_id: userId,
          category: persona.category,
          title: persona.title,
          title_normalized: normalizeRoleTitle(persona.title),
          decision_level: persona.level,
        }))
        await manager.insert(EsnTargetPersonaEntity, chunk)
      }
    })
    report.imported = parsed.personas.length
    report.fed_to_personas = await this.feedDecisionMakerPersonas(userId, parsed.personas)
    return report
  }

  /**
   * #3754.2 — les intitulés de niveau 1-2 rejoignent `decision_maker_personas`,
   * SANS doublon (comparaison normalisée) et SANS écraser la saisie existante :
   * les entrées de l'utilisateur passent d'abord, le niveau 1 d'abord. Théo O
   * onboarding-couverture (22/10) : la V23 retire le plafond de cette liste
   * (`decision_maker_personas`) — rien n'est plus tronqué. Retourne combien
   * d'entrées ont été ajoutées.
   */
  private async feedDecisionMakerPersonas(userId: string, imported: readonly ParsedTargetPersona[]): Promise<number> {
    const current = (await this.profile.getAnswers(userId)).decision_maker_personas ?? []
    const seen = new Set(current.map(normalizeRoleTitle))
    const merged = [...current]
    const fed = [...imported]
      .filter(p => ESN_TARGET_LEVELS_FED_TO_PERSONAS.includes(p.level))
      .sort((a, b) => a.level - b.level)
    let added = 0
    for (const persona of fed) {
      const key = normalizeRoleTitle(persona.title)
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(persona.title)
      added += 1
    }
    if (added > 0) await this.profile.upsertAnswers(userId, { decision_maker_personas: merged })
    return added
  }

  /** `content` : le classeur encodé en base64 (même convention que les autres imports xlsx). */
  private async readXlsx(contentB64: string, sheet?: string): Promise<ParsedTargetPersonas> {
    const workbook = new ExcelJS.Workbook()
    try {
      await workbook.xlsx.load(Buffer.from(contentB64, 'base64') as unknown as ExcelJS.Buffer)
    } catch {
      throw new BadRequestException('Fichier xlsx illisible.')
    }
    // #4426.4 — l'onglet que le pack de contexte a reconnu ; absent ou inconnu = le premier, comme avant.
    const worksheet = (sheet ? workbook.getWorksheet(sheet) : undefined) ?? workbook.worksheets[0]
    const cells: string[][] = []
    worksheet?.eachRow({ includeEmpty: false }, row => {
      const line: string[] = []
      for (let i = 1; i <= row.cellCount; i += 1) line.push(row.getCell(i).text.trim())
      cells.push(line)
    })
    return parseTargetPersonasCells(cells)
  }
}
