import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { TerritoryMeasureKey, TerritorySnapshotSource } from '@bellum/contracts'

/**
 * L'état d'un département à une date — table PARTAGÉE, sans `workspace_id`.
 *
 * Le nombre d'offres IT en Haute-Garonne est le même pour tout le monde. Le
 * stocker par espace le multiplierait par le nombre de clients pour un résultat
 * identique — et empêcherait la moyenne de se constituer chez un nouvel espace,
 * qui repartirait de zéro alors que la donnée existe déjà.
 *
 * ⚠️ L'unicité porte sur `(department, taken_on, SOURCE)` depuis le 31/08/2026 :
 * une photo de la salle de démonstration et la photo réelle du même lundi
 * coexistent, et la seconde n'est plus empêchée par la première.
 */
@Entity('territory_snapshots')
@Index(['department', 'takenOn', 'source'], { unique: true })
export class TerritorySnapshotEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'text' })
  department!: string

  @Column({ name: 'taken_on', type: 'date' })
  takenOn!: string

  @Column({ type: 'int', nullable: true })
  offers!: number | null

  @Column({ name: 'esn_present', type: 'int', nullable: true })
  esnPresent!: number | null

  @Column({ name: 'open_tenders', type: 'int', nullable: true })
  openTenders!: number | null

  @Column({ name: 'awarded_contracts', type: 'int', nullable: true })
  awardedContracts!: number | null

  @Column({ name: 'buyers_with_incumbent', type: 'int', nullable: true })
  buyersWithIncumbent!: number | null

  @Column({ name: 'top_technologies', type: 'jsonb', default: () => "'[]'::jsonb" })
  topTechnologies!: { term: string; count: number }[]

  /** Les ESN qui recrutaient ce jour-là, avec leur nombre d'offres. C'est cette
   *  colonne qui construit la moyenne du score de débordement. */
  @Column({ name: 'esn_hiring', type: 'jsonb', default: () => "'[]'::jsonb" })
  esnHiring!: { name: string; offers: number }[]

  /**
   * Les BORNES DE COLLECTE en vigueur au moment de la prise.
   *
   * Sans elle, « 100 offres » se compare à « 100 offres » comme une stabilité,
   * alors que ce sont deux plafonds. Vide (`{}`) sur les photos antérieures au
   * 31/08/2026 : la lecture retombe alors sur la borne en vigueur et le DIT,
   * plutôt que de les lire comme non bornées.
   */
  @Column({ name: 'collection_limits', type: 'jsonb', default: () => "'{}'::jsonb" })
  collectionLimits!: Partial<Record<TerritoryMeasureKey, number>>

  /**
   * Qui a pris la photo. `sweep` = le balayage du lundi ; `demo` = la salle de
   * démonstration. Aucune lecture réelle ne voit une photo `demo` — ni la
   * médiane de recrutement du référentiel, ni le tableau d'un espace client.
   */
  @Column({ type: 'text', default: 'sweep' })
  source!: TerritorySnapshotSource

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date
}
