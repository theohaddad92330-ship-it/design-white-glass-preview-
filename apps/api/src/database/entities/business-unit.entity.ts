import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type {
  BusinessUnitAccessRequestStatus,
  BusinessUnitKind,
  BusinessUnitMembership,
  BusinessUnitStatus,
} from '@bellum/contracts'

/**
 * La couche BU / agence — le PÉRIMÈTRE DE TRAVAIL d'un espace (#2005.3).
 *
 * ⚠️ HOMONYME, à ne pas confondre — et la confusion coûterait cher.
 * `business_unit` existe DÉJÀ dans ce dépôt comme type d'entité de l'organigramme
 * d'un compte PROSPECTÉ (`account-entity.entity.ts`, `entityTypes.ts`,
 * `entity_type.py`) : là-bas, une « business unit » est une subdivision du
 * CLIENT. Ici, c'est une subdivision de NOTRE espace — l'agence lyonnaise de
 * l'ESN qui utilise Bellum. Les deux vocabulaires ne se croisent jamais : aucun
 * `account_entities.type` ne pointe vers cette table, et aucune ligne d'ici ne
 * décrit un prospect.
 *
 * Le nom est conservé parce que c'est celui que les utilisateurs emploient
 * (« ma BU », « mon agence ») et celui du lot ; le renommer dans le code aurait
 * déplacé la confusion vers l'écran, où elle est plus chère.
 *
 * Migration `1793710000000-BusinessUnits`.
 */
@Entity({ name: 'business_units' })
@Index('business_units_workspace_idx', ['workspace_id'])
export class BusinessUnitEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /**
   * ⚠️ NON NULLABLE, et c'est la borne qui compte. Une BU appartient à UN
   * espace ; toute lecture de cette table garde son `WHERE workspace_id = $1`
   * même quand elle filtre aussi sur la BU. Le risque du chantier est qu'un
   * filtre de BU REMPLACE la borne d'espace — `business-unit-scope.spec.ts` le
   * mesure.
   */
  @Column('uuid')
  workspace_id: string

  @Column('text')
  name: string

  /** L'échelle déclarée (#2087.2-.8). Un FAIT, jamais un droit. */
  @Column('text', { default: 'business_unit' })
  kind: BusinessUnitKind

  /** Les sept champs de la saisie #2087.11 — tous facultatifs. */
  @Column('text', { nullable: true })
  territory: string | null

  @Column('jsonb', { default: () => `'[]'::jsonb` })
  specialties: string[]

  /** `null` = non renseigné. ⚠️ Jamais `0` : « je n'ai pas dit » n'est pas
   *  « je n'ai aucun consultant ». */
  @Column('integer', { nullable: true })
  consultant_count: number | null

  @Column('integer', { nullable: true })
  team_size: number | null

  @Column('uuid', { nullable: true })
  lead_user_id: string | null

  @Column('text', { nullable: true })
  portfolio_note: string | null

  /**
   * #2005.5 (DÉCISION Louis 17/09, lot CP2) — consultants DISPONIBLES,
   * saisis par le responsable de BU dans les réglages des périmètres.
   * Migration `1795610000002-BusinessUnitCapacityObjective`. `null` = non
   * renseigné, jamais `0`.
   */
  @Column('integer', { nullable: true })
  capacity_available_consultants: number | null

  /** #2005.5 (DÉCISION Louis 17/09, lot CP2) — l'objectif du trimestre,
   *  texte libre saisi par le responsable de BU. `null` = non renseigné. */
  @Column('text', { nullable: true })
  quarter_objective: string | null

  @Column('text', { default: 'active' })
  status: BusinessUnitStatus

  @Column('uuid', { nullable: true })
  created_by: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

/**
 * Qui porte quel périmètre. Une personne peut en porter plusieurs (un
 * responsable de deux agences) — c'est pourquoi c'est une table et non une
 * colonne sur `workspace_members`.
 */
@Entity({ name: 'business_unit_members' })
@Index('business_unit_members_member_idx', ['workspace_id', 'user_id'])
@Index('business_unit_members_unique', ['business_unit_id', 'user_id'], { unique: true })
export class BusinessUnitMemberEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  business_unit_id: string

  @Column('uuid')
  user_id: string

  @Column('text', { default: 'member' })
  membership: BusinessUnitMembership

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}

/**
 * « Demander l'accès » (#2087.16) — une demande, pas une adhésion.
 *
 * Rejoindre un périmètre qu'on ne porte pas se DEMANDE ; quelqu'un répond. Une
 * demande tranchée ne s'efface pas : une décision d'accès est une trace, et la
 * question « qui a ouvert ce périmètre à qui » se pose toujours plus tard.
 */
@Entity({ name: 'business_unit_access_requests' })
@Index('business_unit_access_requests_workspace_idx', ['workspace_id', 'status'])
export class BusinessUnitAccessRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  business_unit_id: string

  @Column('uuid')
  user_id: string

  @Column('text', { default: 'pending' })
  status: BusinessUnitAccessRequestStatus

  @Column('text', { nullable: true })
  message: string | null

  @Column('uuid', { nullable: true })
  decided_by: string | null

  @Column('timestamptz', { nullable: true })
  decided_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
