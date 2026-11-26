import { z } from 'zod'
import { isSupportedTimeZone } from './profile.js'
import { portfolioVisibilitySchema } from './portfolio-visibility.values.js'
import { EMPTY_STRUCTURED_LEXICON, structuredLexiconSchema } from './workspace-lexicon.js'

/**
 * Workspace (ESN team) wire schemas — the shapes the API exposes to the web
 * app. A workspace groups several members who share accounts, analyses and the
 * knowledge base. See `agent_docs/multi-user-workspaces.md`.
 *
 * Roles (role-based access, additive — the three legacy roles keep their exact
 * pre-RBAC capabilities; the four new roles carve out narrower seats an ESN can
 * sell separately):
 *
 *  - `owner`      — the billing/admin user. Every permission.
 *  - `admin`      — manages the team + everything the owner can do bar nothing
 *                   today (legacy: admin was ungated on data/billing/integrations).
 *  - `sales_ops`  — commercial usage **plus** team management, no billing, no
 *                   integrations.
 *  - `sales`      — commercial usage only (run analysis, enrich, export, send a
 *                   message) on their perimeter — no team, no billing.
 *  - `tech_admin` — transversal integrations seat: manages integrations/CRM
 *                   connections only, no commercial actions.
 *  - `member`     — LEGACY role, kept so no existing membership is reclassified.
 *                   Retains its pre-RBAC access (everything except team
 *                   management, which was always owner/admin-gated). Behaves like
 *                   `sales` for the commercial actions.
 *  - `viewer`     — strictly read-only. Refused (403) on **every** mutation.
 *
 * Intended seniority for the team screen: owner > admin > sales_ops > sales >
 * viewer, with `tech_admin` orthogonal (integrations only) and `member` legacy.
 * The single source of truth for "who can do what" is {@link ROLE_PERMISSIONS}
 * below — never re-derive permissions from the role string elsewhere.
 */
export const workspaceRoleValues = [
  'owner',
  'admin',
  'sales_ops',
  'sales',
  'tech_admin',
  'member',
  'viewer',
  /**
   * Les deux métiers ESN qu'aucun rôle ne servait (socle d'architecture,
   * BEL-ARCH-001). Ajoutés EN FIN : la garde `enum-additivity` refuse une
   * insertion, et l'ordre de cette liste pilote le tri de l'écran Équipe.
   *
   * `recruiter` tient le vivier et les positionnements sans toucher au pipe
   * commercial ; `finance` lit la marge sans pouvoir modifier une fiche. Les
   * donner à `sales_ops` faute de mieux revenait à accorder cinq droits pour
   * en obtenir un.
   */
  'recruiter',
  'finance',
] as const
export const workspaceRoleSchema = z.enum(workspaceRoleValues)
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>

/**
 * Granular capabilities gated per role. Kept coarse on purpose — one entry per
 * mutating *action family* the product sells, so the matrix stays readable and
 * every server-side guard maps to exactly one of these.
 */
