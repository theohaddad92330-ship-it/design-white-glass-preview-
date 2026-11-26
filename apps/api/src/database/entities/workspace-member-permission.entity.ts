import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Une permission accordée à UNE personne, en plus de son rôle.
 *
 * Neuf rôles ne couvriront jamais une ESN réelle : il y a toujours le
 * commercial à qui on confie la connexion du CRM, ou le recruteur qui doit voir
 * la marge d'une mission. Sans exception nominative, la seule réponse était de
 * le passer `admin` — huit droits pour en régler un, et c'est ainsi qu'un
 * espace se retrouve avec quatre administrateurs.
 *
 * Strictement ADDITIF : une ligne ici ne peut qu'ajouter. Un « rôle moins une
 * permission » se lirait à l'écran comme un rôle et se découvrirait le jour où
 * quelqu'un ne peut plus travailler.
 */
@Entity({ name: 'workspace_member_permissions' })
@Index('workspace_member_permissions_member_idx', ['workspace_id', 'user_id'])
@Index('workspace_member_permissions_unique', ['workspace_id', 'user_id', 'permission'], { unique: true })
export class WorkspaceMemberPermissionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  user_id: string

  @Column('text')
  permission: string

  /** Qui a accordé. Une exception sans auteur ne se relit pas : la question,
   *  six mois plus tard, est toujours « qui a décidé ça ». */
  @Column('uuid', { nullable: true })
  granted_by: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
