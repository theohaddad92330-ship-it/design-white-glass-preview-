import { z } from 'zod'
import { routineChannelSchema, routineKeySchema, routineStatusSchema } from './routines.js'
import { trendPointSchema } from './trend.js'
import { workspaceRoleSchema } from './workspace.js'

/**
 * Manager / Head-of-Sales dashboard (`GET /manager/team-stats`). Consolidated
 * view of a workspace's whole team — per-rep + team-aggregate. Owner/admin only.
 *
 * ## Why the account-ownership fields are OPTIONAL
 *
 * The web (Vercel) and the API (Railway) deploy independently, and the web wins
 * the race by minutes. Every release therefore has a window where the NEW front
 * end talks to the OLD API — measured, not theorised: `/team` fell to the root
 * error boundary in prod while `GET /version` still reported the commit BEFORE
 * the one that added these fields.
 *
 * So "the field the API added in this very release" is genuinely absent from
 * the wire for a few minutes. Modelling it as required is a lie the type system
 * cannot catch (nothing parsed this payload at runtime), and the component paid
 * for it with `data.coverage.unassigned` → `TypeError` → dead screen.
 *
 * Optional here means the consumer MUST handle absence — and handle it
 * honestly: a missing coverage figure is *unknown*, never `0`. Rendering a
 * fabricated zero would break the repo's "jamais de données fictives" rule and
 * tell a manager every account is unassigned.
 */
export const managerMemberStatsSchema = z.object({
  user_id: z.string(),
  name: z.string(),
  email: z.string(),
  // Full RBAC role set — the screen used to hardcode owner/admin/member and
  // rendered the four newer roles as raw untranslated strings.
  role: workspaceRoleSchema,
  accounts: z.number(),
  contacts: z.number(),
  emails_sent: z.number(),
  analyses: z.number(),
  last_activity_at: z.string().nullable(),
  /**
   * Portfolio — accounts explicitly ASSIGNED to this member
   * (`accounts.assigned_to`). Distinct from `accounts`, which counts what they
   * happened to create. A manager reads this one to balance the workload.
   *
   * Optional: absent from an API older than the release that added account
   * ownership. Absent ≠ 0 — render it as unknown.
   */
  assigned_accounts: z.number().optional(),
  /**
   * Assigned accounts with no team activity in the trailing window (see
   * `STALE_ACCOUNT_DAYS`) — "which of my reps is stuck". Never a judgement on
   * the person: it counts accounts, not keystrokes.
   *
   * Optional for the same reason as {@link assigned_accounts}.
   */
  stale_accounts: z.number().optional(),
  /**
   * Crédits d'analyse + d'enrichissement consommés par ce membre (somme des
   * `consume_*` du `credit_ledger`, attribués via `actor_user_id`). Le cockpit
   * manager (restitution V2 §9-10) lit « qui consomme quoi ».
   *
   * Optional pour la même raison de deploy-skew ; absent ≠ 0 → rendu « inconnu ».
   */
  credits_consumed: z.number().optional(),
  /**
   * PROJETS OUVERTS (tout sauf gagné, perdu, endormi)
   * portées par ce membre, rattachées via `accounts.assigned_to`. La maquette
   * p.11 demande « Comptes actifs par propriétaire : comptes · opportunités ·
   * valeur estimée » — les deux premières colonnes existent en base, la
   * troisième non (aucun objet « montant d'affaire » dans le produit), donc
   * elle n'est pas servie plutôt que devinée.
   *
   * Optional pour la même raison de deploy-skew ; absent ≠ 0.
   */
  opportunities: z.number().optional(),
  /** #4158.40 — actions de plan OUVERTES que ce membre porte (déléguées à lui,
   *  sinon son propre plan). Optional (deploy-skew) ; absent ≠ 0. */
  open_actions: z.number().optional(),
  /** #4158.40 — dont échéance dépassée. Optional, même raison. */
  overdue_actions: z.number().optional(),
  /** #4158.40 — traces `user_actions` de ce membre sur la période choisie. */
  period_activity: z.number().optional(),
})

