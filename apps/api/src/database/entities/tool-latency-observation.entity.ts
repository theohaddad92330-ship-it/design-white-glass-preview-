import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #2261.13 (décision Louis 19/09) — UNE synchronisation réelle, gardée pour
 * mesurer la latence probable d'un outil connecté.
 *
 * `source_at` est l'horodatage que l'API de l'outil FOURNIT (quand la donnée a
 * changé chez lui) ; `arrived_at` est l'instant où Bellum l'a lu. Le délai
 * entre les deux, moyenné sur les lignes des 7 derniers jours, EST la latence
 * — jamais une valeur de doc, jamais une moyenne inventée
 * (`tool-latency.ts::measureToolLatency`).
 *
 * Pas de RLS : la table n'est jamais lue directement par un utilisateur, elle
 * n'est agrégée que par `ToolRegistryService`, côté service-role — même
 * régime que `connector_capability_probes`, sa voisine la plus proche.
 */
@Entity({ name: 'tool_latency_observations' })
export class ToolLatencyObservationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Column('text')
  provider: string

  /** Horodatage SOURCE : quand la donnée a changé côté outil, tel que son API le rend. */
  @Column('timestamptz')
  source_at: Date

  /** Quand Bellum l'a lu — la synchronisation elle-même. */
  @Column('timestamptz')
  arrived_at: Date

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
