import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * La définition d'un champ personnalisé.
 *
 * `key` est STABLE et ne change jamais : les exports s'y adossent, et la
 * renommer casserait tous les fichiers déjà produits. Un champ retiré est
 * ARCHIVÉ — effacer la définition rendrait illisibles des valeurs vieilles de
 * trois ans.
 */
@Entity({ name: 'custom_field_defs' })
@Index(['workspace_id', 'entity_type', 'key'], { unique: true })
export class CustomFieldDefEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('text')
  entity_type: string

  @Column('text')
  key: string

  @Column('text')
  label: string

  @Column('text', { default: 'text' })
  type: string

  @Column('text', { array: true, default: () => "'{}'" })
  options: string[]

  @Column('boolean', { default: false })
  archived: boolean

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
