import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Le franchissement d'une porte de décision — qui a décidé, quoi, et surtout
 * ce qui MANQUAIT au moment de décider.
 *
 * Les huit portes du socle d'architecture (G1 à G8) sont les gestes que le
 * produit ne fait jamais seul : prioriser un compte, qualifier un contact,
 * déclarer un besoin staffable, envoyer un profil, armer un playbook, écrire
 * dans l'ERP, déclarer un mois prêt à facturer, clore un projet. Elles ne
 * laissaient aucune trace exploitable.
 *
 * Cette table ne double pas `activities` : la timeline dit QU'une décision a eu
 * lieu, ce journal retient ce qu'aucun écran ne montre. Le champ qui justifie à
 * lui seul la table est `missing` — savoir six mois plus tard qu'on a clos une
 * affaire sans connaître le budget, sans interlocuteur et sans date est la
 * seule chose qui explique le résultat.
 */
@Entity({ name: 'decision_gate_crossings' })
@Index('decision_gate_crossings_subject_idx', ['workspace_id', 'subject', 'subject_id', 'created_at'])
@Index('decision_gate_crossings_gate_idx', ['workspace_id', 'gate', 'created_at'])
export class DecisionGateCrossingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  /** Qui a décidé. Jamais nul : une porte sans auteur ne se relit pas. */
  @Column('uuid')
  user_id: string

  /** L'une des huit portes — contrainte fermée côté base. */
  @Column('text')
  gate: string

  /** `accept` · `refuse` · `force`. */
  @Column('text')
  decision: string

  @Column('text')
  subject: string

  /** Une chaîne : sept portes visent une ligne en base, l'armement d'un
   *  playbook vise sa clé de catalogue. */
  @Column('text')
  subject_id: string

  /** Exigé sur tout refus, tout franchissement forcé, et sur les trois portes
   *  irréversibles. Ailleurs, `null` est une réponse légitime. */
  @Column('text', { nullable: true })
  reason: string | null

  /**
   * Ce qui manquait, en clair. Une liste VIDE dit « rien ne manquait » ; c'est
   * différent de « on n'a pas regardé », qui n'a pas de représentation ici —
   * et c'est voulu : la question est posée à chaque franchissement.
   */
  @Column('jsonb', { default: () => `'[]'::jsonb` })
  missing: string[]

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
