import type { ContactResolutionCorrection } from '@bellum/contracts'
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #2159.35 — une VERSION de la correction de rapprochement d'un contact, par
 * l'espace. Une ligne par geste, jamais mise à jour ni supprimée : la plus
 * haute version gagne, les autres restent (on archive, on ne supprime pas).
 * Migration `1796349800000-ContactResolutionCorrections`.
 */
@Entity({ name: 'contact_resolution_corrections' })
export class ContactResolutionCorrectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  /** L'espace qui a tranché. Jamais nul : c'est ce qui empêche la décision de fuiter. */
  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string

  /** La fiche VISÉE — celle que l'import avait rapprochée, à tort ou à raison. */
  @Column({ name: 'contact_id', type: 'uuid' })
  contactId!: string

  @Column({ name: 'version', type: 'integer' })
  version!: number

  @Column({ name: 'decision', type: 'text' })
  decision!: ContactResolutionCorrection['decision']

  /** La clé de rapprochement visée (`email:<adresse>`), figée au moment du geste. */
  @Column({ name: 'dedup_key', type: 'text' })
  dedupKey!: string

  @Column({ name: 'note', type: 'text', nullable: true })
  note!: string | null

  /** Qui a tranché. Une décision sans auteur ne peut pas se discuter. */
  @Column({ name: 'decided_by', type: 'uuid' })
  decidedBy!: string

  @Column({ name: 'decided_at', type: 'timestamptz' })
  decidedAt!: Date
}
