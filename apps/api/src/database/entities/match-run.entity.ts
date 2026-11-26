import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Une exécution de matching, avec ses critères et sa pondération FIGÉS.
 *
 * Le besoin peut être modifié le lendemain : l'explication doit rester celle du
 * jour du calcul. C'est la seule façon de répondre honnêtement à « pourquoi ce
 * profil n'a-t-il pas été proposé ? » trois mois plus tard.
 */
@Entity({ name: 'match_runs' })
@Index(['workspace_id', 'created_at'])
export class MatchRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('uuid')
  user_id: string

  @Column('uuid', { nullable: true })
  need_id: string | null

  /** Renseigné pour un matching INVERSE : on part d'un talent, pas d'un besoin. */
  @Column('uuid', { nullable: true })
  consultant_id: string | null

  @Column('text', { default: 'need_to_pool' })
  direction: string

  @Column('jsonb')
  criteria: unknown

  @Column('jsonb')
  weights: unknown

  @Column('uuid', { nullable: true })
  weights_version_id: string | null

  @Column('integer')
  threshold: number

  @Column('integer', { default: 0 })
  evaluated_count: number

  /** Écartés AVANT les axes par le pré-filtrage. Comptés, jamais tus. */
  @Column('integer', { default: 0 })
  prefiltered_count: number

  /** `true` quand le détail n'a pas été conservé pour tout le monde. Un journal
   *  qui coupe en silence se lirait comme un vivier plus petit qu'il n'est. */
  @Column('boolean', { default: false })
  truncated: boolean

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  exclusion_counts: { reason: string; count: number }[]

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}

/** Le détail par profil d'une exécution — un rang, deux scores, ses axes, ses motifs. */
@Entity({ name: 'match_run_entries' })
@Index(['run_id', 'rank'])
export class MatchRunEntryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  run_id: string

  @Column('uuid', { nullable: true })
  consultant_id: string | null

  /** Renseigné sur un matching inverse : quel besoin cette ligne évalue. */
  @Column('uuid', { nullable: true })
  need_id: string | null

  @Column('integer')
  rank: number

  @Column('integer')
  correspondence_score: number

  @Column('integer')
  pushable_score: number

  @Column('text')
  bucket: string

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  axes: unknown

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  exclusions: unknown

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}

/**
 * Une version de pondération d'espace — APPEND-ONLY.
 *
 * Revenir en arrière consiste à écrire une nouvelle version, jamais à effacer
 * l'ancienne : le §14.2 exige que « chaque changement de pondération soit daté
 * et réversible », et une ligne écrasée n'est ni l'un ni l'autre.
 */
@Entity({ name: 'match_weight_versions' })
@Index(['workspace_id', 'created_at'])
export class MatchWeightVersionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('jsonb')
  weights: Record<string, number>

  @Column('integer', { default: 60 })
  threshold: number

  @Column('uuid', { nullable: true })
  created_by: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
