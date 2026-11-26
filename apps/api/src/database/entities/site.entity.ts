import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * Une implantation physique d'un compte (PDF 2 §2) — celle qui porte la mission
 * et la mobilité RÉELLE du consultant.
 *
 * Ce n'est PAS un miroir du registre : les établissements sont déjà connus dans
 * `raw_analysis.branches`, et un grand compte en compte plus d'un millier,
 * majoritairement administratifs. Un site est une implantation que l'ESN
 * RETIENT parce qu'elle y va. On propose depuis le registre ; on ne matérialise
 * pas d'office.
 */
@Entity('sites')
@Index(['account_id'])
export class SiteEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('uuid')
  account_id: string

  /** L'entité qui exploite ce site, quand on la connaît. */
  @Column('uuid', { nullable: true })
  entity_id: string | null

  @Column('text')
  label: string

  @Column('text', { nullable: true })
  city: string | null

  @Column('text', { nullable: true })
  postal_code: string | null

  @Column('text', { nullable: true })
  country: string | null

  @Column('text', { nullable: true })
  siret: string | null

  /** Effectif du site. `null` = jamais renseigné, jamais 0 — un 0 se lirait
   *  « site vide » et ferait renoncer à y staffer. */
  @Column('integer', { nullable: true })
  headcount: number | null

  /** Ce que le site FAIT — vocabulaire partagé avec `sitesFrance[].type` de
   *  l'analyse. NULL = non dit ; un site administratif n'est jamais promu usine
   *  parce qu'un SIRET existe (§8.1). Migration 1790027384512. */
  @Column('text', { nullable: true })
  site_type: string | null

  @Column('text', { array: true, default: () => "'{}'" })
  activity_sector_codes: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  industrial_function_codes: string[]

  /** Ce que vaut l'effectif. NULL avec un effectif renseigné n'est pas une
   *  erreur : c'est un chiffre dont personne n'a dit d'où il vient. */
  @Column('text', { nullable: true })
  headcount_confidence: string | null

  @Column('text', { nullable: true })
  headcount_source: string | null

  /** Quand l'effectif était VRAI — pas quand la ligne a été écrite. */
  @Column('timestamptz', { nullable: true })
  headcount_observed_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
