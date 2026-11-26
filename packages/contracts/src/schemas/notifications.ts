import { z } from 'zod'

/**
 * Les langues d'e-mail servies par le produit.
 *
 * Nommée et exportée depuis le 22/08/2026, même raison que `ACTIVITY_VERDICTS` :
 * elle était écrite en `z.enum([...])` au milieu d'un schéma, donc invisible à
 * GA-12. Deux valeurs seulement, et c'est délibéré — elle NE SUIT PAS
 * `marketLocaleValues`, qui en compte trois : une langue de marché sert à cibler
 * un pays, une langue d'e-mail suppose que les gabarits existent.
 */
export const EMAIL_LANGUAGES = ['fr', 'en'] as const
export const emailLanguageSchema = z.enum(EMAIL_LANGUAGES)

/** Une heure locale `HH:MM` (00:00 – 23:59). */
const quietHourSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':')
  return Number(h) * 60 + Number(m)
}

/**
 * Théo D settings-compte.N1 — `now` tombe-t-il dans la plage de tranquillité ?
 *
 * Lue dans le FUSEAU de la personne (`timeZone`), jamais celui du serveur. Une
 * plage de nuit (21:00 → 07:00) enjambe minuit ; début = fin ne silence rien
 * (une plage vide n'est pas « toute la journée »), et une borne absente non plus.
 */
export function isInQuietHours(
  range: { start: string | null; end: string | null; timeZone: string },
  now: Date,
): boolean {
  if (!range.start || !range.end || range.start === range.end) return false
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: range.timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find(p => p.type === 'minute')?.value ?? '0')
  const current = hour * 60 + minute
  const start = minutesOf(range.start)
  const end = minutesOf(range.end)
  return start < end ? current >= start && current < end : current >= start || current < end
}

/**
 * The notification toggles shown on `/settings/notifications`, each a
 * boolean. Defaults mirror the product's shipped screen (buy signals, the
 * weekly veille digest + both changelog rows on; reminders + weekly summary
 * off).
 */
