import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * A user's notification toggles (one row per user). Mirrors the switches on
 * `/settings/notifications`. RLS scopes rows to their owner.
 */
@Entity({ name: 'notification_preferences' })
export class NotificationPreferenceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid', { unique: true })
  user_id: string

  @Column('boolean', { default: true })
  buy_signals: boolean

  @Column('boolean', { default: false })
  relance_reminders: boolean

  @Column('boolean', { default: false })
  weekly_summary: boolean

  /**
   * Email digest hebdo de veille (D3). Défaut SQL `false` depuis
   * `1792800260000-NotificationOutboundDefaultsOff` (#2082.16 — « aucune case
   * précochée ») : cette métadonnée d'entité doit rester ALIGNÉE sur la
   * colonne réelle, pas sur l'ancien défaut produit. Elle ne pilote PAS
   * l'`INSERT` (le driver Postgres émet le mot-clé SQL `DEFAULT`, jamais
   * cette valeur — `InsertQueryBuilder`, node_modules/typeorm), donc une
   * dérive ici ne réécrirait rien de vivant ; elle resterait quand même une
   * fausse piste pour `migration:generate`. Voir
   * `admin-weekly-digest-sweep.service.ts` pour le balayage du stock hérité.
   */
  @Column('boolean', { default: false })
  weekly_digest: boolean

  /**
   * Balayage `weekly_digest` hérité (15/09/2026) : posé UNIQUEMENT par
   * `AdminWeeklyDigestSweepService.sweep` quand cette ligne est repassée à
   * `false` parce que sa valeur venait du backfill de la migration additive
   * `WeeklyDigestPreference`, jamais d'un opt-out utilisateur (qui ne touche
   * jamais cette colonne). NULL = jamais balayée. Réversible et tracé : on
   * peut dire après coup QUELLES lignes ont été touchées et QUAND.
   */
  @Column('timestamptz', { nullable: true })
  weekly_digest_swept_at: Date | null

  /** Alerte in-app « crédits bientôt épuisés » au débit (transparence billing,
   *  Théo beta 15/08) — défaut ON, max 1 par cycle de quota. */
  @Column('boolean', { default: true })
  credit_low: boolean

  /** Digest quotidien in-app des actions de plan en retard (addendum p.22) —
   *  défaut ON, une seule notification récapitulative par jour. */
  @Column('boolean', { default: true })
  action_overdue: boolean

  /** Cadence de veille (§11) : e-mail digest QUOTIDIEN des signaux de veille.
   *  Opt-in STRICT (défaut OFF), lu par `DailyDigestService.run` sous le cron
   *  `daily-veille-digest` (06:30 Europe/Paris). Journée vide = pas d'e-mail. */
  @Column('boolean', { default: false })
  watchlist_daily_digest: boolean

  @Column('boolean', { default: true })
  sidebar_changelog: boolean

  /**
   * #2082.4 / .5 / .6 — les trois annonces d'ENGAGEMENT, in-app (la cloche).
   *
   * Posées le 16/09/2026 avec leur émetteur (`engagement-alerts.service.ts`),
   * jamais avant lui. Défaut ON pour la même raison qu'`action_overdue` : rien
   * ne part chez personne, et chacune annonce un engagement DÉJÀ pris.
   *
   * 🔴 `client_reply` annonce qu'une réponse est ARRIVÉE — jamais son contenu,
   * son objet ni son expéditeur (D65).
   */
  @Column('boolean', { default: true })
  meeting_prep: boolean

  @Column('boolean', { default: true })
  mission_end: boolean

  @Column('boolean', { default: true })
  client_reply: boolean

  /** Même correction de métadonnée que `weekly_digest` ci-dessus — défaut
   *  SQL `false` depuis la même migration, même raison (#2082.16). */
  @Column('boolean', { default: false })
  newsletter_changelog: boolean

  /** #4158.19 — e-mail INTERNE entre collègues, un interrupteur par type, tous
   *  faux par défaut (migration `1796498061438`). */
  @Column('boolean', { default: false })
  email_on_assignment: boolean

  @Column('boolean', { default: false })
  email_on_delegation: boolean

  @Column('boolean', { default: false })
  email_on_mention: boolean

  @Column('boolean', { default: false })
  email_on_manager_digest: boolean

  /** Newsletter Changelog : id de la dernière entrée déjà ENVOYÉE à cet
   *  utilisateur. Le delta se calcule au-dessus de ce repère — c'est ce qui
   *  garantit qu'une nouveauté ne part jamais deux fois. NULL = jamais servi
   *  (le premier passage pose le repère sans envoyer). */
  @Column('text', { nullable: true })
  newsletter_last_entry_id: string | null

  /** Langue d'interface reportée par la SPA (`fr` | `en`) — la langue dans
   *  laquelle partent les e-mails. NULL = inconnue → défaut produit (FR). */
  @Column('text', { nullable: true })
  email_language: string | null

  /** Théo D settings-compte.N1 — la plage de tranquillité (HH:MM, fuseau du
   *  profil). NULL = aucune plage. Migration `1796574800007`. */
  @Column('text', { nullable: true })
  quiet_hours_start: string | null

  @Column('text', { nullable: true })
  quiet_hours_end: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date

  /**
   * Le plafond de messages PROACTIFS par jour (PDF 6 §7, décision D40).
   *
   * Entre 1 et 5, défaut 3. Par utilisateur et non par espace : un commercial
   * et un recruteur n'ont pas la même tolérance au bruit, et c'est celui qui
   * reçoit qui doit régler.
   */
  @Column('int', { default: 3 })
  proactivity_cap: number

  /**
   * Laura Produit est-elle allumée ? — décision D49 du PDF 10.
   *
   * « Oui, et c'est important. Une Laura qu'on ne peut pas couper est une Laura
   * qu'on subit. » Le défaut est l'activation ; l'interrupteur appartient à
   * l'utilisateur, et il est le premier refus évalué par `canInterrupt`.
   */
  @Column('boolean', { default: true })
  laura_enabled: boolean

  /** Jusqu'à quand Laura se tait, après trois fermetures sans lecture (§5.3). */
  @Column('timestamptz', { nullable: true })
  laura_retreat_until: Date | null

  /** Jusqu'à quand le plafond est descendu à un, après deux interventions
   *  ignorées d'affilée. Daté et non compté : rien à réinitialiser. */
  @Column('timestamptz', { nullable: true })
  laura_throttle_until: Date | null
}
