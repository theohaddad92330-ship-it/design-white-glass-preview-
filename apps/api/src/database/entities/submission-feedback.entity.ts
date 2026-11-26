import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Le retour client sur un positionnement, sur quatre axes.
 *
 * Chaque axe vaut `unknown` par défaut : forcer un avis là où le client n'en a
 * pas donné fabriquerait la donnée qui sert ensuite à décider quel profil
 * pousser. Le `verbatim` est gardé TEL QUEL — reformuler un retour client, c'est
 * perdre la seule phrase qui servira en soutenance.
 */
@Entity({ name: 'submission_feedback' })
@Index(['submission_id', 'created_at'])
export class SubmissionFeedbackEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  submission_id: string

  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('text', { default: 'unknown' })
  technical: string

  @Column('text', { default: 'unknown' })
  experience: string

  @Column('text', { default: 'unknown' })
  communication: string

  @Column('text', { default: 'unknown' })
  price: string

  // #2335.4 — six axes de plus (LAU-FINAL-076) : les quatre ci-dessus
  // existaient déjà, additifs jamais un remplacement.
  @Column('text', { default: 'unknown' })
  seniority: string

  @Column('text', { default: 'unknown' })
  context: string

  @Column('text', { default: 'unknown' })
  availability: string

  @Column('text', { default: 'unknown' })
  location: string

  @Column('text', { default: 'unknown' })
  timing: string

  @Column('text', { name: 'other', default: 'unknown' })
  other_axis: string

  // #2178.29 — onzième axe, additif : voir la migration
  // `SubmissionFeedbackAxisPersonality`.
  @Column('text', { default: 'unknown' })
  personality: string

  @Column('text', { nullable: true })
  verbatim: string | null

  /** #2335.6 — apprentissage libre, jamais lu pour réécrire le profil consultant. */
  @Column('text', { nullable: true })
  learning: string | null

  /**
   * Jusqu'où ce retour peut servir au produit — `tenant_private` par défaut.
   *
   * La TRACE de la portée au moment où le retour a été donné, et non le réglage
   * d'espace : celui-ci dit ce que l'espace autorise aujourd'hui, et un espace
   * qui l'ouvre en septembre rendrait rétroactivement réutilisable ce qui a été
   * dit en août. Le `verbatim` ci-dessus ne sort d'ailleurs JAMAIS de son
   * espace, quelle que soit la portée. Migration `1790170000001`, garde GA-47.
   */
  @Column('text', { default: 'tenant_private' })
  reuse_scope: string

  @Column('uuid', { nullable: true })
  recorded_by: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