export const notificationPreferencesSchema = z.object({
  buy_signals: z.boolean(),
  relance_reminders: z.boolean(),
  weekly_summary: z.boolean(),
  // Email digest hebdo de veille (D3) — signaux de la semaine des comptes
  // suivis. #2082.16 — défaut OFF depuis le 15/09/2026 : c'est un ENVOI, et
  // une case cochée d'avance ne vaut pas consentement. L'opt-out reste double
  // (ce toggle OU la suppression list #394), il n'est simplement plus le seul
  // chemin pour ne pas recevoir.
  weekly_digest: z.boolean(),
  // Transparence billing (Théo beta 15/08 — « personne ne doit découvrir un
  // débit a posteriori ») : alerte in-app quand le solde du workspace passe
  // sous ~20 % du quota du plan. Défaut ON ; max 1 par cycle de quota.
  credit_low: z.boolean(),
  // Digest quotidien in-app des actions de plan dont l'échéance est dépassée
  // (addendum p.22). Distinct des « rappels de relance » (opt-in, 1 notif par
  // item + email) : ici UNE notification récapitulative, sans email. Défaut ON.
  action_overdue: z.boolean(),
  // Cadence de veille (restitution V2 §11 — « choix du canal/cadence ») : e-mail
  // digest QUOTIDIEN des signaux de veille des comptes suivis. Opt-in STRICT
  // (défaut OFF) : rien ne part sans que la case ait été cochée. L'envoi réel
  // tourne côté API sous le cron `daily-veille-digest` (06:30 Europe/Paris) ;
  // une journée sans signal ne produit aucun e-mail, jamais un « rien de neuf ».
  watchlist_daily_digest: z.boolean(),
  sidebar_changelog: z.boolean(),
  // Newsletter Changelog : e-mail bimensuel du delta de nouveautés. #2082.16 —
  // défaut OFF depuis le 15/09/2026, même raison que `weekly_digest` : « comme
  // les autres envois produit » décrivait un usage, pas un consentement.
  newsletter_changelog: z.boolean(),
  // Langue dans laquelle partent ces e-mails. Ce n'est pas un interrupteur :
  // c'est la langue d'interface, reportée par la SPA (le serveur n'a aucun
  // autre moyen de la connaître). `null` = pas encore reportée → défaut FR.
  email_language: emailLanguageSchema.nullable(),
  // Théo D settings-compte.N1 — la « plage de tranquillité » : heure locale
  // (HH:MM, dans le fuseau du profil) entre laquelle rien ne SONNE — ni SMS, ni
  // notification du navigateur. La cloche garde tout : c'est l'interruption
  // qu'on retire, pas l'information. `null` = aucune plage.
  quiet_hours_start: quietHourSchema.nullable(),
  quiet_hours_end: quietHourSchema.nullable(),
  // Le plafond de messages PROACTIFS par jour (PDF 6 §7, décision D40). Entre
  // 1 et 5, défaut 3. Ce n'est pas un interrupteur de plus : c'est ce qui
  // empêche les vingt-six routines de parler toutes le même matin, et donc ce
  // qui empêche l'utilisateur de toutes les couper. Les messages au-delà du
  // plafond restent VISIBLES dans le centre d'actions — c'est l'interruption
  // qu'on supprime, pas l'information.
  proactivity_cap: z.number().int().min(1).max(5),
  /**
   * #2082.4/.5/.6 — les trois annonces d'ENGAGEMENT, arrivées le 16/09/2026
   * AVEC leur émetteur, et jamais avant lui.
   *
   * L'ordre a été tranché : l'ÉMETTEUR d'abord, la préférence ensuite. Un
   * interrupteur qui ne commande rien promet un envoi qui n'arrivera jamais —
   * c'est exactement la dette que le docblock de `changelog` nomme quelques
   * lignes plus bas, et la répéter trois fois l'aurait installée.
   *
   * Les trois sont des affichages IN-APP (la cloche), donc rien ne part chez
   * personne : elles ont le droit d'être vraies par défaut, pour la même raison
   * que `action_overdue` — chacune annonce un ENGAGEMENT DÉJÀ PRIS (un
   * rendez-vous qui est dans ton agenda, une mission qui se termine, une
   * réponse que quelqu'un t'a envoyée), jamais une invitation à revenir.
   *
   * 🔴 `client_reply` annonce qu'une réponse est ARRIVÉE — JAMAIS son contenu,
   * ni son objet, ni son expéditeur. D65 : le corps d'un message ne sort pas
   * vers un humain qui n'y a pas droit, et un titre de notification l'exposerait
   * plus largement qu'un corps (aperçu, liste, écran verrouillé).
   */
  meeting_prep: z.boolean(),
  mission_end: z.boolean(),
  client_reply: z.boolean(),
  // Laura Produit parle-t-elle en premier ? (PDF 10, décision D49 : « oui, et
  // c'est important. Une Laura qu'on ne peut pas couper est une Laura qu'on
  // subit. ») Défaut ON, comme les autres capacités du produit.
  //
  // Il vit ICI et pas sur une route à part : le champ a une lecture et une
  // écriture, et un second chemin vers le même booléen est exactement le défaut
  // que ce dépôt passe son temps à corriger — deux écrans qui se contredisent,
  // et personne pour dire lequel a raison.
  laura_enabled: z.boolean(),
  /**
   * #4158.19 — l'e-mail INTERNE entre collègues, un interrupteur par type.
   * Louis 14/10 : « dans l'app + e-mail opt-in ». Les quatre partent d'un
   * geste d'un MEMBRE de l'espace vers un autre membre, jamais vers un
   * prospect, et naissent FAUX (aucune case précochée, #2082.16). L'e-mail ne
   * porte ni le corps d'un commentaire ni celui d'un message commercial
   * (c96) : il dit QUI, QUOI, et donne le lien.
   */
  email_on_assignment: z.boolean(),
  email_on_delegation: z.boolean(),
  email_on_mention: z.boolean(),
  // Réservé au digest du manager (L5, #4158.28) : l'interrupteur existe, son
  // émetteur arrive avec ce lot — l'ordre « émetteur d'abord » est tenu par
  // L5 qui le branche, ce lot ne fait que réserver la colonne.
  email_on_manager_digest: z.boolean(),
})

