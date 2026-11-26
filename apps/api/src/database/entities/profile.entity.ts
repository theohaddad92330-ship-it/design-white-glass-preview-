import type {
  AuditMoveDecisions,
  EntryStrategy,
  ProfileContext,
  ProfileContextCorrections,
  ProfileContextStatus,
  SourceHealth,
} from '@bellum/contracts'
import { Column, CreateDateColumn, Entity, Generated, PrimaryColumn, UpdateDateColumn } from 'typeorm'

/**
 * Identity row shared 1-to-1 with `auth.users`. `user_id` is the natural key
 * (PK + FK to auth.users); `id` is a separate public-facing surrogate that
 * we can expose in URLs without leaking the auth UUID.
 */
@Entity({ name: 'profiles' })
export class ProfileEntity {
  @Column('uuid', { unique: true })
  @Generated('uuid')
  id: string

  @PrimaryColumn('uuid')
  user_id: string

  @Column('text', { nullable: true, unique: true })
  email: string | null

  @Column('text', { nullable: true })
  first_name: string | null

  @Column('text', { nullable: true })
  last_name: string | null

  @Column('text', { nullable: true })
  avatar_url: string | null

  /** Signature e-mail réelle de l'utilisateur, saisie dans Réglages. NULL = non
   *  renseignée : on lit alors celle du fournisseur, et à défaut le brouillon
   *  part sans signature — jamais avec un marque-place (garde-fou n°2). */
  @Column('text', { nullable: true })
  email_signature: string | null

  /** Quel agenda Bellum lit pour cet utilisateur — fournisseur et identifiant
   *  chez ce fournisseur. NULL = aucun choix : on lit l'agenda par défaut du
   *  compte. Le choix vit ici et non dans le navigateur, parce que le brief du
   *  jour et les routines se calculent côté serveur : deux endroits pour la
   *  même préférence, ce sont deux journées différentes pour le même homme. */
  @Column('text', { nullable: true })
  agenda_provider: string | null

  @Column('text', { nullable: true })
  agenda_calendar_id: string | null

  /** Les agendas lus, au pluriel — la vraie réponse pour la plupart des gens :
   *  le sien ET celui de l'équipe, mais pas les jours fériés. NULL ou liste
   *  vide = aucun choix explicite : on lit l'agenda par défaut du compte.
   *  Les colonnes `agenda_provider` / `agenda_calendar_id` ci-dessus sont
   *  l'ancienne forme (un seul agenda) : elles ne sont plus lues, et elles
   *  sont remises à NULL à chaque nouveau choix pour qu'aucun code ne puisse
   *  un jour répondre deux choses différentes à la même question. */
  @Column('jsonb', { nullable: true })
  agenda_calendar_ids: Array<{ provider: string; calendarId: string }> | null

  /** Lire TOUS les agendas lisibles au lieu d'un seul. Une colonne à part et
   *  non une valeur sentinelle dans `agenda_calendar_id` : un identifiant
   *  d'agenda est opaque et vient du fournisseur — y glisser une valeur maison
   *  finirait par entrer en collision avec un vrai identifiant. */
  @Column('boolean', { default: false })
  agenda_read_all: boolean

  /** LE FUSEAU DE CETTE PERSONNE, nom IANA (décision Louis, 14/09/2026).
   *
   *  `NULL` = INCONNU, et pas « Paris ». C'est le cœur de la décision : un
   *  défaut en base aurait rendu « cette personne a choisi Paris »
   *  indiscernable de « personne n'a rien choisi », donc impossible de
   *  proposer le fuseau détecté par le navigateur sans risquer d'écraser un
   *  choix humain — et une correction humaine gagne toujours.
   *
   *  Qui le LIT : `ChatContextService.resolveTimezone`, qui le fait voyager
   *  jusqu'au bloc de date du prompt de Laura (`current_time_block`). Inconnu
   *  ⇒ clé omise sur le fil ⇒ fuseau de RÉFÉRENCE nommé du produit
   *  (`REFERENCE_TIMEZONE`), jamais UTC ni une devinette. */
  @Column('varchar', { length: 64, nullable: true })
  timezone: string | null

  /** Refreshed by the Profiler after every esn_profiles save. */
  @Column('jsonb', { nullable: true })
  profile_context: ProfileContext | null

  /**
   * #2012.12 (épopée #2776) — statut par source FACULTATIVE du Profileur
   * (`ok`/`degraded`/`down`/`skipped`), posé par `ProfilerAgent` sur
   * `AgentMeta.source_health` et jusque-là jeté à la frontière API. Colonne
   * SÉPARÉE de `profile_context` : `meta` et `data` sont deux objets
   * distincts sur l'enveloppe, jamais mélangés. `NULL` = aucun signal encore
   * posé (comportement d'avant, inchangé).
   */
  @Column('jsonb', { nullable: true })
  source_health: Record<string, SourceHealth> | null

