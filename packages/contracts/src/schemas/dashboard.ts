import { z } from 'zod'
import { accountListItemSchema } from './account.js'
import { actionHistoryItemSchema, messageSendBreakdownSchema } from './actions.js'
import { completenessSchema } from './completeness.js'
import { trendPointSchema } from './trend.js'
import { marketPathsSchema } from './market-memory.js'

export const dashboardAccountInsightSchema = accountListItemSchema.extend({
  priority_justification: z.string().nullable(),
  recent_signals_count: z.number().int().min(0),
  primary_signal: z.string().nullable(),
})

export const dashboardActionItemSchema = z.object({
  id: z.string(),
  account_id: z.string().guid(),
  company_name: z.string(),
  description: z.string(),
  channel: z.enum(['LinkedIn', 'Email', 'Téléphone']),
  deadline: z.string().nullable(),
})

export const topAccountKpiSchema = z.object({
  id: z.string().guid(),
  company_name: z.string().nullable(),
  priority_score: z.number().nullable(),
})

export const dashboardKpisSchema = z.object({
  total_accounts: z.number().int().min(0),
  completed_accounts: z.number().int().min(0),
  pending_actions: z.number().int().min(0),
  contacts_count: z.number().int().min(0),
  average_priority_score: z.number().int().min(0),
  top_account: topAccountKpiSchema.nullable(),
  weekly: z.object({
    analyses_count: z.number().int().min(0),
    /** Total des envois — toujours servi avec `messages_breakdown`. */
    messages_count: z.number().int().min(0),
    messages_breakdown: messageSendBreakdownSchema,
    streak_days: z.number().int().min(0),
  }),
})

/**
 * Les quatre compteurs du bandeau — et la SEULE tendance qui se recalcule.
 *
 * Trois d'entre eux sont des STOCKS, c'est-à-dire l'état courant d'une chose
 * qu'on écrase en l'écrivant :
 *
 *  · `contacts_to_enrich` — la fiche complétée hier n'est plus comptée
 *    aujourd'hui, et rien ne garde ce qu'elle valait le mois dernier ;
 *  · `new_signals` — les signaux actifs se lisent dans le dernier instantané
 *    d'analyse, qui est REMPLACÉ à chaque relance, jamais fusionné ;
 *  · `actions_to_launch` — les actions vivent dans le JSON `weeks` d'un plan ;
 *    aucune ligne, donc aucune date par action.
 *
 * Aucune fenêtre `FILTER` ne peut retrouver leur mois précédent : leur tendance
 * n'est pas absente par paresse, elle est INEXISTANTE. Le champ n'est donc pas
 * servi — plutôt qu'un zéro qui se lirait « stable ».
 *
 * `accounts_to_process`, lui, compte des lignes DATÉES par leur création : les
 * deux fenêtres se comptent sur la liste que le total affiche, ce qui rend
 * impossible qu'un objet entre dans l'écart sans entrer dans le total.
 */
export const dashboardCockpitKpisSchema = z.object({
  accounts_to_process: z.number().int().min(0),
  new_signals: z.number().int().min(0),
  contacts_to_enrich: z.number().int().min(0),
  actions_to_launch: z.number().int().min(0),
  accounts_trend: trendPointSchema,
})

export const dashboardCockpitChangeSchema = z.object({
  id: z.string(),
  title: z.string(),
  label: z.string(),
  description: z.string(),
  value: z.number().int().min(0),
  action_label: z.string().nullable(),
  action_tab: z
    .enum(['overview', 'contacts', 'organigramme', 'sites', 'veille', 'messages', 'plan', 'evaluation'])
    .nullable(),
  target_account_id: z.string().guid().nullable(),
})

export const dashboardNbaContactSchema = z.object({
  id: z.string().guid(),
  full_name: z.string(),
  title: z.string().nullable(),
  // Photo Apollo réelle (contacts.photo_url) — optionnelle, fallback initiales.
  photo_url: z.string().nullable().optional(),
})

export const dashboardNextBestActionSchema = z.object({
  action: dashboardActionItemSchema,
  account: dashboardAccountInsightSchema.nullable(),
  contact: dashboardNbaContactSchema.nullable(),
  reason: z.string(),
})

