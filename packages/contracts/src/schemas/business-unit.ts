import { z } from 'zod'

/**
 * La couche BU / agence — le PÉRIMÈTRE DE TRAVAIL d'un espace, et la règle
 * d'accès qui va avec (#2005.3 à #2005.12, #2081.10, #2081.17-.21, #2087.1-.17).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ HOMONYME — deux « business unit » vivent dans ce dépôt
 * ─────────────────────────────────────────────────────────────────────────────
 * `account-entity.ts` connaît déjà une `business_unit` : c'est une subdivision
 * du CLIENT prospecté, un nœud de son organigramme. Celle-ci est une subdivision
 * de NOTRE espace — l'agence lyonnaise de l'ESN qui utilise Bellum. Les deux ne
 * se croisent nulle part : aucun `account_entities.type` ne pointe ici, et rien
 * d'ici ne décrit un prospect.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN OBJET DE PREMIÈRE CLASSE, ET PAS UNE ÉTIQUETTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une étiquette `business_unit: string` sur le membre aurait suffi à AFFICHER
 * « Agence Lyon ». Elle n'aurait pas suffi à : rattacher un compte, désigner un
 * responsable, demander l'accès, compter les membres, archiver un périmètre sans
 * perdre son historique — ni à empêcher que « Agence Lyon » et « agence lyon »
 * deviennent deux équipes. C'est l'arbitrage « dimension COMPLÈTE » du
 * 15/09/2026.
 */

/**
 * Les sept échelles de travail (#2087.2 à #2087.8) — les grandes cartes de la
 * question « à quelle échelle travailles-tu réellement ? ».
 *
 * ⚠️ C'est un FAIT déclaré, jamais un droit. Aucune de ces valeurs n'ouvre ni ne
 * ferme quoi que ce soit : le droit de voir vit dans {@link businessUnitAccessValues},
 * et lui seul. Les mélanger produirait une matrice de sept échelles fois neuf
 * rôles que personne ne saurait relire — et un `kind: 'company'` finirait par
 * signifier « voit tout », ce qui serait faux dès la deuxième ESN.
 */
export const businessUnitKindValues = [
  /** « Toute l'entreprise » (#2087.2). */
  'company',
  /** « Une BU » (#2087.3) — le défaut. */
  'business_unit',
  /** « Une agence » (#2087.4). */
  'agency',
  /** « Une équipe commerciale » (#2087.5). */
  'sales_team',
  /** « Un territoire » (#2087.6). */
  'territory',
  /** « Une nouvelle activité à lancer » (#2087.7). */
  'new_venture',
  /** « Je travaille seul » (#2087.8). */
  'solo',
] as const
export const businessUnitKindSchema = z.enum(businessUnitKindValues)
export type BusinessUnitKind = z.infer<typeof businessUnitKindSchema>

/**
 * L'état d'un périmètre. On archive, on ne supprime pas : une agence fermée a
 * porté des comptes, et l'historique de ces comptes cite son nom.
 */
export const businessUnitStatusValues = ['active', 'archived'] as const
export const businessUnitStatusSchema = z.enum(businessUnitStatusValues)
export type BusinessUnitStatus = z.infer<typeof businessUnitStatusSchema>

/** Le rôle DANS le périmètre — orthogonal au rôle d'espace. */
export const businessUnitMembershipValues = ['lead', 'member'] as const
export const businessUnitMembershipSchema = z.enum(businessUnitMembershipValues)
export type BusinessUnitMembership = z.infer<typeof businessUnitMembershipSchema>

export const businessUnitAccessRequestStatusValues = ['pending', 'granted', 'refused'] as const
export const businessUnitAccessRequestStatusSchema = z.enum(businessUnitAccessRequestStatusValues)
export type BusinessUnitAccessRequestStatus = z.infer<typeof businessUnitAccessRequestStatusSchema>

/**
 * LE NIVEAU D'ACCÈS — ce que ce membre a le droit de VOIR, et rien d'autre.
 *
 * ⚠️ Ce n'est PAS un rôle. Un rôle dit ce qu'on a le droit de FAIRE
 * (`workspaceRoleValues`) ; ceci dit SUR QUOI. Les fusionner obligerait à
 * dupliquer les neuf rôles fois deux niveaux — et une matrice de dix-huit
 * sièges ne se relit plus, donc ne se garde plus.
 *
 * `'workspace'` est le DÉFAUT et le comportement HISTORIQUE : tout l'espace.
 * Toute ligne `workspace_members` existante le porte après migration, donc
 * personne ne perd un accès le jour du déploiement. `'business_unit'` est un
 * RÉTRÉCISSEMENT qu'un responsable pose explicitement.
 */
