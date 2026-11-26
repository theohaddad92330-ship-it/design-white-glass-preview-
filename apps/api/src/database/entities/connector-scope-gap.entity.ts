import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * Une connexion OAuth dont le jeton porte MOINS de portées que l'app n'en demande.
 *
 * Une ligne par (utilisateur, connecteur), posée à deux endroits : au retour du consentement
 * (`fresh_consent = true` — le fournisseur vient de ne PAS accorder ce qu'on demandait, donc c'est
 * l'app publiée qui ne le propose pas) et par le balayage des connexions existantes
 * (`fresh_consent = false` — l'accord est ancien, une reconnexion le répare). La ligne disparaît
 * dès que l'écart se referme : elle dit ce qui manque MAINTENANT, jamais un historique.
 *
 * `notified_signature` borne la notification in-app : une seule fois par (utilisateur, connecteur,
 * ensemble de portées manquantes).
 */
@Entity({ name: 'connector_scope_gaps' })
@Index('connector_scope_gaps_user_provider_uidx', ['user_id', 'provider'], { unique: true })
export class ConnectorScopeGapEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  user_id: string

  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('text')
  provider: string

  /** Les portées demandées qui n'ont pas été accordées, séparées par des espaces. */
  @Column('text')
  missing_scopes: string

  /** L'empreinte stable de `missing_scopes` (ordre et casse neutralisés). */
  @Column('text')
  signature: string

  /** Vrai quand l'écart est apparu JUSTE APRÈS un consentement neuf. */
  @Column('boolean', { default: false })
  fresh_consent: boolean

  /** L'empreinte pour laquelle la notification a déjà été envoyée. */
  @Column('text', { nullable: true })
  notified_signature: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
