import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Le rôle d'un contact SUR CE PROJET — distinct de son rôle de décision porté
 * par le compte.
 *
 * La même personne est sponsor d'un projet et simple utilisatrice d'un autre.
 * Confondre les deux fait viser le mauvais interlocuteur, et c'est la faute qui
 * coûte le plus cher en début de cycle.
 *
 * Un contact ne tient qu'UN rôle par projet (index unique) : deux lignes
 * feraient apparaître le même sponsor deux fois dans le comité.
 */
@Entity({ name: 'project_contacts' })
@Index(['project_id', 'contact_id'], { unique: true })
export class ProjectContactEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Index()
  @Column('uuid')
  project_id: string

  @Column('uuid')
  contact_id: string

  /** sponsor | decideur | prescripteur | acheteur | utilisateur | bloqueur. */
  @Column('text')
  role: string

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