/**
 * #2082.16 / #2091.24 — « aucune case précochée », et la LIGNE exacte que ce
 * dépôt tient.
 *
 * Toutes les préférences ne posent pas la même question. Celles qui déclenchent
 * un **ENVOI SORTANT** — un e-mail qui arrive dans la boîte de quelqu'un —
 * demandent un consentement, et un consentement ne se présume pas : elles sont
 * FAUSSES par défaut, sans exception. Celles qui ne font qu'**AFFICHER dans
 * l'application** (la cloche, un encart, Laura) décrivent le produit chez lui :
 * elles peuvent être vraies par défaut, et trois d'entre elles le sont par
 * décision écrite (transparence du débit pour `credit_low` / `action_overdue`,
 * D49 pour `laura_enabled`).
 *
 * Les deux listes vivent ICI et nulle part ailleurs (GA-26) : la garde de
 * `notifications.test.ts` exige que CHAQUE booléen du schéma soit classé dans
 * l'une ou l'autre, donc une préférence ajoutée demain ne peut pas se glisser
 * sans que quelqu'un ait répondu à la question « est-ce que ça part chez
 * quelqu'un ? ».
 *
 * ⚠️ Ce qui N'EST PAS tranché ici et ne doit pas l'être en silence : la base
 * légale du traitement et le paragraphe de politique de confidentialité qui
 * correspond. Le cadre ci-dessous est technique.
 */
export const NOTIFICATION_OUTBOUND_PREFERENCE_KEYS = [
  'relance_reminders',
  'weekly_summary',
  'weekly_digest',
  'watchlist_daily_digest',
  'newsletter_changelog',
  // #4158.19 — l'e-mail entre collègues : un ENVOI, donc consenti.
  'email_on_assignment',
  'email_on_delegation',
  'email_on_mention',
  'email_on_manager_digest',
] as const

/** Les préférences qui n'AFFICHENT que dans l'application — aucun envoi. */
export const NOTIFICATION_IN_APP_PREFERENCE_KEYS = [
  'buy_signals',
  'credit_low',
  'action_overdue',
  'sidebar_changelog',
  'laura_enabled',
  // #2082.4/.5/.6 — la cloche, rien ne part chez personne.
  'meeting_prep',
  'mission_end',
  'client_reply',
] as const

/**
 * Server-side default preferences, used when a user has no row yet.
 *
 * ⚠️ Changer une valeur ici ne change RIEN à ce qui est déjà écrit en base :
 * les lignes `notification_preferences` existantes gardent leur valeur, qui est
 * peut-être un choix réel de leur propriétaire. Ces défauts ne valent que pour
 * les comptes sans ligne et pour les insertions futures.
 */
export const defaultNotificationPreferences: NotificationPreferences = {
  buy_signals: true,
  relance_reminders: false,
  weekly_summary: false,
  // #2082.16 — aucune préférence d'ENVOI n'est vraie par défaut.
  weekly_digest: false,
  credit_low: true,
  action_overdue: true,
  proactivity_cap: 3,
  laura_enabled: true,
  watchlist_daily_digest: false,
  sidebar_changelog: true,
  // #2082.16 — aucune préférence d'ENVOI n'est vraie par défaut.
  newsletter_changelog: false,
  // #2082.4/.5/.6 — in-app, et chacune annonce un engagement DÉJÀ pris.
  meeting_prep: true,
  mission_end: true,
  client_reply: true,
  // #4158.19 — aucune préférence d'ENVOI n'est vraie par défaut.
  email_on_assignment: false,
  email_on_delegation: false,
  email_on_mention: false,
  email_on_manager_digest: false,
  email_language: null,
  quiet_hours_start: null,
  quiet_hours_end: null,
}

/** PATCH body — every toggle optional so the client can persist a single flip. */
export const updateNotificationPreferencesSchema = notificationPreferencesSchema.partial()

/**
 * In-app notification kinds. Corrected 13/09/2026 (#1938) — the previous
 * comment called `daily_digest` and `system` "reserved"; both are ACTIVE:
 * `daily_digest` from `daily-digest.service.ts`, `system` from
 * `session-registry.service.ts` (security alerts), `playbook-send.sweeper.ts`
 * (approval requests), `action-router.module.ts` and `routines.service.ts`
 * (reminders/routine outcomes) — all four write straight to `NotificationsService`
 * or its repo. Only `changelog` has zero producer today (the newsletter sends
 * by e-mail directly, never through this in-app type).
 */
