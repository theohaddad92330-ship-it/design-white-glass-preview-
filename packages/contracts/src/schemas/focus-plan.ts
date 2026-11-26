import { z } from 'zod'
import type { ToolFamily } from './tool-registry.js'

/**
 * #2391 (LAU-FINAL-105) — FOCUS PLAN, TIME BLOCKING ET CAPACITY-AWARE SCHEDULING.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE LOT LIVRE, ET CE QU'IL NE LIVRE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le balayage du 21/09 (registre `chat-lot3`) n'avait trouvé AUCUN outil ni
 * schéma portant ce concept : `list_agenda`/`find_free_slots`
 * (`apps/ia/app/services/chat_tools.py`) lisent l'agenda et trouvent des
 * créneaux libres, mais aucun des deux n'assemble un plan de journée typé, ne
 * respecte une capacité réelle, ni ne crée réellement les blocs.
 *
 * Ce fichier livre le VOCABULAIRE (onze types de blocs, #2391.3-.13) et la
 * FORME de la proposition que `chat_tools.py::propose_focus_plan` construit —
 * mêmes clés, même snake_case (comme `proposeMissionAmendmentActionSchema`,
 * pas `dayClosureSchema` : ce plan est composé PAR l'outil Python à partir
 * d'entrées du modèle et de lectures réelles d'agenda, il n'est pas RELAYÉ
 * depuis un compilateur NestJS).
 *
 * NE livre PAS (retenu, voir le registre) : un réglage « heures de travail »
 * personnalisable (l'outil réutilise les heures ouvrées déjà appliquées par
 * `AgendaService.freeSlots`), une préférence utilisateur dédiée au plan, le
 * rôle de la personne, ni une politique d'équipe — aucune des trois n'a de
 * source réelle dans ce dépôt aujourd'hui, et inventer un réglage qui n'existe
 * nulle part ailleurs violerait « JAMAIS de données fictives ».
 *
 * ⚠️ Mises à jour : #2770.27 — les heures de travail sont le temps protégé
 * réglé ; #2770.28 — les préférences d'agenda (`agenda-preferences.ts`) pèsent
 * sur le budget du plan (`chat_tools.py::_focus_plan_reserve_minutes`), sans
 * nouveau champ ici. Le rôle et la politique d'équipe restent sans source.
 */

/** Les onze types de blocs que Laura peut proposer (#2391.3 à #2391.13). */
export const FOCUS_PLAN_BLOCK_TYPES = [
  /** #2391.3 */
  'meeting_prep',
  /** #2391.4 */
  'call_session',
  /** #2391.5 */
  'account_research',
  /** #2391.6 */
  'enrichment',
  /** #2391.7 */
  'pipeline_review',
  /** #2391.8 */
  'matching',
  /** #2391.9 */
  'consultant_followup',
  /** #2391.10 */
  'admin_tasks',
  /** #2391.11 */
  'follow_ups',
  /** #2391.12 */
  'manager_review',
  /** #2391.13 */
  'data_correction',
] as const
export const focusPlanBlockTypeSchema = z.enum(FOCUS_PLAN_BLOCK_TYPES)
export type FocusPlanBlockType = z.infer<typeof focusPlanBlockTypeSchema>

/**
 * #2391.18 — l'énergie DÉCLARÉE, jamais mesurée ni devinée : présente
 * seulement quand la personne l'a dite dans la conversation (« je suis
 * fatigué aujourd'hui »). `null` = rien dit, le plan applique son ratio par
 * défaut (voir `chat_tools.py::_FOCUS_PLAN_CAPACITY_RATIO`).
 */
export const FOCUS_PLAN_ENERGY_LEVELS = ['low', 'normal', 'high'] as const
export const focusPlanEnergySchema = z.enum(FOCUS_PLAN_ENERGY_LEVELS)
export type FocusPlanEnergy = z.infer<typeof focusPlanEnergySchema>

/** #2391.20 — le niveau de priorité qu'un bloc porte, quand le modèle en donne un. */
export const FOCUS_PLAN_PRIORITIES = ['high', 'normal', 'low'] as const
export const focusPlanPrioritySchema = z.enum(FOCUS_PLAN_PRIORITIES)
export type FocusPlanPriority = z.infer<typeof focusPlanPrioritySchema>

/**
 * #2391.36 — la collision RÉELLE d'un bloc à horaire demandé explicitement
 * avec un évènement déjà présent dans l'agenda lu. `null` pour tout bloc placé
 * automatiquement dans un créneau libre réel : par construction, un bloc placé
 * ainsi n'est JAMAIS en collision (`chat_tools.py` ne le place que dans un
 * créneau que `find_free_slots` a rendu libre).
 */