export const workspacePermissionValues = [
  /** Launch / re-run / cancel / resume an analysis (consumes a credit). */
  'analysis:run',
  /** On-demand enrichment (contacts, organigram, single contact). */
  'contacts:enrich',
  /** Export data out (CSV / push a contact to a connected CRM). */
  'data:export',
  /** Send an outbound message/email to a contact. */
  'messages:send',
  /**
   * Créer, corriger ou supprimer une fiche du CRM/ATS (compte, contact, projet,
   * note…). Distincte de `data:export` : sortir la donnée et la MODIFIER ne se
   * délèguent pas au même siège — un stagiaire qui exporte une liste ne devrait
   * pas pouvoir renommer un compte.
   */
  'records:write',
  /** Invite / remove members, manage pending invitations. */
  'team:manage',
  /** Connect / configure / disconnect outbound integrations + CRM. */
  'integrations:manage',
  /** Stripe checkout, billing portal, payment method, top-ups. */
  'billing:manage',
  /**
   * Voir le COÛT et la MARGE d'une mission.
   *
   * Distincte de `billing:manage` : payer l'abonnement Bellum et connaître la
   * marge d'une mission sont deux choses sans rapport. Distincte aussi de
   * `records:write` : un commercial saisit un TJM sans avoir à connaître le
   * coût chargé du consultant, qui relève de la paie. Le champ n'est pas mis à
   * zéro sans ce droit — il DISPARAÎT : un zéro se lit comme une marge nulle,
   * ce qui est une information fausse là où l'absence de droit ne dit rien.
   */
  'finance:read',
  /**
   * ÉCRIRE une information financière : marquer un mois comme facturé,
   * enregistrer un paiement, régler le seuil d'alerte de marge (PDF 5, D36).
   *
   * Séparée de `finance:read` parce que les deux gestes n'ont pas le même
   * poids : lire une marge informe, marquer un mois « facturé » le SORT de la
   * surveillance — et un mois sorti par erreur ne se relance plus, personne
   * ne s'en aperçoit, et le client ne paie jamais.
   *
   * AJOUTÉE EN FIN de liste (garde GA-08) : aucune valeur existante ne bouge.
   */
  'finance:write',
  /**
   * Voir le chiffre d'affaires et la marge de SON périmètre — et de lui seul
   * (D1 · 26/08/2026).
   *
   * Le commercial ne pouvait pas voir ce qu'il avait lui-même produit : les six
   * lectures financières étaient sous `finance:read`, que ni `sales` ni
   * `sales_ops` ne portent. Le lui accorder aurait ouvert, du même geste, la
   * marge de ses collègues et le coût chargé des consultants — qui relève de la
   * paie, et n'a rien à faire dans un siège commercial.
   *
   * D'où une permission SÉPARÉE, accompagnée d'une portée (`finance-scope.ts`).
   * Sans la portée, elle serait un simple renommage de `finance:read`.
   *
   * Ce qui reste hors d'atteinte avec elle : la marge d'un collègue, le coût
   * chargé d'un consultant qu'on ne porte pas, la marge par canal de l'espace,
   * le délai de paiement global, les coûts fournisseurs.
   *
   * AJOUTÉE EN FIN de liste (GA-08), et sa contrainte SQL élargie AVANT par la
   * migration `1790160000001`.
   */
  'finance:read:own',
  /**
   * INTERROGER un outil connecté depuis la conversation — savoir si un compte
   * est déjà dans le CRM de l'espace, par exemple (#1791.2, 10/09/2026).
   *
   * Le registre des outils savait qui est BRANCHÉ ; il ne savait pas qui a le
   * droit de l'INTERROGER depuis le chat, et la route web correspondante
   * n'exigeait qu'un jeton d'authentification. Le premier jet a repris
   * `data:export`, ce qui marchait — et liait deux gestes qui n'ont rien à
   * voir : « sortir des données du produit » et « demander si ce compte est
   * chez nous ». Les lier rend l'un infermable sans l'autre.
   *
   * ⚠️ AJOUTÉE EN FIN de liste (garde GA-08) : aucune valeur existante ne
   * bouge de place, et tous les rôles qui portaient `data:export` la reçoivent
   * — personne ne perd un accès qu'il avait.
   */
  'crm:read',
  /**
   * #2018.7 — SIGNALER qu'une information du profil d'entreprise PARTAGÉ est
   * fausse, sans le droit de l'écraser.
   *
   * `team:manage` protège déjà l'ÉCRITURE du profil canonique
   * (`EsnProfileService.persistAnswers` : un membre sans ce droit voit ses
   * modifications de champs ENTREPRISE simplement ignorées). Mais avant ce
   * point, rien ne distinguait « ne peut pas écrire » de « ne peut RIEN
   * faire » — un membre qui repère une erreur n'avait aucun geste, seulement
   * un champ verrouillé.
   *
   * Permission SÉPARÉE de `records:write` (qui gouverne les fiches CRM/ATS,
   * pas le profil de société) et de `team:manage` (qui gouverne l'écriture
   * elle-même) : signaler n'écrit jamais la valeur, seulement une DEMANDE.
   *
   * ⚠️ AJOUTÉE EN FIN de liste (garde GA-08). Accordée à tout rôle qui utilise
   * commercialement le profil (owner, admin, sales_ops, sales, member) —
   * jamais à `viewer`, strictement lecture seule et refusé sur TOUTE mutation
   * (doctrine du fichier, ligne 157) : signaler une demande EST une mutation.
   * `tech_admin`/`recruiter`/`finance` restent hors de ce droit : ce sont des
   * sièges transversaux délibérément étroits (voir leur commentaire propre) ;
   * leur ouvrir ce droit « en passant » referait l'erreur que ce fichier
   * documente déjà — un droit accordé sans qu'on l'ait vraiment décidé.
   */
  'profile:report',
] as const
export const workspacePermissionSchema = z.enum(workspacePermissionValues)
export type WorkspacePermission = z.infer<typeof workspacePermissionSchema>

/**
 * THE permission matrix — role → the permissions it holds. Additive by design:
 * the legacy `owner`/`admin`/`member` rows reproduce their exact pre-RBAC reach
 * (every action was JWT-only/ungated, bar team management which was owner/admin),
 * so turning the guards on removes access from **no** existing membership. The
 * four new roles receive a deliberately narrower subset.
 *
 * Read-only note: `viewer` holds **no** permission — it is refused on every
 * mutation and can only read.
 */
