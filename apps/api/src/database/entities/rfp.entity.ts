import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { BidDecision, RfpDocumentExtraction, RfpRequirement, RfpSourceFormat, RfpStatus } from '@bellum/contracts'

/**
 * Un appel d'offres importé (addendum final p66-68).
 *
 * Les EXIGENCES vivent en JSONB sur la ligne plutôt qu'en table fille. Ce n'est
 * pas de la paresse : une exigence n'a pas de vie propre — elle n'est jamais lue
 * hors de son dossier, jamais jointe, jamais filtrée côté SQL — et la matrice de
 * conformité les relit TOUTES à chaque affichage. Une table fille coûterait une
 * jointure sur chaque lecture pour un bénéfice nul.
 *
 * `source_text` garde le document extrait. C'est ce qui permet de re-analyser un
 * dossier quand le prompt s'améliore, sans redemander le fichier au commercial —
 * et de vérifier après coup qu'une exigence extraite figure bien dans l'original.
 */
@Entity({ name: 'rfps' })
@Index(['workspace_id', 'status'])
@Index(['workspace_id', 'document_hash'])
export class RfpEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  /** Auteur de l'import — l'attribution, distincte du périmètre de lecture. */
  @Column('uuid')
  user_id: string

  @Column('uuid', { nullable: true })
  account_id: string | null

  @Column('text')
  title: string

  @Column('text', { nullable: true })
  issuer: string | null

  @Column('text')
  source_format: RfpSourceFormat

  @Index()
  @Column('text')
  status: RfpStatus

  @Column('timestamptz', { nullable: true })
  due_at: Date | null

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  lots: string[]

  /** Le texte extrait du document. Borné à l'intake, jamais tronqué en silence. */
  @Column('text', { nullable: true })
  source_text: string | null

  /**
   * #2180.40 — hash SHA-256 du contenu BRUT déposé (fichier ou texte collé),
   * jamais du texte extrait par le modèle. Sert la détection de doublon par
   * hash documentaire : deux imports du même document, dans le même espace,
   * partagent cette valeur. `NULL` seulement pour les dossiers importés AVANT
   * cette colonne — jamais recalculé après coup (un fait périmé redevient
   * inconnu, il ne se réécrit pas tout seul).
   */
  @Column('char', { length: 64, nullable: true })
  document_hash: string | null

  /**
   * #2957 (#2180.39) — la référence de la consultation, TELLE QU'ÉCRITE dans le
   * document (migration `1796350506261-RfpReference`). `NULL` quand le document
   * n'en porte aucune, ou pour un dossier importé avant — jamais devinée.
   */
  @Column('varchar', { length: 200, nullable: true })
  reference: string | null

  @Column('jsonb', { nullable: true })
  decision: BidDecision | null

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  requirements: RfpRequirement[]

  /**
   * #2957 (#2180.9-.26) — la structure DOSSIER : douze catégories de champs
   * (entité juridique, calendrier, Q/R, critères de notation, pièces
   * demandées, profils demandés, volumes, tarifs, conditions contractuelles,
   * sécurité/conformité, interlocuteurs, format de remise), chacune avec sa
   * provenance. `NULL` pour un dossier importé avant cette colonne, ou quand
   * l'extraction n'a rien produit — jamais un objet aux douze champs vides
   * fabriqué pour la forme.
   */
  @Column('jsonb', { nullable: true })
  document_extraction: RfpDocumentExtraction | null

  /**
   * #2179.36 — le besoin créé depuis CE dossier, une fois pour toutes.
   * `NULL` tant qu'aucun besoin n'a été créé. Posé par la seule porte
   * d'écriture (`POST :id/need`, #2571.2) : un second appel avec cette
   * colonne déjà remplie est refusé, pas rejoué en silence.
   */
  @Column('uuid', { nullable: true })
  need_id: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
