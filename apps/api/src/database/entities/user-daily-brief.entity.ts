import { Column, Entity, PrimaryColumn } from 'typeorm'

/**
 * LE MARQUEUR « PREMIÈRE OUVERTURE DU JOUR » DE LAURA (#1936, lot 7A).
 *
 * Décision de Louis du 12/09/2026 : la première ouverture de Laura dans la
 * journée EST le brief du matin. Cette table ne porte AUCUN contenu de
 * brief — un seul repère par utilisateur, consommé de façon atomique par
 * `DailyBriefMarkerService`.
 *
 * ⚠️ PK sur `user_id` SEUL, pas `(user_id, workspace_id)` : c'est exactement
 * le patron de `UserLastSeenEntity` (`user_last_seen`), le repère « depuis ma
 * dernière connexion » du Journal — un marqueur d'OUVERTURE D'APPLICATION,
 * pas une donnée d'espace. Le cloisonnement entre deux utilisateurs est déjà
 * entier : chaque ligne appartient à UN `user_id`, et personne ne peut lire
 * ni écrire celle d'un collègue.
 *
 * `last_shown_on` est un TEXTE (`YYYY-MM-DD`, la date-clé de `zonedDateKey`),
 * pas une colonne SQL `date` : le service ne fait jamais d'arithmétique de
 * date dessus, seulement une comparaison d'égalité (`IS DISTINCT FROM`), et
 * `date` reviendrait de SQL brut comme un objet `Date` JS, pas la chaîne
 * qu'on a écrite — un piège déjà payé ailleurs dans ce dépôt.
 */
@Entity({ name: 'user_daily_brief' })
export class UserDailyBriefEntity {
  @PrimaryColumn('uuid')
  user_id: string

  /** Date-clé (`YYYY-MM-DD`) du dernier jour, dans le fuseau REÇU au moment
   *  de l'appel, où Laura a déjà consommé « premier du jour » pour cet
   *  utilisateur. */
  @Column('text')
  last_shown_on: string

  @Column('timestamptz', { default: () => 'now()' })
  updated_at: Date
}
