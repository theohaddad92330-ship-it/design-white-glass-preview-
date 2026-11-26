import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type {
  OrgCorrectionEvidence,
  OrgCorrectionField,
  OrgCorrectionMotive,
  OrgCorrectionObjectType,
  OrgCorrectionScope,
  OrgCorrectionValue,
  OrgCorrectionVisibility,
} from '@bellum/contracts'

/**
 * UNE correction humaine posée sur l'organigramme d'un dossier — une ligne par
 * CHAMP corrigé (OrgGraph FINAL §7 ; v3 §7.2).
 *
 * Table scopée par `workspace_id` : la correction qu'une ESN pose sur
 * l'organigramme d'un compte est sa connaissance à elle, et deux espaces sont
 * deux concurrents.
 *
 * ⚠️ Aucune relation TypeORM vers `AccountEntity`, et c'est délibéré : la
 * mémoire du graphe suit l'ENTREPRISE dans l'espace, pas l'id de compte —
 * chaque run crée une nouvelle ligne `accounts`. Une cascade effacerait
 * l'historique au premier relancement.
 *
 * ⚠️ `old_value` / `new_value` sont nullables et `null` y veut dire « cette
 * information n'est pas connue » — jamais « 0 », jamais « ». C'est ce qui
 * permet à une annulation de RENDRE un champ à l'inconnu plutôt que de le
 * remplir d'une valeur de bouche-trou.
 */
@Entity('org_graph_corrections')
@Index(['workspaceId', 'accountId', 'graphVersionAfter'])
export class OrgGraphCorrectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string

  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string

  /** La version du graphe telle qu'elle était avant ce geste. */
  @Column({ name: 'graph_version_before', type: 'int' })
  graphVersionBefore!: number

  /** Celle qu'il porte après. C'est elle que le 409 compare. */
  @Column({ name: 'graph_version_after', type: 'int' })
  graphVersionAfter!: number

  @Column({ name: 'object_type', type: 'text' })
  objectType!: OrgCorrectionObjectType

  /** Toujours un id, jamais un nom (S5, homonymes). Pour un lien : `from|type|to`. */
  @Column({ name: 'object_id', type: 'text' })
  objectId!: string

  @Column({ type: 'text' })
  field!: OrgCorrectionField

  @Column({ name: 'old_value', type: 'jsonb', nullable: true })
  oldValue!: OrgCorrectionValue

  @Column({ name: 'new_value', type: 'jsonb', nullable: true })
  newValue!: OrgCorrectionValue

  /** Écrite par la personne. Une correction sans raison n'est pas une correction. */
  @Column({ type: 'text' })
  reason!: string

  /** Ce qui prouve CETTE affirmation — pas une preuve globale de la fiche. */
  @Column({ type: 'jsonb' })
  evidence!: OrgCorrectionEvidence

  /** Qui a corrigé. Une correction a un auteur, posé par le serveur. */
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  /** La pierre tombale d'une annulation. La ligne reste, avec sa raison. */
  @Column({ name: 'reverted_at', type: 'timestamptz', nullable: true })
  revertedAt!: Date | null

  /** #2126.36 — le geste posé (confirmer, obsolète, pas pertinent…). Migration 1793700318427. */
  @Column({ type: 'text', default: 'corrected' })
  motive!: OrgCorrectionMotive

  /** #2126.37 — pour qui (personnel / espace / compte). Migration 1793700318427. */
  @Column({ type: 'text', default: 'account' })
  scope!: OrgCorrectionScope

  /** #2126.39 — DÉRIVÉE de `scope`, la base la tient (`visibility_follows_scope_check`). */
  @Column({ type: 'text', default: 'workspace' })
  visibility!: OrgCorrectionVisibility
}
