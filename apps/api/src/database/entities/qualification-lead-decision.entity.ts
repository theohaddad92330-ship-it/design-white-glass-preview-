import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * #2172.42 → .49 / .54 — la décision prise sur une piste à qualifier.
 *
 * La piste elle-même ne vit nulle part : elle se dérive des lignes du dossier.
 * Ce qui se garde, c'est ce qu'un humain a DÉCIDÉ — et la ligne EST la pierre
 * tombale : on archive, on ne supprime pas.
 */
@Entity('qualification_lead_decisions')
@Index(['workspace_id', 'account_id'])
export class QualificationLeadDecisionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  account_id: string

  /** La clé STABLE de la piste — pas sa date de détection. C'est ce qui
   *  l'empêche de ressusciter à l'analyse suivante. */
  @Column('text')
  lead_key: string

  /** `dismissed` | `snoozed`. */
  @Column('text')
  decision: string

  /** L'un des sept motifs. `null` sur une mise en veille : une veille n'est pas
   *  un refus, et lui prêter un motif ferait mentir la relecture. */
  @Column('text', { nullable: true })
  reason: string | null

  @Column('text', { nullable: true })
  note: string | null

  /**
   * TOUJOURS `workspace`, contraint en base. Ce qui est vrai pour cet espace ne
   * devient pas vrai pour tout le monde : la colonne existe pour que la règle
   * soit LISIBLE là où la donnée vit, et refusée là où elle s'écrit.
   */
  @Column('text', { default: 'workspace' })
  scope: string

  @Column('uuid', { nullable: true })
  decided_by: string | null

  @Column('timestamptz')
  decided_at: Date

  /** L'échéance d'une veille. `null` sur un écartement : une pierre tombale
   *  n'expire pas — elle se retire à la main. */
  @Column('timestamptz', { nullable: true })
  snoozed_until: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
