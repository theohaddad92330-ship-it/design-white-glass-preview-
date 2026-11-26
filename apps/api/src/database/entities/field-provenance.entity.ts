import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { FieldSource } from '@bellum/contracts'

/**
 * QUI a écrit CE champ — voir `schemas/provenance.ts` pour la règle d'arbitrage.
 * Une ligne par (objet, champ) : la provenance COURANTE, pas un historique
 * (l'historique, c'est `record_field_audit`).
 */
@Entity({ name: 'field_provenance' })
@Index(['entity_type', 'entity_id', 'field'], { unique: true })
export class FieldProvenanceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('text')
  entity_type: string

  @Column('uuid')
  entity_id: string

  /** Nom du champ côté API (camelCase) — pas le nom de colonne, pour que la
   *  règle reste lisible quand une colonne est renommée. */
  @Column('text')
  field: string

  @Column('text')
  source: FieldSource

  /** `numeric` revient en `string` via le driver pg. NULL = la source ne sait
   *  pas se noter — jamais une confiance inventée. */
  @Column('numeric', { precision: 4, scale: 3, nullable: true })
  confidence: string | null

  @Column('uuid', { nullable: true })
  actor_id: string | null

  @Column('timestamptz', { default: () => 'now()' })
  observed_at: Date
}
