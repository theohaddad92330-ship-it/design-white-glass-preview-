import type { OpportunityJournaledField } from '@bellum/contracts'
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * L2 Pilotage › Pipe — le journal APPEND-ONLY des changements de montant et de
 * date prévue d'une opportunité (`opportunities`). Une ligne par changement,
 * jamais réécrite ni supprimée. Les valeurs sont du texte (centimes ou date
 * ISO) ; `null` = pas de valeur. Source de « montant baissé », « date repoussée
 * N fois » et des barres montées/baissées du waterfall.
 */
@Entity({ name: 'opportunity_field_changes' })
@Index(['opportunity_id', 'occurred_at'])
export class OpportunityFieldChangeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('uuid')
  opportunity_id: string

  @Column('text')
  field: OpportunityJournaledField

  @Column('text', { nullable: true })
  from_value: string | null

  @Column('text', { nullable: true })
  to_value: string | null

  @Column('uuid', { nullable: true })
  actor_id: string | null

  @Column({ type: 'timestamptz', default: () => 'now()' })
  occurred_at: Date
}