const focusPlanCollisionSchema = z
  .object({
    title: z.string().min(1),
    start_iso: z.string().min(1),
    end_iso: z.string().min(1),
  })
  .strict()
export type FocusPlanCollision = z.infer<typeof focusPlanCollisionSchema>

/** Un bloc du plan, PLACÉ (avec ses horaires réels) ou en collision assumée. */
export const focusPlanBlockSchema = z
  .object({
    type: focusPlanBlockTypeSchema,
    title: z.string().trim().min(1).max(200),
    /** #2391.21 — la durée ESTIMÉE, en minutes, 5 à 240. */
    duration_minutes: z.number().int().min(5).max(240),
    /** `null` seulement pour un bloc qu'aucun créneau réel n'a pu accueillir
     *  (voir `deferred_blocks` — ce cas n'apparaît PAS dans `blocks`, ce champ
     *  ne devrait donc jamais être `null` ici ; gardé nullable pour ne jamais
     *  faire échouer le parse sur un futur cas non prévu plutôt que perdre le
     *  bloc entier). */
    start_iso: z.string().min(1).nullable(),
    end_iso: z.string().min(1).nullable(),
    /** #2391.2 — la vraie priorité qui justifie ce bloc, jamais du remplissage. */
    priority_reason: z.string().trim().min(1).max(300),
    priority: focusPlanPrioritySchema.nullable(),
    /** #2391.19 — AAAA-MM-JJ, seulement une échéance réellement dite. */
    deadline: z.string().min(1).nullable(),
    /** #2391.22 — le contexte libre que le modèle a posé, jamais inventé. */
    context: z.string().trim().max(500).nullable(),
    collision: focusPlanCollisionSchema.nullable(),
  })
  .strict()
export type FocusPlanBlock = z.infer<typeof focusPlanBlockSchema>

/** #2391.33 — un bloc que la capacité réelle du jour n'a pas pu accueillir. */
const focusPlanDeferredBlockSchema = z
  .object({
    type: focusPlanBlockTypeSchema,
    title: z.string().trim().min(1).max(200),
    /** #2770.35 — `outil_non_branche` : le bloc s'appuie sur un outil que l'espace n'a pas branché. */
    reason: z.enum(['capacite_atteinte', 'echeance_depassee', 'bloc_trop_long', 'outil_non_branche']),
  })
  .strict()
export type FocusPlanDeferredBlock = z.infer<typeof focusPlanDeferredBlockSchema>

/**
 * #2770.35/.36/.37 (#2391.23/.24/.25) — ce que le plan n'a PAS pris en compte,
 * NOMMÉ plutôt que tu. Depuis le 11/10 (décision Louis), l'outil RETIRE `tools`
 * quand il a lu les outils branchés du tour, et `team_policy` quand il a lu la
 * politique d'équipe (saisie ou non) ; `role` reste (déclaré sur le profil, le
 * moteur ne s'en sert pas — c76, #2770.36 NO-GO : il ne changerait que l'ordre).
 */
export const FOCUS_PLAN_UNREAD_SOURCES = ['tools', 'role', 'team_policy'] as const
export type FocusPlanUnreadSource = (typeof FOCUS_PLAN_UNREAD_SOURCES)[number]
const focusPlanUnreadSourcesSchema = z.array(z.enum(FOCUS_PLAN_UNREAD_SOURCES)).optional()

/**
 * #2770.35 (décision Louis 11/10) — les familles d'outils que le plan NOMME quand
 * elles sont branchées (`connected_tools`), et sur lesquelles un bloc candidat peut
 * s'appuyer (`requires_tool`, entrée de l'outil). Sous-ensemble des familles du
 * registre (`toolFamilyValues`, `tool-registry.ts`) — jamais un nom d'éditeur.
 * Copié dans `chat_tools.py::FOCUS_PLAN_TOOL_FAMILIES`.
 */
export const FOCUS_PLAN_TOOL_FAMILIES = [
  'calendar',
  'email',
  'crm',
  'telephony',
] as const satisfies readonly ToolFamily[]
export type FocusPlanToolFamily = (typeof FOCUS_PLAN_TOOL_FAMILIES)[number]

const focusPlanPolicyWindowSchema = z
  .object({
    start_minute: z.number().int().min(0).max(1439),
    end_minute: z.number().int().min(1).max(1440),
    /** #2770.37 — jours ISO de la plage, posés sur le plan de SEMAINE (le plan d'un jour ne liste que ce qui vaut ce jour). */
    weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7).optional(),
  })
  .strict()

