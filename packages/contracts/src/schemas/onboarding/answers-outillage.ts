import { z } from 'zod'
import { PROFILE_ANSWER_MAX_MULTI } from './limits.js'

/**
 * Cartographier la chaîne, pas collectionner les logos — #2054.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ONZE COLONNES ET NON UN `text[]` DE PLUS
 * ─────────────────────────────────────────────────────────────────────────────
 * `tooling` (profil progressif) est un tableau PLAT de quatorze noms : il dit
 * qu'un outil existe quelque part, jamais où vit quoi. La demande veut une
 * CHAÎNE : une entrée par maillon (#2054.1 à #2054.11), chacune répondant
 * « qui s'en sert » (#2054.12) — c'est-à-dire onze colonnes distinctes. Un
 * douzième tableau plat aurait reposé exactement la même question.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI AUCUNE MARQUE N'EST ÉCRITE ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * Doctrine `tool-naming` (décision Louis 13/09/2026) : NOS fournisseurs ne se
 * nomment JAMAIS, et l'outil du client ne se nomme que s'il est BRANCHÉ, par
 * injection depuis les connexions de l'espace. Une question d'onboarding
 * s'adresse à quelqu'un qui n'a encore rien branché : elle nomme donc la
 * CAPACITÉ (« ton CRM », « ta messagerie », « un outil pour retrouver des
 * coordonnées »). C'est aussi ce que demande le titre de l'issue. Gardes :
 * `answers-outillage.test.ts` ici, GA-44 et `i18n/no-vendor-names.test.ts` côté web.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI N'EST PAS DEVINÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Toutes les colonnes sont `.nullable().optional()`, comme le reste du Temps 1
 * hors questions obligatoires : une question passée reste INCONNUE. « Nous
 * n'avons pas cet outil » est une absence DÉCLARÉE par l'utilisateur, et
 * {@link toolingFamilyIsAbsent} ne la confond jamais avec une question sans
 * réponse — « non mesuré » n'est pas « 0 ».
 */

/**
 * L'échelle des onze entrées : à la fois « cet outil existe-t-il ? » (#2054.1
 * à #2054.11) et « utilisé par qui ? » (#2054.12) — une seule question par
 * maillon plutôt que vingt-deux, parce qu'un outil que personne n'utilise et un
 * outil qui n'existe pas sont la même chose pour la chaîne.
 *
 * Valeurs PERSISTÉES verbatim (colonnes `esn_profiles`), donc jamais traduites
 * — même règle que tout le questionnaire.
 */
export const TOOLING_PRESENCE_SCALE = [
  "Nous n'avons pas cet outil",
  'Moi seul',
  'Mon équipe commerciale',
  "Toute l'ESN",
  'Un autre service (ADV, direction, recrutement)',
  'Je ne sais pas',
] as const

/** La valeur qui dit « nous n'en avons pas » — voir {@link toolingFamilyIsAbsent}. */
export const TOOLING_PRESENCE_ABSENT: string = TOOLING_PRESENCE_SCALE[0]

/**
 * #2054.1-.11 — l'absence DÉCLARÉE d'un maillon, et elle seule.
 *
 * ⚠️ Le défaut mesuré le 14/09/2026 dans `profile-questionnaire.ts` : un
 * prédicat comparé à `'1'` quand les six valeurs réelles sont des libellés est
 * TOUJOURS faux en production, et invisible aux tests dont les fixtures
 * inventent la donnée. Ce prédicat-ci compare à {@link TOOLING_PRESENCE_SCALE},
 * la liste que la question PRODUIT, et sa garde l'éprouve sur elle.
 *
 * `null`, `undefined` et `''` rendent `false` : une question sans réponse n'est
 * pas une absence d'outil, c'est une absence d'INFORMATION.
 */
export function toolingFamilyIsAbsent(value: string | null | undefined): boolean {
  return value === TOOLING_PRESENCE_ABSENT
}

/**
 * #2054.13 — la source de RÉFÉRENCE : l'ancre des six attributs qui suivent.
 * Sans elle, « fraîcheur » et « confiance » porteraient sur un objet flou.
 * Les libellés nomment la CAPACITÉ, jamais un éditeur.
 */
export const TOOLING_REFERENCE_CHOICES = [
  'Le CRM',
  "L'ATS",
  "L'ERP",
  'La messagerie',
  'Un tableur',
  'Un espace de fichiers partagés',
  'Mes notes personnelles',
  'Nulle part : tout est dans ma tête',
] as const

/** #2054.13 — ce que cette source contient réellement. */
export const TOOLING_REFERENCE_DATA_CHOICES = [
  'Les comptes et leurs interlocuteurs',
  'Les coordonnées (téléphone, e-mail)',
  "L'historique des échanges",
  'Les besoins et les opportunités en cours',
  'Les propositions et les prix pratiqués',
  'Les dossiers de compétences des consultants',
  'Les comptes rendus de rendez-vous',
] as const

