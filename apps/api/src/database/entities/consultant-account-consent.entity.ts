import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * Le consentement à représenter un talent, PAR COMPTE (#2329.35-.41, épopée
 * #2948) — `1796321402137-ConsultantAccountRepresentationConsent`.
 *
 * Distinct du consentement GLOBAL de `consultants` (`consent_given_at` et
 * consorts) : celui-ci répond « ai-je le droit vis-à-vis de la personne, en
 * général », celui-ci répond « ai-je le droit de la proposer À CE CLIENT
 * précis ». Une ligne par (consultant, compte) ; son absence se lit « jamais
 * demandé pour ce compte », jamais un refus.
 */
@Entity({ name: 'consultant_account_consent' })
@Index(['consultant_id', 'account_id'], { unique: true })
export class ConsultantAccountConsentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('uuid')
  consultant_id: string

  @Column('uuid')
  account_id: string

  /** #2329.35 — `null` = jamais demandé, jamais un « oui » supposé. */
  @Column('boolean', { nullable: true })
  can_store: boolean | null

  /** #2329.36 */
  @Column('boolean', { nullable: true })
  can_contact: boolean | null

  /** #2329.37/.38 — seul champ qui REFUSE la porte G4, et seulement à `false`. */
  @Column('boolean', { nullable: true })
  can_represent: boolean | null

  /** #2329.39 — ce que la personne a exclu pour CE compte. Texte libre. */
  @Column('text', { nullable: true })
  restrictions: string | null

  /** #2329.41 — d'où vient cette autorisation. Texte libre : la formulation engage l'ESN. */
  @Column('text', { nullable: true })
  source: string | null

  @Column('timestamptz', { nullable: true })
  recorded_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
