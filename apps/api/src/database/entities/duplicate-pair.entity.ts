import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Une paire de doublons PROPOSÉE — ou, depuis le 11/10/2026 (#4016 L6), FUSIONNÉE
 * par le balayeur quand sa confiance atteint 0,99.
 *
 * Bellum n'écrit rien dans le CRM : c'est irréversible côté CRM, et un faux
 * positif détruit l'historique d'un vrai client. La fusion automatique est une
 * écriture BellumAI, réversible, dont cette ligne est le journal. La décision
 * est enregistrée pour que la même paire ne revienne pas indéfiniment.
 *
 * `pair_key` est indépendante de l'ordre : sans elle, (A,B) et (B,A) seraient
 * deux propositions, écarter l'une laisserait l'autre revenir, et la liste ne se
 * viderait jamais.
 */
@Entity({ name: 'duplicate_pairs' })
@Index(['workspace_id', 'entity_type', 'pair_key'], { unique: true })
export class DuplicatePairEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('text')
  entity_type: string

  @Column('text')
  pair_key: string

  @Column('uuid')
  left_id: string

  @Column('uuid')
  right_id: string

  /** POURQUOI on les rapproche. Une proposition sans raison ne se vérifie pas. */
  @Column('text')
  reason: string

  @Column('numeric', {
    transformer: { to: (v: number) => v, from: (v: string | null) => (v === null ? 0 : Number(v)) },
  })
  confidence: number

  @Column('text', { default: 'pending' })
  decision: string

  @Column('timestamptz', { nullable: true })
  decided_at: Date | null

  @Column('uuid', { nullable: true })
  decided_by: string | null

  /**
   * #4016 L6 — la fiche que le balayeur a fait rejoindre l'autre, sur une paire
   * `auto_merged` (≥ 0,99, dans Bellum seulement). L'une des deux de la paire
   * (`duplicate_pairs_auto_merge_absorbed_check`). Migration `1796440163847`.
   */
  @Column('uuid', { nullable: true })
  absorbed_id: string | null

  /** #4016 L6 — l'annulation d'une fusion automatique : quand, par qui. NULL = fusion en vigueur. */
  @Column('timestamptz', { nullable: true })
  undone_at: Date | null

  @Column('uuid', { nullable: true })
  undone_by: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