/** An account nobody owns yet — the manager's to-assign queue. */
export const managerUnassignedAccountSchema = z.object({
  id: z.string(),
  company_name: z.string(),
  sector: z.string().nullable(),
  priority_score: z.number().nullable(),
  commercial_status: z.string(),
  created_at: z.string(),
})

/**
 * Détection de doublons de couverture (restitution V2 §10) : un compte travaillé
 * par 2+ commerciaux distincts (activité `user_actions`). Le manager voit tout de
 * suite « deux sales sur le même compte » et peut coordonner. `reps` = les
 * user_id impliqués (le front les mappe vers des noms via `members`).
 */
export const managerDuplicateAccountSchema = z.object({
  account_id: z.string(),
  company_name: z.string(),
  rep_count: z.number(),
  reps: z.array(z.string()),
})

/**
 * Carte de couverture (restitution V2 §10, « idées avancées ») — QUI couvre QUOI.
 *
 * Un segment = une valeur d'un axe (un secteur, un territoire, un persona). Il
 * dit combien la maille pèse, combien personne ne porte, et comment le reste se
 * répartit entre les membres. Un segment dont `owners` est vide est une **zone
 * blanche** : le workspace a des comptes là-dessus, personne n'est dessus.
 *
 * Unité selon l'axe (impossible à unifier sans mentir) : secteurs et
 * territoires comptent des COMPTES, personas des CONTACTS (un persona n'existe
 * qu'au niveau contact). Le front nomme l'unité dans son libellé.
 */
export const managerCoverageOwnerSchema = z.object({
  user_id: z.string(),
  count: z.number(),
})

export const managerCoverageSegmentSchema = z.object({
  /**
   * Libellé BRUT tel que stocké (secteur, ville du siège) ou valeur du
   * `decision_role` pour un persona. Jamais reformulé côté serveur : le front
   * traduit ce qu'il connaît et affiche le reste tel quel.
   */
  label: z.string(),
  total: z.number(),
  /** Part du segment rattachée à des comptes sans responsable. */
  unassigned: z.number(),
  owners: z.array(managerCoverageOwnerSchema),
})

export const managerCoverageMapSchema = z.object({
  sectors: z.array(managerCoverageSegmentSchema),
  territories: z.array(managerCoverageSegmentSchema),
  personas: z.array(managerCoverageSegmentSchema),
})

/**
 * Une action du plan de compte, vue depuis le cockpit manager (maquette p.11,
 * bloc « Actions à traiter (partagées) »). La donnée existait déjà —
 * `action_plan_items.assigned_to` / `due_date` / `execution_status` — mais
 * n'était lisible que compte par compte : l'écran d'équipe ne l'agrégeait pas.
 *
 * `owner_user_id` = le membre dont c'est le plan ; `assigned_to` = le membre à
 * qui l'action a été DÉLÉGUÉE (null = personne). Les deux sont nécessaires pour
 * répondre à « mes actions » ET « déléguées à moi », qui ne sont pas la même
 * question.
 */
export const managerSharedActionSchema = z.object({
  id: z.string(),
  label: z.string(),
  account_id: z.string(),
  company_name: z.string(),
  /** Échéance `YYYY-MM-DD`, ou `null` quand l'action n'en porte pas. */
  due_date: z.string().nullable(),
  /** Échéance dépassée — calculée côté serveur, sur l'horloge du serveur. */
  overdue: z.boolean(),
  owner_user_id: z.string(),
  assigned_to: z.string().nullable(),
})

/**
 * File d'actions partagées. `open` / `overdue` / `delegated` sont les compteurs
 * COMPLETS (le dénominateur), `items` n'en est que la tête : sans le total, un
 * « 12 actions » tronqué mentirait sur la charge réelle de l'équipe.
 */
