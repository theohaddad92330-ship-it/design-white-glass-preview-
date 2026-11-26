import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * #1617.4 — LA DÉCISION D'UN HUMAIN sur un rapprochement de mémoire marché.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'EXCEPTION SCOPÉE AU MILIEU DE SIX TABLES PARTAGÉES
 * ─────────────────────────────────────────────────────────────────────────────
 * Ses six sœurs `market_*` n'ont AUCUN `workspace_id` : un fait de marché est le
 * même pour tout le monde, et le stocker par espace multiplierait 60 067 lignes
 * par client. Celle-ci fait l'inverse, et le registre des tables avait déjà
 * écrit pourquoi, sur `market_company_signal` :
 *
 *   « une correction d'espace PRIME sur l'observation partagée sans jamais la
 *     réécrire »
 *
 * Les espaces sont des ESN, donc des concurrents. Ce qu'un commercial corrige
 * sur SON portefeuille ne devient jamais la vérité d'un autre — et il ne touche
 * pas non plus le corpus, qui reste en lecture seule pour tout le produit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE PORTE PAS, EXPRÈS
 * ─────────────────────────────────────────────────────────────────────────────
 * · **Pas l'ÉTAT calculé** (`resolved` / `ambiguous` / `unresolved`). #1617 le
 *   demandait ; il n'entre pas. Cet état résulte d'un calcul qui doit rester
 *   VIVANT — le corpus grossit, les alias s'ajoutent. Le figer créerait deux
 *   vérités qui divergeraient au premier import, sans que personne sache
 *   laquelle fait foi.
 * · **Pas de `confidence`.** Une probabilité ne se persiste pas ici (doctrine
 *   `c26_probabilite`, garde GA-64) — et une décision humaine n'est pas
 *   probable, elle est prise. L'ordre de confiance que #1617 demandait est
 *   porté par `matchedOn`, qui est un NOM, pas un nombre.
 * · **Aucune clé étrangère vers le corpus.** Même raison que la table d'alias :
 *   le corpus est RÉIMPORTÉ, et une cascade détruirait la décision. On archive,
 *   on ne supprime pas. Une décision qui vise une clé absente du corpus ne
 *   désigne rien à la lecture — et c'est la bonne réponse.
 */
@Entity({ name: 'market_company_resolution_override' })
@Index(['workspaceId', 'accountId'], { unique: true })
export class MarketCompanyResolutionOverrideEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  /** L'espace qui a tranché. Jamais nul : c'est ce qui empêche la décision de fuiter. */
  @Index()
  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string

  /** Le compte du portefeuille — l'entreprise canonique côté produit. */
  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string

  /**
   * La clé du corpus désignée par l'humain.
   *
   * `null` quand la décision est un REJET : écarter une lecture sans en
   * proposer une autre est une réponse complète, pas une donnée manquante. La
   * contrainte SQL interdit les deux combinaisons absurdes.
   */
  @Column({ name: 'market_company_key', type: 'text', nullable: true })
  marketCompanyKey!: string | null

  /**
   * `confirmed` (c'est cette entreprise) ou `dismissed` (ce n'est pas exact).
   *
   * Deux valeurs, pas quatre — voir le docbloc : l'état calculé n'entre pas.
   */
  @Column({ name: 'decision', type: 'text' })
  decision!: 'confirmed' | 'dismissed'

  /**
   * La raison, quand la personne a pris la peine de l'écrire.
   *
   * Jamais obligatoire : exiger une justification fait cliquer « autre » à tout
   * le monde, et on n'apprend rien.
   */
  @Column({ name: 'note', type: 'text', nullable: true })
  note!: string | null

  @Column({ name: 'reviewed_at', type: 'timestamptz' })
  reviewedAt!: Date

  /** Qui a tranché. Une décision sans auteur ne peut pas se discuter. */
  @Column({ name: 'reviewed_by', type: 'uuid' })
  reviewedBy!: string

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date
}