export const dashboardCockpitSchema = z.object({
  kpis: dashboardCockpitKpisSchema,
  priority_account: dashboardAccountInsightSchema.nullable(),
  next_best_action: dashboardNextBestActionSchema.nullable(),
  hot_accounts: z.array(dashboardAccountInsightSchema),
  changes: z.array(dashboardCockpitChangeSchema),
})

export const dashboardAccountGroupsSchema = z.object({
  all: z.array(dashboardAccountInsightSchema),
  completed: z.array(dashboardAccountInsightSchema),
  recent: z.array(dashboardAccountInsightSchema),
  hot: z.array(dashboardAccountInsightSchema),
})

export const dashboardWeeklySchema = z.object({
  analyses_count: z.number().int().min(0),
  /** Total des envois — toujours servi avec `messages_breakdown`. */
  messages_count: z.number().int().min(0),
  messages_breakdown: messageSendBreakdownSchema,
  streak_days: z.number().int().min(0),
})

export const dashboardTotalsSchema = z.object({
  total_accounts: z.number().int().min(0),
  completed_accounts: z.number().int().min(0),
  contacts_count: z.number().int().min(0),
  average_priority_score: z.number().int().min(0),
  /**
   * Sur combien de dossiers la moyenne ci-dessus est calculée — tome 7, loi 2,
   * élément n°6 (« calculé sur … »).
   *
   * L'exclusion elle-même est JUSTE et ancienne : un compte sans score n'a pas
   * un score de zéro, donc il sort du dénominateur. Elle était SILENCIEUSE, et
   * c'est ce que ce champ corrige : « 7/10 » sur douze dossiers notés parmi
   * quarante-trois se lisait comme la note de tout le portefeuille.
   *
   * OPTIONNEL, et c'est délibéré : une API livrée avant le web ne casse pas
   * l'écran, qui n'affiche alors simplement aucune phrase de complétude. Un
   * `total` à `null` reste possible ET distinct de l'absence du champ — « je
   * n'ai pas pu compter » n'est pas « je n'ai pas servi le champ ».
   */
  average_priority_score_scope: completenessSchema.optional(),
})

/**
 * ⚠️ PLUS AUCUN LECTEUR DEPUIS LE 04/09/2026 (#1457).
 *
 * Ce schéma était la réponse de `GET /dashboard/kpis`, la route qui nourrissait
 * l'onglet « Équipe » de `/dashboard` — un SECOND cockpit d'équipe, doublon non
 * gardé de `/team`, supprimé avec sa route et son service. Il en va de même pour
 * tout ce qui ne sert qu'ici : `topAccountKpiSchema`, `dashboardKpisSchema`,
 * `dashboardCockpit*`, `dashboardNba*`, `dashboardNextBestActionSchema`,
 * `dashboardAccountGroupsSchema`, `dashboardWeeklySchema`,
 * `dashboardTotalsSchema` et les quatre schémas `dashboardRoi*` plus bas.
 *
 * Ils sont laissés en place à dessein plutôt que supprimés dans le même lot :
 * la décision de Louis portait sur l'ÉCRAN et ses portes, et retirer ce
 * vocabulaire touche des gardes de `contracts` qui n'ont rien à voir avec elle.
 * **Ne pas rebâtir dessus** : un écran qui les réutiliserait ressusciterait une
 * lecture d'espace sans permission. Ce qui reste vivant dans ce fichier est le
 * cockpit PERSONNEL (`personalCockpitResponseSchema`), plus
 * `dashboardAccountInsightSchema` et `dashboardActionItemSchema` qu'il partage.
 */
export const dashboardMetricsResponseSchema = z.object({
  overview: dashboardCockpitSchema,
  accounts: dashboardAccountGroupsSchema,
  actions: z.array(dashboardActionItemSchema),
  weekly: dashboardWeeklySchema,
  totals: dashboardTotalsSchema,
})