const ROLE_PERMISSIONS: Record<WorkspaceRole, readonly WorkspacePermission[]> = {
  owner: [
    'analysis:run',
    'contacts:enrich',
    'data:export',
    'crm:read',
    'messages:send',
    'records:write',
    'team:manage',
    'integrations:manage',
    'billing:manage',
    'finance:read',
    'finance:write',
    // Redondante avec `finance:read` pour ces deux rôles, et pourtant présente :
    // un `owner` ne doit jamais se voir refuser une route, quelle que soit la
    // permission qu'elle exige. La garde de la matrice l'impose.
    'finance:read:own',
    // #2018.7 — signaler une information d'entreprise fausse. Redondant avec
    // `team:manage` (qui donne déjà le droit d'ÉCRIRE) pour ce rôle, mais
    // présent pour la même raison que `finance:read:own` juste au-dessus.
    'profile:report',
  ],
  admin: [
    'analysis:run',
    'contacts:enrich',
    'data:export',
    'crm:read',
    'messages:send',
    'records:write',
    'team:manage',
    'integrations:manage',
    'billing:manage',
    'finance:read',
    'finance:write',
    'finance:read:own',
    'profile:report',
  ],
  // Commercial + team management. No billing, no integrations.
  sales_ops: [
    'analysis:run',
    'contacts:enrich',
    'data:export',
    'crm:read',
    'messages:send',
    'records:write',
    'team:manage',
    // Son périmètre, jamais celui de l'espace : `finance:read` reste à
    // `owner`, `admin` et `finance`.
    'finance:read:own',
    'profile:report',
  ],
  // Commercial usage on their perimeter only.
  sales: [
    'analysis:run',
    'contacts:enrich',
    'data:export',
    'crm:read',
    'messages:send',
    'records:write',
    'finance:read:own',
    // #2018.7 — pas de `team:manage` : ce rôle ne peut que SIGNALER une
    // information d'entreprise fausse, jamais l'écraser.
    'profile:report',
  ],
  // Transversal integrations seat.
  tech_admin: ['integrations:manage'],
  // Legacy role: everything except team management (its pre-RBAC reach).
  // `finance:read` n'y est PAS : c'est un droit NOUVEAU, et l'accorder
  // rétroactivement ouvrirait le coût chargé des consultants à tous les sièges
  // historiques d'un coup, sans que personne ne l'ait décidé.
  member: [
    'analysis:run',
    'contacts:enrich',
    'data:export',
    'crm:read',
    'messages:send',
    'records:write',
    'integrations:manage',
    'billing:manage',
    // #2018.7 — pas de `team:manage` : ce rôle ne peut que SIGNALER une
    // information d'entreprise fausse, jamais l'écraser.
    'profile:report',
  ],
  /**
   * Recrutement : le vivier, les CV, les positionnements. Volontairement SANS
   * `messages:send` — un recruteur écrit à des candidats depuis sa messagerie,
   * pas via le moteur d'outreach commercial, et lui ouvrir ce droit le ferait
   * apparaître dans les plafonds d'envoi d'une campagne de prospection.
   */
  recruiter: ['contacts:enrich', 'records:write', 'data:export', 'crm:read'],
  /**
   * Finance : le coût chargé, la marge, l'abonnement. AUCUN droit d'écriture
   * sur les fiches — voir une marge et renommer un compte n'ont rien à faire
   * dans le même siège.
   */
  finance: ['finance:read', 'finance:write', 'billing:manage', 'data:export', 'crm:read', 'finance:read:own'],
  // Strictly read-only.
  viewer: [],
}

/**
 * Whether `role` is allowed to perform `permission`. Single source of truth for
 * every server-side guard and the web's action-gating.
 *
 * #3015 (recette du 25/09/2026) — `role` vient TYPÉ `WorkspaceRole`, mais
 * `apiFetch` (web) et une ligne de base (API) ne le VALIDENT pas à
 * l'exécution : un rôle retiré de l'énumération, ou un cache
 * `PersistQueryClientProvider` persisté depuis AVANT son renommage, ne
 * l'empêche pas d'arriver ici. `ROLE_PERMISSIONS[role]` levait alors
 * `Cannot read properties of undefined` — sur `GlobalSearchDialog`, monté au
 * même niveau que le contenu de la route, ça faisait tomber l'app ENTIÈRE, pas
 * seulement la modale. `?? []` : un rôle inconnu n'ouvre AUCUN droit — fermé
 * par défaut, jamais une exception qui remonte jusqu'à la frontière d'erreur.
 */
export function hasPermission(role: WorkspaceRole, permission: WorkspacePermission): boolean {
  return (ROLE_PERMISSIONS[role] ?? []).includes(permission)
}

/**
 * Le droit d'un MEMBRE : son rôle, plus ce qui lui a été accordé en propre.
 *
 * Neuf rôles ne couvriront jamais une ESN réelle. Il y a toujours le commercial
 * à qui on confie la connexion du CRM, ou le recruteur qui doit voir la marge
 * sur une mission précise. Sans permissions additives, la seule réponse
 * possible était de le monter en `admin` — c'est-à-dire de lui donner huit
 * droits pour en régler un, et c'est ainsi qu'un espace finit avec quatre
 * administrateurs.
 *
 * Strictement ADDITIF, et c'est le point : on n'enlève RIEN. Un « rôle moins
 * une permission » se lit à l'écran comme un rôle, se raisonne comme un rôle,
 * et personne ne se souvient six mois plus tard de ce qui en a été retiré. Une
 * exception qui ajoute se voit ; une exception qui retire se découvre le jour
 * où quelqu'un ne peut plus faire son travail.
 */