/**
 * #2054.14 — la fraîcheur, en bandes DÉCLARÉES.
 *
 * Aucune date n'est calculée à la place de l'utilisateur, et « Je ne sais pas »
 * est une réponse honnête — à ne pas confondre avec l'absence de réponse, qui
 * reste `null` et ne vaut jamais « à jour ».
 */
export const TOOLING_FRESHNESS_CHOICES = [
  'Mise à jour au fil de l’eau',
  'Mise à jour il y a moins d’une semaine',
  'Mise à jour il y a moins d’un mois',
  'Plus rien n’a bougé depuis des mois',
  'Je ne sais pas',
] as const

/**
 * #2054.15 — la confiance DÉCLARÉE dans le contenu.
 *
 * ⚠️ Ce n'est pas un score : ni note, ni pourcentage, ni « chance que ce soit
 * juste ». Le produit n'affiche AUCUNE probabilité (doctrine `c26_probabilite`),
 * et un jugement de l'utilisateur sur ses propres données n'en est pas une.
 */
export const TOOLING_CONFIDENCE_CHOICES = [
  'Je m’y fie sans vérifier',
  'Je vérifie les points importants',
  'Je revérifie tout avant de m’en servir',
  'Je ne m’en sers plus',
  'Je ne sais pas',
] as const

/** #2054.16 — la possibilité d'en sortir ses données. */
export const TOOLING_EXPORT_CHOICES = [
  'Oui, je peux exporter moi-même',
  'Oui, mais il faut passer par quelqu’un',
  'Non, les données sont captives',
  'Je ne sais pas',
] as const

/**
 * #2054.17 — la même information à plusieurs endroits.
 *
 * Un constat, et rien d'autre : on PROPOSE une fusion de doublons, on ne
 * fusionne JAMAIS — cette réponse ne déclenche aucune écriture.
 */
export const TOOLING_DUPLICATES_CHOICES = [
  'Non, chaque information a un seul endroit',
  'Oui, entre deux outils',
  'Oui, entre trois outils ou plus',
  'Je ne sais pas',
] as const

/** Les onze maillons de la chaîne, dans l'ordre de la demande (#2054.1-.11). */
export const TOOLING_MAP_KEYS = [
  'tooling_crm',
  'tooling_ats',
  'tooling_erp',
  'tooling_mailbox',
  'tooling_calendar',
  'tooling_drive',
  'tooling_spreadsheet',
  'tooling_enrichment',
  'tooling_sourcing_platform',
  'tooling_bi',
  'tooling_personal_notes',
] as const
export type ToolingMapKey = (typeof TOOLING_MAP_KEYS)[number]

/**
 * #2054.19 — la famille du registre d'outils (`tool-registry.ts`) qu'une
 * connexion RÉELLE de l'espace permet de rattacher à un maillon, et rien de
 * plus.
 *
 * ⚠️ Le contre-exemple lu au registre : `!ctx.hasConnectedTooling` masquait la
 * TOTALITÉ de la question `tooling` dès qu'UNE connexion existait. Une
 * connexion parle de SON maillon ; le défaut est de se taire sur les autres.
 *
 * Les familles absentes de cette table le sont à dessein, avec leur raison :
 * `linkedin`, `prospection`, `communication`, `data`, `finance`, `mcp`,
 * `telephony`, `admin_docs` existent bien dans le registre, mais une connexion
 * dans l'une d'elles ne prouve RIEN sur l'un des onze maillons — la rattacher
 * serait deviner. `tooling_erp`, `tooling_spreadsheet`, `tooling_enrichment`,
 * `tooling_bi` et `tooling_personal_notes` n'ont donc aucune source de
 * préremplissage : ils se posent, ils ne se supposent pas. (`ats` du registre
 * couvre « ATS / ERP de l'ESN » : on le rattache au seul `tooling_ats`, jamais
 * aux deux — un même branchement ne répond pas à deux questions.)
 */
const TOOLING_FAMILY_TO_MAP_KEY: Readonly<Record<string, ToolingMapKey>> = {
  crm: 'tooling_crm',
  ats: 'tooling_ats',
  email: 'tooling_mailbox',
  calendar: 'tooling_calendar',
  documents: 'tooling_drive',
  jobs: 'tooling_sourcing_platform',
}

/**
 * #2054.19 — les maillons dont une connexion de l'espace peut parler, dans
 * l'ordre de {@link TOOLING_MAP_KEYS} et sans doublon.
 *
 * Tolérant par construction (une charge utile inattendue, un front neuf sur une
 * API ancienne) : ce qui n'est pas un tableau rend une liste vide plutôt que de
 * faire tomber le questionnaire.
 */
