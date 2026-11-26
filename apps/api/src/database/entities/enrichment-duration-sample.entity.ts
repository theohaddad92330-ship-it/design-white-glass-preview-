import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #2120.57 / #2297.23 — une mesure de durée d'enrichissement RÉEL.
 *
 * Une ligne = un appel `ContactsService.enrichContact` qui n'a PAS levé (succès
 * comme « rien trouvé » — `matched`, `no_new_data`, `newer_data_exists` ou
 * `ambiguous`, tous des RÉPONSES). Un échec technique (timeout, 5xx fournisseur)
 * ne débite rien et n'entre pas ici : sa durée ne dit rien de ce qu'un
 * utilisateur qui obtient une réponse attend réellement.
 *
 * Volontairement ANONYME : pas de `workspace_id`, pas de `user_id`, pas de
 * `contact_id`. C'est une latence du PRODUIT, jamais une donnée d'espace
 * (doctrine `c64_analytique_produit` — l'analytique produit mesure le produit,
 * jamais la personne) : la médiane peut donc agréger tous les espaces sans
 * rien révéler d'aucun d'entre eux. Table API-owned, aucune RLS (même famille
 * que `product_events` / `credit_ledger`).
 */
@Entity({ name: 'enrichment_duration_samples' })
@Index('enrichment_duration_samples_measured_at_idx', ['measured_at'])
export class EnrichmentDurationSampleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** Temps mesuré entre le début et la fin de l'appel d'enrichissement, en ms. */
  @Column('integer')
  duration_ms: number

  /**
   * #2120.57 (b) — mesuré en production le 20/09 : une réponse « rien
   * trouvé » revient quasi instantanément quand un enrichissement qui
   * ABOUTIT prend 30 à 85 s (`contacts.module.ts`) — les deux tombaient dans
   * la même médiane, qui ne répondait donc plus à la question de l'écran
   * (« combien de temps vais-je attendre ? »).
   *
   * `true` = le fournisseur a rendu des coordonnées exploitables (email /
   * téléphone / LinkedIn), `false` = réponse « rien trouvé ». `estimate()`
   * ne prend désormais la médiane que sur `found = true`.
   *
   * NULLABLE, sans défaut : une ligne écrite AVANT cette colonne n'a pas
   * cette distinction — elle reste `NULL`, donc EXCLUE de `estimate()`
   * (`WHERE found = true` n'attrape jamais un NULL). Un fait périmé redevient
   * inconnu, il ne se réécrit pas en `true` deviné.
   */
  @Column('boolean', { nullable: true })
  found: boolean | null

  @Column('timestamptz', { default: () => 'now()' })
  measured_at: Date
}
