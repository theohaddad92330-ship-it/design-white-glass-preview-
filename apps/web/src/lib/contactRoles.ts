import type { DecisionRole } from '@bellum/contracts'
import { i18n } from '@/i18n'

export const ROLE_FILTERS = [
  'all',
  'sponsor',
  'champion',
  'operational',
  'purchasing',
  'influencer',
  'blocker',
] as const

export type RoleFilter = (typeof ROLE_FILTERS)[number]

/**
 * #3400.6 (retour bêta #3400) — la taxonomie MEDDIC COURANTE, celle qu'un
 * humain doit pouvoir CHOISIR pour corriger un rôle. Reprise, pas recopiée,
 * du commentaire de `decisionRoleSchema` (`@bellum/contracts`,
 * `schemas/contact.ts`) : les 7 rôles émis aujourd'hui — `sponsor` /
 * `operational` / `purchasing` restent lisibles sur une fiche ancienne
 * (`decisionRoleSchema` les garde) mais ne sont plus proposés à la
 * correction, pour ne pas remettre en circulation un vocabulaire retiré.
 */
export const CURRENT_DECISION_ROLES = [
  'technical',
  'economic',
  'procurement',
  'user',
  'champion',
  'influencer',
  'blocker',
] as const satisfies readonly DecisionRole[]

type RoleColors = {
  bg: string
  text: string
  border: string
  glow: string
}

/**
 * L'UTILISATEUR — « il subira le résultat ». Vert, comme le dit la table des
 * 5 couleurs de rôle de décision du tome 7 §26.2.
 */
const USER_COLORS: RoleColors = {
  bg: 'bg-green-200 dark:bg-green-400',
  text: 'text-[var(--bellum-text-secondary)]',
  border: 'border-[color-mix(in_srgb,var(--bellum-text-muted)_25%,transparent)]',
  glow: 'transparent',
}

/**
 * L'INCONNU — gris, et c'est la ligne la plus importante de ce fichier.
 *
 * Tome 7 §26.2 : « **Le gris est le plus important.** Un organigramme où tout
 * est coloré est un organigramme inventé. » Le rôle `unknown` partageait la
 * MÊME entrée que `user` : une personne dont on ignore le poids de décision
 * s'affichait en vert, exactement comme une personne dont on sait qu'elle
 * subira le résultat. Le commercial lisait « rôle établi » là où la donnée
 * disait « je ne sais pas ».
 *
 * ⚠️ La pastille garde la MÊME forme que ses voisines — un fond OPAQUE clair
 * dans les deux thèmes — parce que `RoleBadge` pose `text-black` par-dessus :
 * un fond à opacité se composerait sur le fond du thème et rendrait le texte
 * illisible en sombre. Gris opaque, donc, pas gris translucide.
 */
const UNKNOWN_COLORS: RoleColors = {
  bg: 'bg-slate-200 dark:bg-slate-400',
  text: 'text-[var(--bellum-text-secondary)]',
  border: 'border-[color-mix(in_srgb,var(--bellum-text-muted)_25%,transparent)]',
  glow: 'transparent',
}

// recette 10/09 — les six `text` ci-dessous écrivaient une nuance BRUTE de la
// palette Tailwind (`text-violet-400`…), pensée pour un fond sombre et qui
// court-circuite le système de tokens (aucune des deux, `RoleBadge` pose de
// toute façon `text-black` par-dessus — voir son docblock — ce champ reste
// écrit pour les futurs appelants qui, eux, l'utiliseront). Les remplacements
// reprennent la MÊME correspondance déjà en place pour les rôles équivalents
// dans `Badges.tsx` (sponsor→accent, purchasing→warning, blocker→danger,
// champion→info) : violet → `--bellum-text-accent`, bleu/cyan/ciel → la
// famille « info », ambre → « warning », rouge → « danger ». Chaque token
// passe AA des deux côtés — aucune nuance fixe ne le peut.
const ECONOMIC_COLORS: RoleColors = {
  bg: 'bg-[var(--bellum-primary-100)] dark:bg-[var(--bellum-primary-300)]',
  text: 'text-[var(--bellum-text-accent)]',
  border: 'border-violet-600/25',
  glow: 'rgba(139, 92, 246, 0.2)',
}

const TECHNICAL_COLORS: RoleColors = {
  bg: 'bg-sky-100 dark:bg-sky-400',
  text: 'text-[var(--info-soft-text)]',
  border: 'border-sky-500/25',
  glow: 'rgba(56, 189, 248, 0.2)',
}

