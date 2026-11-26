import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/** La valeur d'un champ personnalisé sur un enregistrement. Une par couple. */
@Entity({ name: 'custom_field_values' })
@Index(['field_id', 'entity_id'], { unique: true })
export class CustomFieldValueEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  field_id: string

  @Index()
  @Column('uuid')
  entity_id: string

  @Column('jsonb', { nullable: true })
  value: unknown

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