export const businessUnitAccessValues = [
  /** Tout l'espace — le défaut, et le comportement d'avant cette dimension. */
  'workspace',
  /** Ses périmètres, et ce que personne ne porte. */
  'business_unit',
] as const
export const businessUnitAccessSchema = z.enum(businessUnitAccessValues)
export type BusinessUnitAccess = z.infer<typeof businessUnitAccessSchema>

/**
 * Ce que ce membre a le droit de voir, dans la dimension BU.
 *
 * `null` = tout l'espace (le défaut historique). Sinon, les identifiants de
 * périmètre dont les données lui sont visibles — à quoi l'appelant ajoute ce qui
 * n'est rattaché à AUCUN périmètre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS CHOIX, ET LA RAISON DE CHACUN
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **Fonction PURE**, comme `portfolioScopeFor`. Le cloisonnement est le genre
 *    de règle qu'on ne peut pas vérifier à l'œil dans une requête de quarante
 *    lignes ; ici elle se lit, se teste sans base, et ne peut pas diverger entre
 *    les écrans qui listent des comptes.
 *
 * 2. **`includeUnassigned: true`**, toujours. Un compte sans BU reste visible de
 *    qui le voyait avant : la dimension est ADDITIVE, rien ne disparaît pour
 *    personne le jour du déploiement. Sans cette moitié, tout le portefeuille
 *    historique — qui n'a aucune BU — s'évanouirait pour chaque membre cloisonné,
 *    ce qui serait le contraire d'un ajout.
 *
 * 3. **AUCUN contournement par le rôle.** `portfolioScopeFor` laisse passer un
 *    porteur de `team:manage` ; ici, non — et c'est délibéré. Le responsable
 *    d'une agence PORTE `team:manage` sur son agence : lui accorder l'espace
 *    entier au motif qu'il gère une équipe viderait le niveau intermédiaire de
 *    son seul usage (#2005.7 — « un utilisateur d'un grand groupe garde un petit
 *    périmètre »). Qui doit tout voir porte `'workspace'`, qui est le défaut ;
 *    c'est une décision explicite, pas une déduction.
 *
 * ⚠️ Une liste VIDE avec `'business_unit'` ne rend PAS `null`. Un membre
 * cloisonné qui ne porte aucun périmètre voit ce que personne ne porte, et rien
 * d'autre. Rendre `null` ici — « il n'a pas de BU, donc pas de filtre » — est
 * l'erreur qui ouvrirait l'espace entier au premier membre mal configuré.
 */
export function businessUnitScopeFor(
  access: BusinessUnitAccess,
  memberBusinessUnitIds: readonly string[],
): { businessUnitIds: readonly string[]; includeUnassigned: true } | null {
  if (access === 'workspace') return null
  return { businessUnitIds: [...memberBusinessUnitIds], includeUnassigned: true }
}

/** Une BU telle que l'API la rend (#2087.14 : nom, territoire, responsable, membres, état). */
export const businessUnitSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: businessUnitKindSchema,
  territory: z.string().nullable(),
  specialties: z.array(z.string()),
  /** ⚠️ `null` = non renseigné, jamais `0` : « je n'ai pas dit » n'est pas « aucun ». */
  consultantCount: z.number().int().nullable(),
  teamSize: z.number().int().nullable(),
  leadUserId: z.string().nullable(),
  portfolioNote: z.string().nullable(),
  /**
   * #2005.5 (DÉCISION Louis 17/09, lot CP2) — consultants DISPONIBLES,
   * saisis par le responsable de BU dans les réglages des périmètres.
   * ⚠️ `null` = non renseigné, jamais `0` : « je n'ai pas dit » n'est pas
   * « aucun consultant disponible ».
   */
  capacityAvailableConsultants: z.number().int().nullable(),
  /** #2005.5 (DÉCISION Louis 17/09, lot CP2) — l'objectif du trimestre, texte
   *  libre saisi par le responsable de BU. `null` = non renseigné. */
  quarterObjective: z.string().nullable(),
  status: businessUnitStatusSchema,
  memberCount: z.number().int(),
  /** L'appelant en est-il membre ? C'est ce qui décide entre « Rejoindre » et
   *  « Demander l'accès » (#2087.15 / #2087.16). */
  viewerIsMember: z.boolean(),
  viewerAccessRequestStatus: businessUnitAccessRequestStatusSchema.nullable(),
})
export type BusinessUnitView = z.infer<typeof businessUnitSchema>