export const managerSharedActionsSchema = z.object({
  open: z.number(),
  overdue: z.number(),
  delegated: z.number(),
  items: z.array(managerSharedActionSchema),
})

/**
 * Fil « Activité récente » (maquette p.11, colonne droite) — les dernières
 * traces réelles de `user_actions`, workspace-scopées. `action_type` est renvoyé
 * BRUT : le front traduit ce qu'il connaît et affiche le reste tel quel, plutôt
 * que de perdre un événement dont la clé i18n manque.
 */
export const managerActivityEventSchema = z.object({
  id: z.string(),
  user_id: z.string().nullable(),
  action_type: z.string(),
  account_id: z.string().nullable(),
  company_name: z.string().nullable(),
  created_at: z.string(),
})

/**
 * Bloc « Crédits & usage IA » (maquette p.11) — la consommation du CYCLE en
 * cours rapportée à son quota, jamais un nombre nu.
 *
 * MONNAIE UNIQUE : un seul compteur, parce qu'il n'y a plus qu'un seul pool.
 * Une analyse ET un enrichissement débitent la MÊME colonne (`accounts_used`,
 * cf. `CreditsService.consumeEnrichmentCredit`), donc `credits` = `accounts_used`
 * sur `accounts_limit + topup_analyses`. La seconde jauge « Enrichissements »
 * lisait encore `subscriptions.enrichment_credits`, un solde que plus personne
 * ne débite : elle affichait « 0 restant » à côté de 387 crédits disponibles.
 *
 * `by_member` ventile la MÊME fenêtre (`period_start`) : le classement et la
 * jauge partagent leur dénominateur, sinon le manager compare deux périodes
 * sans le savoir. Un membre compte ses deux gestes ensemble — c'est la même
 * monnaie.
 */
export const managerCreditsUsageSchema = z.object({
  period_start: z.string(),
  credits: z.object({ used: z.number(), total: z.number() }),
  by_member: z.array(
    z.object({
      user_id: z.string(),
      credits: z.number(),
    }),
  ),
})

/**
 * Évolution mois en cours vs mois précédent, pour les quatre totaux d'en-tête
 * (maquette p.11 : « 342 emails envoyés » ne dit rien sans « +23 % ce mois »).
 * Deux mois calendaires pleins, comptés sur la date de création de l'objet.
 * `previous` sert de base de comparaison : le front n'affiche un pourcentage
 * que lorsqu'elle est non nulle — sinon il montre le volume brut du mois.
 */
export const managerTrendSchema = z.object({
  accounts: trendPointSchema,
  contacts: trendPointSchema,
  emails_sent: trendPointSchema,
  analyses: trendPointSchema,
})

/**
 * Un rappel du plan de compte à échéance PROCHE (maquette p.11, bloc 7 —
 * « Rappels & agenda »). Même source que la file d'actions partagées
 * (`action_plan_items`), mais vue sous l'angle du calendrier : ce qui tombe dans
 * les jours qui viennent, rangé sous le commercial qui le porte.
 *
 * `holder_user_id` = le porteur RÉEL de l'échéance : le membre à qui l'action a
 * été déléguée (`assigned_to`) sinon le propriétaire du plan (`user_id`). C'est
 * lui que le manager doit relancer, pas forcément l'auteur du plan. `due_date`
 * est TOUJOURS présente ici (le bloc ne liste que des actions datées) — c'est la
 * différence avec la file d'actions, qui accepte les actions sans échéance.
 */
export const managerReminderSchema = z.object({
  id: z.string(),
  label: z.string(),
  account_id: z.string(),
  company_name: z.string(),
  /** Échéance `YYYY-MM-DD`, dans la fenêtre `window_days`. Jamais nulle ici. */
  due_date: z.string(),
  holder_user_id: z.string(),
})

