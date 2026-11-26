import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #2448.8 / #2882.11 (épopée #2882) — une mesure RÉELLE de durée et coût d'UN
 * tour de chat déjà terminé, par PALIER de modèle.
 *
 * Pourquoi cette table : « Vérifié estime coût et durée avant le run » ne
 * peut pas s'appuyer sur un chiffre deviné (CLAUDE.md § Code rules, « JAMAIS
 * de donnée fictive ») — aucune table ne convertissait palier → coût/durée
 * avant ce lot (confirmé par onze lots précédents sur #2882). `tier` (le
 * palier RÉELLEMENT choisi, `tier_decision.tier`) est connu dès la fin du
 * tour ; ce journal le rend RÉUTILISABLE comme estimation pour le PROCHAIN
 * tour du même palier, sur le même patron que `enrichment_duration_samples`
 * (#2120.57 / #2297.23).
 *
 * Volontairement ANONYME : pas de `workspace_id`, pas de `user_id`. C'est une
 * latence/un coût du PRODUIT, jamais une donnée d'espace (doctrine
 * `c64_analytique_produit`) — la médiane peut agréger tous les espaces sans
 * rien révéler d'aucun d'entre eux. Table API-owned, aucune RLS (même famille
 * que `enrichment_duration_samples` / `product_events`).
 */
@Entity({ name: 'chat_turn_cost_samples' })
@Index('chat_turn_cost_samples_tier_measured_at_idx', ['tier', 'measured_at'])
export class ChatTurnCostSampleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** Le palier RÉELLEMENT choisi pour ce tour — `fast` ou `deep`, jamais `auto` (déjà résolu à ce stade). */
  @Column('text')
  tier: 'fast' | 'deep'

  /** Temps mesuré entre la réception de la requête et la fin du tour, en ms. */
  @Column('integer')
  duration_ms: number

  /**
   * Somme des lignes TARIFÉES du registre fournisseur de ce tour (`provider_costs`).
   * `NULL` = aucune ligne tarifée cette fois-ci (fournisseurs tous non tarifés) —
   * jamais confondu avec `0`, qui veut dire « aucun fournisseur payant appelé,
   * mesuré ». `numeric` revient en `string` via le driver pg.
   */
  @Column('numeric', { nullable: true })
  cost_usd: string | null

  @Column('timestamptz', { default: () => 'now()' })
  measured_at: Date
}
