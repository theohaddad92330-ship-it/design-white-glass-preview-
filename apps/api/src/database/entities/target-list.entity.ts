import type { TargetListSource, TargetListStatus, TargetListVisibility } from '@bellum/contracts'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * #2155.13 / .16 — une liste de « Mes cibles » : ce que l'espace veut travailler
 * dans une session, une campagne ou une période, et l'OBJECTIF qui la motive.
 * Voir la migration `1793700400000-TargetLists`.
 */
@Entity({ name: 'target_lists' })
export class TargetListEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  /** Qui a créé la liste — attribution, pas portée de lecture. */
  @Column('uuid')
  created_by: string

  @Column('text')
  name: string

  /** `null` = aucun objectif écrit. */
  @Column('text', { nullable: true })
  objective: string | null

  /** #2156.9 — le responsable de la liste. `null` = personne ne l'a prise. */
  @Column('uuid', { nullable: true })
  owner_user_id: string | null

  /** #2156.10 — l'équipe ou la BU. Une étiquette, jamais un droit de lecture. */
  @Column('text', { nullable: true })
  team: string | null

  /**
   * #2156.11 — une AUTORISATION : `private` n'est lisible que par `created_by`,
   * y compris pour un autre membre du même espace. Défaut `workspace`, qui est
   * exactement ce que faisait le service avant ce champ.
   */
  @Column('text', { default: 'workspace' })
  visibility: TargetListVisibility

  /** #2156.12 — d'où vient la LISTE (à distinguer de la provenance d'un élément). */
  @Column('text', { default: 'manual' })
  source: TargetListSource

  /** #2156.13 — la requête ou les filtres d'origine, tels quels. `null` = aucune recherche. */
  @Column('jsonb', { nullable: true })
  source_query: Record<string, unknown> | null

  /** #2156.16 — le statut de la liste. Une liste neuve est un brouillon. */
  @Column('text', { default: 'draft' })
  status: TargetListStatus

  /** #2156.20 — la prochaine action sur la LISTE. */
  @Column('text', { nullable: true })
  next_action: string | null

  /** #2156.21 — la séquence branchée sur la liste, s'il y en a une. */
  @Column('uuid', { nullable: true })
  sequence_id: string | null

  /** #2156.22 — la session de prospection, s'il y en a une. Pas de clé étrangère : la table n'existe pas encore. */
  @Column('uuid', { nullable: true })
  prospecting_session_id: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