/**
 * Agenda d'équipe (maquette p.11, bloc 7). `window_days` = l'horizon couvert (le
 * front l'affiche pour ne pas laisser croire à un agenda infini) ; `total` = le
 * nombre RÉEL d'échéances dans la fenêtre (le dénominateur), `items` n'en est que
 * la tête — une liste tronquée sans son total mentirait sur la charge à venir.
 */
export const managerAgendaSchema = z.object({
  window_days: z.number(),
  total: z.number(),
  items: z.array(managerReminderSchema),
})

/**
 * Un playbook partagé de l'espace de travail (maquette p.11, bloc 11), lu depuis
 * `library_items` (kinds `playbook` / `method_playbook`). On ne renvoie QUE ce
 * qui existe en base : titre, catégorie, nature. La maquette montre aussi un
 * « taux de réussite » — il n'existe AUCUN compteur d'usage sur `library_items`,
 * donc on ne l'invente pas (règle « jamais de donnée fictive »).
 */
export const managerPlaybookSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string().nullable(),
  /** `playbook` (tactique) ou `method_playbook` (méthode). Renvoyé brut. */
  kind: z.string(),
})

/**
 * Playbooks partagés du workspace. `total` est le décompte complet, `items` la
 * tête de liste affichée (même précaution de troncature que l'agenda).
 */
export const managerPlaybooksSchema = z.object({
  total: z.number(),
  items: z.array(managerPlaybookSchema),
})

/**
 * Pipeline valorisé (cockpit manager §10, bloc « Pipeline partagé ») — un étage
 * du cycle de vie des opportunités avec la somme des montants RÉELLEMENT SAISIS.
 *
 * `amount` ne somme que les `opportunities.estimated_amount` non nuls de l'étage :
 * une opportunité sans montant N'ENTRE PAS dans la somme (elle est comptée à part,
 * cf. {@link managerPipelineValueSchema.without_amount}). `valued_count` = combien
 * portent un montant ; `total_count` = combien il y en a dans l'étage (valorisées
 * ou non). Ne jamais confondre « 0 € saisi » et « aucun montant renseigné ».
 */
export const managerPipelineValueStageSchema = z.object({
  /** L'étape du pipe, valeur brute (`qualified`, `negotiation`…). Le front traduit. */
  stage: z.string(),
  /** Somme des montants SAISIS de l'étape, en euros. 0 si aucun n'est renseigné. */
  amount: z.number(),
  /** Projets de l'étape portant un montant saisi. */
  valued_count: z.number(),
  /** Total d'opportunités de l'étage (valorisées + sans montant). */
  total_count: z.number(),
})

/**
 * Pipeline partagé de l'équipe, valorisé en euros (cockpit manager §10). Le total
 * ne somme QUE des montants saisis par un humain ; `without_amount` compte les
 * opportunités laissées sans montant — elles ne sont jamais forcées à 0 dans le
 * total affiché comme si c'était une valeur (règle « jamais de montant inventé »).
 *
 * ⚠️ Le périmètre est celui des stades ENCORE EN JEU (`LIVE_STAGES`), et c'est
 * la moitié qui manquait jusqu'au 29/08/2026 : la requête n'avait aucun prédicat
 * de stade, si bien que `total_amount` additionnait le signé, le perdu et le
 * dormant à l'ouvert. Un total ne mélange jamais deux statuts — sinon il ne
 * baisse pas quand on gagne, et il monte quand on perd.
 *
 * Optional sur le payload d'équipe (deploy-skew) ; absent = l'API ne sait pas
 * répondre, PAS « pipeline à 0 € » → le front masque le bloc.
 */
export const managerPipelineValueSchema = z.object({
  /** Devise implicite du produit — EUR. Renvoyée pour ne pas la coder en dur côté web. */
  currency: z.string(),
  /** Somme de tous les montants saisis du workspace, en euros. */
  total_amount: z.number(),
  /** Nombre d'opportunités portant un montant saisi. */
  valued_count: z.number(),
  /** Nombre d'opportunités SANS montant — comptées à part, jamais sommées à 0. */
  without_amount: z.number(),
  /** Ventilation par étage de cycle de vie, du plus amont au plus aval. */
  by_stage: z.array(managerPipelineValueStageSchema),
})

