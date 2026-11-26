import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  OBSOLETE_SOURCE_DAYS,
  detectFieldConflict,
  isConflictOpen,
  type ConflictedField,
  type FieldSource,
  type ProvenanceEntityType,
} from '@bellum/contracts'
import { RecordFieldAuditEntity } from '../../database/entities/record-field-audit.entity'

/** Les deux dernières écritures d'un champ, telles que le journal les garde. */
type AuditPair = {
  field: string
  /** L'écriture la plus récente : sa valeur, sa source, sa date. */
  new_value: string | null
  old_value: string | null
  source: FieldSource
  created_at: string
  /** L'écriture PRÉCÉDENTE — celle qui a posé la valeur écrasée. */
  previous_source: FieldSource | null
  previous_at: string | null
  /** #190.2 — portées déclarées de l'écriture récente et de la précédente (`null` = non déclarée). */
  scope?: string | null
  previous_scope?: string | null
}

/**
 * LE DÉTECTEUR DE CONTRADICTION — PDF 6 §5.3.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL NE CRÉE AUCUNE TABLE
 * ─────────────────────────────────────────────────────────────────────────────
 * « On archive, on ne supprime pas » : l'archive EXISTE déjà. `record_field_audit`
 * est append-only depuis le socle CRM et garde, pour chaque écriture, l'ancienne
 * valeur, la nouvelle, la source et la date. Une valeur écartée n'a donc jamais
 * été perdue — elle n'était simplement RACONTÉE nulle part.
 *
 * Ce service la raconte. Il ne pose pas de seconde vérité à côté du journal : un
 * projection persistée divergerait du jour où une écriture passerait à côté de
 * `ProvenanceService.commit`, et c'est exactement ce que
 * `no-blind-record-writes.spec.ts` interdit déjà par ailleurs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COMMENT IL SE BRANCHE SUR L'ARBITRE, SANS LE MODIFIER
 * ─────────────────────────────────────────────────────────────────────────────
 * `decideFieldWrite` accepte une écriture d'autorité ÉGALE
 * (`higher_or_equal_authority`). Deux relevés `pipeline` qui se contredisent
 * passent donc tous les deux, et le premier disparaît en silence — « la dernière
 * écrase la précédente », le défaut que le §5.3 nomme.
 *
 * L'arbitre reste inchangé, volontairement : deux règles d'écriture concurrentes
 * divergeraient au premier writer ajouté. La lecture, elle, rejoue
 * `detectFieldConflict` sur les MÊMES entrées et dit ce que l'écriture a tu.
 *
 * ⚠️ Ce qui se MONTRE est le seul cas indécidable (`unresolved`). Un conflit
 * tranché par un humain ou par l'autorité reste dans la trace et ne dérange
 * personne — montrer tout ferait clignoter chaque nuit de pipeline.
 */
@Injectable()
export class FieldConflictService {
  constructor(
    @InjectRepository(RecordFieldAuditEntity)
    private readonly audit: Repository<RecordFieldAuditEntity>,
  ) {}

