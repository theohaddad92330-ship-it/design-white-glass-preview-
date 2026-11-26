import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #2297 — la trace d'un effacement de personne (RGPD art. 17). Migration
 * 1789811614640, qui dit pourquoi la table ne porte AUCUNE donnée de la
 * personne : qui a effacé, quand, et des empreintes non réversibles qui
 * empêchent la RECOLLECTE (`person-erasure-fingerprint.ts`).
 */
@Entity({ name: 'person_erasures' })
export class PersonErasureEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  /** Le membre de l'espace qui a effacé — jamais la personne effacée. */
  @Column('uuid', { nullable: true })
  erased_by: string | null

  @Column('timestamptz', { default: () => 'now()' })
  erased_at: Date

  /** #2297.51 — empreintes HMAC-SHA-256 hexadécimales, tenues par `person_erasures_fingerprints_check`. */
  @Column('text', { array: true })
  fingerprints: string[]
}
