import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #2445.12 (épopée #2766) — la plus petite tranche prouvable d'une
 * « chronologie d'incident » : `connector_capability_probes` écrase sa
 * dernière preuve à chaque appel (« la dernière observation fait foi, point »,
 * voir `ConnectorProbeService`) — RIEN n'y garde le moment où un connecteur
 * s'est mis à échouer, ni celui où il s'est rétabli. Cette table journalise
 * UNIQUEMENT les TRANSITIONS réelles (ok → erreur, erreur → ok), écrites par
 * le même appelant que le probe qui les détecte — jamais une seconde source
 * devinée après coup.
 *
 * #2445.12 (lot SRC5 28/09 soir) — l'IMPACT, les ACTIONS et la COMMUNICATION,
 * nommés absents ci-dessus, sont désormais tenus : {@link
 * ConnectorIncidentOpsService} (`connector-incident-ops.service.ts`) calcule
 * l'impact depuis CETTE table (compté, jamais nommé) et journalise les deux
 * autres dans `connector_capability_incident_logs`, ancrée sur la transition
 * `degraded` qui ouvre l'incident. Cette table reste la chronologie SEULE —
 * le premier fait sur lequel le reste se construit.
 */
@Entity({ name: 'connector_capability_incidents' })
@Index('ix_connector_capability_incidents_occurred_at', ['occurred_at'])
export class ConnectorCapabilityIncidentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('text')
  provider: string

  @Column('text')
  capability: string

  /** `'degraded'` = la capacité vient de se mettre à échouer ; `'recovered'` = elle vient de se rétablir. */
  @Column('text')
  transition: 'degraded' | 'recovered'

  /** Vocabulaire fermé de `common/connector-error.ts`. `null` sur un `'recovered'`. */
  @Column('text', { nullable: true })
  error_code: string | null

  @Column('timestamptz', { default: () => 'now()' })
  occurred_at: Date
}
