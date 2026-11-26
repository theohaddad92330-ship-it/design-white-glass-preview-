import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

type BetaFeedbackCategory = 'bug' | 'metier' | 'autre'

@Entity({ name: 'beta_feedback' })
@Index('beta_feedback_created_idx', ['created_at'])
export class BetaFeedbackEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /**
   * L'auteur, quand c'en est un DE L'ESPACE.
   *
   * ⚠️ `null` pour un signalement venu du BACK-OFFICE : un opérateur
   * s'authentifie en Basic Auth, il n'a pas de profil Bellum. Lui en inventer un
   * attribuerait un retour à quelqu'un qui ne l'a pas écrit. Qui l'a écrit reste
   * dit — `client_context.source` et `client_context.operator`.
   */
  @Column('uuid', { nullable: true })
  user_id: string | null

  /** Optional dossier the feedback is about. */
  @Column('uuid', { nullable: true })
  account_id: string | null

  @Column('text')
  category: BetaFeedbackCategory

  @Column('text')
  message: string

  /** Reporter contact ("coordonnées"), captured from the session. */
  @Column('text', { nullable: true })
  user_email: string | null

  /** Route the user was on when submitting. */
  @Column('text', { nullable: true })
  page_url: string | null

  @Column('text', { nullable: true })
  user_agent: string | null

  /** Buffered browser console logs (last N lines) for repro. */
  @Column('text', { nullable: true })
  console_logs: string | null

  /** Uncaught errors, rejected promises and failed HTTP calls seen before the report. */
  @Column('text', { nullable: true })
  error_logs: string | null

  /**
   * The DOM element the reporter pointed at: build-time source location,
   * component stack, selector, geometry. Null when reported without pointing.
   */
  @Column('jsonb', { nullable: true })
  element_context: Record<string, unknown> | null

  /**
   * Le reste du contexte client : appels HTTP en échec (avec leur identifiant de
   * corrélation), fil des gestes précédents, version du build et état du
   * navigateur. Une seule colonne JSON plutôt que trois — c'est le même instant
   * observé, ça se lit ensemble, et ça n'ajoute qu'une migration.
   */
  @Column('jsonb', { nullable: true })
  client_context: Record<string, unknown> | null

  /** Optional screenshot as a data URL (rendered in the dashboard-manager). */
  @Column('text', { nullable: true })
  screenshot: string | null

  /** Screenshot mirrored to the GitHub repo so the issue can embed it. */
  @Column('text', { nullable: true })
  screenshot_url: string | null

  /** GitHub issue opened for this feedback (null if the integration is off). */
  @Column('int', { nullable: true })
  github_issue_number: number | null

  @Column('text', { nullable: true })
  github_issue_url: string | null

  /**
   * Jusqu'où ce retour peut servir au produit (addendum Stelya §20).
   *
   * `tenant_private` par défaut, et c'est la seule valeur par défaut
   * acceptable : un retour bêta détaillé décrit une stratégie — des zones, des
   * seuils, des cibles, un lexique — c'est-à-dire ce qui distingue une
   * entreprise de ses concurrents. Il se réutilise sur DÉCISION, jamais par
   * omission. Migration 1790024118503.
   */
  @Column('text', { default: 'tenant_private' })
  reuse_scope: string

  /**
   * #2444.10 — quand une notification de résolution est PARTIE pour ce
   * signalement (`feedback.service.ts::notifyResolvedReports`). `null` =
   * jamais notifié : un ticket qui reste `fixed` d'un passage à l'autre ne
   * renvoie pas la notification. Migration 1795998763263.
   */
  @Column('timestamptz', { nullable: true })
  notified_fixed_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
