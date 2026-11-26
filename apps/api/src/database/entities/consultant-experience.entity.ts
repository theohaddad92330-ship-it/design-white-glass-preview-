import type { ExperienceDatePrecision } from '@bellum/contracts'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Une EXPÉRIENCE structurée en dix champs nommés (#2328.22, épopée #2793),
 * la base des preuves d'une compétence (#2328.9/.10) plutôt qu'un bloc
 * `experiences` plat (`cv-parsing.ts`) que rien ne peut citer précisément.
 *
 * `client_masked` distingue « rien renseigné » de « client explicitement
 * confidentiel » (#2328.23) — un masquage sans raison n'est pas une lecture
 * honnête, c'est une invention de la même famille qu'un client inventé.
 */
@Entity({ name: 'consultant_experiences' })
export class ConsultantExperienceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  consultant_id: string

  /** Dénormalisé comme sur `consultant_skills` : la purge d'un espace efface
   *  par `workspace_id`, sans dépendre d'un ordre de suppression. */
  @Index()
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('text', { nullable: true })
  entreprise: string | null

  @Column('text', { nullable: true })
  client_final: string | null

  @Column('boolean', { default: false })
  client_masked: boolean

  @Column('text', { nullable: true })
  client_masked_reason: string | null

  @Column('text', { nullable: true })
  secteur: string | null

  @Column('text', { nullable: true })
  role: string | null

  @Column('date', { nullable: true })
  date_debut: string | null

  @Column('date', { nullable: true })
  date_fin: string | null

  /** #3935 (lot P03) — `year` : seule l'ANNÉE de `date_debut` est connue (le
   *  1er janvier n'est qu'une convention de stockage) ; `month` : le mois.
   *  `NULL` = la date se lit telle quelle. `1796437902201-ConsultantExperienceDatePrecision`. */
  @Column('text', { nullable: true })
  date_debut_precision: ExperienceDatePrecision | null

  /** #3935 (lot P03) — même règle que `date_debut_precision`, pour `date_fin`. */
  @Column('text', { nullable: true })
  date_fin_precision: ExperienceDatePrecision | null

  @Column('text', { nullable: true })
  contexte: string | null

  @Column('text', { nullable: true })
  realisations: string | null

  @Column('text', { array: true, default: () => "'{}'" })
  technologies: string[]

  @Column('text', { nullable: true })
  responsabilites: string | null

  /** L'extrait qui JUSTIFIE l'expérience — un extrait vide n'est jamais une
   *  preuve, même règle que `parsedFieldSchema.sourceExcerpt`. */
  @Column('text', { nullable: true })
  preuve: string | null

  /** #3935.2b — QUI a écrit chaque champ (`{ role: 'human', date_debut: 'model' }`).
   *  `{}` = inconnue (ligne antérieure), que l'arbitre place au-dessus d'une
   *  lecture de modèle. `1796437900702-ConsultantExperienceFieldProvenance`. */
  @Column('jsonb', { default: () => "'{}'::jsonb" })
  field_provenance: Record<string, 'human' | 'connector' | 'pipeline' | 'model'>

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
