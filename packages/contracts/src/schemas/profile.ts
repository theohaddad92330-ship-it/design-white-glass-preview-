import { z } from 'zod'

/**
 * LE FUSEAU D'UNE PERSONNE EST-IL UN FUSEAU ? (décision Louis, 14/09/2026 —
 * « ajouter un fuseau par utilisateur », contre la recommandation de garder
 * Paris pour tout le monde.)
 *
 * Le seul juge disponible des deux côtés du fil — Node pour l'API, le
 * navigateur pour l'app web — est `Intl` : il porte la base IANA de la
 * plate-forme, il connaît les alias, et il lève `RangeError` sur tout le
 * reste. Une LISTE ÉCRITE À LA MAIN aurait figé la base de 2026 dans un
 * fichier, et une liste de fuseaux périme (un fuseau est renommé, un pays
 * change de règle) : elle aurait fini par refuser un fuseau réel.
 *
 * ⚠️ La validation est ici, à la PORTE, et pas seulement côté écran : c'est
 * elle qui garantit que la colonne ne peut pas contenir une chaîne qu'aucune
 * base de fuseaux ne connaît. Côté service IA, un fuseau illisible retombe
 * sur `REFERENCE_TIMEZONE` (`apps/ia/app/prompts/current_time.py`) — mais un
 * repli n'est pas une raison de laisser entrer n'importe quoi.
 */
export function isSupportedTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

/**
 * Identity row in `public.profiles` (one row per auth user).
 *
 * - `id` — public-facing surrogate (auto-generated, never equals the auth id)
 * - `user_id` — equal to `auth.users.id`, the natural key
 *
 * The legacy `onboarding_data` JSONB and `onboarding_completed` boolean have
 * moved to dedicated tables (`user_onboarding_state`, `esn_profiles`); their
 * schemas live on those tables, not on the profile.
 */
export const userProfileSchema = z.object({
  id: z.string().guid(),
  user_id: z.string().guid(),
  email: z.string().email().nullable(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  /**
   * LE FUSEAU DE CETTE PERSONNE, nom IANA (« Europe/Paris »,
   * « America/Montreal »). `null` = inconnu — et inconnu ne vaut ni UTC ni une
   * devinette : il vaut le fuseau de RÉFÉRENCE nommé du produit
   * (`REFERENCE_TIMEZONE`, `apps/ia/app/prompts/current_time.py`), donc
   * exactement le comportement d'avant ce lot pour qui n'a rien renseigné.
   *
   * Pourquoi une colonne et pas le navigateur : « relance-la demain à 9 h »
   * est résolu par le MODÈLE, dans un tour de `/chat` que le SERVEUR assemble.
   * Un fuseau qui ne vivrait que dans le navigateur ne serait pas là au moment
   * où la date se calcule — et les routines, elles, se déclenchent quand
   * personne n'a d'onglet ouvert.
   */
  timezone: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  /** Mirrored from `auth.users.created_at` — the very first signup timestamp. */
  auth_created_at: z.string().nullable(),
  /** Mirrored from `auth.users.last_sign_in_at` — refreshed on each sign-in.
   *  When equal to `auth_created_at` (or within a few minutes), this is the
   *  user's very first session. */
  auth_last_sign_in_at: z.string().nullable(),
})

// Shape the frontend PUTs to /profiles/me. Each field is optional (partial
// update), but when supplied first_name/last_name must be non-empty — we
// require an identity for every user, no clearing back to null.
export const updateProfileSchema = z
  .object({
    email: z.string().email().nullable(),
    first_name: z.string().min(1, 'Le prénom est obligatoire'),
    last_name: z.string().min(1, 'Le nom est obligatoire'),
    avatar_url: z.string().nullable(),
    /**
     * Le fuseau, CONFIRMÉ ou CORRIGÉ par la personne depuis Réglages › Profil
     * › Identité. Non vide et réellement connu de la base de fuseaux : un nom
     * inventé entrerait sinon en base, et c'est l'écran de Réglages qui
     * afficherait ensuite une valeur que plus rien ne sait lire.
     *
     * `null` est accepté — c'est « je retire mon fuseau », donc le retour
     * assumé au fuseau de référence nommé, jamais un trou silencieux.
     */
    timezone: z.string().min(1).max(64).refine(isSupportedTimeZone, { message: 'Fuseau horaire inconnu' }).nullable(),
  })
  .partial()

export type UserProfile = z.infer<typeof userProfileSchema>
export type UpdateProfile = z.infer<typeof updateProfileSchema>

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/** Body of `POST /profiles/me/email/request-change`. */
export const requestEmailChangeSchema = z.object({
  new_email: z.string().email(),
})
export type RequestEmailChange = z.infer<typeof requestEmailChangeSchema>

/** Body of `POST /profiles/me/email/confirm-change`. Carries the same
 *  `new_email` as the request so the server can re-derive the OTP key. */
export const confirmEmailChangeSchema = z.object({
  new_email: z.string().email(),
  otp: z.string().min(4).max(12),
})
export type ConfirmEmailChange = z.infer<typeof confirmEmailChangeSchema>

/** Response from a successful request-change call. */
export const emailChangeRequestedSchema = z.object({
  status: z.literal('otp_sent'),
  new_email: z.string().email(),
})
export type EmailChangeRequested = z.infer<typeof emailChangeRequestedSchema>

/** Response of `GET /profiles/me/email/pending-change` — the in-flight
 *  email change request, or `null` if none. Used to re-open the OTP modal
 *  on page reload so the user can't bypass verification by refreshing. */
export const pendingEmailChangeSchema = z.object({
  new_email: z.string().email().nullable(),
})
export type PendingEmailChange = z.infer<typeof pendingEmailChangeSchema>
