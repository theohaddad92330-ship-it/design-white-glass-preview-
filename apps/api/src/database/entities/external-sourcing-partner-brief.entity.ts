import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #2818 (lot T4) — CIRCUIT PARTENAIRE : le brief se PRÉPARE, il ne s'envoie
 * jamais (doctrine). Voir le docblock de `external-sourcing.ts`
 * (`@bellum/contracts`) pour la décision produit complète, et
 * `1796340441763-ExternalSourcingPartnerBriefs` pour la table.
 *
 * `partner_name` est un texte LIBRE — comme `consultants.source` — aucun
 * répertoire de partenaires n'existe dans le produit.
 */
@Entity('external_sourcing_partner_briefs')
@Index(['need_id'])
export class ExternalSourcingPartnerBriefEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  need_id: string

  @Column('text')
  partner_name: string

  /** Composé par `buildExternalSourcingPartnerBriefMessage` (`@bellum/contracts`)
   *  depuis le besoin RÉEL — jamais une donnée inventée. */
  @Column('text')
  message: string

  @Column('text', { nullable: true })
  conditions: string | null

  @Column('text', { nullable: true })
  delay: string | null

  /** `null` = pas encore de retour — jamais une chaîne vide. */
  @Column('text', { nullable: true })
  feedback: string | null

  @Column('uuid')
  prepared_by: string

  @CreateDateColumn({ type: 'timestamptz' })
  prepared_at: Date

  @Column('timestamptz', { nullable: true })
  feedback_recorded_at: Date | null
}
