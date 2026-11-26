import type { AtsProvider } from '@bellum/contracts'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm'

/**
 * Le lien d'un ESPACE DE TRAVAIL vers son ATS/ERP.
 *
 * Table dédiée plutôt que `crm_connections` : un ATS n'est pas un CRM. Les deux
 * stockent un jeton chiffré, mais y ranger BoondManager obligerait le service
 * CRM à filtrer un provider qui n'est pas le sien à chaque lecture — le genre de
 * confusion qui finit par exporter un contact vers un ERP de facturation.
 *
 * Scopé par ESPACE et non par utilisateur : un ATS est l'outil de l'ENTREPRISE,
 * pas une habitude personnelle. Deux commerciaux de la même ESN voient le même
 * vivier.
 *
 * Le secret est chiffré AES-256-GCM avec le même helper que les jetons CRM. Le
 * couple « jeton + clé » de l'espace développeur est concaténé avant chiffrement
 * (séparateur `\n`) : une seule colonne à protéger, un seul endroit à auditer.
 */
@Entity({ name: 'ats_connections' })
@Unique('ats_connections_workspace_provider', ['workspace_id', 'provider'])
export class AtsConnectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  /** Qui a branché la connexion — attribution, pas portée de lecture. */
  @Column('uuid')
  created_by: string

  @Column('text')
  provider: AtsProvider

  /** `oauth2` (le seul mode d'une connexion neuve), ou l'héritage : `user_token` (Basic), `client_jwt` (couple d'en-têtes). */
  @Column('text')
  auth_mode: 'user_token' | 'client_jwt' | 'oauth2'

  /** Secret collé chiffré (modes hérités). Pour `client_jwt` : `clientToken\nclientKey`. `null` en `oauth2`. */
  @Column('text', { nullable: true })
  credentials_enc: string | null

  /** #4688 — jetons OAuth2 chiffrés (même helper que les CRM). Jamais relus par une route. */
  @Column('text', { nullable: true })
  access_token_enc: string | null

  /** Réécrit à CHAQUE échange : Boond ne dit pas publiquement si le refresh est tournant. */
  @Column('text', { nullable: true })
  refresh_token_enc: string | null

  /** Posé depuis le `expires_in` rendu par Boond, jamais depuis une durée supposée. */
  @Column('timestamptz', { nullable: true })
  expires_at: Date | null

  /** Un refresh refusé : la connexion est « à reconnecter », plus aucun refresh n'est tenté. */
  @Column('timestamptz', { nullable: true })
  refresh_failed_at: Date | null

  /** Les scopes réellement accordés, tels que Boond les rend. */
  @Column('text', { nullable: true })
  scopes: string | null

  /** L'aller-retour d'autorisation en cours : empreinte du `state`, `code_verifier` PKCE chiffré, début. */
  @Column('text', { nullable: true })
  oauth_state_hash: string | null

  @Column('text', { nullable: true })
  oauth_verifier_enc: string | null

  @Column('timestamptz', { nullable: true })
  oauth_started_at: Date | null

  /** Base d'API surchargée (instance dédiée, sandbox). NULL = défaut éditeur. */
  @Column('text', { nullable: true })
  base_url: string | null

  @Column('timestamptz', { nullable: true })
  last_used_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
