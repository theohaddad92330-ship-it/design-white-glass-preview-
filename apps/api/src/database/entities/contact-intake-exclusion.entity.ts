import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #2309.16/.19 — un candidat jamais devenu une fiche : identité ambiguë
 * (`ContactsService.createFromCrmPresence`, branche `ambiguous`) ou doublon
 * détecté avant création (`bulkImportManual` / `createFromCrmPresence`,
 * branche `duplicate`). Distincte de `contact_stops` : ceci ne parle jamais
 * d'une fiche existante, seulement d'un candidat qui n'en a jamais eu.
 *
 * En AJOUT SEUL — voir la migration pour la raison complète.
 */
@Entity({ name: 'contact_intake_exclusions' })
export class ContactIntakeExclusionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  account_id: string

  /** `'ambiguous_identity'` ou `'duplicate_identity'`, tenues par
   *  `contact_intake_exclusions_reason_check`. */
  @Column('text')
  reason: 'ambiguous_identity' | 'duplicate_identity'

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