export const businessUnitListSchema = z.object({
  businessUnits: z.array(businessUnitSchema),
  /** Le niveau d'accès de l'appelant — l'écran le NOMME (#2081.21). */
  viewerAccess: businessUnitAccessSchema,
})
export type BusinessUnitList = z.infer<typeof businessUnitListSchema>

const nameSchema = z.string().trim().min(1).max(120)

const specialtiesSchema = z.array(z.string().trim().min(1).max(80)).max(20)

/** Les sept champs de la saisie #2087.11. Seul le nom est obligatoire. */
export const createBusinessUnitSchema = z.object({
  name: nameSchema,
  kind: businessUnitKindSchema.default('business_unit'),
  territory: z.string().trim().max(160).nullish(),
  specialties: specialtiesSchema.default([]),
  consultantCount: z.number().int().min(0).max(100000).nullish(),
  teamSize: z.number().int().min(0).max(100000).nullish(),
  leadUserId: z.string().guid().nullish(),
  portfolioNote: z.string().trim().max(2000).nullish(),
  // #2005.5 (DÉCISION Louis 17/09, lot CP2) — capacité et objectif du
  // trimestre, saisis par le responsable de BU dans les réglages des
  // périmètres. Facultatifs à la création, comme les autres champs de ce
  // schéma hors nom.
  capacityAvailableConsultants: z.number().int().min(0).max(100000).nullish(),
  quarterObjective: z.string().trim().max(500).nullish(),
})
export type CreateBusinessUnit = z.infer<typeof createBusinessUnitSchema>

// zod 4 applique le `.default()` d'un champ même sous `.partial()` : un PATCH sans
// `specialties` les viderait. `kind` et `specialties` sont redéclarés SANS défaut.
export const updateBusinessUnitSchema = createBusinessUnitSchema.partial().extend({
  kind: businessUnitKindSchema.optional(),
  specialties: specialtiesSchema.optional(),
  status: businessUnitStatusSchema.optional(),
})
export type UpdateBusinessUnit = z.infer<typeof updateBusinessUnitSchema>

/** Corps de `POST /business-units/:id/access-request` (#2087.16). */
export const requestBusinessUnitAccessSchema = z.object({
  message: z.string().trim().max(500).nullish(),
})
export type RequestBusinessUnitAccess = z.infer<typeof requestBusinessUnitAccessSchema>

/** Corps de `PUT /business-units/members/:userId` — le niveau d'accès d'un membre. */
export const setMemberBusinessUnitAccessSchema = z.object({
  access: businessUnitAccessSchema,
  businessUnitIds: z.array(z.string().guid()).max(50).default([]),
})
export type SetMemberBusinessUnitAccess = z.infer<typeof setMemberBusinessUnitAccessSchema>

/** Corps de `PUT /accounts/:id/business-unit` — le rattachement d'un compte (#2081.10). */
export const assignAccountBusinessUnitSchema = z.object({
  /** `null` DÉTACHE : le compte redevient visible de tous les cloisonnés. */
  businessUnitId: z.string().guid().nullable(),
})
export type AssignAccountBusinessUnit = z.infer<typeof assignAccountBusinessUnitSchema>

/**
 * #2259.30 / #2259.32 / #2259.33 / #2259.34 / #2259.35 — CE QUE LAURA REÇOIT
 * POUR UNE BU PORTÉE (DÉCISION Louis 17/09 après-midi : la BU est un
 * CONTEXTE pour prioriser et formuler, JAMAIS un FILTRE de ce que Laura voit
 * ailleurs).
 *
 * Contrat partagé (pas un zod schema : assemblé server-side, jamais posté par
 * un navigateur) entre `ChatContextService` (API, qui le construit) et
 * `IaClient` (API, qui le transmet) — évite l'import croisé `ia` → `ia-proxy`.
 *
 * `capacity` / `quarterObjective` / `consultantCount` / `teamSize` (#3384.1) :
 * la couche BU DÉCLARÉE par le responsable de BU (colonnes du lot CP2) ; `null`
 * tant que non renseignée — jamais deviné, jamais un défaut fabriqué.
 * `referenceCount` : `null` car AUCUNE colonne ne rattache une référence à une
 * BU dans le schéma actuel (#2259.34) — distinct de `accountCount`, un compte
 * RÉEL (`0` compris) car `accounts.business_unit_id` existe.
 */
export type BusinessUnitContextItem = {
  name: string
  territory: string | null
  specialties: readonly string[]
  capacity: string | null
  quarterObjective: string | null
  accountCount: number
  consultantCount: number | null
  referenceCount: number | null
  /** #3384.1 — l'effectif DÉCLARÉ de l'équipe commerciale de la BU ; `null` = non déclaré. */
  teamSize: number | null
}
