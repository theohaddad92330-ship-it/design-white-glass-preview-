import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { CanonicalTriggerKind, TriggerStatus } from '@bellum/contracts'

/**
 * #2875 (#2402.9, dédoublonnage 27/09) — LE REGISTRE des déclencheurs
 * commerciaux, pas encore le moteur. `kind` porte le `type` d'un
 * `TriggerEvent` canonique (`trigger-event.ts`, seul point de construction),
 * restreint par `isCanonicalTriggerKind` avant écriture — voir
 * `packages/contracts/src/schemas/canonical-trigger.ts`. Liste fermée,
 * élargie à chaque émetteur migré (GA-11/12 — la contrainte SQL avant le
 * code qui écrit).
 */
@Entity({ name: 'canonical_trigger_events' })
@Index(['workspace_id', 'kind'])
export class CanonicalTriggerEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('text')
  kind: CanonicalTriggerKind

  /** Le module qui a écrit l'événement (`governance.service`, …) — jamais un fournisseur nommé. */
  @Column('text')
  source_module: string

  /** Ce que CE genre d'événement porte — la forme varie par `kind`. */
  @Column('jsonb', { default: {} })
  payload: Record<string, unknown>

  @Column('timestamptz')
  occurred_at: Date

  /** #3915.1 — gravité 0-100 du TriggerEvent ; NULL = ligne antérieure à la colonne. */
  @Column('integer', { nullable: true })
  severity: number | null

  /** #3915.1 — clé de dédoublonnage (`workspace:type:sujet`) ; NULL = ligne antérieure. */
  @Column('text', { nullable: true })
  dedupe_key: string | null

  /** #3915.1 — échéance au-delà de laquelle l'événement n'est plus vivant ; NULL = sans échéance. */
  @Column('timestamptz', { nullable: true })
  expires_at: Date | null

  /** #3915.1 — `open` | `acknowledged` | `resolved` ; NULL = ligne antérieure (lue vivante). */
  @Column('text', { nullable: true })
  status: TriggerStatus | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
