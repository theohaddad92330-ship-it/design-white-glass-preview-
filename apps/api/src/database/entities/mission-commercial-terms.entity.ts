import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * Les conditions commerciales d'une mission — la partie réservée à `finance:read`.
 *
 * Table à part et non colonnes de plus sur `missions` : une donnée dont l'accès
 * diffère du reste de la ligne se protège mal quand elle vit dans la même ligne.
 * Séparée, la requête qui la lit est exactement celle qu'on garde.
 */
@Entity({ name: 'mission_commercial_terms' })
@Index(['mission_id'], { unique: true })
export class MissionCommercialTermsEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  mission_id: string

  @Column('uuid', { nullable: true })
  workspace_id: string | null

  /** Centimes. `null` = non renseigné, jamais 0 : aucune formule ne devine un
   *  coût chargé, et un coût moyen produirait une marge fausse. */
  @Column('bigint', { nullable: true })
  loaded_daily_cost_cents: string | number | null

  /** Le CHEMIN par lequel la mission est arrivée (direct / partenaire /
   *  sous-traitance). `unknown` par défaut, et compté À PART : ranger les
   *  inconnues avec le direct fausserait la comparaison qu'on cherche. */
  @Column('text', { default: 'unknown' })
  channel: string

  /** Le client exige un bon de commande avant facturation. */
  @Column('boolean', { default: false })
  requires_po: boolean

  @Column('text', { nullable: true })
  po_number: string | null

  /** La DATE du bon de commande. `null` = non renseignée — un numéro peut être
   *  connu avant sa date, et c'est l'état normal en début de mission. */
  @Column('date', { nullable: true })
  po_issued_on: string | null

  /** #2566.2 — la date jusqu'à laquelle le bon de commande COUVRE. `null` = non
   *  renseignée, jamais présumée expirée. Migration `1795660000000`. */
  @Column('date', { nullable: true })
  po_valid_until: string | null

  /** Le MONTANT du bon de commande, en CENTIMES. `null` = non renseigné, jamais
   *  0 : un bon de commande à 0 € n'existe pas, et confondre les deux ferait
   *  disparaître un bon de commande réel. */
  @Column('bigint', { nullable: true })
  po_amount_cents: string | number | null

  /**
   * Le VOLUME de jours du bon de commande. `null` = non renseigné — c'est ce
   * champ, croisé avec les jours CONSOMMÉS (dérivés de `mission_timesheets`,
   * jamais stockés — GA-26), qui permet la barre de consommation. Sans lui,
   * la barre ne s'affiche PAS : un volume inconnu ne donne pas une barre à
   * 0 %, elle n'existe simplement pas encore.
   *
   * `numeric` et non `integer` : les demi-journées existent déjà sur
   * `mission_timesheets.days`.
   */
  @Column('numeric', {
    nullable: true,
    transformer: { to: (v: number | null) => v, from: (v: string | null) => (v === null ? null : Number(v)) },
  })
  po_volume_days: number | null

  @Column('text', { nullable: true })
  billing_cadence: string | null

  /**
   * La commission de l'intermédiaire, en CENTIMES et par JOUR — la seconde
   * moitié du coût d'une mission passée par un partenaire ou en
   * sous-traitance. Sans elle, la marge de ces missions était surévaluée, et
   * c'est ce chiffre qui alimente la marge par canal.
   *
   * `null` = non renseignée, jamais 0 : « pas de commission » et « on ne sait
   * pas » ne mènent pas à la même décision.
   */
  @Column('bigint', { nullable: true })
  partner_commission_daily_cents: string | number | null

  @Column('integer', { nullable: true })
  notice_days: number | null

  @Column('text', { nullable: true })
  notes: string | null

  /** Le DÉLAI de règlement, en jours — « à 60 jours ». `null` = non renseigné,
   *  jamais 0. Migration `1790981000002`. */
  @Column('integer', { nullable: true })
  payment_terms_days: number | null

  /** Le point de départ du délai — `invoice_date` ou `end_of_month`. Sans lui,
   *  un délai seul ne dit pas quand il commence. Migration `1790981000002`. */
  @Column('text', { nullable: true })
  payment_terms_basis: string | null

  /** #2420 — la SOURCE du coût (`MISSION_COST_SOURCES`). `null` = non déclarée :
   *  le noyau historique s'applique. Migration `1795340000001`. */
  @Column('text', { nullable: true })
  cost_source: string | null

  /** #2420 — devise du TJM et du contrat (ISO 4217). `null` = non renseignée. */
  @Column('text', { nullable: true })
  currency: string | null

  /** #2420 — devise du coût quand elle diffère. `null` = la même que `currency`. */
  @Column('text', { nullable: true })
  cost_currency: string | null

  /** #2420 — la décomposition du coût (`missionCostBreakdownSchema`). `{}` = rien de déclaré. */
  @Column('jsonb', { default: () => "'{}'::jsonb" })
  cost_breakdown: Record<string, unknown>

  /** #2420 — le TJM (centimes) en vigueur quand le coût a été saisi, posé par
   *  le serveur. `null` = inconnu (lignes d'avant le moteur) : pas d'alerte. */
  @Column('bigint', { nullable: true })
  cost_recorded_rate_cents: string | number | null

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