export function can(
  role: WorkspaceRole,
  additional: readonly WorkspacePermission[],
  permission: WorkspacePermission,
): boolean {
  return hasPermission(role, permission) || additional.includes(permission)
}

/**
 * Ce qu'un membre gagne VRAIMENT par rapport à son rôle.
 *
 * Sert l'écran Équipe : afficher « + gestion des intégrations » à côté d'un
 * siège dit quelque chose, afficher les neuf permissions ne dit rien. Les
 * accords redondants (déjà couverts par le rôle) sont écartés — les montrer
 * laisserait croire à un privilège là où il n'y en a pas.
 */
export function effectiveExtraPermissions(
  role: WorkspaceRole,
  additional: readonly WorkspacePermission[],
): WorkspacePermission[] {
  return additional.filter(permission => !hasPermission(role, permission))
}

/** Corps de `PUT /workspaces/members/:userId/permissions` — la liste COMPLÈTE
 *  des accords en propre, pas un delta : envoyer un tableau vide les retire
 *  tous, et c'est le geste qu'on veut pouvoir faire d'un clic. */
export const setMemberPermissionsSchema = z.object({
  permissions: z.array(workspacePermissionSchema).max(workspacePermissionValues.length),
})
export type SetMemberPermissions = z.infer<typeof setMemberPermissionsSchema>

/** FR labels for the "Équipe" role selector + badges. */
export const workspaceRoleLabels: Record<WorkspaceRole, string> = {
  owner: 'Propriétaire',
  admin: 'Admin',
  sales_ops: 'Sales Ops',
  sales: 'Sales',
  tech_admin: 'Tech / Admin',
  member: 'Membre',
  viewer: 'Lecteur',
  recruiter: 'Recrutement',
  finance: 'Finance',
}

/** Roles an owner/admin may assign via invite or role change — everyone but the
 *  owner (a second owner cannot be minted, nor the owner demoted). */
export const assignableWorkspaceRoles = workspaceRoleValues.filter(
  (role): role is Exclude<WorkspaceRole, 'owner'> => role !== 'owner',
)

export const workspaceInvitationStatusValues = ['pending', 'accepted', 'revoked', 'expired'] as const
export const workspaceInvitationStatusSchema = z.enum(workspaceInvitationStatusValues)
export type WorkspaceInvitationStatus = z.infer<typeof workspaceInvitationStatusSchema>

export const workspaceSchema = z.object({
  id: z.string().guid(),
  name: z.string().min(1),
  ownerUserId: z.string().guid(),
  /** The requesting user's role in this workspace. */
  role: workspaceRoleSchema,
  memberCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
})
export type Workspace = z.infer<typeof workspaceSchema>

export const workspaceMemberSchema = z.object({
  id: z.string().guid(),
  userId: z.string().guid(),
  email: z.string().email(),
  fullName: z.string().nullable(),
  role: workspaceRoleSchema,
  joinedAt: z.string().datetime(),
})
export type WorkspaceMember = z.infer<typeof workspaceMemberSchema>

export const workspaceInvitationSchema = z.object({
  id: z.string().guid(),
  email: z.string().email(),
  role: workspaceRoleSchema,
  status: workspaceInvitationStatusSchema,
  invitedByUserId: z.string().guid(),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
})
export type WorkspaceInvitation = z.infer<typeof workspaceInvitationSchema>

/** Body of `POST /workspaces/:id/invitations`. Only owners/admins may call. */
export const createWorkspaceInvitationSchema = z.object({
  email: z.string().email(),
  role: workspaceRoleSchema.exclude(['owner']).default('member'),
})
export type CreateWorkspaceInvitation = z.infer<typeof createWorkspaceInvitationSchema>

/** Body of `PATCH /workspaces/:id` — rename the team. */
export const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(120),
})
export type UpdateWorkspace = z.infer<typeof updateWorkspaceSchema>

/* -------------------------------------------------------------------------- */
/*  Market (target country) — drives data sources, locale and legal basis.    */
/* -------------------------------------------------------------------------- */

/**
 * The target market (country) a workspace operates on. `FR` is the default and
 * the *strictly-unchanged* French path (no country pack). `CH`/`BE`/`LU`/`US`/`CA`
 * each map to a country pack on the IA side (flag-gated per pack — `COUNTRY_PACK_CH`,
 * …, `COUNTRY_PACK_US`, `COUNTRY_PACK_CA`).
 * The value doubles as the 2-letter `country` code the IA analysis expects: a
 * non-FR market propagates as `country=<code>` and, when the matching pack flag
 * is on, activates that country's public-registry + local-signal sources.
 * Extensible: adding a market = one entry here + one entry in {@link MARKET_CATALOG}.
 */
