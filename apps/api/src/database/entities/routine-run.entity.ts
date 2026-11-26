import type { RoutineKey } from '@bellum/contracts'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm'

/**
 * Une exécution de routine — la trace qui rend le moteur idempotent ET lisible.
 *
 * `run_key` porte l'unicité : `utilisateur:routine:jour-local`. C'est une CLÉ et
 * pas une horloge, parce que le balayeur passe toutes les quinze minutes et
 * qu'un redémarrage — ou deux replicas — ne doivent pas produire deux envois.
 * L'insertion échoue au second essai plutôt que de dupliquer.
 *
 * `outcome` est écrit en clair et pas en code : quand quelqu'un se demande
 * pourquoi il n'a rien reçu ce matin, il doit lire « aucun fil en attente » et
 * pas `NO_ITEMS`. C'est la moitié « jamais opaque » de l'exigence du rapport.
 *
 * Une exécution qui n'a RIEN produit est quand même écrite. C'est ce qui permet
 * de répondre « la routine a tourné, il n'y avait rien » — la seule réponse qui
 * distingue un silence normal d'une panne.
 */
@Entity({ name: 'routine_runs' })
@Unique('routine_runs_key', ['run_key'])
export class RoutineRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  user_id: string

  @Column('text')
  routine_key: RoutineKey

  /** `utilisateur:routine:AAAA-MM-JJ` en heure locale de l'utilisateur. */
  @Column('text')
  run_key: string

  /** A-t-elle produit une notification ? `false` = elle a tourné, rien à dire. */
  @Column('boolean', { default: false })
  notified: boolean

  /** Ce qui s'est passé, en français lisible. */
  @Column('text')
  outcome: string

  /**
   * #2205.54 — la PREUVE vérifiable de ce que l'exécution a produit, jamais
   * devinée : `NULL` tant qu'aucun exécuteur n'a rien de vérifiable à citer.
   * Voir `RoutineOutcome.proofRef` (`routine-executors.ts`).
   */
  @Column('text', { nullable: true })
  proof_ref: string | null

  /**
   * #2843.20 (lot L13) — le numéro de tentative de CETTE occurrence (1 à 3).
   * Une reprise réécrit la même ligne (jamais une seconde) : l'unicité de
   * `run_key` reste la garde contre le double envoi. Voir `routine-retry.ts`.
   */
  @Column('int', { default: 1 })
  attempt: number

  /** #2843.20 — quand la dernière tentative a commencé (base du délai de reprise). */
  @Column('timestamptz', { nullable: true })
  attempted_at: Date | null

  /**
   * #2843.21/.24 (lot L13) — la durée de l'exécution, en millisecondes.
   * BACK-OFFICE SEUL (arbitrage Louis 31/10, c132) : `RoutinesService.listRuns`
   * ne la relaie jamais au client. `NULL` = non mesurée (ligne antérieure),
   * jamais « 0 ».
   */
  @Column('int', { nullable: true })
  duration_ms: number | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