export const notificationTypeSchema = z.enum([
  'buy_signal',
  'weekly_summary',
  'weekly_digest',
  'daily_digest',
  'relance',
  'credit_low',
  'action_overdue',
  'changelog',
  'system',
  // AJOUT EN FIN, jamais au milieu (GA-08). `discover_alert` est arrivé le
  // 15/09/2026 avec l'exécuteur de cadence des recherches enregistrées de
  // Découvrir : c'est le canal `in_app` de ces alertes, et le seul des trois
  // qui ne quitte pas l'application. La colonne `notifications.type` est du
  // texte libre — aucune contrainte SQL à élargir (vérifié : seul
  // `notifications_origin_check` existe).
  'discover_alert',
  // AJOUT EN FIN, jamais au milieu (GA-08). #2082.4/.5/.6 — les trois annonces
  // d'engagement du 16/09/2026, arrivées AVEC leur émetteur
  // (`engagement-alerts.service.ts`) : la décision était « l'émetteur d'abord,
  // la préférence ensuite ». La colonne `notifications.type` est du texte libre
  // — aucune contrainte SQL à élargir (seul `notifications_origin_check` existe).
  'meeting_prep',
  'mission_end',
  'client_reply',
  // AJOUT EN FIN, jamais au milieu (GA-08). #1940.1 — un collègue mentionné
  // (`@Prénom`) dans un fil Laura partagé est prévenu : avant, `appendMention`
  // insérait juste le texte, sans que la personne visée le sache si elle
  // n'avait pas le fil ouvert au même instant.
  'chat_mention',
  // AJOUT EN FIN, jamais au milieu (GA-08). #2444.10 — un signalement beta que
  // la personne a ELLE-MÊME déposé vient d'être corrigé (`reportStatusOf` passe
  // à `fixed`) : une réponse à son propre geste, jamais une invitation à
  // revenir — même famille que `client_reply`. Pas de préférence dédiée (comme
  // `system`) : toujours affichée, jamais un envoi sortant. La colonne
  // `notifications.type` est du texte libre — aucune contrainte SQL à élargir.
  'feedback_resolved',
  // AJOUT EN FIN, jamais au milieu (GA-08). #1940.7 — une carte d'action de
  // Laura ASSIGNÉE à un collègue (sélecteur « assigner à », relié à
  // `useWorkspaceMembers`, même registre que #1940.1) le prévient réellement.
  // Même famille que `chat_mention` : geste explicite d'un membre de l'espace,
  // jamais une relance automatique — pas de préférence dédiée, toujours
  // affichée. La colonne `notifications.type` est du texte libre — aucune
  // contrainte SQL à élargir.
  'chat_action_assigned',
  // AJOUT EN FIN, jamais au milieu (GA-08). #2864 — reste du lot précédent :
  // une demande d'approbation CONFIÉE à un collègue (`POST
  // /action-os/approvals/:id/assign`) le prévient réellement, au lieu de le
  // laisser découvrir la file « À valider » déjà réordonnée en sa faveur.
  // Même famille que `chat_action_assigned` : geste explicite d'un membre de
  // l'espace, jamais une relance automatique — pas de préférence dédiée,
  // toujours affichée. La colonne `notifications.type` est du texte libre —
  // aucune contrainte SQL à élargir.
  'approval_assigned',
  // AJOUT EN FIN, jamais au milieu (GA-08). #4158.15/.16/.17/.18 — la boîte de
  // réception d'ÉQUIPE : un compte m'est assigné, une action m'est déléguée, un
  // collègue me mentionne, un collègue attend que l'ESN soit décrite. La
  // colonne `notifications.type` est du texte libre — aucune contrainte SQL à
  // élargir. `esn_description_pending` n'est JAMAIS stocké : il est calculé à
  // la lecture (#4158.18).
  'account_assigned',
  'action_delegated',
  'team_mention',
  'esn_description_pending',
  // AJOUT EN FIN, jamais au milieu (GA-08). #4158.28 — le digest hebdomadaire du
  // manager (lundi matin) : une synthèse AGRÉGÉE de la semaine de l'équipe, rendue
  // dans l'application. Un e-mail ne part que si le manager a activé l'interrupteur
  // « digest manager » (désactivé par défaut) — jamais ici. La colonne
  // `notifications.type` est du texte libre — aucune contrainte SQL à élargir.
  'manager_digest',
])

/**
 * #4158.14 — les types qui forment la catégorie « Équipe » de la boîte de
 * réception : un FILTRE de la boîte existante, jamais une seconde cloche.
 * Chacun naît d'un geste d'un collègue (ou, pour le dernier, de l'attente de
 * l'un d'eux) ; les types de Laura et du produit n'en font pas partie.
 */
export const TEAM_NOTIFICATION_TYPES = [
  'account_assigned',
  'action_delegated',
  'team_mention',
  'esn_description_pending',
  'chat_mention',
  'chat_action_assigned',
  'approval_assigned',
] as const satisfies readonly z.infer<typeof notificationTypeSchema>[]

