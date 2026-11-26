import { Column, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm'

/**
 * La durée cible d'une étape du pipe, réglée par un espace (PDF 3 §3.5).
 *
 * Ce qui se configure : le NOMBRE DE JOURS. Ce qui ne se configure pas : quelles
 * étapes existent, dans quel ordre, et le fait qu'une étape gagnée n'a pas de
 * durée cible. Une ligne absente = le défaut du produit
 * (`DEAL_STAGE_SLA_DEFAULTS` : 7 / 14 / 7 / 21), jamais zéro.
 *
 * ⚠️ « Le SLA n'est pas une contrainte, c'est un révélateur. Il dit où le pipe
 * coince, pas qui est en retard. » Rien dans le produit ne bloque un
 * déplacement au-delà du seuil : il ouvre une ligne dans la file du
 * responsable, et c'est tout.
 */
@Entity({ name: 'deal_stage_sla' })
export class DealStageSlaEntity {
  @Index()
  @PrimaryColumn('uuid')
  workspace_id: string

  @PrimaryColumn('text')
  stage: string

  /** Bornée en base (1 à 365) autant qu'en TypeScript. */
  @Column('int')
  sla_days: number

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
