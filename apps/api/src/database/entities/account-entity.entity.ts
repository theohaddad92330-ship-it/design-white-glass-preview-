import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * Une subdivision du CLIENT : business unit, filiale, division (PDF 2 §2).
 *
 * ⚠️ La classe s'appelle `AccountEntityRow` et non `AccountEntity` parce que ce
 * dernier nom désigne déjà, dans ce même dossier, la ligne de la table
 * `accounts` (`account.entity.ts`). Deux classes du même nom dans un dossier
 * d'entités TypeORM est exactement le genre de collision qui compile et se
 * découvre en production.
 *
 * À ne pas confondre non plus avec `legal_entities`, qui porte les sociétés DE
 * L'ESN pour savoir laquelle facture. Celle-ci porte celles du client.
 */
@Entity('account_entities')
@Index(['account_id'])
export class AccountEntityRow {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('uuid')
  account_id: string

  @Column('text')
  name: string

  /** `bu` | `subsidiary` | `division` | `unknown`. Contraint en base. */
  @Column('text', { default: 'unknown' })
  kind: string

  @Column('text', { nullable: true })
  siren: string | null

  /**
   * Le numéro d'ÉTABLISSEMENT, quatorze chiffres (31/08/2026). `null` = jamais
   * saisi.
   *
   * ⚠️ Il ne se DÉDUIT jamais du SIREN : les cinq derniers chiffres (le NIC)
   * désignent un établissement précis et ne s'inventent pas. Un SIRET fabriqué
   * enverrait la facture au mauvais site d'un grand groupe.
   */
  @Column('text', { nullable: true })
  siret: string | null

  /**
   * Qui a confirmé l'identité légale de cette entité : `public_registry` |
   * `human_declared`. `null` = personne — la pastille « vérifié » se tait alors,
   * elle n'affiche pas « non vérifié » comme un reproche.
   *
   * Va TOUJOURS avec `identity_checked_on` (contrainte
   * `account_entities_identity_pair_check`) : une source sans date ne dit pas
   * quand elle était vraie.
   */
  @Column('text', { nullable: true })
  identity_source: string | null

  /** Quand l'identité a été confirmée (`YYYY-MM-DD`). Va toujours avec
   *  `identity_source`. */
  @Column('date', { nullable: true })
  identity_checked_on: string | null

  @Column('text', { nullable: true })
  domain: string | null

  /**
   * L'entité d'accueil des contacts dont on ignore la division. Au plus une par
   * compte — l'unicité est portée par un index partiel, pas par le code : deux
   * périmètres non déterminés se partageraient les contacts orphelins sans que
   * rien ne le signale.
   */
  @Column('boolean', { default: false })
  is_default: boolean

  /**
   * Une ESN de rang 1 est-elle installée sur cette entité ? `yes` | `no` |
   * `unknown`. Le rang 1 est une propriété de l'ENTITÉ et non du compte : on ne
   * traite pas avec « EDF », on traite avec une DSI qui a, ou non, son
   * intégrateur en place.
   */
  @Column('text', { default: 'unknown' })
  rank1_incumbent: string

  @Column('text', { nullable: true })
  rank1_note: string | null

  /**
   * Cette entité est-elle celle qui REÇOIT la facture ? Au plus une par compte,
   * l'unicité étant portée par un index partiel comme pour `is_default`.
   *
   * ⚠️ Le défaut est FAUX, et c'est une décision : aucune entité n'est payeuse
   * tant que quelqu'un ne l'a pas désignée. En désigner une d'office ferait
   * afficher un SIREN qui n'est pas celui du payeur.
   */
  @Column('boolean', { default: false })
  is_billing: boolean

  /** La raison sociale du payeur, distincte du libellé d'usage porté par
   *  `name`. `null` = jamais saisie ; aucun repli sur `name`, qui ferait passer
   *  un nom d'usage (« EDF DSI Groupe ») pour une raison sociale. */
  @Column('text', { nullable: true })
  legal_name: string | null

  /**
   * Le délai de règlement, en jours. `null` = personne ne l'a saisi — un
   * bloqueur nommé, puisque sans lui aucune échéance n'est calculable, donc
   * aucun retard, donc aucune relance d'encaissement. `0` est une valeur SAISIE
   * et légitime (comptant) : les confondre ferait bloquer un client qui paie le
   * jour même.
   */
  @Column('integer', { nullable: true })
  payment_terms_days: number | null

  /** L'échéance du contrat-cadre. `null` = aucune échéance connue, le cas
   *  normal d'un contrat sans terme — jamais « expiré ». */
  @Column('date', { nullable: true })
  contract_expires_on: string | null

  /** À qui la facture part, chez le client (`contacts.id`). `ON DELETE SET
   *  NULL` en base : supprimer l'interlocuteur fait RÉAPPARAÎTRE le bloqueur,
   *  ce qui est le signal utile. */
  @Column('uuid', { nullable: true })
  billing_contact_id: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