/* ------------------------------------------------------------------ */
/*  ROI / feedback loop (Drive backlog #4 — "BellumAI ne sait JAMAIS  */
/*  si ça a marché"). Surfaces the sales funnel + return so a rep      */
/*  sees the outcome. Read-only aggregation over `contacts` — no new   */
/*  tracking: the signal already lives in `contacts.user_status`       */
/*  (funnel), `contacts.email_sent_at` (emails sent from Bellum) and   */
/*  `contacts.created_at`.                                             */
/* ------------------------------------------------------------------ */

/** Snapshot of the sales funnel: current count of contacts in each lifecycle
 *  status. Keys mirror `contactStatusSchema` (new → contacted → replied →
 *  meeting, with refused/silence as terminal states). */
export const dashboardRoiFunnelSchema = z.object({
  new: z.number().int().min(0),
  contacted: z.number().int().min(0),
  replied: z.number().int().min(0),
  meeting: z.number().int().min(0),
  refused: z.number().int().min(0),
  silence: z.number().int().min(0),
})

/** "Ce mois" slice — activity grounded in real timestamps (`created_at` /
 *  `email_sent_at` >= start of the current month). */
export const dashboardRoiThisMonthSchema = z.object({
  contacts_created: z.number().int().min(0),
  emails_sent: z.number().int().min(0),
})

/**
 * Simple funnel conversion ratios (0..1). Snapshot-based per the brief:
 * `reply_rate` = replied / contacted, `meeting_rate` = meeting / replied.
 *
 * ⚠️ `null` = le taux n'est pas DÉRIVABLE, parce que son dénominateur est vide.
 * Il valait `0` auparavant, et l'écran l'écrivait « 0 % » : sur un espace où
 * personne n'a encore été contacté, cela annonçait un échec commercial là où il
 * n'y avait tout simplement rien à diviser. Un dénominateur absent ne fait pas
 * un taux nul — il ne fait pas de taux du tout.
 *
 * Un `0` reste possible et reste VRAI : des contacts contactés, aucune réponse.
 * C'est une mesure, et elle se garde.
 */
export const dashboardRoiConversionSchema = z.object({
  reply_rate: z.number().min(0).nullable(),
  meeting_rate: z.number().min(0).nullable(),
})

export const dashboardRoiResponseSchema = z.object({
  funnel: dashboardRoiFunnelSchema,
  total_contacts: z.number().int().min(0),
  emails_sent: z.number().int().min(0),
  this_month: dashboardRoiThisMonthSchema,
  conversion: dashboardRoiConversionSchema,
})

/* ------------------------------------------------------------------ */
/*  Personal cockpit (roadmap §5 — "Seat value UI"). A per-commercial   */
/*  view scoped STRICTLY to the current user inside their workspace:     */
/*  my accounts, my follow-ups (relances), my priorities, my messages.   */
/*  Distinct from the workspace/team dashboard above — never surfaces a   */
/*  colleague's items. See the `dashboard/me` endpoint.                   */
/* ------------------------------------------------------------------ */

/** A follow-up (relance) that is mine to do: a not-done, dated action-plan
 *  item I own (unassigned) or that a teammate delegated to me. Ordered by
 *  `due_date` ASC so the most urgent surfaces first; `overdue` flags a passed
 *  deadline. `cadence_step` is set for multi-touch relance sequences. */
export const personalRelanceSchema = z.object({
  id: z.string().guid(),
  account_id: z.string().guid(),
  /**
   * Le nom du compte, ou `null` quand il n'y en a pas.
   *
   * `accounts.company_name` est NOT NULL, mais NOT NULL n'interdit pas la chaîne
   * vide : le mappeur écrivait alors « Compte », un nom INVENTÉ, indiscernable
   * d'un vrai compte qui s'appellerait ainsi. La relance, elle, reste due — on
   * ne la jette pas, on dit qu'on ne connaît pas le nom.
   */
  company_name: z.string().nullable(),
  label: z.string(),
  due_date: z.string(),
  overdue: z.boolean(),
  cadence_step: z.enum(['initial', 'relance', 'preuve_sociale', 'close_loop']).nullable(),
  contact_id: z.string().guid().nullable(),
  assigned_to_me: z.boolean(),
})

