import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { type EntityManager, In, Repository } from 'typeorm'
import {
  ESTIMATED_FIELD_SOURCE,
  serializeAuditValue,
  visibleFieldContradictions,
  type FieldContradiction,
  type FieldSource,
  type ProvenanceEntityType,
  type RecordFieldAudit,
  type RecordImportEntityType,
  type RecordImportMark,
  type RecordImportSourceKind,
} from '@bellum/contracts'
import { FieldContradictionEntity } from '../../database/entities/field-contradiction.entity'
import { FieldProvenanceEntity } from '../../database/entities/field-provenance.entity'
import { RecordFieldAuditEntity } from '../../database/entities/record-field-audit.entity'
import { insertImportMarks } from './record-import-marks'

/** Ce que le journal enregistre pour un champ modifié. */
export type FieldChange = {
  field: string
  oldValue: unknown
  newValue: unknown
  /** #190.2 — la portée que l'écrivain DÉCLARE pour cette valeur ; absente = non déclarée, jamais devinée. */
  scope?: string | null
}

// #2757 — `serializeAuditValue` a DÉMÉNAGÉ vers `@bellum/contracts`
// (`schemas/provenance.ts`) le 23/09/2026 : `capitalisation.service.ts` en
// avait aussi besoin, et l'importer depuis ce module aurait fait grimper
// GA-07 (service → service) pour une fonction pure sans dépendance NestJS.
// Réimportée ci-dessus, utilisée plus bas dans `commit()` — plus ré-exportée
// d'ici, aucun autre module ne la consommait par ce chemin.

/** Une ligne du journal enrichie du nom de son auteur. */
type AuditRow = {
  id: string
  entityType: ProvenanceEntityType
  entityId: string
  field: string
  oldValue: string | null
  newValue: string | null
  source: FieldSource
  actorId: string | null
  firstName: string | null
  lastName: string | null
  email: string | null
  createdAt: Date | string
  /** #2327.21 — `null` pour tout l'historique écrit avant la colonne. */
  rule?: string | null
}

/**
 * La mémoire de QUI a écrit quoi.
 *
 * Deux écritures, toujours ensemble : la provenance COURANTE (une ligne par
 * champ, qui sert d'arbitre au prochain writer) et le JOURNAL (une ligne par
 * modification, qui répond à « qui a changé ça ? »). Les séparer ferait
 * inévitablement diverger l'un de l'autre.
 *
 * La règle d'arbitrage elle-même n'est PAS ici : elle est pure et testée dans
 * `@bellum/contracts` (`decideFieldWrite`), pour qu'aucun writer ne puisse la
 * réinventer à sa façon.
 */
@Injectable()
export class ProvenanceService {
  constructor(
    @InjectRepository(FieldProvenanceEntity)
    private readonly provenanceRepo: Repository<FieldProvenanceEntity>,
    @InjectRepository(RecordFieldAuditEntity)
    private readonly auditRepo: Repository<RecordFieldAuditEntity>,
  ) {}

  /**
   * La provenance courante de chaque champ d'un objet, prête à être passée à
   * `applyFieldUpdates`. Un champ absent de la table n'a pas de provenance
   * connue — l'arbitre le traite alors comme `pipeline`.
   */
  async currentSources(
    entityType: ProvenanceEntityType,
    entityId: string,
    // #4616 — sous une transaction, lire sur SA connexion : une lecture sur le pool global en prendrait une
    // deuxième pendant que la première est tenue (attente circulaire qui saturait le pool).
    manager?: EntityManager,
  ): Promise<Partial<Record<string, FieldSource>>> {
    const repo = manager ? manager.getRepository(FieldProvenanceEntity) : this.provenanceRepo
    const rows = await repo.find({ where: { entity_type: entityType, entity_id: entityId } })
    const sources: Partial<Record<string, FieldSource>> = {}
    for (const row of rows) sources[row.field] = row.source
    return sources
  }

  /**
   * #2988 (#2161) — la provenance courante, SOURCE + DATE, pour l'écran (fiche
   * contact). `currentSources` (ci-dessus) ne rend que la catégorie : c'est
   * suffisant pour l'arbitre, pas pour un humain qui veut savoir QUAND. Un
   * champ absent de la table est ABSENT du résultat, jamais une date inventée
   * — « non mesuré » n'est jamais 0 (GA-18/19), la même règle appliquée à une
   * provenance.
   */
  async currentSourcesDetailed(
    entityType: ProvenanceEntityType,
    entityId: string,
  ): Promise<Partial<Record<string, { source: FieldSource; observedAt: string }>>> {
    const rows = await this.provenanceRepo.find({ where: { entity_type: entityType, entity_id: entityId } })
    const sources: Partial<Record<string, { source: FieldSource; observedAt: string }>> = {}
    for (const row of rows) {
      sources[row.field] = {
        source: row.source,
        observedAt: row.observed_at instanceof Date ? row.observed_at.toISOString() : row.observed_at,
      }
    }
    return sources
  }

