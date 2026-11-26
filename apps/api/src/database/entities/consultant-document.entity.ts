import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Un document attaché à un talent — presque toujours un CV.
 *
 * Le TEXTE extrait sert à chercher dedans et réécrire pour une mission.
 * #4034 (Louis 12/10/2026) — l'ORIGINAL d'un CV déposé est AUSSI conservé,
 * dans le seau privé (`storage_path`), pour l'aperçu fidèle ; il part avec
 * le document (retrait, effacement RGPD).
 */
@Entity({ name: 'consultant_documents' })
@Index(['consultant_id', 'created_at'])
export class ConsultantDocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  consultant_id: string

  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('text', { default: 'cv' })
  kind: string

  @Column('text')
  filename: string

  @Column('text', { nullable: true })
  mime_type: string | null

  @Column('integer', { nullable: true })
  size_bytes: number | null

  @Column('text', { nullable: true })
  extracted_text: string | null

  @Column('uuid', { nullable: true })
  uploaded_by: string | null

  /** #2327.9 — l'empreinte SHA-256 du fichier déposé ; `null` pour un texte collé. */
  @Column('text', { nullable: true })
  content_sha256: string | null

  /** #2327.7 — les lignes d'expérience (employeur + période), lues au dépôt. */
  @Column('text', { array: true, default: () => "'{}'" })
  experience_keys: string[]

  /** #2327.22 — « aucun document source n'est supprimé » : retirer = archiver. */
  @Column('timestamptz', { nullable: true })
  archived_at: Date | null

  /**
   * #2569.2 — la date RÉELLE du document (entrée ZIP, ou message qui le
   * portait), jamais la date de dépôt. `null` = inconnue, jamais devinée ;
   * voir `incomingCvIsMoreRecent` (@bellum/contracts).
   */
  @Column('timestamptz', { nullable: true })
  captured_at: Date | null

  /**
   * #2542.3 — vrai quand une PARTIE seulement de ce document a pu être lue
   * (#1954.16/.30 : une page sans calque texte au milieu d'un dossier
   * autrement numérique). `extracted_text` reste ce qui a pu être lu — jamais
   * vide pour autant, jamais un texte inventé pour combler le reste. « non
   * mesuré n'est jamais 0 » (GA-18/GA-19) : un champ absent de la relecture
   * d'un document PARTIEL n'est pas confirmé absent du CV.
   */
  @Column('boolean', { default: false })
  extraction_partial: boolean

  /**
   * #4034.2 — le chemin de l'ORIGINAL dans le seau privé
   * (`<workspace_id>/cv/<document_id>/<nom>`). `null` = original non conservé
   * (CV importé avant #4034, texte collé, ou stockage indisponible au dépôt) :
   * l'aperçu le DIT, il n'invente rien.
   */
  @Column('text', { nullable: true })
  storage_path: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