export const NOTIFICATION_INBOX_SCOPES = ['all', 'team'] as const
export const notificationInboxScopeSchema = z.enum(NOTIFICATION_INBOX_SCOPES)
export type NotificationInboxScope = z.infer<typeof notificationInboxScopeSchema>

/**
 * La finalité métier de CHAQUE type de notification (#1938.10 — jamais une
 * notification dont la seule raison d'être est de faire revenir l'utilisateur).
 * Obligatoire : la garde `notification type purposes` (notifications.test.ts)
 * refuse qu'un type soit ajouté à `notificationTypeSchema` sans sa phrase ici,
 * pour la même raison que `chain.ts:133-141` refuse un parcours sans `purpose`
 * — sauf qu'ici la garde porte sur le TYPE, pas sur chaque instance.
 *
 * Audit du 13/09/2026 (#1938.10) : aucun des 9 types n'a pour SEULE finalité
 * de faire revenir l'utilisateur — chacun porte une utilité vérifiable dans le
 * dépôt (signal commercial, sécurité budgétaire, échéance, sécurité du compte).
 * `changelog` reste une dette distincte (déclaré, sans émetteur) — à corriger
 * en branchant un émetteur ou en le retirant, pas en silence.
 */
export const NOTIFICATION_TYPE_PURPOSES: Record<NotificationType, string> = {
  buy_signal:
    "Une fenêtre de contact commerciale réelle vient de s'ouvrir sur un compte suivi — elle se referme si elle attend jusqu'au prochain passage sur l'écran.",
  weekly_summary:
    "Le récapitulatif de ce qui a bougé sur le portefeuille cette semaine — un point d'activité, jamais une invitation à revenir sans contenu.",
  weekly_digest:
    "Les signaux de veille marché de la semaine sur les comptes suivis, agrégés en un seul envoi — évite de rouvrir l'écran de veille chaque jour.",
  daily_digest:
    "Les signaux de veille du jour sur les comptes suivis — cadence QUOTIDIENNE choisie explicitement par l'utilisateur (opt-in), jamais imposée.",
  relance:
    "Une relance que l'utilisateur a lui-même programmée arrive à échéance — l'app rappelle un engagement pris, elle n'en suggère pas un nouveau.",
  credit_low:
    "Le solde de crédits de l'espace passe sous le seuil d'alerte — sécurité budgétaire, pour ne jamais découvrir un blocage après coup.",
  action_overdue:
    "Des actions de plan déjà décidées ont dépassé leur échéance — un rappel d'un engagement pris sur un dossier, pas une relance générique.",
  changelog:
    'Annoncer une nouveauté déjà livrée sur un canal in-app dédié — actuellement déclaré sans émetteur branché (dette distincte, voir le docblock).',
  system:
    'Un événement qui touche la sécurité du compte ou une décision en attente (connexions simultanées, envoi automatique à valider, rappel programmé) — jamais une notification de confort.',
  discover_alert:
    'Une recherche enregistrée de Découvrir arrive à sa cadence : son propriétaire a lui-même demandé à être prévenu quand son périmètre est à rejouer — un engagement qu’il a pris, jamais une invitation à revenir.',
  meeting_prep:
    'Un rendez-vous déjà dans l’agenda arrive demain : le préparer se fait la veille ou pas du tout — c’est un engagement pris envers quelqu’un d’autre, pas une suggestion de l’application.',
  mission_end:
    'Une mission en cours arrive à son terme : le renouvellement se joue AVANT la fin, et une fin découverte après coup est un client perdu sans qu’il ait rien décidé.',
  client_reply:
    'Une réponse est ARRIVÉE dans ta messagerie — le fait, jamais son contenu, jamais son objet, jamais son expéditeur (D65). Ce qu’on annonce est qu’il y a quelque chose à lire, et l’endroit où le lire.',
  chat_mention:
    'Un collègue t’a mentionné dans un fil Laura — un geste explicite d’un membre de ton espace envers toi, jamais une relance automatique.',
  feedback_resolved:
    'Un signalement que tu as déposé toi-même vient d’être corrigé — jamais une invitation à revenir, une réponse à ton propre geste, pour te proposer de retester.',
  chat_action_assigned:
    "Un collègue vient de t'attribuer explicitement une action que Laura avait proposée dans un fil partagé — un geste délégué à traiter, jamais une relance automatique.",
  approval_assigned:
    "Un collègue vient de te confier une demande d'approbation en attente — un geste délégué à trancher, jamais une relance automatique.",
  account_assigned:
    "Un collègue vient de t'attribuer un compte — un geste explicite d'un membre de ton espace envers toi, jamais une relance automatique.",
  action_delegated:
    'Un collègue vient de te déléguer une action de son plan — un geste explicite à prendre en charge, jamais une relance automatique.',
  team_mention:
    "Un collègue t'a mentionné dans un commentaire d'équipe — un geste explicite envers toi, limité aux membres qui ont accès à l'objet.",
  esn_description_pending:
    "Des collègues ont fini leur onboarding et attendent que l'entreprise soit décrite — seul un gestionnaire de l'équipe peut le faire, et l'entrée disparaît dès que c'est fait.",
  manager_digest:
    'La synthèse de la semaine de ton équipe (ce qui demande un arbitrage, le travail fait et en retard, les comptes en veille) — agrégée, sans classement nominatif, un seul rendez-vous le lundi.',
}