/** A next-best-action on one of my accounts: the account plus a human reason
 *  (an overdue relance label, else the account's primary signal / priority
 *  justification). `overdue` mirrors the driving relance when there is one. */
export const personalPrioritySchema = z.object({
  account_id: z.string().guid(),
  company_name: z.string(),
  priority_score: z.number().nullable(),
  reason: z.string(),
  overdue: z.boolean(),
  /**
   * De quoi dessiner le logo de l'entreprise, comme partout ailleurs dans le
   * produit : le logo réel quand on l'a, sinon le site dont on tire un favicon,
   * sinon l'initiale. Le cockpit était le seul écran à lister des entreprises
   * sans les montrer — une colonne de noms se parcourt à la lecture, une
   * colonne de logos se reconnaît d'un coup d'œil.
   */
  logo_url: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
})

export const personalCockpitKpisSchema = z.object({
  my_accounts: z.number().int().min(0),
  relances_open: z.number().int().min(0),
  relances_overdue: z.number().int().min(0),
  messages_this_week: z.number().int().min(0),
})

export type TopAccountKpi = z.infer<typeof topAccountKpiSchema>
export type DashboardAccountInsight = z.infer<typeof dashboardAccountInsightSchema>
export type DashboardActionItem = z.infer<typeof dashboardActionItemSchema>
export type DashboardKpis = z.infer<typeof dashboardKpisSchema>
export type DashboardCockpitKpis = z.infer<typeof dashboardCockpitKpisSchema>
export type DashboardCockpitChange = z.infer<typeof dashboardCockpitChangeSchema>
export type DashboardNbaContact = z.infer<typeof dashboardNbaContactSchema>
export type DashboardNextBestAction = z.infer<typeof dashboardNextBestActionSchema>
export type DashboardCockpit = z.infer<typeof dashboardCockpitSchema>
export type DashboardAccountGroups = z.infer<typeof dashboardAccountGroupsSchema>
export type DashboardWeekly = z.infer<typeof dashboardWeeklySchema>
export type DashboardTotals = z.infer<typeof dashboardTotalsSchema>
export type DashboardMetricsResponse = z.infer<typeof dashboardMetricsResponseSchema>
export type DashboardRoiResponse = z.infer<typeof dashboardRoiResponseSchema>
export type PersonalRelance = z.infer<typeof personalRelanceSchema>
export type PersonalPriority = z.infer<typeof personalPrioritySchema>
export type PersonalCockpitKpis = z.infer<typeof personalCockpitKpisSchema>
export type PersonalCockpitResponse = z.infer<typeof personalCockpitResponseSchema>

/* ------------------------------------------------------------------ */
/*  Cockpit personnel — les blocs de RECUL (#1404 → #1411).            */
/*                                                                     */
/*  Le retour #1404 pose la frontière, et tout ce qui suit s'y tient : */
/*  « Aujourd'hui » porte les décisions immédiates, « Messagerie » les  */
/*  échanges à traiter, « Comptes » les dossiers — et CE cockpit porte  */
/*  le recul : trajectoire, couverture, opportunités oubliées.         */
/*  Aucun bloc ci-dessous ne re-liste donc des objets à traiter ; ils   */
/*  MESURENT, puis renvoient vers l'écran qui traite.                  */
/* ------------------------------------------------------------------ */

/**
 * D'où vient un bloc, sur quoi il porte, et de quand il date (#1411).
 *
 * ⚠️ `sources` nomme des CAPACITÉS, jamais des éditeurs. Le retour écrivait
 * « Sources : Gmail + CRM + actions Bellum » ; « Gmail » est un nom d'éditeur,
 * et la doctrine du dépôt l'interdit côté application (seul Réglages ›
 * Intégrations le nomme, parce que l'utilisateur y autorise lui-même l'accès).
 * L'intention — dire d'où sort le chiffre — est livrée ; le mot est corrigé.
 *
 * ⚠️ Une source ABSENTE de la liste n'a pas été lue. C'est ce qui permet à
 * l'écran d'écrire « Non mesurable — CRM non connecté » plutôt qu'un zéro :
 * `value: null` dit qu'on ne sait pas, `sources` dit POURQUOI.
 */
