import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { DiscoverAlertDeliverySurface, DiscoverAlertEventKind } from '@bellum/contracts'

/**
 * UN ÉVÉNEMENT SURVEILLÉ PAR UNE ALERTE DE DÉCOUVRIR — #2151.14 à .25.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE TABLE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une alerte partait sur une HORLOGE. Elle ne pouvait donc rien dire de ce qui
 * était apparu, et elle sonnait les jours où rien n'était apparu. Cette table
 * est la mémoire de ce qui EST apparu : un fait, son sujet, sa date, la nature
 * de sa source — et la surface UNIQUE par laquelle il a été délivré.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DEUX CHOSES QUE LA FORME TIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **Le cloisonnement.** `workspace_id` est NON NULL et porté par l'index
 *    unique : une lecture sans lui n'a aucun sens ici, et le service n'en écrit
 *    aucune. Les espaces sont des ESN, donc des concurrents.
 * 2. **#2151.25, la déduplication.** L'unique `(workspace_id, event_key)` est
 *    la SEULE garantie qui tienne : une lecture préalable « est-ce que je l'ai
 *    déjà vu ? » court avec le balayage voisin, et deux répliques la perdent.
 *    C'est la base qui refuse le doublon, pas la discipline d'un appelant.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ON ARCHIVE, ON NE SUPPRIME PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Une ligne ne disparaît pas quand elle cesse d'être « nouvelle » : elle reste
 * consultable AVEC sa date. « Nouveau » est une lecture relative à
 * `saved_views.last_run_at`, jamais un état écrit dans la ligne — sinon le
 * produit perdrait l'historique le jour où quelqu'un ouvre son écran.
 */
@Entity({ name: 'discover_alert_events' })
@Index('discover_alert_events_workspace_occurred_idx', ['workspace_id', 'occurred_at'])
@Index('discover_alert_events_workspace_key_uidx', ['workspace_id', 'event_key'], { unique: true })
export class DiscoverAlertEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** L'espace propriétaire. Jamais nullable : c'est la barrière de lecture. */
  @Column('uuid')
  workspace_id: string

  /** L'un des sept genres (`DISCOVER_ALERT_EVENT_KINDS`). */
  @Column('text')
  kind: DiscoverAlertEventKind

  /**
   * #2151.25 — la clé déterministe : genre + sujet + jour, chaque partie
   * encodée. Calculée par `discoverAlertEventKey` (`@bellum/contracts`), à un
   * seul endroit : deux calculs de clé qui divergent rouvrent le doublon.
   */
  @Column('text')
  event_key: string

  /** L'objet concerné. `null` quand l'événement n'en désigne pas un. */
  @Column('uuid', { nullable: true })
  subject_id: string | null

  /** Ce que la ligne DIT : un nom de compte, de besoin, de mission. */
  @Column('text')
  subject_label: string

  /**
   * La recherche enregistrée qui l'a demandé, ou `null` = événement d'ESPACE,
   * lu par tous les périmètres. Nullable à dessein : la plupart des faits
   * (une mission qui se termine, une ESN déclarée) n'appartiennent à aucun
   * périmètre en particulier.
   */
  @Column('uuid', { nullable: true })
  saved_view_id: string | null

  /**
   * #2151.25 — PAR OÙ il est arrivé. **Une seule valeur, jamais une liste** :
   * une colonne qui accepterait plusieurs surfaces autoriserait, en base, le
   * doublon que tout ce lot refuse.
   *
   * `null` = PAS ENCORE DÉLIVRÉ, ce qui n'est pas « délivré nulle part ». Les
   * genres urgents naissent à `today` (leur ligne EST la délivrance : Aujourd'hui
   * lit cette table) ; les autres attendent le passage de l'émetteur, qui choisit
   * UNE surface pour le lot et la stampe. Un événement déjà stampé n'est jamais
   * repris — c'est ce `surface IS NULL` qui empêche la seconde arrivée.
   */
  @Column('text', { nullable: true })
  surface: DiscoverAlertDeliverySurface | null

  /**
   * QUAND le fait a eu lieu — pas quand on l'a écrit. Un balayage qui repasse
   * à 07:30 sur un fait d'hier ne le rajeunit pas.
   */
  @Column('timestamptz')
  occurred_at: Date

  /**
   * Quand l'utilisateur a pris connaissance de l'événement. `null` = pas
   * encore vu, ce qui n'est PAS « ignoré ». Sert à retirer la ligne
   * d'Aujourd'hui sans l'effacer de l'histoire.
   */
  @Column('timestamptz', { nullable: true })
  acknowledged_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
