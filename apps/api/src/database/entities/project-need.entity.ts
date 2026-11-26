import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { ConvergenceState, RequiredSkill } from '@bellum/contracts'

/**
 * Un rôle recherché À L'INTÉRIEUR d'un projet.
 *
 * C'est ici que « un Projet unique » se paie en clarté : le besoin n'est plus un
 * objet concurrent du projet, c'est une de ses lignes. Un projet « refonte du SI
 * paiement » peut chercher deux architectes et un chef de projet — trois lignes,
 * un seul projet, un seul montant, un seul cycle. Compter les besoins ne gonfle
 * donc plus le pipeline.
 *
 * Table : `project_needs` (migration `1789344812907`).
 */
@Entity({ name: 'project_needs' })
export class ProjectNeedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  /**
   * #2558.1 — un besoin existe sans projet.
   *
   * Le COMPTE est le vrai lien, et le seul qui ne peut pas manquer : un besoin
   * sans compte n'a aucun sens. Jusqu'au 18/09/2026 ce lien n'existait pas en
   * propre — on remontait au compte par `project_id → opportunities.account_id`,
   * ce qui rendait le projet obligatoire pour une raison qui n'était pas la
   * sienne. La majorité des missions d'ESN ne produisent aucun signal public
   * (retour bêta François Thomas, 17/09/2026) : les attacher à un projet
   * inventé, c'était fabriquer de la donnée vide.
   *
   * `NOT NULL` en base (migration `1795711263408`) — c'est l'invariant qui
   * REMPLACE celui qu'on a retiré de `project_id`, pas une contrainte de moins.
   */
  @Index()
  @Column('uuid')
  account_id: string

  /**
   * Le projet, quand il y en a un. `null` = ce besoin n'appartient à aucun
   * projet, et c'est un ÉTAT VALIDE — pas une donnée manquante à compléter.
   * Nullable depuis la migration `1795711263408` (#2558.1).
   */
  @Index()
  @Column('uuid', { nullable: true })
  project_id: string | null

  @Column('text')
  title: string

  /** Les compétences demandées, avec leur caractère éliminatoire. Jamais un
   *  niveau normalisé : aucune échelle commune ne survit à deux clients. */
  @Column('jsonb', { default: () => "'[]'::jsonb" })
  skills: RequiredSkill[]

  @Column('text', { nullable: true })
  seniority: string | null

  /** Jamais 0 : un poste à zéro personne se lirait « rien à faire ». */
  @Column('integer', { default: 1 })
  headcount: number

  /** TJM cible en CENTIMES. NULL = non communiqué, jamais 0. */
  @Column('bigint', { nullable: true })
  target_tjm_cents: string | null

  @Column('date', { nullable: true })
  start_on: string | null

  @Column('integer', { nullable: true })
  duration_months: number | null

  @Column('text', { nullable: true })
  location: string | null

  /** #2173.29 — `sur_site` | `hybride` | `full_remote` | `indifferent`, les
   *  mêmes quatre valeurs que `consultants.remote_preference` (GA-26). `null`
   *  = personne ne l'a dit, jamais un défaut `sur_site`. Migration
   *  `1789759782176-NeedRemote.ts`. */
  @Column('text', { nullable: true })
  remote: string | null

  /** Langues exigées par le poste. Vide = le besoin n'en demande pas, et l'axe
   *  sort du dénominateur plutôt que de valoir zéro. */
  @Column('jsonb', { default: () => "'[]'::jsonb" })
  languages: { code: string; level: string | null }[]

  /** Habilitations exigées. Une habilitation manquante BLOQUE : elle ne se
   *  négocie pas comme un TJM. */
  @Column('text', { array: true, default: () => "'{}'" })
  clearances: string[]

  /** regie | forfait | recrutement | inconnu. `inconnu` est un état honnête :
   *  le type de contrat change la marge, on ne le devine pas. */
  @Column('text', { default: 'inconnu' })
  contract_kind: string

  /** #3547 — `staffed` (défaut historique) | `supervised` : le FORFAIT ENCADRÉ,
   *  réalisé par les salariés du client, où les consultants sont facultatifs.
   *  N'existe qu'au forfait (CHECK croisé, migration `1796424913577`). */
  @Column('text', { default: 'staffed' })
  delivery_mode: string

  /** #3547 — framing | supervision | both. `NULL` = non dit, jamais « cadrage ». */
  @Column('text', { nullable: true })
  supervision_role: string | null

  /** #3547 — l'équipe côté client, par un NOMBRE… `NULL` = non renseignée (jamais 0). */
  @Column('integer', { nullable: true })
  client_team_size: number | null

  /** #3547 — …ou par des NOMS. `{}` = non renseignés. */
  @Column('text', { array: true, default: () => "'{}'" })
  client_team_names: string[]

  /** open | staffed | lost | cancelled. */
  /**
   * L'un des onze états du terrain (PDF 2 §7.4). Le défaut est `to_qualify` :
   * un besoin qui vient d'apparaître n'est pas « ouvert » au sens vague, il est
   * à QUALIFIER — et c'est ce mot qui dit à qui il appartient maintenant.
   *
   * `open` et `staffed` restent acceptées par la contrainte mais ne sont plus
   * écrites : la reprise les a converties.
   */
  @Column('text', { default: 'to_qualify' })
  status: string

  /** Le motif de clôture. Obligatoire sur une perte ou une annulation, absent
   *  partout ailleurs — un formulaire à chaque étape se contourne. */
  @Column('text', { nullable: true })
  status_reason: string | null

  /** #3389.13 — la reprise prévue d'une veille (`on_hold`), AAAA-MM-JJ. `null` =
   *  pas de date donnée, jamais une échéance devinée. Migration
   *  `1796414612437-NeedResumeOn.ts`. */
  @Column('date', { nullable: true })
  resume_on: string | null

  @Column('timestamptz', { nullable: true })
  status_changed_at: Date | null

  /** `basse` | `normale` | `haute` | `critique`. `null` = personne ne l'a dite —
   *  un défaut « normale » ferait passer pour un arbitrage ce qui n'est qu'une
   *  absence de réponse. */
  @Column('text', { nullable: true })
  urgency: string | null

  /** L'une des douze sources de création du §7.2. */
  @Column('text', { nullable: true })
  source: string | null

  /** `human` | `connector` | `pipeline` | `model`. Un besoin créé par un
   *  pipeline n'a pas la même autorité qu'un besoin dicté par un client. */
  @Column('text', { nullable: true })
  provenance: string | null

  @Column('timestamptz', { nullable: true })
  detected_at: Date | null

  /** Le DEMANDEUR — la personne qui a exprimé le besoin. */
  @Column('uuid', { nullable: true })
  contact_id: string | null

  @Column('uuid', { nullable: true })
  owner_id: string | null

  /**
   * #4158.34 — objet PRIVÉ : visible de son porteur (`owner_id`) et de qui gère
   * l'équipe, d'aucun autre membre (il ne fait alors AUCUNE ligne sur la fiche
   * Contact). Défaut `false` = partagé avec l'espace.
   */
  @Column('boolean', { default: false })
  is_private: boolean

  /** Budget en CENTIMES, et jamais deviné (§7.3 « Interdits »). */
  @Column('bigint', { nullable: true })
  budget_cents: string | null

  /** Le plancher acceptable, en centimes. Distinct du TJM cible : l'un est ce
   *  qu'on vise, l'autre ce en dessous de quoi on ne descend pas. */
  @Column('bigint', { nullable: true })
  min_tjm_cents: string | null

  @Column('text', { nullable: true })
  expertise: string | null

  @Column('text', { nullable: true })
  context: string | null

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  stack: string[]

  @Column('text', { nullable: true })
  constraints: string | null

  /** #2323.22 — le processus de présentation/recrutement, texte libre —
   *  jamais une énumération de ses étapes (voir `need-presenter-gate.ts`,
   *  packages/contracts). */
  @Column('text', { nullable: true })
  presentation_process: string | null

  /** #2939 (#2174.32) — COMMENT LE CLIENT DÉCIDE en interne (comité, DSI,
   *  validation budgétaire…) — distinct de `presentation_process`, qui porte
   *  le recrutement CÔTÉ ESN. Texte libre, même patron. Migration
   *  `20260927183242-NeedDecisionProcessAndProcurement.ts`. */
  @Column('text', { nullable: true })
  decision_process: string | null

  /** #2939 (#2174.33) — LE DÉCIDEUR : une PERSONNE, jamais une chaîne de
   *  caractères — même forme que `contact_id` ci-dessus. Vérifié CÔTÉ SERVEUR
   *  contre `account_id` avant écriture (`assertContactBelongsToAccount`). */
  @Column('uuid', { nullable: true })
  decision_maker_contact_id: string | null

  /** #2939 (#2174.34) — LES ACHATS : `implique` | `non_implique`, les deux
   *  valeurs déjà nommées par le compilateur de besoin
   *  (`NEED_PROCUREMENT_INVOLVEMENTS`, `need-compilation.ts`, #2322.49) — pas
   *  une troisième échelle jumelle (GA-26). */
  @Column('text', { nullable: true })
  procurement_involvement: string | null

  /**
   * #2323.18 — la porte PRÉSENTER, « accord sur le type de profil » :
   * `unknown` | `agreed` | `not_agreed` — même famille que `staffable`
   * juste en dessous. `unknown` est le défaut et c'est une RÉPONSE — « pas
   * encore demandé au client », jamais un accord ou un refus deviné.
   */
  @Column('text', { default: 'unknown' })
  profile_type_agreement: string

  /**
   * La porte G3 : `unknown` | `yes` | `no` (PDF 2 §7.6).
   *
   * `unknown` est le défaut et c'est une RÉPONSE — « la question n'a pas encore
   * été posée ». La distinguer de « non » compte : l'un se traite, l'autre est
   * tranché.
   */
  @Column('text', { default: 'unknown' })
  staffable: string

  /** Obligatoire sur un « non ». C'est ce motif, et lui seul, qui produit le
   *  taux de besoins refusés PAR CAUSE. */
  @Column('text', { nullable: true })
  staffable_reason: string | null

  @Column('timestamptz', { nullable: true })
  staffable_decided_at: Date | null

  /** `entrant` | `sortant` | `appel_offres` | `apport_affaires` — voir
   *  `NEED_ORIGINS` (`project.ts`) pour la raison du découplage d'avec
   *  `source`, qui mélangeait cet axe avec le CANAL et un mécanisme d'import. */
  @Column('text', { nullable: true })
  origin: string | null

  /** `direct` | `partenaire` | `portage`. */
  @Column('text', { nullable: true })
  channel: string | null

  /** #2323.38 — le nombre d'entretiens du processus, STRUCTURÉ (0-10). `null`
   *  = non renseigné, jamais 0 par défaut. Voir
   *  `packages/contracts/src/schemas/need-contradictions.ts`. */
  @Column('integer', { nullable: true })
  interview_rounds: number | null

  /** #2323.40 — jours de présence sur site exigés par semaine (0-5). `null`
   *  = non renseigné. */
  @Column('integer', { nullable: true })
  onsite_days_per_week: number | null

  /** #2323.41 — le client exclut les freelances sur ce besoin. `null` = non
   *  renseigné, jamais `false` par défaut. */
  @Column('boolean', { nullable: true })
  freelance_excluded: boolean | null

  /** #2323.42 — le budget de la mission est-il validé côté client. `null` =
   *  non renseigné. */
  @Column('boolean', { nullable: true })
  budget_validated: boolean | null

  /** Les certifications EXIGÉES par le poste — distinct des certifications
   *  qu'un CONSULTANT porte sur son profil (`CV_DETECTIONS.certifications`,
   *  côté parsing de CV). Vide = aucune exigée. */
  @Column('jsonb', { default: () => "'[]'::jsonb" })
  required_certifications: string[]

  @Column('timestamptz', { nullable: true })
  deadline_at: Date | null

  // #2173.49 — archiver range, sans toucher au statut
  /**
   * #2173.49 — ARCHIVÉ, PAS UN STATUT. Décision Louis 17/09/2026 : un
   * rangement neutre, `status` ne bouge JAMAIS pour ce geste. Migration
   * `1789704872452-NeedArchive.ts`.
   */
  @Column('timestamptz', { nullable: true })
  archived_at: Date | null

  /**
   * #2952 (#2305.13/.14/.15/.16) — le niveau de convergence SIGNAL → PROJET
   * PLAUSIBLE/CONFIRMÉ → BESOIN DÉTECTÉ/EXPRIMÉ (`ConvergenceState`,
   * `convergence.ts`). `NULL` = jamais évalué — jamais un défaut deviné.
   * Migration `1796321998392-NeedConvergenceState.ts`. Un besoin existe déjà
   * sans projet (`project_id`, #2558.1) : c'est le porteur naturel de cette
   * chaîne, pas une table à inventer.
   */
  @Column('text', { nullable: true })
  convergence_state: ConvergenceState | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date

  /**
   * Import universel (Louis 27/09/2026, migration `1796322824816`) — les
   * colonnes d'un fichier importé qui n'ont AUCUN champ d'accueil, sous leur
   * en-tête d'origine. `{}` = rien d'importé en plus.
   */
  @Column('jsonb', { default: () => "'{}'::jsonb" })
  extra: Record<string, string>
}
