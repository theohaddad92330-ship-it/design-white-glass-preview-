import { z } from 'zod'

/**
 * LE JOURNAL D'AUDIT UNIQUE DU BACK-OFFICE (#1666).
 *
 * « Un journal unique, toutes opérations du manager confondues :
 *   Qui · Quoi · Sur quoi · Quand · Depuis où · Résultat. »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL VIT DANS LES CONTRATS, ET PAS DANS L'API SEULE
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois lecteurs, une seule définition : l'API l'écrit et le purge, la console
 * l'écrit (chaque route de mutation) et l'AFFICHE (les filtres, le tableau des
 * rétentions). Recopier la liste des catégories dans la console la ferait
 * diverger de la contrainte SQL à la première correction — et un filtre qui
 * propose une catégorie que la base refuse est une garantie qui ment.
 * Un réglage vit à un seul endroit (GA-26).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE JOURNAL NE PORTE JAMAIS
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ **Aucune charge utile brute de requête.** Une ligne de journal dit CE QUI
 * a été fait et SUR QUOI, jamais avec quels octets : un corps de requête
 * recopié tel quel porterait un jour un jeton, un lien de réinitialisation ou
 * un mot de passe, et le journal d'audit deviendrait le meilleur endroit du
 * produit où aller les chercher. `detail` est une NOTE COURTE écrite par
 * l'appelant, bornée à 500 caractères, jamais un `JSON.stringify(req.body)`.
 *
 * ⚠️ **Aucune donnée de client** au-delà de ce que le geste DÉSIGNE : le sujet
 * (un identifiant, un libellé) et rien de son contenu.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DISTINCT DU JOURNAL D'ACCÈS (#1671.2), ET C'EST VOULU
 * ─────────────────────────────────────────────────────────────────────────────
 * `backoffice_access_events` répond « qui est entré », se garde douze mois et
 * sert à COMPTER les échecs de connexion (l'alerte de #1671.3). Celui-ci répond
 * « qu'a-t-on fait », et ses rétentions vont de 24 mois à PERMANENT selon la
 * catégorie. Les fusionner imposerait la rétention la plus longue à des données
 * qui n'en ont pas besoin, et rendrait le comptage d'échecs illisible.
 *
 * Ils ne sont pas pour autant deux histoires séparées : une entrée d'accès est
 * une OPÉRATION du back-office, donc elle est MIROITÉE ici — sans quoi
 * « journal unique » serait un titre, pas un fait.
 */

/**
 * Les cinq catégories de l'issue, dans l'ordre où elle les écrit.
 *
 * ⚠️ ORDRE FIGÉ (GA-08) : une valeur ne disparaît jamais, les ajouts vont en
 * FIN, et la contrainte SQL `backoffice_audit_events_category_check` est élargie
 * AVANT le code qui écrit la valeur (GA-11 / GA-12).
 *
 * ⚠️ La catégorie n'est pas une étiquette d'affichage : elle DÉCIDE de la
 * rétention. Ranger une suppression en « ordinaire » la ferait disparaître au
 * bout de deux ans alors qu'elle doit rester pour toujours.
 */
export const BACKOFFICE_AUDIT_CATEGORIES = [
  /** Tout le quotidien : lire, relancer, créditer, saisir, rejouer un job. */
  'ordinaire',
  /** Ce qui change ce que quelqu'un a le DROIT de faire : rôle, palier, suspension, membre d'un espace. */
  'permission',
  /** Ce qui fait SORTIR de la donnée du produit : export, extraction, téléchargement en masse. */
  'export',
  /** Ce qui DÉTRUIT : un compte, un espace, une facture, un job. */
  'suppression',
  /** Une prise d'identité — agir SOUS le compte de quelqu'un d'autre. */
  'impersonation',
] as const

export const backofficeAuditCategorySchema = z.enum(BACKOFFICE_AUDIT_CATEGORIES)

export type BackofficeAuditCategory = (typeof BACKOFFICE_AUDIT_CATEGORIES)[number]

/**
 * Ce que le geste a DONNÉ. Le sixième champ de l'issue (« Résultat »).
 *
 * ⚠️ `refus` et `echec` ne sont pas la même chose, et les confondre coûterait
 * cher : un refus est le produit qui fonctionne (le rôle ne permettait pas le
 * geste), une panne est le produit qui ne fonctionne pas. Un tableau qui les
 * mélange fait chercher un incident là où il y a eu une décision.
 */