export const cockpitSourceSchema = z.enum(['bellum', 'crm', 'mailbox', 'calendar', 'public_registry'])

export const cockpitProvenanceSchema = z.object({
  /** Les capacités RÉELLEMENT interrogées pour ce bloc. Vide = rien n'a pu l'être. */
  sources: z.array(cockpitSourceSchema),
  /** La fenêtre couverte, en jours. `null` = le bloc est un stock, pas une fenêtre. */
  window_days: z.number().int().positive().nullable(),
  /** Sur combien d'objets le bloc porte. `null` = population non dénombrable. */
  population: z.number().int().min(0).nullable(),
  /** Quand ce bloc a été calculé (ISO 8601). Jamais l'heure du navigateur. */
  computed_at: z.string(),
})

/**
 * Ma trajectoire (#1407, 1re section) — le recul chiffré sur mon activité.
 *
 * ⚠️ CHAQUE MESURE EST `nullable`, ET C'EST LA RÈGLE QUI COMPTE. Un pipe à
 * `null` veut dire « la source n'a pas été lue », jamais « zéro euro » : un
 * commercial qui lit « 0 € de pipe » va chercher ce qu'il a perdu. Zéro reste
 * possible et reste VRAI quand il est mesuré.
 *
 * ⚠️ Le retour demandait « CA signé / produit / facturé / encaissé ». Deux de
 * ces quatre existent en base (`invoice_readiness` porte le facturé et le
 * payé) ; « signé » et « produit » n'ont AUCUN objet porteur dans le produit —
 * ils ne sont donc pas servis plutôt que devinés. C'est la même retenue que
 * `managerMemberStats.opportunities`, qui ne sert pas la « valeur estimée »
 * que sa maquette demandait.
 */
export const cockpitPipelineSchema = z.object({
  /** Σ des montants RÉELLEMENT saisis sur mes affaires ouvertes. */
  amount_euros: z.number().nullable(),
  /** Combien d'affaires sont encore en jeu. */
  open_count: z.number().int().min(0),
  /**
   * Combien d'entre elles portent un montant — le DÉNOMINATEUR de la somme.
   * Sans lui, « 120 k€ sur 30 affaires » laisse croire que les 30 sont
   * chiffrées ; c'est l'invariant « un score n'est jamais nu » appliqué à une
   * somme, et c'est ce que `PipelineValueCard` fait déjà côté équipe.
   */
  valued_count: z.number().int().min(0),
})

export const cockpitTrajectorySchema = z.object({
  pipeline: cockpitPipelineSchema.nullable(),
  missions_active: z.number().int().min(0).nullable(),
  invoiced_euros: z.number().nullable(),
  collected_euros: z.number().nullable(),
  /**
   * L'appelant a-t-il le droit de LIRE les deux montants ci-dessus ?
   *
   * ⚠️ Sans ce drapeau, `null` dirait deux choses à la fois — « on n'a pas pu
   * mesurer » et « ce n'est pas ton périmètre » — et l'écran choisirait la
   * mauvaise moitié du temps. C'est exactement le champ `canReadFinance` que
   * `GET /delivery/invoice-readiness` porte déjà, et pour la même raison : « le
   * champ financier se garde, pas la lecture ».
   *
   * Il existe parce que cette route ne porte QUE `JwtGuard` : sans redaction,
   * elle aurait rendu le facturé et l'encaissé à un `sales` que `/delivery`
   * masque — une porte dérobée par un agrégat, la forme exacte du défaut #1457.
   */
  finance_readable: z.boolean(),
  provenance: cockpitProvenanceSchema,
})

/*
 * ⚠️ « Capacité disponible » (#1407) N'EST PAS SERVIE, et c'est une décision.
 *
 * Deux raisons, chacune suffisante :
 *  · elle n'est pas PERSONNELLE — le vivier est le banc de l'ESN entière, et
 *    #1404 range cet écran du côté du recul personnel ; l'afficher sous « ma
 *    trajectoire » aurait fait lire « ma capacité » un chiffre qui parle de
 *    tout le monde ;
 *  · `GET /consultants` passe par `PlanFeatureGuard`, que cette route-ci ne
 *    porte pas. Servir le compte ici aurait livré la donnée d'un module payant
 *    par une porte qui ne le vérifie pas.
 *
 * Le retour écrivait « capacité disponible SI MESURABLE ». Elle est mesurable ;
 * elle n'est pas lisible d'ici. La nuance est écrite plutôt que devinée.
 */

