import type { ForecastCategory } from '@bellum/contracts'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * Une opportunité matérialisée (restitution V2 §6-7 — « Opportunity Graph »).
 * Base propriétaire : un besoin dérivé d'une analyse, daté, sourcé, avec un cycle
 * de vie que le commercial fait évoluer (nouveau → confirmé → obsolète → …).
 * Voir la migration `1787900000000-Opportunities`.
 */
@Entity({ name: 'opportunities' })
export class ProjectEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** #4295.27 — la demande de signature de cette proposition, retenue à l'envoi (jamais présumée signée). */
  @Column('text', { nullable: true })
  signature_request_id: string | null

  @Column('text', { nullable: true })
  signature_provider: string | null

  @Column('timestamptz', { nullable: true })
  signature_sent_at: Date | null

  /** Le DERNIER statut relu chez l'outil (`pending` | `signed` | `not_found`) et sa date. */
  @Column('text', { nullable: true })
  signature_status: string | null

  @Column('timestamptz', { nullable: true })
  signature_status_at: Date | null

  // Scope équipe (comme accounts/attack_angles). Nullable tant que le
  // roll-out user_id → workspace_id est en cours ; c'est le scope de lecture.
  @Index()
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Index()
  @Column('uuid')
  account_id: string

  /** pain | challenge | program | implication — la nature/provenance du besoin. */
  @Column('text')
  kind: string

  /** Le besoin, en une ligne. */
  @Column('text')
  label: string

  @Column('text', { nullable: true })
  detail: string | null

  /** L'offre ESN rattachée quand l'IA l'a reliée. */
  @Column('text', { nullable: true })
  offer: string | null

  /** Provenance (= `kind` en slice 1 ; enrichissable). */
  @Column('text', { nullable: true })
  source: string | null

  /** Échelle de confiance dérivée de la force de preuve (high/medium/low). */
  @Column('text', { nullable: true })
  confidence: string | null

  @Column('text', { nullable: true })
  urgency: string | null

  /**
   * Montant d'affaire estimé, en euros (devise implicite EUR), saisi par le
   * commercial depuis le détail du besoin (cockpit manager §10 — pipeline
   * valorisé). `null` = jamais renseigné : le pipeline € ne somme que des montants
   * réellement saisis. `numeric` revient en `string` via le driver pg — le service
   * le convertit en nombre à la lecture.
   */
  @Column('numeric', { nullable: true })
  estimated_amount: string | null

  /**
   * ANCIEN cycle (`nouveau | confirme | obsolete | transforme | converti`).
   *
   * Repris UNE fois dans `stage` par la migration `1789344812907`, puis plus
   * jamais lu ni écrit. La colonne reste : deux champs d'état sur le même objet
   * finissent toujours par se contredire, et c'est la contradiction qui casse un
   * rapport — pas une colonne morte.
   */
  @Column('text', { default: 'nouveau' })
  lifecycle_status: string

  /** L'étape courante du projet — LE champ de cycle. Voir `PROJECT_STAGES`. */
  @Index()
  @Column('text', { default: 'detected' })
  stage: string

  /** Depuis quand le projet est à cette étape : ce qui rend « bloqué depuis
   *  40 jours » calculable au lieu d'être deviné. */
  @Column('timestamptz', { default: () => 'now()' })
  stage_entered_at: Date

  /** Porteur du projet. NULL = non attribué — l'état honnête de départ. */
  @Index()
  @Column('uuid', { nullable: true })
  owner_id: string | null

  /**
   * #4158.34 — objet PRIVÉ : visible de son porteur (`owner_id`) et de qui gère
   * l'équipe, d'aucun autre membre (il ne fait alors AUCUNE ligne sur la fiche
   * Contact). Défaut `false` = partagé avec l'espace.
   */
  @Column('boolean', { default: false })
  is_private: boolean

  /**
   * #2172.37 — CE QU'ON CHERCHE À OBTENIR, écrit à la conversion d'une piste.
   *
   * Une phrase, pas un montant : « décrocher 3 rendez-vous avec la DSI ». NULL =
   * aucun objectif écrit, ce qui n'est pas une chaîne vide et surtout pas un
   * objectif deviné depuis le libellé du besoin. Migration `1794120000000`,
   * posée avant ce champ (GA-11 / GA-12).
   */
  @Column('text', { nullable: true })
  objective: string | null

  /** Montant en CENTIMES, forme canonique. NULL = jamais saisi, jamais 0.
   *  `bigint` revient en `string` via le driver pg. */
  @Column('bigint', { nullable: true })
  amount_cents: string | null

  @Column('text', { nullable: true })
  currency: string | null

  /** Clôture ESPÉRÉE (`YYYY-MM-DD`), saisie. Jamais déduite d'un cycle moyen. */
  @Column('date', { nullable: true })
  expected_close_on: string | null

  /** La catégorie DÉCLARÉE par le commercial (L2 Pipe) — une déclaration, pas
   *  une probabilité. `null` = non déclarée. Liste fermée `FORECAST_CATEGORIES`. */
  @Column('text', { nullable: true })
  forecast_category: ForecastCategory | null

  /** Clôture RÉELLE, posée au passage en gagné/perdu. */
  @Column('timestamptz', { nullable: true })
  closed_at: Date | null

  /** won | lost | abandoned. NULL tant que le projet est en jeu. */
  @Column('text', { nullable: true })
  outcome: string | null

  /** Motif de perte, choisi dans le catalogue de l'espace. NULL = personne ne
   *  l'a dit — une information, pas un trou à combler par un défaut. */
  @Column('text', { nullable: true })
  loss_reason: string | null

  /** #3989.9 (Louis 15/10/2026) — le motif de perte, liste FERMÉE commune (`opportunities_loss_reason_code_check`). */
  @Column({ type: 'text', nullable: true })
  loss_reason_code: string | null

  /** #3246 (lot W9) — stratégie d'approche, vocabulaire fermé (`CASE_STRATEGIES`). NULL = non saisie. */
  @Column('text', { nullable: true })
  strategy: string | null

  /** #3246 (lot W9) — modèle d'achat, vocabulaire fermé (`CASE_BUYING_MODELS`). NULL = non saisi. */
  @Column('text', { nullable: true })
  buying_model: string | null

  /** #3246 (lot cloud 14/10) — organisation de la décision, vocabulaire fermé (`CASE_ORGANISATIONS`). NULL = non saisie. */
  @Column('text', { nullable: true })
  organisation: string | null

  /** #2324.37 — les risques identifiés sur l'affaire. NULL = personne ne les a
   *  écrits : l'écran n'en montre aucune ligne. */
  @Column('text', { nullable: true })
  risks: string | null

  /**
   * Qualification BTMMP du besoin (annexe méthodo p21) : budget / timing /
   * mission / management / process / prochaine étape. Chaque axe porte ce que le
   * commercial a APPRIS (texte libre) ; le vide n'est jamais deviné. NULL = besoin
   * non encore qualifié. Migration `1788026719004`. */
  @Column('jsonb', { nullable: true })
  btmmp: {
    budget?: string | null
    timing?: string | null
    mission?: string | null
    management?: string | null
    process?: string | null
    nextStep?: string | null
  } | null

  /** Date de 1re détection — jamais réécrite par une re-matérialisation. */
  @CreateDateColumn({ type: 'timestamptz' })
  first_detected_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
  /** L'entité (division/BU du COMPTE CLIENT, table `account_entities`) qui
   *  porte le besoin. Ajoutée en base par `1789531284416` mais jamais déclarée
   *  ici : la colonne n'était lisible qu'en SQL brut, et un `where` TypeORM
   *  dessus aurait été IGNORÉ en silence. NULL = besoin au niveau groupe. */
  @Column('uuid', { nullable: true })
  entity_id: string | null

  /**
   * Les secteurs d'application RÉELS de cette demande (codes
   * `APPLICATION_SECTORS`) — addendum Stelya §4.1.
   *
   * Vide ≠ « secteur du compte » : un projet sans secteur déclaré n'en a pas, et
   * le matching le DIT au lieu de faire passer le secteur du groupe pour celui
   * de la demande. Un même compte industriel porte « automatisation d'une ligne
   * automobile » et « maintenance nucléaire » ; leur donner le secteur du groupe
   * rend interchangeables deux profils qui ne le sont pas.
   */
  @Column('text', { array: true, default: () => "'{}'" })
  application_sector_codes: string[]

  /** La famille de prestation achetée (code des 66 domaines). NULL = non dit. */
  @Column('text', { nullable: true })
  primary_domain_code: string | null

  /** Le SITE où la demande se porte. NULL = non dit, jamais déduit du siège. */
  @Column('uuid', { nullable: true })
  site_id: string | null

  /** Par où on entre — tome 1 §4. `null` sur un projet antérieur : lui inventer
   *  un mode affirmerait par où l'on est entré chez un client servi depuis deux
   *  ans. */
  @Column('text', { nullable: true })
  access_mode: string | null

  /** Le chemin d'accès : nœuds, relations, source de chaque arête, fraîcheur. */
  @Column('jsonb', { nullable: true })
  access_path: Record<string, unknown> | null

  /** Le score d'adressabilité et ses axes, FIGÉS au moment du calcul — le
   *  besoin peut changer demain, l'explication doit rester celle du jour. */
  @Column('jsonb', { nullable: true })
  addressability: Record<string, unknown> | null

  /**
   * #2171.39 — ARCHIVER, un rangement NEUTRE (même mécanisme que
   * `project_needs.archived_at`, migration `1789704872452`) : `NULL` = active,
   * un horodatage = rangée. `stage`/`outcome` ne bougent JAMAIS pour ce geste
   * — deux champs d'état sur le même objet finiraient par se contredire.
   * Migration `1796321264605`.
   */
  @Column('timestamptz', { nullable: true })
  archived_at: Date | null

  /**
   * #3266.1 — le grain équipe/site/projet de l'opportunité, saisi par le
   * commercial. `NULL` = personne ne l'a écrit, jamais deviné. Migration
   * `1796372014823`.
   */
  @Column('text', { nullable: true })
  scope_label: string | null
}
