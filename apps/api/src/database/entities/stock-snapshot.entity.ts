import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { StockMetricKey } from '@bellum/contracts'

/**
 * L'état d'un indicateur de STOCK à la fin d'un mois, pour UN espace.
 *
 * Table scopée : contrairement à `territory_snapshots` — qui décrit un marché
 * et n'a donc pas de `workspace_id` —, le nombre de clients actifs ou la taille
 * du vivier d'une ESN sont sa donnée à elle. Deux espaces sont deux
 * concurrents ; agréger ces chiffres serait un échange d'informations
 * commerciales.
 *
 * ⚠️ `value` n'est pas nullable, et c'est le cœur de la règle : une valeur non
 * lue n'écrit AUCUNE ligne. L'absence de ligne dit « on ne sait pas » ; un
 * `null` en base finirait tôt ou tard lu comme un zéro.
 */
@Entity('stock_snapshots')
@Index(['workspaceId', 'takenOn', 'metricKey'], { unique: true })
export class StockSnapshotEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string

  /** Le DERNIER jour du mois photographié (`YYYY-MM-DD`). */
  @Column({ name: 'taken_on', type: 'date' })
  takenOn!: string

  /** La clé de la dérivation photographiée — le même littéral que celui que
   *  l'écran affiche, jamais une traduction. */
  @Column({ name: 'metric_key', type: 'text' })
  metricKey!: StockMetricKey

  @Column({ type: 'int' })
  value!: number

  /**
   * La POPULATION sur laquelle `value` a été mesurée — « 7 sur 42 comptes
   * suivis ». `null` = aucune population lue, et JAMAIS « population vide » :
   * les deux se ressembleraient à `0`, alors qu'un taux sur une population vide
   * n'est pas « 0 % » mais une absence de mesure.
   *
   * ⚠️ Lu en SQL brut puis converti par `Number()` — TypeORM rend un `bigint`
   * sous forme de chaîne, et le chemin de lecture de ce module ne passe pas par
   * le repository.
   */
  @Column({ name: 'denominator', type: 'bigint', nullable: true })
  denominator!: number | null

  /** D'où sort ce chiffre. Il voyage AVEC la valeur pour rester lisible le jour
   *  où la dérivation change de forme ou de fichier. */
  @Column({ type: 'text' })
  provenance!: string

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date
}