export function toolingMapKeysForConnectedTools(
  tools: readonly { family: string }[] | null | undefined,
): ToolingMapKey[] {
  if (!Array.isArray(tools)) return []
  const touched = new Set<ToolingMapKey>()
  for (const tool of tools as ReadonlyArray<{ family?: string } | null | undefined>) {
    const key = tool?.family ? TOOLING_FAMILY_TO_MAP_KEY[tool.family] : undefined
    if (key) touched.add(key)
  }
  return TOOLING_MAP_KEYS.filter(key => touched.has(key))
}

/**
 * #4971 — les outils MAISON (CRM, ATS, ERP développés en interne) : un nom
 * LIBRE, parce qu'un outil interne n'a ni catalogue ni marque à choisir.
 *
 * ⚠️ #4971.2 — un nom saisi ici n'est JAMAIS « branché » : il n'entre pas dans
 * {@link TOOLING_MAP_KEYS}, et seule une connexion RÉELLE de l'espace
 * ({@link toolingMapKeysForConnectedTools}) confirme un maillon.
 */
export const TOOLING_INTERNAL_NAMES_MAX = PROFILE_ANSWER_MAX_MULTI
/** #4971 — longueur d'un nom d'outil interne (au-delà, c'est une phrase, pas un nom). */
export const TOOLING_INTERNAL_NAME_MAX_LENGTH = 80

const presence = (): z.ZodOptional<z.ZodNullable<z.ZodString>> => z.string().nullable().optional()

/**
 * Les 18 colonnes de la cartographie, plus les noms d'outils maison (#4971). Toutes ADDITIVES et nullables — migration
 * `1794024402918-OutillageCartographie`.
 */
export const OUTILLAGE_ANSWER_FIELDS = {
  // #2054.1 — le CRM : comptes, contacts, opportunités.
  tooling_crm: presence(),
  // #2054.2 — l'ATS : candidatures, profils, dossiers de compétences.
  tooling_ats: presence(),
  // #2054.3 — l'ERP ESN : missions, staffing, facturation.
  tooling_erp: presence(),
  // #2054.4 — la messagerie. ⚠️ Cette question demande OÙ vivent les échanges,
  // jamais leur contenu : le CORPS d'un message ne sort ni vers un humain ni
  // vers le modèle (D65), et répondre ici n'ouvre aucun accès à une boîte.
  tooling_mailbox: presence(),
  // #2054.5 — l'agenda.
  tooling_calendar: presence(),
  // #2054.6 — l'espace de fichiers partagés.
  tooling_drive: presence(),
  // #2054.7 — les tableurs.
  tooling_spreadsheet: presence(),
  // #2054.8 — un outil pour retrouver des coordonnées. La CAPACITÉ, jamais une
  // marque : nos propres fournisseurs d'enrichissement ne se nomment nulle part.
  tooling_enrichment: presence(),
  // #2054.9 — les plateformes où l'ESN reçoit ou publie des besoins.
  tooling_sourcing_platform: presence(),
  // #2054.10 — le pilotage et le reporting.
  tooling_bi: presence(),
  // #2054.11 — les notes personnelles.
  tooling_personal_notes: presence(),
  // #2054.13 — l'ancre des six attributs qui suivent : la source de RÉFÉRENCE.
  // Sans elle, « fraîcheur » et « confiance » porteraient sur un objet flou.
  tooling_reference: presence(),
  // #2054.13 — ce que cette source contient réellement.
  tooling_reference_data: z.array(z.string()).optional(),
  // #2054.14 — sa fraîcheur. Une bande déclarée, jamais une date calculée.
  tooling_reference_freshness: presence(),
  // #2054.15 — la confiance que l'utilisateur lui accorde. DÉCLARATIF : ce
  // n'est pas un score, il n'y a ni note, ni pourcentage, ni probabilité.
  tooling_reference_confidence: presence(),
  // #2054.16 — la possibilité d'export.
  tooling_reference_export: presence(),
  // #2054.17 — le doublon. ⚠️ On PROPOSE une fusion, on ne fusionne JAMAIS :
  // cette réponse ne déclenche aucune écriture.
  tooling_duplicates: presence(),
  // #2054.18 — la douleur. Texte libre : une douleur ne se choisit pas dans une
  // liste fermée sans la déformer.
  tooling_pain: presence(),
  // #4971.1 — les noms des outils MAISON. Liste bornée de noms libres ; absente
  // = question passée, jamais « aucun outil interne ». Migration
  // `1796610000200-OutillageNomsInternes`.
  tooling_internal_names: z
    .array(z.string().trim().min(1).max(TOOLING_INTERNAL_NAME_MAX_LENGTH))
    .max(TOOLING_INTERNAL_NAMES_MAX)
    .nullable()
    .optional(),
}
