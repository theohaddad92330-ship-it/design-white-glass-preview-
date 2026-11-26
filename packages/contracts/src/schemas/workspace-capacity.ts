import { z } from 'zod'
import { SEND_TIMING_WEEKDAYS } from './send-timing.js'

/**
 * LES DEUX RÉGLAGES D'ESPACE — `#2035.10` (marché inversé) / `#2035.11`
 * (charge commerciale), décision de Louis du 18/09/2026.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ #2035.10 / #2035.11 — fusionné le 21/09, deux implémentations concurrentes
 * ─────────────────────────────────────────────────────────────────────────
 * Deux vagues d'intégration lancées en parallèle le 21/09/2026 ont construit
 * ces réglages DEUX FOIS, sans se voir. La vague 2 est partie EN PRODUCTION à
 * 11 h 18 avec `workspace_reverse_market_settings.max_recruiters_shown` et
 * `workspace_commercial_load_settings.max_open_needs` ; la vague 3 portait
 * `enabled` / `response_capacity_per_week` / `max_tracked_accounts` sur une
 * SECONDE paire de tables, renommée `..._capacity_settings` pour coexister.
 *
 * Décision de Louis du 21/09/2026 : **on fusionne en une seule paire**. Les
 * tables qui survivent sont celles de la PRODUCTION — elles portent déjà des
 * données ; les colonnes de la vague 3 les REJOIGNENT par `ADD COLUMN`
 * (migration `1795995017405-WorkspaceSettingsFusion`). Un réglage vit à un
 * seul endroit (GA-26), et `maxOpenNeeds` n'a jamais bougé de sa table.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * `#2035.10` — LE MARCHÉ INVERSÉ
 * ─────────────────────────────────────────────────────────────────────────
 * Trois réglages, un seul écran (`/settings/reverse-market`) :
 * - `enabled` — le marché inversé est-il ouvert pour cet espace ;
 * - `responseCapacityPerWeek` — combien de sollicitations l'espace accepte de
 *   traiter par semaine ;
 * - `maxRecruitersShown` — combien de recruteurs `ReverseMarketService
 *   .forTalent` remonte par consultant (§6.2, `rankRecruiters`).
 *
 * 🔴 LA LIGNE ROUGE : `responseCapacityPerWeek` nomme une CAPACITÉ CONFIGURÉE
 * — ce que l'espace accepte de traiter — **jamais une chance estimée**.
 * Aucune PROBABILITÉ ne s'affiche dans ce produit (refusé six fois). C'est
 * pour ça que ce champ est un ENTIER posé par un administrateur, jamais un
 * pourcentage ni un score calculé.
 *
 * `responseCapacityPerWeek: null` = « non renseigné » — GA-18/GA-19 : une
 * capacité non déclarée ne s'affiche JAMAIS « 0 », qui se lirait « peut
 * traiter zéro sollicitation », l'inverse d'une absence de réglage.
 *
 * `maxRecruitersShown` n'est PAS nullable : la colonne est en production
 * `NOT NULL DEFAULT 10`, et un espace sans ligne lit
 * `DEFAULT_MAX_RECRUITERS_SHOWN` — il y a toujours un nombre de lignes à
 * afficher, « non réglé » n'a pas de sens ici.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * `#2035.11` — LA CHARGE COMMERCIALE ET LA PRIORISATION DES BESOINS
 * ─────────────────────────────────────────────────────────────────────────
 * Ce que le modèle de données porte réellement, et sur quoi ces deux plafonds
 * s'appuient : `accounts.assigned_to` (le commercial qui suit un dossier) et
 * `project_needs.status` (un besoin est ouvert tant que son état n'est pas
 * `staffed`/`lost`/`cancelled`). Aucun autre concept n'est inventé : pas de
 * pondération, pas de score de priorité — ce que la table ne porte pas ne se
 * configure pas ici.
 *
 * `maxTrackedAccounts: null` = « non renseigné » (GA-18/GA-19) : un plafond
 * non déclaré n'est pas zéro dossier. `maxOpenNeeds` est en production
 * `NOT NULL DEFAULT 15` et `OpenNeedsService.list` s'en sert pour reprioriser
 * — il a donc toujours une valeur, celle du code si aucune ligne n'existe.
 */

/** Bornes du réglage — le CHECK SQL de chaque colonne dit la même chose (GA-11/GA-12). */
export const REVERSE_MARKET_RESPONSE_CAPACITY_BOUNDS = { min: 1, max: 500 } as const
/** `workspace_reverse_market_settings_max_recruiters_shown_check` (1-50). */
export const MAX_RECRUITERS_SHOWN_BOUNDS = { min: 1, max: 50 } as const
/** `workspace_commercial_load_settings_max_tracked_accounts_check` (1-500). */
export const COMMERCIAL_LOAD_BOUNDS = { min: 1, max: 500 } as const
/** `workspace_commercial_load_settings_max_open_needs_check` (1-100). */
export const MAX_OPEN_NEEDS_BOUNDS = { min: 1, max: 100 } as const
/**
 * `workspace_commercial_load_settings_weekly_available_hours_check` (1-80).
 * #3245 (reste de #3209.3) — heures commerciales disponibles par semaine.
 */
