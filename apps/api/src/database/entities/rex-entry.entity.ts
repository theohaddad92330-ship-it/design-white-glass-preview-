import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Le retour d'une mission terminée (PDF 2 §12).
 *
 * Un REX n'est PAS une preuve : il est la matière brute d'où une preuve peut
 * sortir, une fois relue. Les confondre ferait sortir chez un prospect une
 * phrase écrite à chaud par un consultant qui rentrait de mission.
 *
 * Un seul REX par mission — la contrainte est en base : deux retours sur la
 * même mission ne se contredisent pas, ils se corrigent.
 */
@Entity('rex_entries')
@Index(['workspace_id'])
export class RexEntryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  mission_id: string

  @Column('uuid', { nullable: true })
  account_id: string | null

  @Column('text')
  summary: string

  @Column('text', { nullable: true })
  what_worked: string | null

  @Column('text', { nullable: true })
  what_failed: string | null

  // #2424.3 — trois des quinze champs nommés (équipe, compétences,
  // contraintes). Douze autres restent à trancher avec la liste réelle du
  // document source (voir `rexEntrySchema`, @bellum/contracts).
  @Column('text', { nullable: true })
  team: string | null

  @Column('text', { nullable: true })
  skills: string | null

  @Column('text', { nullable: true })
  constraints: string | null

  // #3210.2 (épopée #3246) — sept des douze champs restants d'un cas validé
  // (offre, expertise, voie d'accès, première porte, preuve mobilisée, durée
  // du cycle, partenaire). Les cinq autres (résultat, raisons de succès/échec,
  // limites de transférabilité, type d'entreprise) restent à trancher.
  @Column('text', { nullable: true })
  offer: string | null

  @Column('text', { nullable: true })
  expertise: string | null

  @Column('text', { nullable: true })
  access_path: string | null

  @Column('text', { nullable: true })
  first_door: string | null

  @Column('text', { nullable: true })
  proof_used: string | null

  @Column('text', { nullable: true })
  cycle_duration: string | null

  @Column('text', { nullable: true })
  partner: string | null

  // #3246 / #3210.3 (lot W9) — vocabulaires FERMÉS (`CASE_STRATEGIES`,
  // `CASE_BUYING_MODELS`, CHECK posée par la migration 1796440123457).
  @Column('text', { nullable: true })
  strategy: string | null

  @Column('text', { nullable: true })
  buying_model: string | null

  // #3246 / #3210.3 (lot cloud 14/10) — `CASE_ORGANISATIONS`, CHECK posée
  // par la migration 20261014060000.
  @Column('text', { nullable: true })
  organisation: string | null

  @Column('uuid', { nullable: true })
  collected_by: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  collected_at: Date
}