/**
 * Une anomalie de couverture (#1408) — un compte qui figure ici parce qu'il
 * RÉVÈLE un problème, jamais parce qu'il existe.
 *
 * C'est la phrase du retour, et elle est la seule règle d'admission : « Un
 * compte listé ici doit apparaître parce qu'il révèle un problème de couverture
 * ou une opportunité, pas simplement parce qu'il existe. » D'où `kind`, qui
 * NOMME le problème : sans lui, la liste redeviendrait « Mes comptes » avec un
 * autre titre, c'est-à-dire le doublon que le retour dénonce.
 */
export const cockpitCoverageAnomalyKindSchema = z.enum([
  /** Suivi, mais rien de programmé dessus. */
  'without_next_action',
  /** Aucun échange depuis la fenêtre du bloc. */
  'no_recent_interaction',
  /** Un signal est apparu et personne n'a bougé. */
  'new_signal_untouched',
  /** Au portefeuille, jamais réellement travaillé. */
  'never_worked',
])

export const cockpitCoverageAnomalySchema = z.object({
  account_id: z.string().guid(),
  /** `null` plutôt qu'un nom inventé — même règle que `personalRelance`. */
  company_name: z.string().nullable(),
  kind: cockpitCoverageAnomalyKindSchema,
  /**
   * Depuis quand, quand la question a une réponse datée. `null` = jamais
   * d'interaction du tout, ce qui n'est PAS « depuis 0 jour ».
   */
  since: z.string().nullable(),
  logo_url: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  /**
   * Les parcours observés sur ce compte par la mémoire marché (#1572).
   *
   * `null` = pas de couverture, ou couverture sous le seuil : la ligne reste
   * alors EXACTEMENT ce qu'elle est sans mémoire marché. L'absence est
   * SILENCIEUSE ici — cet écran sert à agir, pas à auditer la donnée — donc pas
   * d'« inconnu », pas de tiret, et surtout jamais « 0 parcours ».
   *
   * ⚠️ `.optional()` et pas seulement `.nullable()` : une API plus ancienne que
   * le web ne l'envoie pas du tout, et un champ neuf lu sans garde casse
   * l'écran pendant toute la durée du déploiement.
   */
  market_paths: marketPathsSchema.optional(),
})

/**
 * Mon portefeuille, lu en COUVERTURE (#1408).
 *
 * ⚠️ Ce bloc remplace la lecture « Mes comptes », dont le retour dit qu'elle
 * fait doublon avec `/comptes` et avec « Aujourd'hui ». Il ne liste pas des
 * comptes : il compte des ÉTATS, puis ne montre que les anomalies.
 *
 * ⚠️ Les deux premiers compteurs réutilisent `ACCOUNT_HYGIENE_PREDICATES` par
 * leur NOM (GA-53) : `/pilotage`, le cockpit et cet écran disent le même
 * chiffre parce qu'ils lisent le même prédicat, jamais une copie.
 */
export const cockpitCoverageSchema = z.object({
  followed: z.number().int().min(0).nullable(),
  without_next_action: z.number().int().min(0).nullable(),
  no_interaction_30d: z.number().int().min(0).nullable(),
  new_signals_7d: z.number().int().min(0).nullable(),
  never_worked: z.number().int().min(0).nullable(),
  /** Trois à cinq, jamais la liste entière — c'est la borne du retour. */
  anomalies: z.array(cockpitCoverageAnomalySchema).max(5),
  provenance: cockpitProvenanceSchema,
})

/**
 * La dynamique relationnelle (#1409) — une SYNTHÈSE, pas une seconde boîte de
 * réception.
 *
 * ⚠️ Aucun corps de message ne voyage ici, et c'est une doctrine, pas une
 * économie de bande passante : le corps d'un message ne sort jamais vers un
 * humain autre que son propriétaire (D65). On compte des fils, on ne les cite
 * pas. « Le détail des emails reste dans Messagerie », dit le retour lui-même.
 */
