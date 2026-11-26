import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'

/**
 * #2968 — UNE ENTREPRISE DU REVERSE MARKET MASQUÉE, PAR PERSONNE, SUR UN
 * CONSULTANT.
 *
 * Même patron que `SimilarAccountDismissalEntity` (#2127.37, QCM de Louis du
 * 15/09/2026) : PERSISTANT et PAR PERSONNE, archive jamais suppression. Voir
 * la migration `ReverseMarketDismissals` pour la raison de chaque colonne.
 *
 * `company_key` (pas `company_id`) parce qu'une entreprise de « Environnements
 * compatibles » n'est pas une ligne de la base : c'est un nom rendu par la
 * mémoire marché, sans identifiant commun avec `accounts`. `company_name`
 * voyage à côté pour réafficher le libellé d'une ligne masquée sans second
 * aller-retour.
 */
@Entity({ name: 'reverse_market_dismissals' })
export class ReverseMarketDismissalEntity {
  @PrimaryColumn('uuid')
  workspace_id: string

  @PrimaryColumn('uuid')
  user_id: string

  /** La fiche depuis laquelle le geste a été fait — masquer ne traverse pas les consultants. */
  @PrimaryColumn('uuid')
  consultant_id: string

  /** Le libellé rapproché (`marketVerificationKey`) — casse et espaces de bord ignorés. */
  @PrimaryColumn('text')
  company_key: string

  /** Le libellé TEL QUE la mémoire marché l'a rendu, et tel que l'écran l'a envoyé. */
  @Column('text')
  company_name: string

  /** `NULL` = visible. Une date = masquée depuis cette date. Jamais supprimée. */
  @Column({ type: 'timestamptz', nullable: true })
  dismissed_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