export const workspaceMarketValues = ['FR', 'CH', 'BE', 'LU', 'US', 'CA'] as const
export const workspaceMarketSchema = z.enum(workspaceMarketValues)
export type WorkspaceMarket = z.infer<typeof workspaceMarketSchema>

/** Default UI/content language derived from the market. */
export const marketLocaleValues = ['fr', 'en', 'de'] as const
export const marketLocaleSchema = z.enum(marketLocaleValues)
export type MarketLocale = z.infer<typeof marketLocaleSchema>

/**
 * Legal basis under which the market's data may be processed. `RGPD` = intra-EU
 * (France, Belgium, Luxembourg — full GDPR). `adéquation` = the EU adequacy
 * decision covering Switzerland (15 Jan 2024) alongside the nFADP. `PIPEDA` =
 * Canada's federal privacy act (EU adequacy 2002, reaffirmed 15 Jan 2024).
 * `CCPA` = US state privacy laws (CCPA/CPRA et al.) — the US has NO federal
 * omnibus privacy law and no GDPR adequacy; only public B2B registry data is read.
 */
export const marketLegalBasisValues = ['RGPD', 'adéquation', 'PIPEDA', 'CCPA'] as const
export const marketLegalBasisSchema = z.enum(marketLegalBasisValues)
export type MarketLegalBasis = z.infer<typeof marketLegalBasisSchema>

/**
 * The resolved market view for the active workspace — everything the product
 * layer needs to drive a run: the `country` code passed to the IA, the default
 * locale, the legal basis, and whether a country pack backs the market.
 */
export const workspaceMarketResolutionSchema = z.object({
  /** The stored market setting. */
  market: workspaceMarketSchema,
  /** 2-letter country code handed to the IA analysis (`country`). FR = default. */
  countryCode: workspaceMarketSchema,
  /** Default content/UI language for this market. */
  defaultLocale: marketLocaleSchema,
  /** Legal basis for processing this market's data. */
  legalBasis: marketLegalBasisSchema,
  /** Whether a country pack backs this market on the IA side (FR = none). */
  activeCountryPack: z.boolean(),
})
export type WorkspaceMarketResolution = z.infer<typeof workspaceMarketResolutionSchema>

/** Body of `PATCH /workspaces/market` — set the workspace's target market. */
export const updateWorkspaceMarketSchema = z.object({
  market: workspaceMarketSchema,
})
export type UpdateWorkspaceMarket = z.infer<typeof updateWorkspaceMarketSchema>

/**
 * Canonical market → {locale, legal basis, country-pack} mapping. Single source
 * of truth shared by the API resolver and the web selector, so both agree on the
 * consequences of a market without duplicating the table. FR is deliberately the
 * only market with `activeCountryPack: false` (it is the native path, not a pack).
 */
export const MARKET_CATALOG: Record<
  WorkspaceMarket,
  { defaultLocale: MarketLocale; legalBasis: MarketLegalBasis; activeCountryPack: boolean }
> = {
  FR: { defaultLocale: 'fr', legalBasis: 'RGPD', activeCountryPack: false },
  CH: { defaultLocale: 'de', legalBasis: 'adéquation', activeCountryPack: true },
  BE: { defaultLocale: 'fr', legalBasis: 'RGPD', activeCountryPack: true },
  LU: { defaultLocale: 'fr', legalBasis: 'RGPD', activeCountryPack: true },
  US: { defaultLocale: 'en', legalBasis: 'CCPA', activeCountryPack: true },
  // CA is bilingual: `en` is the business default, FR-CA is mandatory in Québec
  // (Loi 96) — the pack's prompt fragment carries that nuance per contact.
  CA: { defaultLocale: 'en', legalBasis: 'PIPEDA', activeCountryPack: true },
}

/**
 * #2621.1 — le pays BRUT qu'une source externe écrit (Apollo : `country:
 * "France"`, `"Switzerland"`…), PAS un libellé traduit pour l'affichage —
 * `market-labels.ts` (web) en porte un autre, localisé, qui ne doit rien à
 * celui-ci. Un seul endroit pour rapprocher un `country` brut du marché de
 * l'espace (GA-26) : Découvrir (contacts) filtre par défaut sur ce nom, et une
 * bascule explicite ouvre au monde (`discover-contact-rows.ts`).
 */
export const MARKET_COUNTRY_NAMES: Record<WorkspaceMarket, string> = {
  FR: 'France',
  CH: 'Switzerland',
  BE: 'Belgium',
  LU: 'Luxembourg',
  US: 'United States',
  CA: 'Canada',
}

/**
 * Coerce a raw stored value to a supported {@link WorkspaceMarket}. Unknown,
 * empty or malformed values fall back to `FR` so a bad row can never silently
 * activate a foreign path.
 */
