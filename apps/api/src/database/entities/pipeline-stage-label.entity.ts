import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'

/**
 * Le renommage des cinq étapes du pipe, par espace de travail.
 *
 * Ce qui se configure : le LIBELLÉ. Ce qui ne se configure pas : le nombre,
 * l'ordre, et le fait qu'une étape soit gagnante. Un client qui dit « chez nous
 * on appelle ça une short-list » doit pouvoir l'écrire ; deux espaces dont les
 * pipes n'ont ni le même nombre d'étapes ni le même ordre n'ont plus aucun
 * rapport comparable, et c'est le premier chiffre qu'un dirigeant regarde.
 *
 * Une ligne absente = le libellé par défaut (`DEFAULT_STAGE_LABELS`).
 */
@Entity({ name: 'pipeline_stage_labels' })
export class PipelineStageLabelEntity {
  @PrimaryColumn('uuid')
  workspace_id: string

  @PrimaryColumn('text')
  stage: string

  @Column('text')
  label: string

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