  /**
   * Les contradictions OUVERTES sur une fiche : deux sources automatiques de
   * même autorité qui ne disent pas la même chose, et personne n'a tranché.
   */
  async openConflicts(
    workspaceId: string,
    entityType: ProvenanceEntityType,
    entityId: string,
    options: { includeSettled?: boolean } = {},
  ): Promise<ConflictedField[]> {
    const rows = await this.audit.manager.query<AuditPair[]>(
      // Les deux dernières écritures de chaque champ. `LAG` sur la fenêtre
      // ordonnée par date rend la source et la date de l'écriture PRÉCÉDENTE —
      // c'est-à-dire la provenance de la valeur qui a été écartée. Le journal
      // ne la porte pas sur la même ligne : `record_field_audit.source` est la
      // source de l'écriture entrante, jamais celle de l'ancienne valeur.
      `WITH ranked AS (
         SELECT field, old_value, new_value, source, created_at,
                scope,
                LAG(scope)      OVER (PARTITION BY field ORDER BY created_at) AS previous_scope,
                LAG(source)     OVER (PARTITION BY field ORDER BY created_at) AS previous_source,
                LAG(created_at) OVER (PARTITION BY field ORDER BY created_at) AS previous_at,
                ROW_NUMBER()    OVER (PARTITION BY field ORDER BY created_at DESC) AS rn
           FROM record_field_audit
          WHERE workspace_id = $1 AND entity_type = $2 AND entity_id = $3
       )
       SELECT field, old_value, new_value, source, created_at::text AS created_at,
              previous_source, previous_at::text AS previous_at, scope, previous_scope
         FROM ranked
        WHERE rn = 1`,
      [workspaceId, entityType, entityId],
    )

    const obsoleteSources = await this.obsoleteSources(workspaceId, entityType, entityId)
    const conflicts: ConflictedField[] = []
    for (const row of rows) {
      // ⚠️ Sans date pour la valeur ÉCARTÉE, on ne peut pas écrire « le registre
      // dit 4 200 (relevé le 14/08) ». Une contradiction non datée n'aide
      // personne à trancher, et inventer la date de l'autre côté en ferait deux
      // relevés simultanés. Le cas se produit sur la toute PREMIÈRE écriture
      // d'un champ, dont la valeur antérieure est plus vieille que le journal.
      if (row.previous_at === null) continue

      const conflict = detectFieldConflict({
        field: row.field,
        incomingValue: row.new_value,
        incomingSource: row.source,
        incomingAt: row.created_at,
        currentValue: row.old_value,
        currentSource: row.previous_source,
        currentObservedAt: row.previous_at,
        obsoleteSources,
        incomingScope: row.scope,
        currentScope: row.previous_scope,
      })
      // #190.1 — `entity` : le détecteur pur ne la connaît pas, ce service si
      // (c'est lui qui reçoit `entityType`/`entityId` en paramètre).
      // #190.2 — `includeSettled` : l'écran montre AUSSI ce qui s'est tranché
      // tout seul (autorité, fraîcheur, source abandonnée), à part des ouvertes.
      if (conflict && (options.includeSettled || isConflictOpen(conflict))) {
        conflicts.push({ ...conflict, entity: { type: entityType, id: entityId } })
      }
    }

    // La contradiction la plus RÉCENTE d'abord : c'est celle qu'on vient de
    // produire, donc celle dont on se souvient encore.
    return conflicts.sort((a, b) => b.conflictSince.localeCompare(a.conflictSince))
  }

  /**
   * #190.2 — les sources qui ont CESSÉ d'écrire sur cette fiche : leur dernière
   * écriture précède d'au moins {@link OBSOLETE_SOURCE_DAYS} jours la plus
   * récente de la fiche (toutes sources). Lu dans le journal, jamais deviné :
   * une fiche sans autre écriture récente ne rend personne obsolète.
   */
  private async obsoleteSources(
    workspaceId: string,
    entityType: ProvenanceEntityType,
    entityId: string,
  ): Promise<FieldSource[]> {
    const rows = await this.audit.manager.query<{ source?: FieldSource; last_at?: string }[]>(
      `SELECT source, MAX(created_at)::text AS last_at
         FROM record_field_audit
        WHERE workspace_id = $1 AND entity_type = $2 AND entity_id = $3
        GROUP BY source`,
      [workspaceId, entityType, entityId],
    )
    const seen = rows.flatMap(r => {
      const at = r.last_at ? Date.parse(r.last_at) : Number.NaN
      return r.source && !Number.isNaN(at) ? [{ source: r.source, at }] : []
    })
    const newest = Math.max(...seen.map(r => r.at))
    return seen.filter(r => newest - r.at >= OBSOLETE_SOURCE_DAYS * 86_400_000).map(r => r.source)
  }
}
