import type { CrmMirrorActivityKind, CrmMirrorDealStatus } from '@bellum/contracts'
import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm'

/**
 * SYNC-A (19/10/2026) — le MIROIR des objets du CRM branché par l'espace (migration
 * `1796560465886-CrmMirror`). Écrit par `CrmMirrorService` seul ; lu par la fiche compte, Laura,
 * Pilotage › Pipe et la veille.
 *
 * Toute fiche porte la clé d'upsert `(workspace_id, provider, external_id)` ; une fiche disparue du
 * CRM est ARCHIVÉE (`archived_at`), jamais supprimée. Un champ que le CRM ne rend pas est `null`.
 */
abstract class CrmMirrorRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('text')
  provider: string

  /** L'identifiant chez le fournisseur — texte, aucun CRM ne promet un uuid. */
  @Column('text')
  external_id: string

  @Column('timestamptz', { nullable: true })
  crm_updated_at: Date | null

  @Column('text', { nullable: true })
  crm_url: string | null

  @Column('jsonb', { default: () => "'{}'::jsonb" })
  crm_custom_fields: Record<string, unknown>

  @Column('timestamptz', { nullable: true })
  archived_at: Date | null

  @Column('timestamptz', { default: () => 'now()' })
  synced_at: Date

  @Column('timestamptz', { default: () => 'now()' })
  created_at: Date

  @Column('timestamptz', { default: () => 'now()' })
  updated_at: Date
}

@Entity({ name: 'crm_owners' })
@Unique('crm_owners_external_unique', ['workspace_id', 'provider', 'external_id'])
export class CrmOwnerEntity extends CrmMirrorRecord {
  @Column('text', { nullable: true })
  name: string | null

  @Column('text', { nullable: true })
  email: string | null
}

@Entity({ name: 'crm_pipelines' })
@Unique('crm_pipelines_external_unique', ['workspace_id', 'provider', 'external_id'])
export class CrmPipelineEntity extends CrmMirrorRecord {
  @Column('text', { nullable: true })
  label: string | null
}

@Entity({ name: 'crm_stages' })
@Unique('crm_stages_external_unique', ['workspace_id', 'provider', 'external_id'])
export class CrmStageEntity extends CrmMirrorRecord {
  @Index('crm_stages_pipeline_idx')
  @Column('uuid')
  pipeline_id: string

  @Column('text', { nullable: true })
  label: string | null

  @Column('int', { nullable: true })
  position: number | null

  /** Une étape qui clôt l'affaire quand le CRM le dit, sinon `null`. */
  @Column('text', { nullable: true })
  status: CrmMirrorDealStatus | null
}

@Entity({ name: 'crm_deals' })
@Unique('crm_deals_external_unique', ['workspace_id', 'provider', 'external_id'])
@Index('crm_deals_workspace_account_idx', ['workspace_id', 'account_id'])
export class CrmDealEntity extends CrmMirrorRecord {
  @Column('text', { nullable: true })
  title: string | null

  @Column('text', { nullable: true })
  pipeline_external_id: string | null

  @Column('text', { nullable: true })
  stage_external_id: string | null

  @Column('text', { nullable: true })
  stage_label: string | null

  /** `numeric` côté base (TypeORM le rend en chaîne) : jamais un flottant qui affiche 1 999,99 €. */
  @Column('numeric', { nullable: true })
  amount: string | null

  @Column('text', { nullable: true })
  currency: string | null

  @Column('text', { nullable: true })
  status: CrmMirrorDealStatus | null

  @Column('text', { nullable: true })
  lost_reason: string | null

  @Column('timestamptz', { nullable: true })
  crm_created_at: Date | null

  @Column('timestamptz', { nullable: true })
  expected_close_date: Date | null

  @Column('timestamptz', { nullable: true })
  closed_at: Date | null

  @Column('text', { nullable: true })
  owner_external_id: string | null

  @Column('text', { nullable: true })
  account_external_id: string | null

  @Column('uuid', { nullable: true })
  account_id: string | null

  @Column('text', { array: true, default: () => "'{}'" })
  contact_external_ids: string[]
}

@Entity({ name: 'crm_activities' })
@Unique('crm_activities_external_unique', ['workspace_id', 'provider', 'external_id'])
@Index('crm_activities_workspace_account_idx', ['workspace_id', 'account_id'])
export class CrmActivityEntity extends CrmMirrorRecord {
  @Column('text', { nullable: true })
  kind: CrmMirrorActivityKind | null

  /** Le SUJET seulement — le corps d'un e-mail ou d'une note ne se stocke pas (doctrine c96). */
  @Column('text', { nullable: true })
  subject: string | null

  @Column('timestamptz', { nullable: true })
  occurred_at: Date | null

  @Column('boolean', { nullable: true })
  done: boolean | null

  @Column('text', { nullable: true })
  owner_external_id: string | null

  @Column('text', { nullable: true })
  account_external_id: string | null

  @Column('uuid', { nullable: true })
  account_id: string | null

  @Column('text', { nullable: true })
  contact_external_id: string | null

  @Column('uuid', { nullable: true })
  contact_id: string | null

  @Column('text', { nullable: true })
  deal_external_id: string | null
}
