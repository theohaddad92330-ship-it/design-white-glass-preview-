import { z } from 'zod'

/**
 * Le JOURNAL D'ACCÈS du back-office — qui s'est connecté, quand, d'où (#1671.2).
 *
 * ⚠️ SÉPARÉ DU JOURNAL D'ACTIONS, ET C'EST LA DEMANDE ELLE-MÊME.
 * « UN JOURNAL D'ACCÈS séparé du journal d'actions. » Ce sont deux questions
 * différentes, avec deux rétentions différentes : l'accès répond « qui est
 * entré », l'action répond « qu'a-t-il fait ». Le second est #1666, encore
 * ouvert ; les fusionner rendrait l'un des deux illisible et forcerait la
 * rétention la plus longue sur des données qui n'en ont pas besoin.
 *
 * ⚠️ CE QUE CE JOURNAL NE PORTE PAS. Aucune donnée de client : ni compte
 * consulté, ni contact lu, ni contenu. Il ne parle que des OPÉRATEURS et de
 * leurs entrées. C'est ce qui permet de le garder douze mois sans que la
 * question de la finalité se repose.
 *
 * ⚠️ ORDRE FIGÉ (GA-08) : une valeur ne disparaît jamais, les ajouts vont en
 * fin, et la contrainte SQL `backoffice_access_events_event_check` est élargie
 * AVANT le code qui écrit la valeur (GA-11 / GA-12).
 */
export const BACKOFFICE_ACCESS_EVENTS = [
  /** Une session s'est ouverte : adresse autorisée, mot de passe et code acceptés. */
  'connexion',
  /** Les identifiants ou le code ont été refusés. C'est l'événement que l'alerte compte. */
  'connexion_refusee',
  /** L'adresse n'est pas dans `DM_ALLOWED_EMAILS` — refusée AVANT tout appel à Supabase. */
  'acces_refuse',
  /** Déconnexion explicite. */
  'deconnexion',
  /** Une fenêtre d'enrôlement TOTP a été ouverte pour cette adresse. */
  'enrolement_demarre',
  /** Le second facteur est posé : le compte est protégé à partir de cet instant. */
  'enrolement_confirme',
  /** L'enrôlement a été refusé — fenêtre fermée, facteur déjà posé, ou code faux. */
  'enrolement_refuse',
  /** Un geste a été refusé faute de rôle (la porte des capacités, #1669). */
  'capacite_refusee',
  /** Une adresse masquée a été révélée au clic (#1670.4). */
  'email_revele',
] as const

export const backofficeAccessEventSchema = z.enum(BACKOFFICE_ACCESS_EVENTS)

export type BackofficeAccessEvent = (typeof BACKOFFICE_ACCESS_EVENTS)[number]

/**
 * Ce qu'une entrée du journal porte.
 *
 * ⚠️ `ip`, `userAgent` et `country` sont NULLABLES, et le resteront. Le
 * back-office tourne derrière Vercel, qui les fournit presque toujours — mais
 * « presque » n'est pas « toujours », et une valeur absente reste absente. La
 * remplir par `'inconnu'` ferait d'une lacune un fait, et l'alerte « pays
 * inhabituel » compterait `'inconnu'` comme un pays.
 */
export const backofficeAccessEntrySchema = z.object({
  event: backofficeAccessEventSchema,
  /** L'adresse de l'opérateur. Absente seulement quand l'événement n'en a pas (couche non configurée). */
  actorEmail: z.string().trim().max(320).nullish(),
  /** Le rôle relu dans `DM_ALLOWED_EMAILS` au moment du geste, jamais dans le cookie. */
  actorRole: z.string().trim().max(32).nullish(),
  /** Ce que le refus dit, en un mot — `hors_liste`, `identifiants_refuses`, `mfa_absent`… */
  reason: z.string().trim().max(120).nullish(),
  /** ⚠️ Le DIAGNOSTIC technique (code Supabase, statut), jamais rendu à un écran de connexion. */
  detail: z.string().trim().max(500).nullish(),
  ip: z.string().trim().max(64).nullish(),
  userAgent: z.string().trim().max(500).nullish(),
  /** Le code pays à deux lettres tel que le rendu par le bord — sert à l'alerte « pays inhabituel ». */
  country: z.string().trim().max(8).nullish(),
  /** Ce sur quoi portait le geste, quand l'événement en désigne un (une capacité, un écran). */
  target: z.string().trim().max(200).nullish(),
})

export type BackofficeAccessEntry = z.infer<typeof backofficeAccessEntrySchema>
