import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #2445.12 (épopée #2766, lot SRC5 28/09 soir) — UNE ligne du journal d'un
 * incident : une ACTION prise, ou une COMMUNICATION tenue avec un client.
 * Raison complète : migration `1796349930000-ConnectorCapabilityIncidentLogs`.
 *
 * Append-only (doctrine « on archive, on ne supprime pas ») : aucune méthode
 * de mise à jour ni de suppression n'existe côté service.
 */
@Entity({ name: 'connector_capability_incident_logs' })
@Index('ix_connector_capability_incident_logs_incident', ['incident_id', 'created_at'])
export class ConnectorCapabilityIncidentLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** La transition `degraded` qui ancre cet incident (`connector_capability_incidents.id`). */
  @Column('uuid')
  incident_id: string

  @Column('text')
  kind: 'action' | 'communication'

  /** Le client visé par une COMMUNICATION. `null` pour une ACTION opérateur, qui n'en cible aucun. */
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  /** L'opérateur, forwardé par le Dashboard Manager depuis son Basic-Auth
   *  (même patron que `AdminStopAnalysisDto.actor`) — jamais un identifiant
   *  `auth.users` : un opérateur backoffice n'en a pas. */
  @Column('text', { nullable: true })
  actor: string | null

  @Column('text')
  note: string

  @Column('timestamptz', { default: () => 'now()' })
  created_at: Date
}