export function normalizeMarket(value: string | null | undefined): WorkspaceMarket {
  const code = (value ?? '').trim().toUpperCase()
  return (workspaceMarketValues as readonly string[]).includes(code) ? (code as WorkspaceMarket) : 'FR'
}

/** Build the full {@link WorkspaceMarketResolution} for a market from the catalog. */
export function resolveMarket(market: WorkspaceMarket): WorkspaceMarketResolution {
  const config = MARKET_CATALOG[market]
  return {
    market,
    countryCode: market,
    defaultLocale: config.defaultLocale,
    legalBasis: config.legalBasis,
    activeCountryPack: config.activeCountryPack,
  }
}

/* -------------------------------------------------------------------------- */
/*  Timezone (fuseau de l'ESPACE) — #1958.2, l'escalier personne → rendez-vous */
/*  → espace → défaut produit.                                                */
/* -------------------------------------------------------------------------- */

/**
 * #1958.2 — LE FUSEAU DE L'ESPACE, nom IANA ou `null`.
 *
 * Jusqu'ici seule la PERSONNE (#1958.1, `profiles.timezone`) et le défaut
 * produit nommé (`REFERENCE_TIMEZONE`, `apps/ia/app/prompts/current_time.py`)
 * existaient : aucun fuseau n'était porté par l'ESPACE (l'ESN). Une équipe
 * dont personne n'a renseigné son fuseau personnel retombait directement sur
 * Paris, même basée à Montréal.
 *
 * `null` = cet espace n'a rien réglé — pas « UTC », pas une devinette depuis
 * {@link workspaceMarketSchema} : le marché dit QUI on prospecte, le fuseau
 * dit QUAND on travaille, et les deux divergent couramment (une ESN française
 * qui prospecte les États-Unis reste sur Paris). La dérivation qui décide quel
 * fuseau s'applique à un tour de copilote vit dans `resolve_applicable_timezone`
 * (`apps/ia/app/prompts/current_time.py`, GA-26 — un seul endroit) : personne
 * → rendez-vous (#1958.3) → espace → défaut produit.
 *
 * Même validateur que `profiles.timezone` (`isSupportedTimeZone`, non vide,
 * ≤ 64 caractères) : un nom inventé entrerait sinon en base.
 */
export const workspaceTimezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(isSupportedTimeZone, { message: 'Fuseau horaire inconnu' })
  .nullable()

/** Response of `GET /workspaces/timezone` — the active workspace's setting. */
export const workspaceTimezoneResolutionSchema = z.object({
  timezone: workspaceTimezoneSchema,
})
export type WorkspaceTimezoneResolution = z.infer<typeof workspaceTimezoneResolutionSchema>

/** Body of `PATCH /workspaces/timezone` — set the workspace's timezone. */
export const updateWorkspaceTimezoneSchema = z.object({
  timezone: workspaceTimezoneSchema,
})
export type UpdateWorkspaceTimezone = z.infer<typeof updateWorkspaceTimezoneSchema>

/**
 * #2957 (#2179.2/.35) — LES SECTIONS DE NAVIGATION QU'UN ADMIN PEUT MASQUER
 * POUR SON ESPACE.
 *
 * Une seule entrée à ce jour : `'rfp'`. Une LISTE FERMÉE plutôt qu'une chaîne
 * libre — masquer `/accounts` ou `/team` couperait l'accès au produit lui-même,
 * pas à une section secondaire. N'y entre que ce dont l'empty state DIT
 * explicitement qu'il peut être masqué (`rfp.json#list.empty`).
 */
export const MASKABLE_WORKSPACE_SECTIONS = ['rfp'] as const
export type MaskableWorkspaceSection = (typeof MASKABLE_WORKSPACE_SECTIONS)[number]
export const maskableWorkspaceSectionSchema = z.enum(MASKABLE_WORKSPACE_SECTIONS)

/** Vrai si `value` est une section masquable connue. Sert à filtrer une valeur
 *  venue de la base (colonne `text[]` libre) sans faire confiance à son
 *  contenu — même rôle que {@link isPlanFeatureKey} pour les features. */
export function isMaskableWorkspaceSection(value: unknown): value is MaskableWorkspaceSection {
  return typeof value === 'string' && (MASKABLE_WORKSPACE_SECTIONS as readonly string[]).includes(value)
}

/** Response of `GET /workspaces/hidden-sections` — any member may read it (the
 *  nav needs it to hide the tab for everyone, not just admins). */
export const workspaceHiddenSectionsResolutionSchema = z.object({
  hiddenSections: z.array(maskableWorkspaceSectionSchema),
})
export type WorkspaceHiddenSectionsResolution = z.infer<typeof workspaceHiddenSectionsResolutionSchema>

/** Body of `PATCH /workspaces/hidden-sections` — replace the full set (owner/admin only). */
export const updateWorkspaceHiddenSectionsSchema = z.object({
  hiddenSections: z.array(maskableWorkspaceSectionSchema),
})
export type UpdateWorkspaceHiddenSections = z.infer<typeof updateWorkspaceHiddenSectionsSchema>

