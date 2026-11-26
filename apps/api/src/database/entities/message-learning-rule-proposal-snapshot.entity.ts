import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #2385.5 (épopée #2877) — la persistance VERSIONNÉE et RÉVERSIBLE que le
 * candidat calculé à la volée (`proposeWorkspaceMessageLearningRule`) n'avait
 * pas encore : chaque snapshot enregistré porte son propre `version`
 * (incrémental par workspace) et n'écrase JAMAIS le précédent — « on archive,
 * on ne supprime pas ». C'est la tranche la plus petite du reste nommé par le
 * bilan du 28/09 : la persistance, pas le workflow de décision (aucun statut
 * `adopted`/`rejected` ici, contrairement à `MessageStyleRuleProposalEntity`)
 * ni l'agrégation aux niveaux message/campagne/utilisateur/global (toujours
 * hors de cette tranche).
 *
 * `status` naît TOUJOURS `'proposed'` — le NO-GO #2385.11 (jamais affirmer un
 * apprentissage sans règle versionnée ET réversible) tient par construction :
 * aucun code ne crée une ligne `adopted`/`rejected`. `adopted`/`rejected`
 * n'arrivent que par un geste humain EXPLICITE et séparé (#2385.1, migration
 * `1796405091234`), jamais `applied` — même discipline que
 * `MessageStyleRuleProposalEntity` (#2369.7/.8).
 */
@Entity({ name: 'message_learning_rule_proposal_snapshots' })
export class MessageLearningRuleProposalSnapshotEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  /** Toujours `'workspace'` aujourd'hui — le seul niveau que le calcul actuel peuple. */
  @Column('text')
  level: string

  /** Incrémental par `workspace_id`, jamais réutilisé : `MAX(version) + 1`. */
  @Column('int')
  version: number

  @Column('text', { default: 'proposed' })
  status: string

  @Column('text')
  summary: string

  @Column('int')
  based_on_sample: number

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  /** `NULL` tant que `status = 'proposed'` — posé par le SEUL geste de décision (#2385.1). */
  @Column('timestamptz', { nullable: true })
  decided_at: Date | null
}
