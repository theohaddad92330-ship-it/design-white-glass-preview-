import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Un geste HORS OUTIL coché sur un dossier (#1503).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE ÉCRITURE-LÀ EST PERMISE, ALORS QU'ON VIENT DE SUPPRIMER
 * L'AUTRE
 * ─────────────────────────────────────────────────────────────────────────
 * Le chantier des parcours dérivés supprime la position écrite à la main, parce
 * qu'elle fabriquait une seconde vérité en face de l'objet métier. Une case
 * cochée ici n'en fabrique aucune : badge d'accès remis, VPN ouvert, contrat
 * signé, soutenance tenue — **aucune table ne porte ces faits, et il n'en
 * existera pas** (décision D48). Il n'y a donc rien avec quoi diverger.
 *
 * La règle qui sépare les deux tient en une phrase : on n'écrit à la main que ce
 * qu'aucun objet ne sait dire. `ChainsService.toggleManualMark` la fait
 * respecter — une position du flux dérivé y est refusée.
 */
@Entity({ name: 'chain_manual_marks' })
@Index(['workspace_id', 'chain_key', 'subject_id', 'position'], { unique: true })
export class ChainManualMarkEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('text')
  chain_key: string

  /** Le dossier — compte, projet, besoin, mission ou consultant selon la chaîne. */
  @Column('uuid')
  subject_id: string

  /** La position, dans le catalogue, du geste coché. */
  @Column('int')
  position: number

  @CreateDateColumn({ type: 'timestamptz' })
  marked_at: Date

  /** Qui l'a coché. Un geste hors outil est constaté par quelqu'un, jamais déduit. */
  @Column('uuid', { nullable: true })
  marked_by: string | null
}
