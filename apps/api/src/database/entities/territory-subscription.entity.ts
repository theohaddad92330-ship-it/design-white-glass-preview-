import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/** Un territoire qu'un espace SUIT (tome 4 §21.3). L'intention est privée. */
@Entity('territory_subscriptions')
@Index(['workspaceId', 'department'], { unique: true })
export class TerritorySubscriptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string

  @Column({ type: 'text' })
  department!: string

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date
}