/**
 * #2770.37 — la politique d'équipe que le plan a APPLIQUÉE (`team-policy.ts`,
 * relue en snake_case par l'outil). Sur le plan : absente = non lue (pont muet,
 * la source reste dans `unread_sources`) ; `null` = lue, rien saisi (« aucune
 * politique d'équipe saisie ») ; objet = appliquée.
 */
const focusPlanTeamPolicySchema = z
  .object({
    prospecting_windows: z.array(focusPlanPolicyWindowSchema),
    forbidden_windows: z.array(focusPlanPolicyWindowSchema),
    max_meetings_per_day: z.number().int().min(1).nullable(),
    daily_call_target: z.number().int().min(1).nullable(),
  })
  .strict()
export type FocusPlanTeamPolicy = z.infer<typeof focusPlanTeamPolicySchema>

/** #2770.35/.37 — ce que le plan a LU, partagé par le jour et la semaine. */
const focusPlanInputsShape = {
  connected_tools: z.array(z.enum(FOCUS_PLAN_TOOL_FAMILIES)).optional(),
  team_policy: focusPlanTeamPolicySchema.nullable().optional(),
}

/** La proposition entière que la carte de chat affiche. */
export const focusPlanSchema = z
  .object({
    /** AAAA-MM-JJ, le jour planifié. */
    date: z.string().min(1),
    /** #2391.17 — le fuseau RÉELLEMENT applicable (`resolve_applicable_timezone`),
     *  `null` = rien de réglé nulle part, jamais un fuseau deviné. */
    time_zone: z.string().min(1).nullable(),
    energy: focusPlanEnergySchema.nullable(),
    blocks: z.array(focusPlanBlockSchema),
    deferred_blocks: z.array(focusPlanDeferredBlockSchema),
    /** #2391.32 — la marge RÉELLE laissée non planifiée, minutes, jamais négative. */
    margin_minutes: z.number().int().min(0),
    /** #2770.35/.36/.37 — absent d'un plan d'avant ce champ : aucune ligne. */
    unread_sources: focusPlanUnreadSourcesSchema,
    ...focusPlanInputsShape,
    /** #2770.37 — les réunions RÉELLES du jour, comptées seulement quand la politique fixe un plafond ;
     *  absent = non compté (jamais 0). */
    meetings_count: z.number().int().min(0).optional(),
  })
  .strict()
export type FocusPlan = z.infer<typeof focusPlanSchema>

/**
 * #2770.55-.62 — LE PLAN HEBDOMADAIRE : une suite de plans de journée (le même
 * `focusPlanSchema`, jour après jour) + les blocs que la semaine n'a pas pu
 * accueillir. Un jour sans bloc placé n'y figure pas (une absence ne fait pas
 * une ligne) ; `margin_minutes` est le libre non planifié de TOUTE la semaine.
 * Construit par `chat_tools.py::propose_weekly_plan`, jamais relayé de NestJS.
 */
export const focusWeekPlanSchema = z
  .object({
    /** AAAA-MM-JJ, le lundi de la semaine planifiée. */
    week_start: z.string().min(1),
    time_zone: z.string().min(1).nullable(),
    energy: focusPlanEnergySchema.nullable(),
    days: z.array(focusPlanSchema).max(7),
    deferred_blocks: z.array(focusPlanDeferredBlockSchema),
    margin_minutes: z.number().int().min(0),
    unread_sources: focusPlanUnreadSourcesSchema,
    ...focusPlanInputsShape,
  })
  .strict()
export type FocusWeekPlan = z.infer<typeof focusWeekPlanSchema>

/**
 * #2770.49/.50/.51 — LA PORTE D'ÉCRITURE D'UN BLOC DE PLAN DE JOURNÉE.
 *
 * Même principe que `agendaSlotProposalConfirmRequestSchema`
 * (`agenda-slot-proposal.ts`) : le titre et les horaires EXACTS que la carte
 * a montrés, jamais recomposés côté serveur — la carte affiche une
 * PROPOSITION (`propose_focus_plan` n'écrit rien), ce geste explicite est ce
 * qui écrit réellement `[start_iso, end_iso]` dans l'agenda, via
 * `AgendaService.createEvent` (déjà là). N'accepte qu'un bloc RÉELLEMENT
 * placé (`FocusPlanBlock`, jamais un bloc `deferred_blocks` : il n'a pas
 * d'horaires à écrire).
 */
