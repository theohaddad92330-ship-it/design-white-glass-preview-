import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Un retour utilisateur structuré sur un dossier (feedback loop A2) : « ce play
 * est hors sujet », « ce contact n'est plus là », « bonne lecture ». Append-only
 * (jamais d'UPDATE) — chaque ligne est un fait daté, cité tel quel dans les
 * directives de correction réinjectées aux runs suivants du même compte.
 *
 * Clé de lecture = `workspace_id` (mémoire d'équipe par compte, comme les
 * pinned facts) ; `user_id` = attribution created-by (JWT, jamais body).
 * Migration owned here (NestJS = owner des tables métier) : `1785880000000`.
 */
@Entity({ name: 'account_feedback' })
@Index('account_feedback_account_idx', ['account_id', 'created_at'])
@Index('account_feedback_workspace_idx', ['workspace_id', 'created_at'])
export class AccountFeedbackEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  account_id: string

  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('uuid')
  user_id: string

  /** Surface visée : play | contact | signal | section | global (CHECK en base). */
  @Column('text')
  target: string

  /** Ce que le retour désigne, cité tel quel (titre du play, nom du contact…). */
  @Column('text', { default: '' })
  target_ref: string

  /** utile | inutile | faux | obsolete (CHECK en base, token ASCII stable). */
  @Column('text')
  verdict: string

  /** Précision libre de l'utilisateur — citée, jamais réinterprétée. */
  @Column('text', { nullable: true })
  note: string | null

  /**
   * Jusqu'où ce retour peut servir au produit — `tenant_private` par défaut.
   *
   * La TRACE de la portée au moment où le retour a été donné, et non le réglage
   * d'espace : celui-ci dit ce que l'espace autorise aujourd'hui, et un espace
   * qui l'ouvre en septembre rendrait rétroactivement réutilisable ce qui a été
   * dit en août. La `note` ci-dessus ne sort d'ailleurs JAMAIS de son espace,
   * quelle que soit la portée. Migration `1790170000001`, garde GA-47.
   */
  @Column('text', { default: 'tenant_private' })
  reuse_scope: string

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
