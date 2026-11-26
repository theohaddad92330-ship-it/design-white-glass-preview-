import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Le lien entre un enregistrement d'un CRM externe et le nôtre.
 *
 * C'est la seule chose qui empêche un second import de créer une seconde fiche
 * pour la même personne. L'index unique porte le FOURNISSEUR : le même
 * identifiant peut exister chez deux CRM sans désigner quelqu'un de commun.
 */
@Entity({ name: 'sync_links' })
@Index(['workspace_id', 'provider', 'entity_type', 'external_id'], { unique: true })
export class SyncLinkEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('text')
  provider: string

  @Column('text')
  entity_type: string

  @Column('text')
  external_id: string

  @Index()
  @Column('uuid')
  internal_id: string

  @Column('timestamptz', { default: () => 'now()' })
  last_synced_at: Date

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
