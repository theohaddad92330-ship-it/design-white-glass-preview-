/**
 * Correspondance champ d'API (camelCase) → colonne, pour les objets de fiche.
 *
 * Une seule carte, partagée par l'édition humaine et par les writers du
 * pipeline. Deux cartes finiraient par diverger, et la divergence se lirait
 * ainsi : un champ protégé côté édition, réécrit côté pipeline, sans que
 * personne ne comprenne pourquoi la correction n'a pas tenu.
 *
 * Les listes sont FERMÉES et littérales : le nom de colonne entre dans un
 * `UPDATE`, il ne doit donc jamais pouvoir venir d'une valeur d'entrée.
 */

/** Ce qu'un humain peut corriger sur un COMPTE. */
export const ACCOUNT_FIELD_COLUMNS = {
  companyName: 'company_name',
  tradeName: 'trade_name',
  sector: 'sector',
  employees: 'employees',
  revenue: 'revenue',
  headquarters: 'headquarters',
  website: 'website',
  phone: 'phone',
  address: 'address',
  siren: 'siren',
  nafCode: 'naf_code',
  // #2165.24 / #2166.3 / #2165.16 — lien capitalistique. Écrit par le
  // pipeline (`AccountsService.applyResearch`), corrigeable par un humain
  // via le même arbitre : une correction humaine gagne toujours.
  groupHeadSiren: 'group_head_siren',
  groupRole: 'group_role',
  groupLinkSource: 'group_link_source',
  groupLinkObservedAt: 'group_link_observed_at',
  // #219.6 (#3231, lot X50) — CLIENT INTERNE DÉCLARÉ (jamais deviné).
  declaredInternalClientMode: 'declared_internal_client_mode',
  // #219.6 (J05) — les quatre rôles d'une direction interne, nommés à la main.
  declaredInternalSponsor: 'declared_internal_sponsor',
  declaredInternalUsers: 'declared_internal_users',
  declaredLegalEntity: 'declared_legal_entity',
  declaredEndClient: 'declared_end_client',
  // #3278.2 (lot M11) — les six critères de route sans source, déclarés à la main.
  declaredRouteScope: 'declared_route_scope',
  declaredRouteObjectives: 'declared_route_objectives',
  declaredRouteAvailableRoles: 'declared_route_available_roles',
  declaredRoutePartners: 'declared_route_partners',
  declaredRouteHistory: 'declared_route_history',
  declaredRouteTiming: 'declared_route_timing',
  // #3278.2b (Louis 15/10) — déclaratifs.
  declaredRouteBudget: 'declared_route_budget',
  declaredRouteAvailability: 'declared_route_availability',
  declaredRouteNetwork: 'declared_route_network',
  // #3278.1 (décision Louis 11/10/2026) — les faits des routes « événement / communauté » et « inbound / contenu ».
  declaredRouteEvent: 'declared_route_event',
  declaredRouteInbound: 'declared_route_inbound',
  // #219.6 (#3231, lot X50) — les FILIALES déclarées à la main (saisie texte → liste) :
  // la correction humaine gagne, l'analyse ne les réécrit plus.
  subsidiaries: 'subsidiaries',
} as const

/** Ce qu'un humain peut corriger sur un CONTACT. */
export const CONTACT_FIELD_COLUMNS = {
  fullName: 'full_name',
  title: 'title',
  entity: 'entity',
  email: 'email',
  phone: 'phone',
  linkedinUrl: 'linkedin_url',
  family: 'family',
  decisionRole: 'decision_role',
  assignedTo: 'assigned_to',
  // #2861 (#2437.2, 26/09/2026) — le niveau DESTINATAIRE de langue.
  locale: 'locale',
  // #219.8 (#3231, lot Q03) — la relation personne↔entreprise DÉCLARÉE.
  declaredPersonCompanyRelation: 'declared_person_company_relation',
} as const

/**
 * Ce que le PIPELINE écrit sur un contact — les champs éditables plus ceux
 * qu'aucun humain ne saisit (priorité calculée, portrait, leviers de carrière).
 * Tous passent par l'arbitre : c'est ce qui empêche l'enrichissement de rendre
 * un `null` et d'effacer une adresse trouvée à la main.
 */
export const CONTACT_PIPELINE_FIELD_COLUMNS = {
  ...CONTACT_FIELD_COLUMNS,
  priority: 'priority',
  profileSummary: 'profile_summary',
  whyContact: 'why_contact',
  careerLevers: 'career_levers',
  implicitFears: 'implicit_fears',
} as const

/**
 * #3219 (#190.2) — les champs d'un contact qui DÉPENDENT du périmètre d'une
 * analyse (l'entité où il exerce, sa famille, son rôle dans la décision).
 * Seuls ceux-là reçoivent la portée déclarée du run (`FieldChange.scope`) :
 * l'e-mail ou le téléphone d'une personne ne changent pas avec le périmètre.
 */
export const PERIMETER_SCOPED_CONTACT_FIELDS: ReadonlySet<string> = new Set(['entity', 'family', 'decisionRole'])

type ContactPipelineField = keyof typeof CONTACT_PIPELINE_FIELD_COLUMNS

/** Projette une ligne de base sur les noms de champ d'API, pour l'arbitre. */
export function toFieldView(
  row: Record<string, unknown>,
  columns: Readonly<Record<string, string>>,
): Record<string, unknown> {
  const view: Record<string, unknown> = {}
  for (const [field, column] of Object.entries(columns)) view[field] = row[column]
  return view
}

/** Projette un lot de champs d'API sur leurs colonnes, pour l'`UPDATE`. */
export function toColumnPatch(
  fields: Record<string, unknown>,
  columns: Readonly<Record<string, string>>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const [field, value] of Object.entries(fields)) {
    const column = columns[field]
    if (column) patch[column] = value
  }
  return patch
}