  @Column('text', { default: 'not_generated' })
  profile_context_status: ProfileContextStatus

  /** #4969 — le CODE court de la dernière panne de génération (jamais un message d'erreur). `NULL` hors `failed`. */
  @Column('text', { nullable: true })
  profile_context_failure_reason: string | null

  /** Set when the user validates the generated context (status `validated`). */
  @Column('timestamptz', { nullable: true })
  profile_context_validated_at: Date | null

  /**
   * #2010.17 — le `profile_context_version` (colonne juste en dessous) que
   * portait la ligne AU MOMENT du clic « Valider ». Distinct de
   * `profile_context_validated_at` (LA date, effacée à chaque régénération,
   * migration `1796000668903-ProfileContextLastValidatedVersion.ts`) : cette
   * colonne SURVIT à une régénération qui écrase `profile_context` /
   * `profile_context_version` en place, c'est précisément ce qui permet de
   * retrouver, pendant une revue en cours (`to_review`), QUELLE ancienne
   * révision (`profile_context_revisions`) était la dernière validée —
   * jamais deviné par sa position dans la liste (#2010.6 ne dérive que
   * « actuelle vs remplacée », pas « laquelle était validée »). `null` tant
   * qu'aucune validation n'a jamais eu lieu.
   */
  @Column('int', { nullable: true })
  last_validated_context_version: number | null

  /** Content revision number of the live `profile_context`; `0` until the
   *  first generation. Each regeneration bumps it and snapshots into
   *  `profile_context_revisions`. */
  @Column('int', { default: 0 })
  profile_context_version: number

  /**
   * #2908 (#2011.4) — la version du dossier d'audit commercial en EMPREINTE
   * DE CONTENU (`commercialAuditVersionOf`), distincte du COMPTEUR
   * `profile_context_version` juste au-dessus : deux générations au contenu
   * identique portent la même empreinte, même si le compteur, lui, a bougé.
   * `NULL` tant qu'aucune génération n'a encore posé d'empreinte.
   */
  @Column('text', { nullable: true })
  commercial_audit_version: string | null

  /** #2009.14 — la clé d'idempotence ({@link
   *  ProfileContextService.generationKey}) qui a produit la DERNIÈRE
   *  génération RÉUSSIE de `profile_context`. Permet à un nouveau
   *  déclenchement sur les MÊMES réponses (même espace, même utilisateur,
   *  même contenu) de réutiliser ce résultat plutôt que de payer le modèle
   *  une seconde fois. `NULL` = jamais généré, ou dernière génération en
   *  échec — les deux cas régénèrent normalement. */
  @Column('text', { nullable: true })
  profile_context_generation_key: string | null

  /** #2073.8 — LA STRATÉGIE D'ENTRÉE CHOISIE, distincte de celle CALCULÉE par
   *  le profileur (`profile_context.idealAccountProfile.entryStrategy`).
   *  `NULL` = aucun choix explicite : le lecteur retombe sur le champ
   *  calculé (une correction humaine gagne toujours, mais tant qu'elle n'a
   *  pas eu lieu il n'y a rien à faire gagner). Colonne SÉPARÉE et non un
   *  partage du champ calculé : celui-ci est réécrit en entier à chaque
   *  régénération du profil, ce qui effacerait un choix logé au même endroit. */
  @Column('text', { nullable: true })
  chosen_entry_strategy: EntryStrategy | null

  /** #2074.16 — les décisions humaines (valider/modifier/écarter) sur les
   *  mouvements d'audit PROPOSÉS (`AuditMove`, packages/contracts/src/
   *  schemas/commercial-audit-moves.ts, verrouillé). Clé JSONB =
   *  `AuditMove.ruleId`. `NULL`/`{}` = aucune décision : le mouvement reste
   *  `propose` (statut dérivé par défaut). Colonne SÉPARÉE de
   *  `profile_context`, jamais réécrite par une régénération — même
   *  précédent que `chosen_entry_strategy` : une correction humaine gagne
   *  toujours. */
  @Column('jsonb', { nullable: true })
  audit_move_decisions: AuditMoveDecisions | null

  /** #2908 (#2010.4) — l'état « corrigé » éditable, champ par champ, du
   *  contexte commercial généré. Clé = un chemin de `PROFILE_CONTEXT_CORRECTABLE_FIELDS`
   *  (packages/contracts). `NULL`/`{}` = aucune correction. Colonne SÉPARÉE de
   *  `profile_context`, jamais réécrite par une régénération — même précédent
   *  que `audit_move_decisions` juste au-dessus : une correction humaine
   *  gagne toujours. */
  @Column('jsonb', { nullable: true })
  profile_context_corrections: ProfileContextCorrections | null

  /** RGPD droit à l'effacement: set when the account is closed and the identity
   *  PII (email/first_name/last_name/avatar) has been scrubbed. NULL = active. */
  @Column('timestamptz', { nullable: true })
  anonymized_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