  /**
   * #4016 L4 — parmi ces objets, ceux dont CE champ est une ESTIMATION
   * (`inferred`), avec la date à laquelle elle a été posée (et vérifiée). Une
   * requête pour toute une liste, jamais une par ligne : une liste qui montre
   * une adresse estimée doit pouvoir la BADGER, et un badge qui coûterait N
   * requêtes finirait retiré.
   */
  async estimatedAmong(
    entityType: ProvenanceEntityType,
    entityIds: readonly string[],
    field: string,
  ): Promise<Map<string, string>> {
    const estimated = new Map<string, string>()
    if (entityIds.length === 0) return estimated
    const rows = await this.provenanceRepo.find({
      where: { entity_type: entityType, entity_id: In([...entityIds]), field, source: ESTIMATED_FIELD_SOURCE },
    })
    for (const row of rows) {
      estimated.set(row.entity_id, row.observed_at instanceof Date ? row.observed_at.toISOString() : row.observed_at)
    }
    return estimated
  }

  /**
   * Enregistre un lot de modifications RÉELLEMENT écrites : provenance mise à
   * jour et journal complété, dans une seule transaction. Un champ dont la
   * valeur n'a pas bougé ne doit pas arriver ici — il n'y a rien à journaliser.
   */
  async commit(
    params: {
      workspaceId: string | null
      entityType: ProvenanceEntityType
      entityId: string
      source: FieldSource
      actorId: string | null
      confidence?: number | null
      /** #2327.21 — la RÈGLE qui a produit l'écriture. Absente = `null`, jamais devinée. */
      rule?: string | null
      changes: FieldChange[]
    },
    // #4616 — sous la transaction d'un appelant, écrire sur SA connexion (déjà transactionnelle) : en ouvrir
    // une ici en prendrait une deuxième pendant que la première est tenue.
    outer?: EntityManager,
  ): Promise<void> {
    if (params.changes.length === 0) return

    const write = async (manager: EntityManager): Promise<void> => {
      for (const change of params.changes) {
        await manager.query(
          `INSERT INTO field_provenance (workspace_id, entity_type, entity_id, field, source, confidence, actor_id, observed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, now())
           ON CONFLICT (entity_type, entity_id, field)
           DO UPDATE SET source = EXCLUDED.source,
                         confidence = EXCLUDED.confidence,
                         actor_id = EXCLUDED.actor_id,
                         observed_at = EXCLUDED.observed_at,
                         workspace_id = COALESCE(EXCLUDED.workspace_id, field_provenance.workspace_id)`,
          [
            params.workspaceId,
            params.entityType,
            params.entityId,
            change.field,
            params.source,
            params.confidence ?? null,
            params.actorId,
          ],
        )
        await manager.query(
          `INSERT INTO record_field_audit (workspace_id, entity_type, entity_id, field, old_value, new_value, source, actor_id, rule, scope)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            params.workspaceId,
            params.entityType,
            params.entityId,
            change.field,
            serializeAuditValue(change.oldValue),
            serializeAuditValue(change.newValue),
            params.source,
            params.actorId,
            params.rule ?? null,
            change.scope?.trim() || null,
          ],
        )
      }
    }
    if (outer) await write(outer)
    else await this.provenanceRepo.manager.transaction(write)
  }

  /**
   * #4016.L13 — « fait confirmé jusqu'à preuve contraire » : une source automatique a dit autre chose
   * qu'un fait confirmé à la main, et l'arbitre a refusé l'écriture. Le fait n'est PAS touché ; la
   * valeur adverse est tracée ici pour être NOMMÉE à côté. Le dépôt passe par le gestionnaire (entité
   * enregistrée globalement) : aucun module qui fournit ce service n'a à déclarer une table de plus.
   */
  async recordContradictions(params: {
    workspaceId: string | null
    entityType: ProvenanceEntityType
    entityId: string
    source: FieldContradiction['source']
    contradictions: { field: string; value: string }[]
  }): Promise<void> {
    if (params.contradictions.length === 0) return
    await this.provenanceRepo.manager.getRepository(FieldContradictionEntity).insert(
      params.contradictions.map(({ field, value }) => ({
        workspace_id: params.workspaceId,
        entity_type: params.entityType,
        entity_id: params.entityId,
        field,
        value,
        source: params.source,
      })),
    )
  }

  /**
   * #4016.L13 — les contradictions qui TIENNENT encore sur un objet : une par champ, la plus récente,
   * tant que le champ est confirmé à la main et qu'aucune correction humaine ne l'a suivie (même
   * prédicat que « Garder la valeur du CRM », #4189.9 — `visibleFieldContradictions`).
   */
  async contradictionsFor(
    workspaceId: string,
    entityType: ProvenanceEntityType,
    entityId: string,
  ): Promise<FieldContradiction[]> {
    const rows = await this.provenanceRepo.manager.getRepository(FieldContradictionEntity).find({
      where: { workspace_id: workspaceId, entity_type: entityType, entity_id: entityId },
      order: { observed_at: 'DESC' },
      take: 50,
    })
    if (rows.length === 0) return []
    const current = await this.currentSourcesDetailed(entityType, entityId)
    return visibleFieldContradictions(
      rows.map(row => ({
        field: row.field,
        value: row.value,
        source: row.source,
        observedAt: row.observed_at instanceof Date ? row.observed_at.toISOString() : row.observed_at,
      })),
      current,
    )
  }

  /**
   * #2403.38 (épopée #2995) — la DERNIÈRE correction humaine connue sur cette
   * fiche, tout champ confondu. `null` = aucune (l'immense majorité des
   * fiches) — jamais un signal deviné : `record_field_audit` est le journal
   * append-only déjà écrit par {@link commit}, ceci n'en lit qu'un `MAX`.
   *
   * Portée à l'ESPACE (comme {@link history}) : une correction posée sur un
   * autre espace n'a rien à dire sur celui-ci.
   */
  async lastHumanCorrectionAt(
    workspaceId: string,
    entityType: ProvenanceEntityType,
    entityId: string,
  ): Promise<Date | null> {
    const rows = await this.auditRepo.manager.query<{ maxCreatedAt: Date | null }[]>(
      `SELECT MAX(created_at) AS "maxCreatedAt" FROM record_field_audit
       WHERE entity_type = $1 AND entity_id = $2 AND workspace_id = $3 AND source = 'human'`,
      [entityType, entityId, workspaceId],
    )
    const value = rows[0]?.maxCreatedAt ?? null
    return value ? new Date(value) : null
  }

  /**
   * #4051 — « Importé le <date> depuis <source> » : une trace par fiche touchée par un import RÉEL (jamais une
   * simulation). `sourceLabel` est le nom du FICHIER déposé ou de l'outil branché du client — jamais un
   * fournisseur à nous. Addition seule ; best-effort côté appelant (une trace manquée ne fait pas échouer un import).
   */
  async markImported(params: {
    workspaceId: string
    entityType: RecordImportEntityType
    entityIds: readonly string[]
    sourceKind: RecordImportSourceKind
    sourceLabel: string
  }): Promise<void> {
    await insertImportMarks(this.auditRepo.manager, params)
  }

  /** #4051 — la trace d'import la plus récente de la fiche ; `null` = jamais importée (jamais une date devinée). */
  async latestImportMark(
    workspaceId: string,
    entityType: RecordImportEntityType,
    entityId: string,
  ): Promise<RecordImportMark | null> {
    const rows = await this.auditRepo.manager.query<
      { importedAt: Date | string; sourceKind: RecordImportSourceKind; sourceLabel: string }[]
    >(
      `SELECT imported_at AS "importedAt", source_kind AS "sourceKind", source_label AS "sourceLabel"
         FROM record_import_marks
        WHERE workspace_id = $1 AND entity_type = $2 AND entity_id = $3
        ORDER BY imported_at DESC
        LIMIT 1`,
      [workspaceId, entityType, entityId],
    )
    const row = rows[0]
    if (!row) return null
    return {
      importedAt: new Date(row.importedAt).toISOString(),
      sourceKind: row.sourceKind,
      sourceLabel: row.sourceLabel,
    }
  }

  /** Le journal d'un objet, plus récent d'abord, auteur résolu côté serveur. */
  async history(
    workspaceId: string,
    entityType: ProvenanceEntityType,
    entityId: string,
    limit = 100,
  ): Promise<RecordFieldAudit[]> {
    const rows = await this.auditRepo.manager.query<AuditRow[]>(
      `SELECT a.id, a.entity_type AS "entityType", a.entity_id AS "entityId", a.field,
              a.old_value AS "oldValue", a.new_value AS "newValue", a.source,
              a.actor_id AS "actorId", p.first_name AS "firstName", p.last_name AS "lastName",
              p.email AS "email", a.created_at AS "createdAt", a.rule AS "rule"
       FROM record_field_audit a
       LEFT JOIN profiles p ON p.user_id = a.actor_id
       WHERE a.entity_type = $1 AND a.entity_id = $2 AND a.workspace_id = $3
       ORDER BY a.created_at DESC
       LIMIT $4`,
      [entityType, entityId, workspaceId, limit],
    )

    return rows.map(row => ({
      id: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      field: row.field,
      oldValue: row.oldValue,
      newValue: row.newValue,
      source: row.source,
      actorId: row.actorId,
      actorName: displayName(row),
      createdAt: new Date(row.createdAt).toISOString(),
      rule: row.rule ?? null,
    }))
  }
}

/** Nom affichable d'un auteur. `null` quand le membre a quitté l'espace — l'écran
 *  dit « Auteur inconnu », il n'affiche jamais un identifiant brut. */
function displayName(row: Pick<AuditRow, 'firstName' | 'lastName' | 'email'>): string | null {
  const full = [row.firstName, row.lastName].filter(Boolean).join(' ').trim()
  if (full) return full
  return row.email ?? null
}