export const WEEKLY_AVAILABLE_HOURS_BOUNDS = { min: 1, max: 80 } as const

/**
 * Le comportement d'avant ces lots, devenu le défaut d'un espace SANS ligne :
 * l'ancien `REVERSE_MARKET_RECRUITERS_MAX` en dur dans `reverse-market.ts`.
 * Un seul endroit (GA-26) : le service le lit d'ici, l'écran aussi.
 */
export const DEFAULT_MAX_RECRUITERS_SHOWN = 10
/**
 * `OpenNeedsService` ne triait pas du tout par porteur avant #2035.11, ce qui
 * revient à un plafond infiniment haut. On choisit un défaut FINI plutôt
 * qu'« aucune limite », qui rendrait la colonne inutile pour tout espace
 * n'ayant jamais réglé.
 */
export const DEFAULT_MAX_OPEN_NEEDS = 15

const responseCapacity = z
  .number()
  .int()
  .min(REVERSE_MARKET_RESPONSE_CAPACITY_BOUNDS.min)
  .max(REVERSE_MARKET_RESPONSE_CAPACITY_BOUNDS.max)
  .nullable()

const recruitersShown = z.number().int().min(MAX_RECRUITERS_SHOWN_BOUNDS.min).max(MAX_RECRUITERS_SHOWN_BOUNDS.max)

const trackedAccounts = z.number().int().min(COMMERCIAL_LOAD_BOUNDS.min).max(COMMERCIAL_LOAD_BOUNDS.max).nullable()

const openNeeds = z.number().int().min(MAX_OPEN_NEEDS_BOUNDS.min).max(MAX_OPEN_NEEDS_BOUNDS.max)

const weeklyAvailableHours = z
  .number()
  .int()
  .min(WEEKLY_AVAILABLE_HOURS_BOUNDS.min)
  .max(WEEKLY_AVAILABLE_HOURS_BOUNDS.max)
  .nullable()

/**
 * #3289.29 — le jour de la semaine que l'espace IMPOSE à ses relances de cadence. `null`/absent =
 * « non renseigné » : le jour appris (`SendTimingService`) s'applique, sinon le rythme nominal.
 * Mêmes jours que la mesure (`SEND_TIMING_WEEKDAYS`) : un seul vocabulaire (GA-26).
 */
const cadenceWeekday = z.enum(SEND_TIMING_WEEKDAYS).nullable()

/** `GET /workspaces/reverse-market-settings` — l'état en vigueur. */
export const reverseMarketSettingsSchema = z.object({
  enabled: z.boolean(),
  responseCapacityPerWeek: responseCapacity,
  maxRecruitersShown: recruitersShown,
})
export type ReverseMarketSettings = z.infer<typeof reverseMarketSettingsSchema>

/**
 * `PATCH /workspaces/reverse-market-settings`.
 *
 * ⚠️ `undefined` = ne touche pas, `null` (sur la capacité seule) = repasse à
 * « non renseigné ». Un formulaire qui n'envoie que `enabled` ne doit pas
 * effacer la capacité déjà déclarée ni le nombre de recruteurs affichés.
 */
export const updateReverseMarketSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    responseCapacityPerWeek: responseCapacity.optional(),
    maxRecruitersShown: recruitersShown.optional(),
  })
  .strict()
export type UpdateReverseMarketSettings = z.infer<typeof updateReverseMarketSettingsSchema>

/** `GET /workspaces/commercial-load-settings` — l'état en vigueur. */
export const commercialLoadSettingsSchema = z.object({
  maxTrackedAccounts: trackedAccounts,
  maxOpenNeeds: openNeeds,
  weeklyAvailableHours: weeklyAvailableHours,
  cadenceWeekday: cadenceWeekday.optional(),
})
export type CommercialLoadSettings = z.infer<typeof commercialLoadSettingsSchema>

/** `PATCH /workspaces/commercial-load-settings` — même convention `undefined`/`null`. */
export const updateCommercialLoadSettingsSchema = z
  .object({
    maxTrackedAccounts: trackedAccounts.optional(),
    maxOpenNeeds: openNeeds.optional(),
    weeklyAvailableHours: weeklyAvailableHours.optional(),
    cadenceWeekday: cadenceWeekday.optional(),
  })
  .strict()
export type UpdateCommercialLoadSettings = z.infer<typeof updateCommercialLoadSettingsSchema>