const CHAMPION_COLORS: RoleColors = {
  bg: 'bg-blue-100 dark:bg-blue-400',
  text: 'text-[var(--info-soft-text)]',
  border: 'border-blue-500/25',
  glow: 'rgba(59, 130, 246, 0.2)',
}

const PROCUREMENT_COLORS: RoleColors = {
  bg: 'bg-amber-100 dark:bg-amber-400',
  text: 'text-[var(--warning-soft-text)]',
  border: 'border-amber-500/25',
  glow: 'rgba(251, 191, 36, 0.2)',
}

const INFLUENCER_COLORS: RoleColors = {
  bg: 'bg-cyan-100 dark:bg-cyan-400',
  text: 'text-[var(--info-soft-text)]',
  border: 'border-cyan-500/25',
  glow: 'rgba(34, 211, 238, 0.2)',
}

const BLOCKER_COLORS: RoleColors = {
  bg: 'bg-red-500',
  text: 'text-[var(--danger-soft-text)]',
  border: 'border-red-500/25',
  glow: 'rgba(248, 113, 113, 0.2)',
}

export const ROLE_COLORS: Record<string, RoleColors> = {
  sponsor: ECONOMIC_COLORS,
  economic: ECONOMIC_COLORS,
  champion: CHAMPION_COLORS,
  technical: TECHNICAL_COLORS,
  operational: USER_COLORS,
  user: USER_COLORS,
  purchasing: PROCUREMENT_COLORS,
  procurement: PROCUREMENT_COLORS,
  influencer: INFLUENCER_COLORS,
  blocker: BLOCKER_COLORS,
  unknown: UNKNOWN_COLORS,
}

export const ORGANIGRAMME_ROLE_WEIGHTS: Record<DecisionRole, number> = {
  sponsor: 6,
  economic: 6,
  champion: 5,
  technical: 4,
  influencer: 3,
  purchasing: 3,
  procurement: 3,
  operational: 2,
  user: 2,
  blocker: 1,
  unknown: 0,
}

type OrganigrammeLegendItem = {
  role: DecisionRole
  label: string
  description: string
  dotClass: string
}

const ORGANIGRAMME_LEGEND_DOTS: Array<{ role: DecisionRole; dotClass: string }> = [
  { role: 'economic', dotClass: ECONOMIC_COLORS.bg },
  { role: 'technical', dotClass: TECHNICAL_COLORS.bg },
  { role: 'champion', dotClass: CHAMPION_COLORS.bg },
  { role: 'influencer', dotClass: INFLUENCER_COLORS.bg },
  { role: 'procurement', dotClass: PROCUREMENT_COLORS.bg },
  { role: 'user', dotClass: USER_COLORS.bg },
  { role: 'blocker', dotClass: BLOCKER_COLORS.bg },
]

/** Résolu à l'appel (pas à l'import) pour suivre la langue courante. */
export function getOrganigrammeLegendItems(): OrganigrammeLegendItem[] {
  // i18n keys: roleDescriptions.economic | roleDescriptions.technical | roleDescriptions.champion |
  // roleDescriptions.influencer | roleDescriptions.procurement | roleDescriptions.user | roleDescriptions.blocker
  return ORGANIGRAMME_LEGEND_DOTS.map(({ role, dotClass }) => ({
    role,
    label: getRoleLabel(role),
    description: i18n.t(`contacts:roleDescriptions.${role}`),
    dotClass,
  }))
}

/** Un rôle que la table ne connaît pas est un rôle INCONNU, donc gris — pas
 *  un « utilisateur » vert par défaut (§26.2). */
export function getRoleColors(role: string): RoleColors {
  return ROLE_COLORS[role] ?? UNKNOWN_COLORS
}

/** Libellé display d'un rôle décisionnel (les VALEURS d'enum restent en anglais). */
export function getRoleLabel(role: string): string {
  // i18n keys: roles.all | roles.sponsor | roles.economic | roles.champion | roles.technical |
  // roles.influencer | roles.procurement | roles.purchasing | roles.user | roles.operational |
  // roles.blocker | roles.unknown
  return i18n.t(`contacts:roles.${role}`, { defaultValue: role })
}

/** La phrase d'une ligne qui explique le rôle (déjà écrite pour la légende de
 *  l'organigramme, `getOrganigrammeLegendItems` ci-dessus) — réemployée telle
 *  quelle (GA-26), jamais reformulée une seconde fois. `''` pour un rôle
 *  légataire/`unknown` sans description écrite (jamais devinée). */