/**
 * #2404.3 — LES QUATRE NIVEAUX NOMMÉS, JAMAIS POUR L'ENGAGEMENT.
 *
 * `notification.entity.ts` ne portait qu'un `priority` 0-100 et un `type` —
 * aucun niveau NOMMÉ. « Information / Action / Urgent / Critique » découpe ce
 * score déjà calculé en quatre quadrants LUS, sans en inventer un second : la
 * même dérivation partout, plutôt que quatre écrans qui retraduiraient le
 * chiffre chacun à sa façon (GA-26, un réglage vit à un seul endroit).
 *
 * ⚠️ JAMAIS pour l'engagement. Ce niveau ne pèse dans AUCUN calcul du budget
 * de proactivité (`interruption-budget.ts`, `exceedsCap`) : il nomme, il ne
 * décide pas. Le décider ferait du champ d'affichage un second levier
 * d'interruption, exactement ce que la doctrine refuse.
 */
export const NOTIFICATION_LEVELS = ['information', 'action', 'urgent', 'critical'] as const
export const notificationLevelSchema = z.enum(NOTIFICATION_LEVELS)
export type NotificationLevel = (typeof NOTIFICATION_LEVELS)[number]

/**
 * Le quadrant d'un score déjà calculé — jamais une seconde mesure.
 *
 * `null` reste `null` (GA-18/GA-19) : « pas de priorité calculée » n'est pas
 * « information », et lui donner le niveau le plus bas inventerait un fait que
 * personne n'a mesuré.
 */
export function notificationLevelFor(priority: number | null): NotificationLevel | null {
  if (priority === null) return null
  if (priority < 25) return 'information'
  if (priority < 50) return 'action'
  if (priority < 75) return 'urgent'
  return 'critical'
}

export const notificationSchema = z.object({
  id: z.string().guid(),
  type: notificationTypeSchema,
  title: z.string(),
  body: z.string(),
  link: z.string().nullable(),
  read_at: z.string().nullable(),
  created_at: z.string(),
  // #2404.3 — le quadrant NOMMÉ de `priority`, transporté jusqu'à l'écran.
  // `.nullable().default(null)` : une notification créée avant cette colonne,
  // ou dont `priority` n'était pas mesuré, ne se voit jamais attribuer
  // « information » par défaut (GA-18/GA-19) — l'absence reste `null`.
  level: notificationLevelSchema.nullable().default(null),
  // #2404.7 — D'OÙ vient l'information : ce que l'espace a BRANCHÉ (sa
  // messagerie Gmail/Outlook, son CRM) ou un registre public nommable
  // (BOAMP, DECP) — JAMAIS un de nos fournisseurs d'enrichissement (Pappers,
  // Apollo, Brave — doctrine « on nomme ce que l'espace a branché, jamais ce
  // qui nous sert »). `.nullable().default(null)` : une notification créée
  // avant cette colonne, ou dont l'émetteur ne sait pas nommer sa source, ne
  // se voit jamais attribuer une source inventée (GA-18/GA-19).
  source: z.string().nullable().default(null),
  // #3922.n — le lien EXTERNE vérifiable du signal cité, et son genre. Distinct
  // de `link` (destination interne). `.nullable().default(null)` : une
  // notification sans signal cité, ou antérieure à la colonne, n'en gagne
  // jamais un deviné — l'écran dit « Sans lien vérifiable ».
  source_url: z.string().nullable().default(null),
  source_kind: z.string().nullable().default(null),
  // #4158.14 — l'AUTEUR du geste, écrit EN CLAIR (jamais « un collègue »
  // quand on sait qui). `null` = notification sans auteur (le produit, Laura).
  actor_name: z.string().nullable().default(null),
  // #4158.18 — vrai pour une entrée CALCULÉE à la lecture, jamais stockée : on
  // ne la marque pas « lue », elle disparaît quand sa cause disparaît.
  derived: z.boolean().default(false),
})