export const cockpitRelationshipPulseSchema = z.object({
  active_threads: z.number().int().min(0).nullable(),
  /** Des fils où la balle est dans leur camp depuis assez longtemps pour compter. */
  awaiting_reply: z.number().int().min(0).nullable(),
  /** Réponses reçues sur la fenêtre. Jamais un jugement sur leur ton. */
  replies_received: z.number().int().min(0).nullable(),
  accounts_without_interaction: z.number().int().min(0).nullable(),
  provenance: cockpitProvenanceSchema,
})

/**
 * Une preuve de relation passée (#1407, 2e section). Chaque élément porte sa
 * DATE : « Ne jamais inventer une relation passée : source + date obligatoires »
 * est la dernière ligne du retour, et c'est la seule raison d'être de ce type.
 */
export const cockpitDormantEvidenceSchema = z.object({
  kind: z.enum(['proposal_sent', 'contact_known', 'message_exchanged', 'need_open', 'analysis_run']),
  /** De quoi il s'agit — un intitulé d'objet, jamais le corps d'un message. */
  label: z.string().nullable(),
  occurred_at: z.string(),
})

/**
 * Une opportunité à réveiller (#1407, 2e section).
 *
 * ⚠️ « Dormante » est ici un CROISEMENT, jamais un état de cycle de vie. Depuis
 * #2117.21 (Louis, 15/09/2026) la valeur `dormant` (« En veille ») EXISTE, mais
 * elle est DÉCLARÉE par un commercial avec son motif : ce bloc ne la lit pas et
 * ne l'écrit pas. Ce qu'on croise est factuel et daté — une relation qui a
 * existé, un silence qui dure, et parfois un signal neuf. Un compte mis en
 * veille a quelqu'un qui a dit pourquoi ; un compte silencieux n'a que notre
 * absence de nouvelles.
 *
 * ⚠️ `evidence` porte au moins un élément. Un compte sans preuve datée n'est
 * pas une opportunité endormie, c'est un compte dont on ne sait rien : il ne
 * rentre pas dans ce bloc.
 */
export const cockpitDormantOpportunitySchema = z.object({
  account_id: z.string().guid(),
  company_name: z.string().nullable(),
  logo_url: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  evidence: z.array(cockpitDormantEvidenceSchema).min(1),
  /** Dernier échange connu. `null` = aucun, ce qui n'est pas « aujourd'hui ». */
  last_interaction_at: z.string().nullable(),
  /**
   * Le signal RÉCENT qui justifie de rouvrir maintenant. `null` = il n'y en a
   * pas, et le bloc le dit : la raison devient le silence lui-même, pas un
   * événement qu'on aurait inventé pour rendre la carte plus vendeuse.
   */
  new_signal: z
    .object({
      label: z.string(),
      detected_at: z.string(),
    })
    .nullable(),
  /**
   * Les parcours observés sur ce compte par la mémoire marché (#1574.1).
   *
   * Le MÊME champ que sur une anomalie de couverture (#1572), et il se lit de
   * la même façon : `null` = pas de couverture, ou couverture sous le seuil ;
   * l'absence est SILENCIEUSE, jamais « 0 parcours ».
   *
   * ⚠️ Il ne peut RIEN dire de la situation actuelle du compte. Le retour
   * l'écrit en toutes lettres : « ne jamais transformer cette mémoire en
   * prétexte automatique pour contacter le client ». Il augmente un POTENTIEL,
   * il ne fabrique jamais une urgence — c'est pourquoi il ne touche ni au
   * choix du CTA (`new_signal` seul le décide) ni au premier critère du tri.
   *
   * ⚠️ `.optional()` et pas seulement `.nullable()` : une API plus ancienne que
   * le web ne l'envoie pas du tout, et un champ neuf lu sans garde casse
   * l'écran pendant toute la durée du déploiement.
   */
  market_paths: marketPathsSchema.optional(),
})

