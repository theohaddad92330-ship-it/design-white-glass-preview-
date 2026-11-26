import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * Un justificatif de note de frais, et sa CONSERVATION (31/08/2026).
 *
 * Deux nullables qui DISENT quelque chose :
 *  · `byte_size` — `null` = poids inconnu. L'écran écrit « non mesuré », jamais
 *    « 0 KB », qui se lirait « fichier vide » ;
 *  · `storage_object_id` — `null` = la pièce est RÉFÉRENCÉE mais pas détenue,
 *    et l'écran n'offre alors aucun téléchargement. Un bouton qui ne télécharge
 *    rien est une donnée fictive sous forme d'affordance.
 *
 * ⚠️ `download_url` a été RETIRÉE le 31/08/2026 (`1790990000003`) : le fichier
 * s'ouvre par une URL signée de cinq minutes, fabriquée à la demande après
 * vérification du droit de lire la NOTE. Une colonne d'adresse durable laissée
 * à côté aurait été la porte évidente pour contourner celle-là.
 *
 * `retention_until` est STOCKÉE, pas recalculée : ce qu'on oppose à un contrôle
 * est la règle en vigueur AU MOMENT du dépôt, pas celle d'aujourd'hui.
 */
@Entity({ name: 'expense_report_attachments' })
export class ExpenseReportAttachmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  expense_report_id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Column('text')
  file_name: string

  @Column('text', { nullable: true })
  content_type: string | null

  /** Octets. `null` = poids inconnu — jamais 0 pour combler. */
  @Column('bigint', { nullable: true })
  byte_size: string | number | null

  /** Jusqu'à quand la pièce doit être conservée — `AAAA-MM-JJ`. */
  @Index()
  @Column('date')
  retention_until: string

  /**
   * L'objet RANGÉ, quand il existe (31/08/2026).
   *
   * `null` = la pièce est référencée sans octets — l'écran n'offre alors aucun
   * téléchargement, exactement comme avant ce lot. C'est ce qui distingue
   * « on connaît cette pièce » de « on la détient ».
   *
   * ⚠️ `ON DELETE SET NULL` côté base : la purge de rétention emporte le
   * FICHIER, jamais la trace. « On archive, on ne supprime pas. »
   */
  @Index()
  @Column('uuid', { nullable: true })
  storage_object_id: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