export const unreadCountSchema = z.object({ count: z.number().int().min(0) })

/**
 * Présélections de notification (#1938.6-9) — « Urgent uniquement », « Brief
 * quotidien », « Résumé hebdomadaire », « Personnalisé ».
 *
 * Une présélection est un JEU des réglages EXISTANTS ci-dessus, jamais un
 * canal ou un envoi neuf : appliquer « Urgent uniquement » écrit un PATCH sur
 * `notification_preferences`, exactement comme un utilisateur qui basculerait
 * les 7 interrupteurs un par un. Aucun stockage supplémentaire n'existe pour
 * « quelle présélection est active » — GA-26 (un réglage vit à un seul
 * endroit) : un second champ qui MÉMORISERAIT le choix diverguerait du
 * contenu réel dès qu'un interrupteur est touché à la main, et il faudrait
 * alors décider laquelle des deux sources ment. `detectNotificationPreset`
 * recalcule donc l'état à chaque lecture, depuis les 7 réglages eux-mêmes.
 *
 * Portée volontairement limitée aux 7 réglages de CADENCE COMMERCIALE (la
 * section « Activité » de l'écran) : les changelogs (actualité produit) et
 * l'assistante (`laura_enabled`, `proactivity_cap` — budget d'interruption,
 * décision D49) sont des axes À PART. Les mélanger à une présélection de
 * cadence commerciale les ferait changer pour une raison qui ne les concerne
 * pas — exactement la loi 4 du tome 7 (rien ne se recopie sous une forme qui
 * peut diverger).
 */
export const NOTIFICATION_PRESET_KEYS = [
  'buy_signals',
  'relance_reminders',
  'weekly_summary',
  'weekly_digest',
  'credit_low',
  'action_overdue',
  'watchlist_daily_digest',
] as const

type NotificationPresetKey = (typeof NOTIFICATION_PRESET_KEYS)[number]

/** Les 7 réglages qu'une présélection écrit, jamais plus. Non exporté : ne
 *  sert qu'à typer `NOTIFICATION_PRESETS` ci-dessous, dans ce même fichier. */
type NotificationPresetValues = Pick<NotificationPreferences, NotificationPresetKey>

export const NOTIFICATION_PRESET_IDS = ['urgent_only', 'daily_brief', 'weekly_recap', 'custom'] as const
export const notificationPresetIdSchema = z.enum(NOTIFICATION_PRESET_IDS)
export type NotificationPresetId = z.infer<typeof notificationPresetIdSchema>

/**
 * Les 3 présélections NOMMÉES. `'custom'` n'a délibérément AUCUNE valeur ici —
 * ce n'est pas un jeu qu'on écrit, c'est l'état qu'on DÉTECTE quand aucun des
 * trois ne correspond exactement (voir `detectNotificationPreset`).
 *
 *  - **Urgent uniquement** : les alertes immédiates seulement (signal
 *    d'achat, solde bas, actions en retard) — aucun digest périodique.
 *  - **Brief quotidien** : les mêmes alertes immédiates, PLUS le digest
 *    quotidien de veille — la cadence choisie est le jour, pas la semaine.
 *  - **Résumé hebdomadaire** : les mêmes alertes immédiates, PLUS les deux
 *    récapitulatifs hebdomadaires — la cadence choisie est la semaine.
 *
 * `relance_reminders` reste à `false` dans les trois : c'est un rappel que
 * l'utilisateur programme lui-même sur un dossier précis, un axe indépendant
 * de la cadence choisie ici — l'allumer à la main bascule sur Personnalisé,
 * ce qui est le comportement voulu.
 */
export const NOTIFICATION_PRESETS: Record<Exclude<NotificationPresetId, 'custom'>, NotificationPresetValues> = {
  urgent_only: {
    buy_signals: true,
    credit_low: true,
    action_overdue: true,
    relance_reminders: false,
    weekly_summary: false,
    weekly_digest: false,
    watchlist_daily_digest: false,
  },
  daily_brief: {
    buy_signals: true,
    credit_low: true,
    action_overdue: true,
    watchlist_daily_digest: true,
    relance_reminders: false,
    weekly_summary: false,
    weekly_digest: false,
  },
  weekly_recap: {
    buy_signals: true,
    credit_low: true,
    action_overdue: true,
    weekly_summary: true,
    weekly_digest: true,
    relance_reminders: false,
    watchlist_daily_digest: false,
  },
}

