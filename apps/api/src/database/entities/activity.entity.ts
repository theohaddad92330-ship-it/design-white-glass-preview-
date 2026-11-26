import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Une interaction réelle avec un compte, un contact ou un projet.
 *
 * `external_id` porte l'idempotence de la capture, via un index unique PARTIEL
 * `(workspace_id, source, external_id) WHERE external_id IS NOT NULL` : deux
 * appels saisis à la main le même jour sont deux appels, le même e-mail relu
 * deux fois est un seul e-mail.
 */
@Entity({ name: 'activities' })
@Index(['account_id', 'occurred_at'])
@Index(['contact_id', 'occurred_at'])
@Index(['project_id', 'occurred_at'])
export class ActivityEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  /** L'utilisateur de l'espace dont on a lu la boîte, ou l'auteur de la saisie. */
  @Column('uuid', { nullable: true })
  user_id: string | null

  @Column('text')
  kind: string

  @Column('text')
  source: string

  @Column('text')
  direction: string

  @Column('text', { nullable: true })
  subject: string | null

  /** Corps intégral (arbitrage Louis 16/08). `null` pour un appel sans transcription. */
  @Column('text', { nullable: true })
  body: string | null

  @Column('boolean', { default: false })
  body_truncated: boolean

  /** Date RÉELLE de l'événement, jamais la date d'import. */
  @Column('timestamptz')
  occurred_at: Date

  @Column('integer', { nullable: true })
  duration_seconds: number | null

  @Column('uuid', { nullable: true })
  account_id: string | null

  @Column('uuid', { nullable: true })
  contact_id: string | null

  @Column('uuid', { nullable: true })
  project_id: string | null

  /** Pourquoi cette activité est attachée là — affiché tel quel dans le détail. */
  @Column('text', { nullable: true })
  link_reason: string | null

  @Column('text', { nullable: true })
  external_id: string | null

  @Column('text', { nullable: true })
  external_url: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  /** Le canal réellement emprunté. `null` pour une activité capturée en
   *  lecture — elle n'a pas été envoyée par nous. */
  @Column('text', { nullable: true })
  channel: string | null

  /** `sent` | `drafted` | `failed` | `partial` | `unknown`. */
  @Column('text', { nullable: true })
  verdict: string | null

  /** L'issue d'un APPEL (N11-B) — `null` pour tout ce qui n'est pas un appel,
   *  et pour un appel dont l'issue n'a pas été renseignée. Voir
   *  `CALL_OUTCOMES` dans `packages/contracts/src/schemas/activity.ts`. */
  @Column('text', { nullable: true })
  call_outcome: string | null

  /** #2377.1/.4/.6 — le debrief structuré (fait/besoin/objection/engagement)
   *  et l'éventuelle prochaine action déclarée. `null` = non saisi. Voir
   *  `callDebriefSchema`/`callNextActionSchema` dans
   *  `packages/contracts/src/schemas/activity.ts`. */
  @Column('jsonb', { nullable: true })
  call_debrief: Record<string, unknown> | null
}