/**
 * Un point d'une série du cockpit (#1410).
 *
 * ⚠️ `value: null` = AUCUNE mesure ce jour-là, et le tracé doit s'INTERROMPRE.
 * C'est l'invariant « non mesuré n'est pas zéro » appliqué aux graphiques, et
 * `interaction-laws.ts` le nomme comme le trou que rien ne tenait : les
 * primitives `UnknownValue`/`MeasuredValue` le tiennent dans le TEXTE, rien ne
 * le tenait dans une courbe — où un point manquant devient un creux qui se lit
 * comme une chute.
 */
export const cockpitSeriesPointSchema = z.object({
  /** Le début de la maille, en `YYYY-MM-DD`. */
  at: z.string(),
  value: z.number().nullable(),
})

/**
 * Les séries du cockpit (#1410) — servies SEULEMENT quand un historique réel
 * existe.
 *
 * « Si aucune série temporelle fiable n'existe, afficher une synthèse statique
 * plutôt qu'un graphique artificiel » : c'est le retour qui l'écrit, et le
 * champ est donc `nullable`. Une série absente n'est pas une série plate.
 */
export const cockpitSeriesSchema = z.object({
  /** Comptes ayant reçu une action ou une interaction, par semaine. */
  coverage: z.array(cockpitSeriesPointSchema).nullable(),
  /** Messages envoyés, par semaine — la « dynamique commerciale » du retour. */
  outreach: z.array(cockpitSeriesPointSchema).nullable(),
  provenance: cockpitProvenanceSchema,
})

/**
 * Le RECUL du cockpit personnel — tout ce que #1404 range du côté « trajectoire,
 * couverture et opportunités oubliées », par opposition à « Aujourd'hui ».
 *
 * ⚠️ OPTIONNEL au niveau de la réponse : une API plus ancienne que le web n'en
 * sert rien, et l'écran doit alors masquer les blocs plutôt que les zéroter.
 * C'est le même contrat de deploy-skew que `managerStats.coverage`, et c'est ce
 * qui évite le défaut mesuré au lot 6 (« un champ qui change de forme pendant
 * le déploiement ne dégrade pas, il rend `undefined` »).
 */
export const cockpitPerspectiveSchema = z.object({
  trajectory: cockpitTrajectorySchema,
  coverage: cockpitCoverageSchema,
  relationship: cockpitRelationshipPulseSchema,
  dormant: z.array(cockpitDormantOpportunitySchema),
  series: cockpitSeriesSchema,
})

/**
 * La réponse de `GET /dashboard/me`.
 *
 * Définie EN FIN DE FICHIER parce qu'elle compose `cockpitPerspectiveSchema` :
 * un schéma zod est une valeur, pas une déclaration remontée par le compilateur.
 */
export const personalCockpitResponseSchema = z.object({
  kpis: personalCockpitKpisSchema,
  priorities: z.array(personalPrioritySchema),
  relances: z.array(personalRelanceSchema),
  accounts: z.array(dashboardAccountInsightSchema),
  messages: z.array(actionHistoryItemSchema),
  /**
   * Le recul (#1404 → #1411). Absent d'une API plus ancienne que le web : les
   * blocs se MASQUENT alors, ils ne s'affichent pas à zéro.
   */
  perspective: cockpitPerspectiveSchema.optional(),
})

export type CockpitProvenance = z.infer<typeof cockpitProvenanceSchema>
export type CockpitSource = z.infer<typeof cockpitSourceSchema>
export type CockpitTrajectory = z.infer<typeof cockpitTrajectorySchema>
export type CockpitCoverage = z.infer<typeof cockpitCoverageSchema>
export type CockpitCoverageAnomaly = z.infer<typeof cockpitCoverageAnomalySchema>
export type CockpitRelationshipPulse = z.infer<typeof cockpitRelationshipPulseSchema>
export type CockpitDormantOpportunity = z.infer<typeof cockpitDormantOpportunitySchema>
export type CockpitSeriesPoint = z.infer<typeof cockpitSeriesPointSchema>
export type CockpitSeries = z.infer<typeof cockpitSeriesSchema>
export type CockpitPerspective = z.infer<typeof cockpitPerspectiveSchema>