/* -------------------------------------------------------------------------- */
/*  Team management (Phase 3/4) — the "Équipe" settings screen wire shapes.   */
/* -------------------------------------------------------------------------- */

/**
 * A team member as shown on the "Équipe" screen. `email` may be `null` when the
 * member's profile has no email on file (fail soft rather than drop the row).
 * Keyed by `userId` — the value the remove/change-role endpoints take.
 */
export const workspaceTeamMemberSchema = z.object({
  userId: z.string().guid(),
  email: z.string().email().nullable(),
  fullName: z.string().nullable(),
  role: workspaceRoleSchema,
  joinedAt: z.string().datetime(),
  /**
   * Les permissions accordées EN PROPRE, en plus du rôle.
   *
   * `PUT /workspaces/members/:userId/permissions` savait les ÉCRIRE depuis le
   * début, et `WorkspacePermissionGuard` les consultait à chaque requête — mais
   * rien ne les RENDAIT. Un écran ne pouvait donc pas montrer ce qu'un membre
   * avait de plus que son rôle, et une liste COMPLÈTE ne s'envoie pas sans
   * connaître celle qui est en place : le premier enregistrement aurait effacé
   * en silence tout ce qui avait été accordé avant.
   *
   * Optionnel : une réponse antérieure au champ reste valide, et l'écran lit
   * `?? []`. Vide veut dire « aucune exception », jamais « on ne sait pas » —
   * le serveur rend toujours le tableau.
   */
  extraPermissions: z.array(workspacePermissionSchema).optional(),
  /**
   * « Qui intervient en renfort transversal » (#3387.10) — une personne qui
   * épaule les autres sur tous les comptes sans en être le porteur.
   *
   * Un DRAPEAU sur le membre, pas un organigramme : le rôle dit ce qu'on a le
   * droit de faire, ce drapeau dit seulement vers qui se tourner quand un
   * compte manque de bras. Il ne donne aucun droit et ne retire aucun compte à
   * son porteur — le porteur reste l'unique responsable de la prochaine action.
   *
   * Optionnel : une réponse antérieure au champ reste valide et se lit `false`.
   */
  crossTeamSupport: z.boolean().optional(),
})
export type WorkspaceTeamMember = z.infer<typeof workspaceTeamMemberSchema>

/** A pending invitation as shown on the "Équipe" screen. */
export const workspaceTeamInvitationSchema = z.object({
  id: z.string().guid(),
  email: z.string().email(),
  role: workspaceRoleSchema,
  status: workspaceInvitationStatusSchema,
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
})
export type WorkspaceTeamInvitation = z.infer<typeof workspaceTeamInvitationSchema>

/**
 * #4158.2 — l'issue d'un renvoi d'invitation. `emailSent` dit si le courriel est
 * réellement parti (jamais supposé) ; `emailError` porte la raison sinon.
 */
export const resendWorkspaceInvitationResultSchema = z.object({
  invitation: workspaceTeamInvitationSchema,
  emailSent: z.boolean(),
  emailError: z.string().nullable(),
})
export type ResendWorkspaceInvitationResult = z.infer<typeof resendWorkspaceInvitationResultSchema>

/**
 * Seat usage: `used` = members + pending invitations, `total` = the owner
 * plan's seat allowance (see the API's `PLAN_SEATS` map). When `used >= total`
 * the invite endpoint refuses new invitations (402).
 */
export const workspaceSeatsSchema = z.object({
  used: z.number().int().nonnegative(),
  total: z.number().int().positive(),
})
export type WorkspaceSeats = z.infer<typeof workspaceSeatsSchema>

/**
 * Response of `GET /workspaces/me` — the caller's active workspace, its members,
 * pending invitations and seat usage. Powers the "Équipe" settings screen.
 */
