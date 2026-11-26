import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #2899 / #2443.10 / #2278.9 — un tour de Laura ANONYMISÉ, versé aux évals par un espace qui
 * a COCHÉ l'échantillonnage (`workspaces.chat_eval_sampling_enabled`). Le texte est masqué
 * AVANT d'arriver ici (`chat-eval-anonymizer.ts`) ; le corps d'un message rédigé n'y entre
 * jamais. Migration `1796443917261-ChatEvalSampling`.
 */
@Entity({ name: 'chat_eval_samples' })
@Index('chat_eval_samples_workspace_idx', ['workspace_id', 'sampled_at'])
export class ChatEvalSampleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('text')
  anonymized_text: string

  @Column({ type: 'timestamptz', default: () => 'now()' })
  sampled_at: Date
}