/**
 * #2405.6 — UN FAIT DATÉ, JAMAIS UN JUGEMENT.
 *
 * ⚠️ `count`/`days` sont les deux seuls nombres du bloc : jamais un score, un
 * pourcentage ni un rang. L'ordre du tableau suit `members` (l'ordre de
 * l'équipe), jamais un tri par `count` décroissant — trier reviendrait à
 * classer, et #2405.7 interdit le classement entre commerciaux dans ce
 * cockpit. Doctrine : « le rôle change l'ordre, jamais le contenu » — ici
 * c'est l'inverse qui vaut : aucun rôle ne réordonne ce bloc par performance.
 */
export const managerCoachingStaleOpportunitySchema = z.object({
  member_user_id: z.string(),
  member_name: z.string(),
  /** Opportunités LIVE (mêmes stades que `openOpportunitiesByOwner`) sans changement de stade depuis `days`. */
  count: z.number(),
  /** Le seuil appliqué, pas une durée mesurée par opportunité — voir `manager.service.ts`. */
  days: z.number(),
})
export const managerCoachingSchema = z.object({
  stale_opportunities: z.array(managerCoachingStaleOpportunitySchema),
})

/**
 * #2399.8 (axe WORKSPACE) — la vue manager des routines, LECTURE SEULE.
 *
 * `RoutinesController` reste `@PersonalScope` sur la classe : aucune route de
 * ce contrôleur ne sert jamais qu'une autre personne que l'appelant. Cette vue
 * vit donc ici, dans le cockpit déjà gardé par `team:manage` — jamais un
 * second contrôleur `@PersonalScope`-adjacent qui percerait la même porte.
 *
 * « On n'affiche pas ce qu'on n'a pas » (doctrine, Louis 20/09/2026) : `routines`
 * ne liste QUE les abonnements déjà matérialisés (une ligne existe en base pour
 * ce membre) — jamais les 42 clés du catalogue complétées par leur défaut. Un
 * membre qui n'a jamais ouvert Réglages › Routines apparaît avec une liste
 * vide, ce qui est l'état vrai : rien n'a encore été VU, donc rien n'a de
 * réglage à montrer à son manager.
 *
 * Le CORPS des messages ne sort jamais (doctrine) : seuls la clé, le statut, le
 * canal et le résultat de la dernière exécution (texte déjà écrit par
 * `RoutinesService`, jamais le contenu envoyé à un contact) apparaissent.
 */
export const managerRoutineMemberEntrySchema = z.object({
  key: routineKeySchema,
  name: z.object({ fr: z.string(), en: z.string() }),
  status: routineStatusSchema,
  channel: routineChannelSchema,
  lastRunAt: z.string().nullable(),
  lastFailed: z.boolean().optional(),
  nextTriggerAt: z.string().nullable(),
})
export type ManagerRoutineMemberEntry = z.infer<typeof managerRoutineMemberEntrySchema>

export const managerRoutinesMemberSchema = z.object({
  user_id: z.string(),
  routines: z.array(managerRoutineMemberEntrySchema),
})
export type ManagerRoutinesMember = z.infer<typeof managerRoutinesMemberSchema>

export const managerRoutinesOverviewSchema = z.object({
  members: z.array(managerRoutinesMemberSchema),
})
export type ManagerRoutinesOverview = z.infer<typeof managerRoutinesOverviewSchema>

/**
 * #4158.37 / #4158.39 — UNE période pour tout le tableau `/team`, lue depuis
 * l'URL (`?periode=`) et passée telle quelle à l'API. La liste vit ICI, seule
 * (GA-26) : le sélecteur du web et la lecture du contrôleur la lisent tous deux.
 */