export const workspaceTeamSchema = z.object({
  workspace: z.object({
    id: z.string().guid(),
    name: z.string().min(1),
    /** The requesting user's role in this workspace. */
    role: workspaceRoleSchema,
    memberCount: z.number().int().nonnegative(),
    /**
     * L'opt-in de la donnée communautaire (tome 2 §5.3, décision D51).
     *
     * Décoché par défaut. Il vit ici plutôt que dans un appel à part parce que
     * l'écran Équipe l'affiche à côté des sièges : c'est un réglage d'ESPACE,
     * pas une préférence personnelle.
     */
    communityDataSharing: z.boolean().default(false),
    /**
     * Le cloisonnement du portefeuille, EN LECTURE.
     *
     * L'endpoint d'écriture (`PATCH /workspaces/portfolio-visibility`) existait
     * depuis des mois, et le calcul aussi (`portfolioScopeFor`) — mais AUCUNE
     * route ne rendait la valeur EN COURS. Un écran ne pouvait donc pas montrer
     * le réglage sans le deviner, et deviner « ouvert » chez une ESN qui a
     * cloisonné aurait affiché l'inverse de la vérité.
     *
     * Le défaut n'était pas le réglage : c'était qu'on ne pouvait pas le LIRE.
     */
    portfolioVisibility: portfolioVisibilitySchema.default('open'),
    /**
     * Le lexique de l'espace (D17, 28/08/2026) — les mots que l'équipe emploie
     * pour nommer les objets du produit.
     *
     * Il voyage ICI plutôt que par une route à lui, et c'est la décision qui
     * compte : le lexique doit teindre la NAVIGATION de tout le monde, or
     * `GET /esn-profile/offer-portfolio` — son domicile — se lit avec
     * `team:manage`. Un commercial y aurait lu « Besoins » pendant que son
     * responsable a écrit « Postes », et le réglage aurait eu l'air de ne pas
     * marcher.
     *
     * Cette réponse-là est déjà lue par CHAQUE membre sur CHAQUE écran (la barre
     * latérale en dépend), elle porte déjà deux autres réglages d'espace, et
     * l'ajouter n'ouvre aucune route neuve. Ce qu'elle expose est exactement ce
     * que la personne voit déjà : le nom de ses propres onglets.
     *
     * Les mots INTERDITS ne sont PAS ici : ils ne servent aucun libellé — ils
     * teignent ce que Laura rédige, côté serveur — et la liste des mots qu'une
     * ESN refuse d'employer en dit long sur son positionnement. Ils restent
     * derrière `team:manage`, avec le reste du portefeuille.
     */
    lexicon: structuredLexiconSchema.catch(EMPTY_STRUCTURED_LEXICON).default(EMPTY_STRUCTURED_LEXICON),
  }),
  members: z.array(workspaceTeamMemberSchema),
  invitations: z.array(workspaceTeamInvitationSchema),
  seats: workspaceSeatsSchema,
})
export type WorkspaceTeam = z.infer<typeof workspaceTeamSchema>

/**
 * Body of `PATCH /workspaces/members/:userId/role` — owner only. `owner` is not
 * a settable target: you cannot mint a second owner nor demote the owner here.
 */
export const updateWorkspaceMemberRoleSchema = z.object({
  role: workspaceRoleSchema.exclude(['owner']),
})
export type UpdateWorkspaceMemberRole = z.infer<typeof updateWorkspaceMemberRoleSchema>

/** Corps de `PATCH /workspaces/members/:userId/cross-team-support` (#3387.10). */
export const setCrossTeamSupportSchema = z.object({ enabled: z.boolean() })
export type SetCrossTeamSupport = z.infer<typeof setCrossTeamSupportSchema>

/** Response of `POST /workspaces/invitations/:token/accept`. */
export const acceptWorkspaceInvitationResultSchema = z.object({
  workspaceId: z.string().guid(),
  workspaceName: z.string(),
  role: workspaceRoleSchema,
})
export type AcceptWorkspaceInvitationResult = z.infer<typeof acceptWorkspaceInvitationResultSchema>

/* -------------------------------------------------------------------------- */
/*  Belonging to several workspaces — the switcher.                           */
/* -------------------------------------------------------------------------- */

/**
 * One entry of `GET /workspaces` — a workspace the caller belongs to, as shown
 * in the switcher.
 *
 * Why this exists: signup provisions a *personal* workspace for every user
 * (trigger `handle_new_user_workspace`), so anyone who tried the product before
 * being invited already owns one. Accepting an ESN's invitation writes the
 * `workspace_members` row correctly — but until the switcher landed, the
 * resolver always returned the owned workspace, so the joiner never saw the team
 * they had just joined. Membership was already many-to-many; only the *choice*
 * of which membership is active was missing.
 *
 * `isPersonal` marks the workspace the user owns themselves — the one holding
 * the dossiers they built before joining. It is never deleted or merged when
 * they join a team: it stays in this list, which is the whole point of having a
 * switcher rather than a move.
 */
export const workspaceSummarySchema = z.object({
  id: z.string().guid(),
  name: z.string().min(1),
  /** The caller's role in THIS workspace (not their role in the active one). */
  role: workspaceRoleSchema,
  /** Whether this is the workspace the caller is currently working in. */
  isActive: z.boolean(),
  /** True when the caller owns it — their own space, kept across every join. */
  isPersonal: z.boolean(),
  memberCount: z.number().int().nonnegative(),
})
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>

/** Body of `POST /workspaces/active` — switch the caller's active workspace.
 *  Refused (403) unless the caller is a member of the target. */
export const switchWorkspaceSchema = z.object({
  workspaceId: z.string().guid(),
})
export type SwitchWorkspace = z.infer<typeof switchWorkspaceSchema>

/** Response of `POST /workspaces/active` — the newly active workspace. */
export const activeWorkspaceSchema = z.object({
  workspaceId: z.string().guid(),
  workspaceName: z.string(),
  role: workspaceRoleSchema,
})
export type ActiveWorkspace = z.infer<typeof activeWorkspaceSchema>
