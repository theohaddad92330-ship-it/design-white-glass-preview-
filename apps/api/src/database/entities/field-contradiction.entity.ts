import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { FieldContradiction } from '@bellum/contracts'

/**
 * #4016.L13 — une source automatique a CONTREDIT un fait confirmé à la main. Le fait reste en place
 * (`field_provenance` / la fiche) ; cette ligne nomme la contradiction à côté. Journal en ajout seul.
 */
@Entity({ name: 'field_contradictions' })
@Index(['entity_type', 'entity_id', 'observed_at'])
export class FieldContradictionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('text')
  entity_type: string

  @Column('uuid')
  entity_id: string

  /** Nom du champ côté API (camelCase), comme `field_provenance.field`. */
  @Column('text')
  field: string

  /** La valeur ADVERSE, sérialisée — jamais écrite sur la fiche. */
  @Column('text')
  value: string

  @Column('text')
  source: FieldContradiction['source']

  @Column('timestamptz', { default: () => 'now()' })
  observed_at: Date
}