export const MANAGER_PERIOD_DAYS = [7, 30, 90] as const
export type ManagerPeriodDays = (typeof MANAGER_PERIOD_DAYS)[number]
export const DEFAULT_MANAGER_PERIOD_DAYS: ManagerPeriodDays = 7

/** Une valeur hors liste (lien trafiqué, ancien favori) retombe sur 7 j —
 *  jamais une fenêtre devinée, jamais un 400 sur un écran de lecture. */
export function parseManagerPeriodDays(raw: unknown): ManagerPeriodDays {
  const value = typeof raw === 'string' ? Number(raw) : raw
  return (MANAGER_PERIOD_DAYS as readonly unknown[]).includes(value)
    ? (value as ManagerPeriodDays)
    : DEFAULT_MANAGER_PERIOD_DAYS
}

/** La fenêtre réellement comptée : `[since, maintenant)` contre `[previous_since, since)`. */
export const managerPeriodSchema = z.object({
  days: z.number(),
  since: z.string(),
  previous_since: z.string(),
})

/** Un comptage sur la période et sur la précédente, de même longueur. Deux
 *  COMPTAGES, donc toujours mesurés — jamais un stock reconstitué. */
export const managerPeriodCountSchema = z.object({
  current: z.number(),
  previous: z.number(),
})

/**
 * #4158.39 — « Pouls de l'équipe » : cinq indicateurs, chacun comparé à la
 * période précédente. Aucun score, aucune probabilité, aucun classement.
 * `meetings_declared` compte les « RDV obtenus » DÉCLARÉS par le commercial
 * (`user_actions.rdv_obtained`) — un geste déclaratif, nommé comme tel à
 * l'écran. `open_needs` compte les besoins APPARUS sur la période (un flux,
 * comparable d'une période à l'autre ; le stock ouvert vit dans `staffing`).
 */
export const managerPulseSchema = z.object({
  analyses: managerPeriodCountSchema,
  actions_done: managerPeriodCountSchema,
  meetings_declared: managerPeriodCountSchema,
  active_accounts: managerPeriodCountSchema,
  open_needs: managerPeriodCountSchema,
})

/** Les trois RAISONS nommées de la revue de pipeline — jamais une note. */
export const MANAGER_PIPELINE_REVIEW_REASONS = ['no_next_step', 'no_activity', 'stuck'] as const
export const managerPipelineReviewReasonSchema = z.enum(MANAGER_PIPELINE_REVIEW_REASONS)

export const managerPipelineReviewItemSchema = z.object({
  opportunity_id: z.string(),
  label: z.string(),
  account_id: z.string(),
  company_name: z.string(),
  /** Étape brute (`qualified`…) — le front traduit. */
  stage: z.string(),
  /** Le responsable du compte ; `null` = personne, et la carte le dit. */
  owner_user_id: z.string().nullable(),
  reasons: z.array(managerPipelineReviewReasonSchema),
  stage_entered_at: z.string(),
  last_activity_at: z.string().nullable(),
})

/**
 * #4158.41 — « Revue de pipeline » : les affaires encore en jeu qui ont
 * besoin d'un geste — sans prochaine étape (aucune action ouverte sur le
 * compte), sans activité depuis `inactivity_days`, bloquées dans leur étape
 * depuis `stuck_days`. `total`/`counts` portent la file COMPLÈTE, `items`
 * n'en est que la tête.
 */
export const managerPipelineReviewSchema = z.object({
  inactivity_days: z.number(),
  stuck_days: z.number(),
  total: z.number(),
  counts: z.object({ no_next_step: z.number(), no_activity: z.number(), stuck: z.number() }),
  items: z.array(managerPipelineReviewItemSchema),
})

/**
 * #4158.42 — besoins ouverts face aux consultants disponibles. « Disponible »
 * = `immediate` ; « bientôt » = `sous_1_mois`. `inconnu` n'est JAMAIS compté
 * disponible (`consultant.ts`).
 */