/**
 * Quelle présélection les 7 réglages ACTUELS égalent exactement, ou
 * `'custom'` si aucune ne correspond — jamais lu depuis un stockage, toujours
 * recalculé. Toucher UN SEUL des 7 réglages à la main suffit à sortir de la
 * présélection (#1938 : « toucher un réglage à la main bascule sur
 * Personnalisé »), et c'est le mécanisme même de cette fonction qui le
 * garantit : elle ne compare rien d'autre que les valeurs réelles.
 */
export function detectNotificationPreset(preferences: NotificationPreferences): NotificationPresetId {
  for (const id of ['urgent_only', 'daily_brief', 'weekly_recap'] as const) {
    const preset = NOTIFICATION_PRESETS[id]
    if (NOTIFICATION_PRESET_KEYS.every(key => preferences[key] === preset[key])) return id
  }
  return 'custom'
}

export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>
export type UpdateNotificationPreferences = z.infer<typeof updateNotificationPreferencesSchema>
export type NotificationType = z.infer<typeof notificationTypeSchema>
export type NotificationItem = z.infer<typeof notificationSchema>
export type UnreadCount = z.infer<typeof unreadCountSchema>

/** Une alerte consolidée — l'item le plus RÉCENT du groupe qu'elle représente,
 *  plus le nombre d'occurrences fusionnées. `occurrences: 1` pour une alerte
 *  qui n'avait aucun doublon : le champ existe toujours, jamais un badge
 *  invisible pour le cas ordinaire. */
export type ConsolidatedNotification = NotificationItem & { occurrences: number }

/**
 * #2144.27 (épopée #2928) — PAS DEUX ALERTES IDENTIQUES SANS CONSOLIDATION.
 *
 * « Identique » : même `type`, même `link` (deux alertes qui pointent le même
 * endroit), toutes deux NON LUES. Tranché sans Louis — aucune définition
 * écrite n'existait pour deux alertes de nature DIFFÉRENTE (ex. un signal
 * d'achat et une fin de mission) : le `type` fait partie de l'égalité pour
 * cette raison précise, jamais une fusion fourre-tout par lien seul. Une
 * alerte SANS lien (`link: null`) ne fusionne jamais avec une autre : rien ne
 * prouve alors qu'elles désignent le même fait. Une alerte déjà LUE ne
 * fusionne jamais avec une non lue — un fait déjà vu reste un fait distinct,
 * pas un doublon à faire disparaître. Deux alertes de SOURCES différentes ne fusionnent
 * pas non plus (#3920.5) : la source fait partie du fait.
 *
 * Un seul point de calcul (`useNotifications`, apps/web) : la cloche de
 * notification et la bulle de Laura lisent la MÊME liste consolidée (GA-26,
 * un réglage vit à un seul endroit) — les deux endroits où le manque avait été
 * mesuré (#2928, vérification du 25/09).
 */
export function consolidateNotifications(items: readonly NotificationItem[]): ConsolidatedNotification[] {
  const groups = new Map<string, ConsolidatedNotification>()
  const order: string[] = []
  items.forEach((item, index) => {
    // #4158.14 — un geste de COLLÈGUE ne fusionne jamais : deux personnes qui
    // te mentionnent au même endroit sont deux faits, et la fusion garderait un
    // seul nom.
    const mergeable = item.link !== null && item.read_at === null && (item.actor_name ?? null) === null
    // #3920.5 — deux signaux d'un MÊME compte mais de SOURCES différentes (annonce légale, « Votre CRM »)
    // sont deux faits au même lien : la fusion en gardait un seul, et la cloche ne montrait jamais l'autre.
    const key = mergeable ? `${item.type}::${item.link}::${item.source ?? ''}` : `unique::${index}`
    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, { ...item, occurrences: 1 })
      order.push(key)
      return
    }
    const mostRecent = new Date(item.created_at).getTime() > new Date(existing.created_at).getTime() ? item : existing
    groups.set(key, { ...mostRecent, occurrences: existing.occurrences + 1 })
  })
  return order.map(key => groups.get(key)!)
}
