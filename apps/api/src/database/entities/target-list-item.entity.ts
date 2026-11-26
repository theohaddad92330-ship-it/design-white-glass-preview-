import type {
  SellerHypotheses,
  TargetPriority,
  TargetProvenance,
  TargetTierLabel,
  TargetWorkStatus,
} from '@bellum/contracts'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * #2155.14 à .21 — un élément de cible. Il RÉFÉRENCE un compte ou un contact
 * canonique (jamais les deux) et ne recopie rien de la fiche : il porte ce que la
 * fiche n'a pas — priorité, owner, statut de travail, provenance, action suivante.
 */
@Entity({ name: 'target_list_items' })
export class TargetListItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  target_list_id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Column('uuid', { nullable: true })
  account_id: string | null

  @Column('uuid', { nullable: true })
  contact_id: string | null

  /** #2156.24 — pourquoi CETTE fiche est dans CETTE liste. `null` = personne ne l'a écrit. */
  @Column('text', { nullable: true })
  selection_reason: string | null

  /** `null` = pas encore posée. */
  @Column('text', { nullable: true })
  priority: TargetPriority | null

  /** #3753 — la lettre du tier de l'ESN (A/B/C). `null` = aucun tier. */
  @Column('text', { nullable: true })
  tier_label: TargetTierLabel | null

  /** #3753 — hypothèses du vendeur (fournies, non vérifiées). `null` = rien fourni. */
  @Column('jsonb', { nullable: true })
  seller_hypotheses: SellerHypotheses | null

  @Column('uuid', { nullable: true })
  owner_user_id: string | null

  @Column('text', { default: 'to_review' })
  work_status: TargetWorkStatus

  @Column('text', { default: 'manual' })
  provenance: TargetProvenance

  /**
   * #2156.29 — quand les données de la fiche ont été revérifiées POUR cette
   * liste. `null` n'est pas « à jour » : c'est inconnu.
   */
  @Column('timestamptz', { nullable: true })
  refreshed_at: Date | null

  /** #2156.31 — on archive, on ne supprime pas : la ligne reste, datée. */
  @Column('timestamptz', { nullable: true })
  removed_at: Date | null

  /** #2156.31 — le motif du retrait. Sans lui, un retrait ne s'explique plus. */
  @Column('text', { nullable: true })
  removal_reason: string | null

  @Column('text', { nullable: true })
  next_action: string | null

  /** #2156.33 — des notes propres à cette liste, qui ne remontent pas sur la fiche. */
  @Column('text', { nullable: true })
  notes: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
