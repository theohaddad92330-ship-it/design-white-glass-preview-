import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm'

/**
 * Ce qu'on sait de la dernière lecture profonde d'un espace.
 *
 * Une table pour trois colonnes, parce que « combien de deals ont été lus » et
 * « la lecture a-t-elle été tronquée » sont des propriétés de la LECTURE et non
 * d'un deal. Les déduire en comptant les lignes de `crm_deal_facts` donnerait un
 * nombre juste et une troncature invisible — exactement le silence que le
 * produit s'interdit ailleurs (coûts non tarifés, sources faibles, périmètre).
 */
@Entity({ name: 'crm_pipeline_syncs' })
@Unique('crm_pipeline_syncs_unique', ['workspace_id', 'provider'])
export class CrmPipelineSyncEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('text')
  provider: string

  @Column('int', { default: 0 })
  deals_read: number

  @Column('boolean', { default: false })
  truncated: boolean

  @Column('timestamptz', { default: () => 'now()' })
  synced_at: Date
}
