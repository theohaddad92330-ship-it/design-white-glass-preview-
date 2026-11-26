import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Un témoignage client (PDF 2 §12).
 *
 * `consent_reference` est nullable en base pour permettre la saisie en deux
 * temps, mais un témoignage PUBLIABLE sans elle est refusé côté service : la
 * contrainte est de forme, la règle est métier. Un témoignage sans trace
 * d'accord est un risque juridique qu'aucune ESN ne veut porter pour gagner une
 * ligne de plaquette.
 */
@Entity('testimonials')
@Index(['workspace_id'])
export class TestimonialEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid', { nullable: true })
  account_id: string | null

  @Column('text', { nullable: true })
  author_name: string | null

  @Column('text', { nullable: true })
  author_title: string | null

  @Column('text')
  quote: string

  @Column('text', { nullable: true })
  consent_reference: string | null

  @Column('boolean', { default: false })
  publishable: boolean

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
