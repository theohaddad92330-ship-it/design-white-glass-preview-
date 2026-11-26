import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #3754 — un poste cible de l'ESN et son niveau décideur (1 signataire …
 * 4 influenceur). Importé dans Réglages › Profil ESN ; sert à ORDONNER les
 * contacts d'un compte (jamais à les filtrer, doctrine c76).
 *
 * Migration : `1796436218731-EsnTargetPersonas`.
 */
@Entity({ name: 'esn_target_personas' })
@Index(['workspace_id'])
export class EsnTargetPersonaEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  user_id: string

  @Column('text', { nullable: true })
  category: string | null

  @Column('text')
  title: string

  /** Intitulé normalisé (`normalizeRoleTitle`) — la clé du rapprochement. */
  @Column('text')
  title_normalized: string

  @Column('smallint')
  decision_level: number

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
