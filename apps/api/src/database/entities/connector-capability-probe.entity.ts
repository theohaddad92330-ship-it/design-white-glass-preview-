import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * La dernière preuve — et la dernière erreur — d'une capacité de connecteur.
 *
 * Voir la migration `1789910000001-ConnectorCapabilityProbes` pour le pourquoi.
 * En deux lignes : « connecté » ne prouve pas qu'une lecture marche, et le
 * 16/08/2026 un agenda plein s'est affiché vide pendant des semaines sans que
 * rien ne puisse le dire.
 *
 * ⚠️ `last_proof_sample` est un NOM d'objet (« Perso, Équipe, Client EDF »),
 * jamais un contenu. Un test qui afficherait le corps d'un message serait une
 * fuite, pas une preuve.
 */
@Entity({ name: 'connector_capability_probes' })
@Index('connector_capability_probes_uidx', ['workspace_id', 'provider', 'capability'], { unique: true })
export class ConnectorCapabilityProbeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  /** Qui a produit la preuve — attribution, jamais portée de lecture. */
  @Column('uuid', { nullable: true })
  user_id: string | null

  @Column('text')
  provider: string

  @Column('text')
  capability: string

  @Column('timestamptz', { nullable: true })
  last_proof_at: Date | null

  @Column('text', { nullable: true })
  last_proof_sample: string | null

  /** Vocabulaire fermé de `common/connector-error.ts`, jamais un message brut. */
  @Column('text', { nullable: true })
  last_error_code: string | null

  @Column('timestamptz', { nullable: true })
  last_error_at: Date | null

  @Column('timestamptz', { default: () => 'now()' })
  updated_at: Date
}