export function getRoleDescription(role: string): string {
  // i18n keys: roleDescriptions.economic | roleDescriptions.technical | roleDescriptions.champion |
  // roleDescriptions.influencer | roleDescriptions.procurement | roleDescriptions.user | roleDescriptions.blocker
  return i18n.t(`contacts:roleDescriptions.${role}`, { defaultValue: '' })
}

export function getOrganigrammeRoleWeight(role: DecisionRole | null | undefined): number {
  return ORGANIGRAMME_ROLE_WEIGHTS[role ?? 'unknown']
}

/**
 * #3401 — « pour chaque contact recommandé, expliquer son utilité
 * commerciale » : ce qu'il peut CONFIRMER (il vit le terrain), ce qu'il peut
 * FAIRE AVANCER (relais interne), ce qu'il ne peut probablement PAS décider
 * seul (le budget). Dérivé de la MÊME taxonomie MEDDIC que
 * `roleDescriptions` (contacts.json) et `decisionRoleSchema`
 * (`@bellum/contracts`) — pas une seconde liste (GA-26) : trois ensembles de
 * rôles, jamais une prose par rôle qui inventerait un jugement sur la
 * personne plutôt que sur la FONCTION qu'elle occupe.
 */
const ROLES_THAT_CONFIRM_GROUND_TRUTH: ReadonlySet<string> = new Set([
  'technical',
  'user',
  'procurement',
  'blocker',
  'operational',
  'purchasing',
])
const ROLES_THAT_ADVANCE_INTERNALLY: ReadonlySet<string> = new Set(['champion', 'influencer', 'sponsor'])

// Non exporté (`pnpm lint:exports:types`) : consommé uniquement par
// `getRoleUtility` ci-dessous, dans ce même fichier — l'inférence de retour
// suffit aux deux appelants (`ContactCommercialUtility.tsx`, tests).
type ContactRoleUtility = {
  canConfirmGroundTruth: boolean
  canAdvanceInternally: boolean
  /** Décide probablement seul du budget/de l'arbitrage final — SEUL `economic`
   *  porte cette capacité dans le deck MEDDIC (voir `decisionRoleSchema`). */
  canProbablyDecideAlone: boolean
}

/** `null` pour `unknown`/absent : on ne déduit RIEN d'un rôle qu'on n'a pas
 *  (GA-18/19) — l'appelant rend alors la ligne « rôle non établi », jamais
 *  trois capacités devinées. */
export function getRoleUtility(role: string | null | undefined): ContactRoleUtility | null {
  if (!role || role === 'unknown') return null
  return {
    canConfirmGroundTruth: ROLES_THAT_CONFIRM_GROUND_TRUTH.has(role),
    canAdvanceInternally: ROLES_THAT_ADVANCE_INTERNALLY.has(role),
    canProbablyDecideAlone: role === 'economic',
  }
}

/** 13/10/2026 — LA définition du « décideur » : le rôle `economic` (celui que compte « Décideurs
 *  économiques » du plan 5P, `account-strategy-5p.ts`). Un rôle absent ou inconnu n'en est pas un. */
export function isDecisionMaker(role: string | null | undefined): boolean {
  return getRoleUtility(role)?.canProbablyDecideAlone === true
}

/** #4292.2 — le rôle de décision d'une personne NOMMÉE (sans identifiant) parmi les contacts du compte.
 *  Rapprochement par nom normalisé, jamais deviné : aucun homonyme exact unique → `null` (pas de pastille). */
// #4292.2 — la pastille « Décideur » suit le contact par son nom là où aucun identifiant ne voyage.
export function decisionRoleByName(
  contacts: readonly { full_name?: string | null; decision_role?: string | null }[] | null | undefined,
  name: string | null | undefined,
): string | null {
  const wanted = name?.trim().toLowerCase()
  if (!wanted || !Array.isArray(contacts)) return null
  const matches = contacts.filter(c => c?.full_name?.trim().toLowerCase() === wanted)
  return matches.length === 1 ? (matches[0]?.decision_role ?? null) : null
}

const ROLE_QUESTION_FAMILY: Readonly<Record<string, string>> = {
  technical: 'technical',
  economic: 'economic',
  procurement: 'procurement',
  purchasing: 'procurement',
  user: 'user',
  operational: 'user',
  champion: 'champion',
  sponsor: 'champion',
  influencer: 'champion',
  blocker: 'blocker',
}

/** #3401.9 — clé i18n de la question à poser à ce rôle (suggestion tirée du
 *  rôle MEDDIC, jamais un fait sur la personne). `null` si rôle non établi. */
export function getRoleQuestionKey(role: string | null | undefined): string | null {
  const family = role ? ROLE_QUESTION_FAMILY[role] : undefined
  return family ? `utility.question.${family}` : null
}