export const managerStaffingSchema = z.object({
  open_needs: z.number(),
  available_now: z.number(),
  available_soon: z.number(),
})

/** #4158.43 — le fil de la période, sa tête et son total réel. */
export const managerPeriodActivitySchema = z.object({
  total: z.number(),
  items: z.array(managerActivityEventSchema),
})

export const managerTeamStatsSchema = z.object({
  workspace: z.object({
    id: z.string(),
    name: z.string().nullable(),
    member_count: z.number(),
  }),
  totals: z.object({
    accounts: z.number(),
    contacts: z.number(),
    emails_sent: z.number(),
    analyses: z.number(),
  }),
  // Team-wide contact pipeline breakdown by `user_status` (new/contacted/…).
  pipeline: z.array(z.object({ status: z.string(), count: z.number() })),
  members: z.array(managerMemberStatsSchema),
  /**
   * Coverage of the workspace portfolio. `unassigned` is the count of accounts
   * with `assigned_to IS NULL`; `unassigned_sample` is the head of that queue
   * (most recent first) so the manager can act without a second round-trip.
   *
   * Both optional — see the note at the top of this file. When absent, the
   * screen hides the coverage card and the to-assign queue rather than showing
   * a zeroed portfolio: an older API cannot answer "qui porte quoi", and
   * silence is the truthful rendering of that.
   */
  coverage: z
    .object({
      total_accounts: z.number(),
      assigned: z.number(),
      unassigned: z.number(),
    })
    .optional(),
  unassigned_sample: z.array(managerUnassignedAccountSchema).optional(),
  /**
   * Doublons de couverture — comptes touchés par 2+ commerciaux (restitution
   * V2 §10). Optional (deploy-skew) ; absent = la détection n'est pas encore
   * servie par cette API, pas « aucun doublon ». Le front masque l'alerte.
   */
  duplicate_coverage: z
    .object({
      accounts: z.array(managerDuplicateAccountSchema),
    })
    .optional(),
  /**
   * Carte de couverture par secteur / territoire / persona (restitution V2 §10).
   * Optional (deploy-skew, cf. la note en tête de fichier) ; absent = l'API ne
   * sait pas répondre, PAS « aucune couverture » → le front masque la carte.
   */
  coverage_map: managerCoverageMapSchema.optional(),
  /**
   * File d'actions partagées (maquette p.11, bloc 8). Optional (deploy-skew) ;
   * absent = l'API ne sait pas répondre, PAS « aucune action » → le front masque
   * le bloc au lieu d'annoncer une équipe à jour.
   */
  shared_actions: managerSharedActionsSchema.optional(),
  /** Fil d'activité récente (maquette p.11, bloc 6). Optional, même raison. */
  recent_activity: z.array(managerActivityEventSchema).optional(),
  /** Crédits & usage IA du cycle (maquette p.11, bloc 9). Optional, même raison. */
  credits: managerCreditsUsageSchema.optional(),
  /** Évolution mensuelle des totaux d'en-tête. Optional, même raison. */
  trend: managerTrendSchema.optional(),
  /**
   * Rappels & agenda (maquette p.11, bloc 7). Optional (deploy-skew) ; absent =
   * l'API ne sait pas répondre, PAS « aucun rappel » → le front masque le bloc.
   */
  agenda: managerAgendaSchema.optional(),
  /**
   * Playbooks partagés (maquette p.11, bloc 11). Optional, même raison. Absent =
   * masqué, jamais un « aucun playbook » fabriqué par une API plus ancienne.
   */
  playbooks: managerPlaybooksSchema.optional(),
  /**
   * Pipeline partagé valorisé en euros (cockpit manager §10). Optional (deploy-skew) ;
   * absent = l'API ne sait pas répondre, PAS « pipeline vide » → le front masque le bloc.
   */
  pipeline_value: managerPipelineValueSchema.optional(),
  /**
   * #2405.6 — coaching parti d'un fait daté (cockpit manager). Optional
   * (deploy-skew, cf. la note en tête de fichier) ; absent = l'API ne sait
   * pas répondre, PAS « aucune suggestion » → le front masque le bloc.
   */
  coaching: managerCoachingSchema.optional(),
  /**
   * #2399.8 (axe WORKSPACE) — vue manager des routines d'équipe, lecture seule.
   * Optional (deploy-skew, cf. la note en tête de fichier) ; absent = l'API ne
   * sait pas répondre, PAS « aucune routine configurée » → le front masque le
   * bloc plutôt que d'affirmer une équipe sans automatisation.
   */
  routines: managerRoutinesOverviewSchema.optional(),
  // ─── #4158 (lot L7, 14/10) — blocs de période. TOUS optionnels (deploy-skew,
  // note en tête de fichier) : absent = l'API ne sait pas répondre, le front
  // masque le bloc — jamais un zéro fabriqué.
  period: managerPeriodSchema.optional(),
  pulse: managerPulseSchema.optional(),
  pipeline_review: managerPipelineReviewSchema.optional(),
  staffing: managerStaffingSchema.optional(),
  /** #4158.38 — invitations encore valables (`pending`, non expirées). */
  pending_invitations: z.number().optional(),
  /** #4158.38 — collègues onboardés qui attendent la description de l'ESN
   *  (aucune fiche canonique dans l'espace). Des `user_id` de `members`. */
  awaiting_esn_profile: z.array(z.string()).optional(),
  period_activity: managerPeriodActivitySchema.optional(),
})