export const BACKOFFICE_AUDIT_OUTCOMES = [
  /** Le geste a abouti. */
  'succes',
  /** Le geste a été REFUSÉ — rôle insuffisant, règle métier, saisie invalide. */
  'refus',
  /** Le geste a ÉCHOUÉ — l'API n'a pas répondu, ou a répondu 5xx. */
  'echec',
] as const

export const backofficeAuditOutcomeSchema = z.enum(BACKOFFICE_AUDIT_OUTCOMES)

export type BackofficeAuditOutcome = (typeof BACKOFFICE_AUDIT_OUTCOMES)[number]

/**
 * LES RÉTENTIONS DE L'ISSUE, EN MOIS. `null` = PERMANENT.
 *
 *   Actions ordinaires          24 mois
 *   Changements de permission   36 mois
 *   Exports de données          36 mois
 *   Suppressions                permanent
 *   Impersonations              36 mois
 *
 * ⚠️ `null` et `0` sont deux phrases opposées, et c'est le genre de confusion
 * qui vide une table. `null` veut dire « ne purge JAMAIS » ; un `0` mal lu
 * voudrait dire « purge tout de suite ». Le type l'interdit, et le calcul de
 * la fenêtre (`apps/api/src/modules/admin/audit-retention.ts`) rend `null`
 * plutôt qu'une date pour cette catégorie-là.
 *
 * Elles vivent ICI et nulle part ailleurs : la purge côté API et le tableau
 * « Rétentions » de l'écran lisent la MÊME table. Deux copies auraient
 * divergé, et l'écran aurait annoncé une promesse que la purge ne tient pas.
 */
export const BACKOFFICE_AUDIT_RETENTION_MONTHS: Readonly<Record<BackofficeAuditCategory, number | null>> = {
  ordinaire: 24,
  permission: 36,
  export: 36,
  suppression: null,
  impersonation: 36,
}

/**
 * Ce qu'une entrée porte — les six colonnes de l'issue, nommées.
 *
 * Qui        `actorEmail` + `actorRole`
 * Quoi       `operation` + `category`
 * Sur quoi   `subjectType` + `subjectId` + `subjectLabel`
 * Quand      `created_at`, posé par la base (il ne se reçoit pas d'un appelant)
 * Depuis où  `ip` + `userAgent` + `country`
 * Résultat   `outcome` + `statusCode` + `detail`
 *
 * ⚠️ TOUT CE QUI PEUT MANQUER EST NULLABLE, et le reste. Vercel fournit
 * l'origine presque toujours, et « presque » n'est pas « toujours » ; la couche
 * d'identité peut être au repos (`DM_ALLOWED_EMAILS` non posée), et l'auteur
 * vaut alors `null`. Écrire `'inconnu'` ferait d'une lacune un fait.
 */
export const backofficeAuditEntrySchema = z.object({
  /**
   * Le nom STABLE du geste, en `domaine.verbe` — `users.delete`,
   * `workspaces.member_remove`, `email.reveal`. C'est ce qu'on filtre et ce
   * qu'on relit dans six mois ; un libellé français y aurait figé une langue.
   */
  operation: z.string().trim().min(1).max(120),
  category: backofficeAuditCategorySchema,
  outcome: backofficeAuditOutcomeSchema,
  /** L'adresse de l'opérateur, relue à la requête — jamais celle du cookie. */
  actorEmail: z.string().trim().max(320).nullish(),
  actorRole: z.string().trim().max(32).nullish(),
  /** La NATURE du sujet : `user`, `workspace`, `plan`, `queue`, `invoice`… */
  subjectType: z.string().trim().max(64).nullish(),
  /** Son identifiant technique, tel qu'il apparaît dans l'URL du geste. */
  subjectId: z.string().trim().max(200).nullish(),
  /**
   * De quoi le RECONNAÎTRE sans rouvrir la base — un nom d'espace, une clé
   * d'offre, un nom de file. ⚠️ Jamais une adresse e-mail en clair : l'écran
   * la masquerait, mais le journal l'aurait déjà écrite.
   */
  subjectLabel: z.string().trim().max(200).nullish(),
  /** Le code HTTP rendu à l'opérateur, quand il y en a un. */
  statusCode: z.number().int().min(100).max(599).nullish(),
  /**
   * ⚠️ UNE NOTE COURTE, JAMAIS UNE CHARGE UTILE. Voir le docblock de tête :
   * un corps de requête recopié ici porterait un jour un jeton.
   */
  detail: z.string().trim().max(500).nullish(),
  ip: z.string().trim().max(64).nullish(),
  userAgent: z.string().trim().max(500).nullish(),
  country: z.string().trim().max(8).nullish(),
})

export type BackofficeAuditEntry = z.infer<typeof backofficeAuditEntrySchema>
