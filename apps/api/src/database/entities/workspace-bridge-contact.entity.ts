import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { MemoryCrossingKind } from '@bellum/contracts'

/**
 * Une mise en relation enregistrée par la mémoire collective — le journal de
 * contribution.
 *
 * ⚠️ **Aucune colonne de texte, et c'est délibéré.** Le croisement est un pont ;
 * la table qui compte les ponts n'a pas à savoir ce qui a traversé. Une colonne
 * `note text` serait remplie dans le mois — on retire le MOYEN, pas seulement la
 * permission. Voir la migration `1791450000001-WorkspaceBridgeContacts`.
 *
 * ⚠️ **Le seul lecteur est un COMPTE d'espace sur un mois.** Jamais une
 * ventilation par personne : « aucun classement entre pairs » (doctrine, §24
 * Red Team). Les deux colonnes d'identité servent à ne pas compter trois fois le
 * même clic, et à l'arbitrage HUMAIN d'une commission.
 */
@Entity({ name: 'workspace_bridge_contacts' })
@Index(['workspace_id', 'bridged_month'])
export class WorkspaceBridgeContactEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  account_id: string

  /** La nature du croisement qui a servi de pont. Bornée par un CHECK nommé. */
  @Column('text')
  kind: MemoryCrossingKind

  /** Qui a cliqué « Contacter ». */
  @Column('uuid')
  from_user_id: string

  /** Le collègue désigné. `null` quand le croisement ne nommait qu'un RÔLE. */
  @Column('uuid', { nullable: true })
  to_user_id: string | null

  /**
   * Le mois de la mise en relation (premier jour). STOCKÉ et non dérivé : un
   * index unique a besoin d'une expression immuable, et `date_trunc` sur un
   * `timestamptz` dépend du fuseau de la session.
   */
  @Column('date')
  bridged_month: string

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