/** Body of `PATCH /accounts/:id/assign`. `null` releases the account. */
export const assignAccountSchema = z.object({
  assigned_to: z.string().guid().nullable(),
})

export type ManagerMemberStats = z.infer<typeof managerMemberStatsSchema>
export type ManagerUnassignedAccount = z.infer<typeof managerUnassignedAccountSchema>
export type ManagerDuplicateAccount = z.infer<typeof managerDuplicateAccountSchema>
export type ManagerCoverageSegment = z.infer<typeof managerCoverageSegmentSchema>
export type ManagerCoverageMap = z.infer<typeof managerCoverageMapSchema>
export type ManagerSharedActions = z.infer<typeof managerSharedActionsSchema>
export type ManagerActivityEvent = z.infer<typeof managerActivityEventSchema>
export type ManagerCreditsUsage = z.infer<typeof managerCreditsUsageSchema>
export type ManagerTrend = z.infer<typeof managerTrendSchema>
export type ManagerReminder = z.infer<typeof managerReminderSchema>
export type ManagerAgenda = z.infer<typeof managerAgendaSchema>
export type ManagerPlaybook = z.infer<typeof managerPlaybookSchema>
export type ManagerPlaybooks = z.infer<typeof managerPlaybooksSchema>
export type ManagerPipelineValueStage = z.infer<typeof managerPipelineValueStageSchema>
export type ManagerPipelineValue = z.infer<typeof managerPipelineValueSchema>
export type ManagerCoachingStaleOpportunity = z.infer<typeof managerCoachingStaleOpportunitySchema>
export type ManagerCoaching = z.infer<typeof managerCoachingSchema>
export type ManagerTeamStats = z.infer<typeof managerTeamStatsSchema>
export type ManagerPeriod = z.infer<typeof managerPeriodSchema>
export type ManagerPeriodCount = z.infer<typeof managerPeriodCountSchema>
export type ManagerPulse = z.infer<typeof managerPulseSchema>
export type ManagerPipelineReviewReason = z.infer<typeof managerPipelineReviewReasonSchema>
export type ManagerPipelineReviewItem = z.infer<typeof managerPipelineReviewItemSchema>
export type ManagerPipelineReview = z.infer<typeof managerPipelineReviewSchema>
export type ManagerStaffing = z.infer<typeof managerStaffingSchema>
export type ManagerPeriodActivity = z.infer<typeof managerPeriodActivitySchema>
