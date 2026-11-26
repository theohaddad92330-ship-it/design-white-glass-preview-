import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { StorageDomain } from '@bellum/contracts'

/**
 * Un fichier RANGÉ — le registre unique des octets que ce produit détient.
 *
 * Voir la migration `1790990000001-StorageObjects` pour pourquoi la table est
 * centrale plutôt qu'une colonne par domaine (le chemin, le quota et l'échéance
 * ne se dupliquent pas sans diverger).
 *
 * ⚠️ `object_path` ne sort JAMAIS vers un client. Le magasin est privé : le
 * chemin ne suffit à rien sans une URL signée, et une URL signée ne se fabrique
 * qu'après vérification du droit de lire l'objet PARENT.
 */
@Entity({ name: 'storage_objects' })
@Index(['workspace_id'])
export class StorageObjectEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('text')
  domain: StorageDomain

  /** `<espace>/<domaine>/<identifiant tiré au hasard>/<nom lisible>`. UNIQUE. */
  @Column('text')
  object_path: string

  @Column('text')
  file_name: string

  /** Décidé sur l'EXTENSION à l'écriture, jamais sur ce que le client déclare. */
  @Column('text')
  content_type: string

  /**
   * Octets, toujours MESURÉS — on les a comptés en les écrivant.
   *
   * ⚠️ `bigint` revient en CHAÎNE du pilote PostgreSQL : le type le dit, pour
   * qu'aucun appelant ne fasse une addition sur du texte sans s'en apercevoir.
   */
  @Column('bigint')
  byte_size: string | number

  /** Jusqu'à quand garder — `AAAA-MM-JJ`, calculée UNE fois au dépôt. */
  @Index()
  @Column('date')
  retention_until: string

  /** Qui a déposé. `null` = déposé par un chemin système (le semis de la salle
   *  de démonstration), jamais « on ne sait plus ». */
  @Column('uuid', { nullable: true })
  uploaded_by: string | null

  /**
   * #2438.7 — L'EMPREINTE (SHA-256, hex) des octets, calculée au dépôt.
   *
   * `null` = ligne écrite AVANT la migration qui a posé cette colonne — aucun
   * backfill, les octets d'origine ne sont pas relus pour fabriquer une
   * empreinte a posteriori. Un hachage ne LIT rien du contenu, il le résume :
   * ce n'est ni un antivirus, ni une extraction.
   */
  @Column('text', { nullable: true })
  content_sha256: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
