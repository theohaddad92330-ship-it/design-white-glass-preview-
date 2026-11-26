import type { RoutineChannel, RoutineKey, RoutineStatus } from '@bellum/contracts'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm'

/**
 * L'abonnement d'un utilisateur à une routine.
 *
 * La seule chose qui vit en base : le catalogue, lui, est dans le code
 * (`routine-catalog.ts`). Une définition éditable en base serait un chemin
 * d'exécution que personne n'a relu.
 *
 * Une ligne ABSENTE n'est pas « désactivé » : c'est « jamais touché », et le
 * service applique alors le défaut du catalogue. La distinction compte — sans
 * elle, activer une nouvelle routine par défaut pour les nouveaux comptes la
 * rallumerait aussi chez quelqu'un qui l'avait explicitement coupée.
 */
@Entity({ name: 'routine_subscriptions' })
@Unique('routine_subscriptions_user_key', ['user_id', 'routine_key'])
export class RoutineSubscriptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  user_id: string

  /** Clé du catalogue. TEXT libre et PAS un enum Postgres : retirer une routine
   *  du catalogue laisse une ligne orpheline que le service ignore, plutôt
   *  qu'une contrainte violée au déploiement. */
  @Column('text')
  routine_key: RoutineKey

  /** @deprecated Miroir de `status` (`enabled === (status === 'active')`),
   *  maintenu par `RoutinesService` — jamais écrit indépendamment (GA-26).
   *  Conservé pour `routine-schedule.ts`/`laura-probe.service.ts`/
   *  `quality-metrics.service.ts`, pas encore migrés vers `status`. */
  @Column('boolean', { default: true })
  enabled: boolean

  /** #2398.7 — les six statuts (migration `RoutineSubscriptionStatus1796322045000`,
   *  contrainte SQL `IN (...)`). Voir `routineStatusSchema` pour le détail de
   *  chacun et lesquels sont réglables à l'écran. */
  @Column('text', { default: 'active' })
  status: RoutineStatus

  /** Heure LOCALE de déclenchement (0-23). */
  @Column('int')
  hour: number

  /** Jour ISO (1 = lundi) pour les routines hebdomadaires ; NULL sinon. */
  @Column('int', { nullable: true })
  weekday: number | null

  @Column('text', { default: 'in_app' })
  channel: RoutineChannel

  /** Fuseau de l'utilisateur — une routine « du matin » calée sur UTC tombe à
   *  6 h 30 à Paris en été. */
  @Column('text', { default: 'Europe/Paris' })
  time_zone: string

  /**
   * #2916 (#2399.6) — la version de `RoutineDefinition` que CE compte a VUE
   * en dernier sur cette routine. `1` par défaut : toutes les définitions du
   * catalogue sont encore à la version 1, donc une ligne posée aujourd'hui a
   * réellement vu tout ce qui existe. En retard sur `definition.version` =
   * la routine a changé depuis (#2399.7).
   */
  @Column('int', { default: 1 })
  seen_version: number

  /**
   * #2843 (#2205.45) — le plafond de destinataires, DISTINCT de la cible
   * calculée. `NULL` = aucun plafond réglé, l'exécuteur retombe sur `1`
   * (comportement d'avant ce champ). Réglable UNIQUEMENT sur
   * `no_reply_follow_up` — voir `RoutinesService.update`.
   */
  @Column('int', { nullable: true })
  max_items_per_run: number | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