export const confirmFocusPlanBlockRequestSchema = z
  .object({
    type: focusPlanBlockTypeSchema,
    title: z.string().trim().min(1).max(200),
    start_iso: z.string().min(1),
    end_iso: z.string().min(1),
  })
  .strict()
  .refine(input => Date.parse(input.end_iso) > Date.parse(input.start_iso), {
    message: 'end_iso doit être postérieur à start_iso',
    path: ['end_iso'],
  })
export type ConfirmFocusPlanBlockRequest = z.infer<typeof confirmFocusPlanBlockRequestSchema>

/**
 * #2770.52 — L'ANNULATION D'UN BLOC RÉELLEMENT CRÉÉ.
 *
 * `confirmFocusPlanBlockRequestSchema` ci-dessus écrit le bloc et rend
 * `AgendaCreateResult.id` — le SEUL identifiant qui permet de revenir dessus.
 * Ce contrat ne prend que cet identifiant : jamais le titre ni les horaires
 * (qui n'ont plus cours une fois l'évènement créé chez le fournisseur), même
 * principe que `agendaSlotProposalRejectRequestSchema` qui ne prend que la clé
 * nécessaire au geste.
 */
export const cancelFocusPlanBlockRequestSchema = z
  .object({
    event_id: z.string().trim().min(1),
  })
  .strict()
export type CancelFocusPlanBlockRequest = z.infer<typeof cancelFocusPlanBlockRequestSchema>

/**
 * #2770.63/.64/.65 (#2391.51/.52/.53) — LA MESURE POST-BLOC, three états
 * DÉCLARÉS, jamais déduits.
 *
 * Ce que six lots précédents (25→29/09) avaient nommé « aucun champ
 * `block_outcome` trouvé, système entier absent » ne l'est plus en totalité :
 * un bloc RÉELLEMENT créé (`confirmFocusPlanBlockRequestSchema` ci-dessus) a
 * désormais un endroit où porter ce qu'il en est advenu. `résultat` (#2391.54, un texte libre) et `durée réelle` (#2391.55) s'y
 * ajoutent depuis #2770.66/.67, mais TAPÉS par la personne, jamais mesurés —
 * les trois états ci-dessous couvrent ce qu'un simple bouton peut dire sans
 * jamais surveiller (#2391.56 : « mesure jamais intrusive » — un CLIC, rien
 * de déduit de l'agenda ou d'un minuteur).
 */
/** Bornes des deux champs déclarés d'un bloc (#2770.66/.67) — une seule source, l'API et le web les lisent ici. */
export const FOCUS_PLAN_OUTCOME_NOTE_MAX = 500
export const FOCUS_PLAN_ACTUAL_MINUTES_MAX = 1440

export const FOCUS_PLAN_BLOCK_OUTCOMES = ['realized', 'interrupted', 'postponed'] as const
export const focusPlanBlockOutcomeSchema = z.enum(FOCUS_PLAN_BLOCK_OUTCOMES)
export type FocusPlanBlockOutcome = z.infer<typeof focusPlanBlockOutcomeSchema>

/**
 * Même principe que `cancelFocusPlanBlockRequestSchema` : le SEUL identifiant
 * que `confirmFocusPlanBlockRequestSchema` a rendu, jamais le titre ni les
 * horaires. Une correction humaine gagne toujours, quelle que soit sa date —
 * ce geste est donc un UPSERT côté service, pas un « pose une fois pour
 * toutes ».
 */
export const setFocusPlanBlockOutcomeRequestSchema = z
  .object({
    event_id: z.string().trim().min(1),
    outcome: focusPlanBlockOutcomeSchema,
    /**
     * #2770.66 (#2391.54) — « résultat », un texte LIBRE que la personne écrit.
     * Facultatif : le clic seul reste un geste complet. Jamais pré-rempli ni
     * déduit (#2391.56).
     */
    note: z.string().trim().min(1).max(FOCUS_PLAN_OUTCOME_NOTE_MAX).optional(),
    /**
     * #2770.67 (#2391.55) — « durée réelle », en minutes entières, TAPÉE par la
     * personne : jamais lue d'un minuteur ni de l'agenda (#2391.56, « mesure
     * jamais intrusive »).
     */
    actual_minutes: z.number().int().min(1).max(FOCUS_PLAN_ACTUAL_MINUTES_MAX).optional(),
  })
  .strict()
export type SetFocusPlanBlockOutcomeRequest = z.infer<typeof setFocusPlanBlockOutcomeRequestSchema>
