import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { ProofFieldProvenance } from '@bellum/contracts'

/**
 * Une affirmation qu'on peut sortir : « migration de 400 To en 6 mois »
 * (PDF 2 §12).
 *
 * `scope` vaut `internal` par DÉFAUT, et c'est le pire cas honnête : une preuve
 * dont personne n'a vérifié qu'on peut la citer ne sort pas. L'inverse mettrait
 * la responsabilité sur celui qui oublie de cocher.
 */
@Entity('proofs')
@Index(['workspace_id'])
export class ProofEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid', { nullable: true })
  account_id: string | null

  @Column('uuid', { nullable: true })
  mission_id: string | null

  @Column('text')
  claim: string

  @Column('text', { nullable: true })
  detail: string | null

  /** `measured` | `attested` | `declared`. */
  @Column('text', { default: 'declared' })
  strength: string

  /** `internal` | `client_safe`. */
  @Column('text', { default: 'internal' })
  scope: string

  @Column('text', { nullable: true })
  sector: string | null

  @Column('boolean', { default: false })
  anonymised: boolean

  /**
   * #1612.1 / #1638.1 — sur quelle(s) techno(s) cette preuve porte, saisi par
   * qui la déclare. Jamais nullable : une preuve sans technologie déclarée est
   * une liste VIDE, pas une absence (migration `1792143857211`).
   */
  @Column('text', { array: true, default: () => "'{}'" })
  technologies: string[]

  /**
   * #2124.49 à .55 — les champs de preuve, PROPOSÉS par Laura puis validés par
   * un humain (décision de Louis du 14/09/2026).
   *
   * `citation_allowed` porte TROIS valeurs : `true`, `false`, et `null` =
   * personne n'a tranché. Un booléen à deux valeurs aurait fait dire « citation
   * refusée » à une absence de décision.
   *
   * `field_provenance` dit, CHAMP PAR CHAMP, qui a posé la valeur (`proposed`
   * validé tel quel / `human` tapé), quand, et depuis quel enregistrement. Une
   * preuve n'a pas une provenance unique : son résultat peut venir d'un retour
   * de mission et son problème d'un besoin.
   */
  @Column('text', { nullable: true })
  problem: string | null

  @Column('text', { nullable: true })
  result: string | null

  @Column('text', { array: true, default: () => "'{}'" })
  expertise: string[]

  @Column('boolean', { nullable: true })
  citation_allowed: boolean | null

  /** `mission` | `need` | `rex` | `testimonial` | `manual` (`PROOF_SOURCES`). */
  @Column('text', { nullable: true })
  source: string | null

  /**
   * #2424.6 — CE QUE la preuve montre (`PROOF_CONTENT_TYPES` :
   * `livrable` | `resultat_chiffre` | `certification` | `methode` |
   * `etude_de_cas` | `reference_technique` | `reconnaissance` |
   * `logo_client`), jamais d'où elle vient (`source`, juste au-dessus).
   * `null` = pas encore classée.
   */
  @Column('text', { nullable: true })
  content_type: string | null

  /**
   * #2424.4 — LA RÉFÉRENCE EXTERNE, les trois éléments qui manquaient (voir le
   * commentaire de `PROOF_CHANNELS` côté contrat) : les canaux où la citer,
   * la durée accordée et l'échéance qui en découle. `[]` / `null` = pas
   * encore posés.
   */
  @Column('text', { array: true, default: () => "'{}'" })
  allowed_channels: string[]

  @Column('integer', { nullable: true })
  validity_duration_months: number | null

  @Column('timestamptz', { nullable: true })
  valid_until: Date | null

  /** +1 à chaque validation humaine : une preuve citée en clientèle doit
   *  pouvoir dire QUELLE version a été citée. */
  @Column('integer', { default: 1 })
  version: number

  @Column('jsonb', { default: () => "'{}'::jsonb" })
  field_provenance: Record<string, ProofFieldProvenance>

  /** Le dernier humain qui a validé des champs, distinct du créateur. */
  @Column('uuid', { nullable: true })
  validated_by: string | null

  @Column('uuid', { nullable: true })
  created_by: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
