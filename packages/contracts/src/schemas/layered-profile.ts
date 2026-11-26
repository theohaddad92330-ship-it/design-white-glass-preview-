import { z } from 'zod'
import {
  businessUnitAccessSchema,
  businessUnitKindSchema,
  businessUnitMembershipSchema,
  type BusinessUnitAccess,
  type BusinessUnitKind,
  type BusinessUnitMembership,
} from './business-unit.js'
import { importContentFingerprint } from './import-resume.js'
import { esnObjectiveSchema } from './onboarding/answers-objectifs.js'
import type { EsnAnswers } from './onboarding.js'
import { portfolioVisibilitySchema, type PortfolioVisibility } from './portfolio-visibility.values.js'
import { workspaceRoleSchema, type WorkspaceRole } from './workspace.js'

/**
 * Le profil à TROIS COUCHES — entreprise · BU · personne — comme UN objet
 * (#2005.4, #2005.5, #2005.6), et la version de chaque couche (#2005.11).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN OBJET COMPOSÉ, ET PAS UNE TABLE DE PLUS
 * ─────────────────────────────────────────────────────────────────────────────
 * Les trois couches existent déjà, chacune dans son coin : la fiche d'entreprise
 * canonique (`esn_profiles`), la BU (`business_units`), la personne (sa
 * surcouche de réponses, son rôle d'espace, ses objectifs du mois, ses
 * préférences épinglées). Les recopier dans une table « profil » ferait deux
 * registres qui divergent au premier écart (GA-26). Cet objet se DÉRIVE à la
 * lecture ; il ne se stocke pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS RÈGLES
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **Ce qui n'existe pas en base vaut `null`**, jamais une valeur de
 *    remplissage — et le manque est NOMMÉ dans `unknown`. Une facette dont
 *    aucune source n'est renseignée vaut `null` ; une couche dont aucune
 *    facette n'est renseignée vaut `null`.
 * 2. **Chaque couche lit SA moitié de la fusion.** Les réponses arrivent déjà
 *    fusionnées (`mergeWorkspaceAnswers` : l'entreprise pour ses clés, la
 *    surcouche du membre pour les siennes). La couche entreprise ne lit que des
 *    clés d'entreprise, la couche personne que des clés personnelles — sinon la
 *    version de l'une bougerait quand l'autre change.
 * 3. **La version est une EMPREINTE du contenu**, pas un compteur : elle ne
 *    demande aucune colonne, elle est identique côté serveur et côté
 *    navigateur, et deux lectures d'un même contenu rendent la même version.
 */

/** Les trois couches, dans l'ordre de la demande. */
export const LAYERED_PROFILE_LAYERS = ['company', 'businessUnit', 'person'] as const
type LayeredProfileLayer = (typeof LAYERED_PROFILE_LAYERS)[number]

/** #2005.4 — Niveau 1 : identité, offres, références, implantations, politiques, taille, modèle. */
export const COMPANY_LAYER_FACETS = [
  'identity',
  'offers',
  'references',
  'locations',
  'policies',
  'size',
  'model',
] as const

/** #2005.5 — Niveau 2 : territoire, spécialités, capacité, consultants, comptes, équipe, objectifs. */
export const BUSINESS_UNIT_LAYER_FACETS = [
  'territory',
  'specialties',
  'capacity',
  'consultants',
  'accounts',
  'team',
  'objectives',
] as const

/** #2005.6 — Niveau 3 : rôle, expérience, portefeuille, habitudes, objectifs, préférences, autorisations. */
export const PERSON_LAYER_FACETS = [
  'role',
  'experience',
  'portfolio',
  'habits',
  'objectives',
  'preferences',
  'permissions',
] as const

/**
 * Les réponses que lit la couche ENTREPRISE — toutes des clés d'entreprise
 * (garde : `layered-profile.test.ts`).
 *
 * `client_references` et `no_go_sectors` y sont DEPUIS le 17/09/2026
 * (DÉCISION Louis, lot CP2, #2005.4) : le questionnaire les posait dans la
 * surcouche PERSONNELLE (`ESN_PERSONAL_ANSWER_KEYS`, Temps 2), une par
 * membre — une référence client ou un secteur refusé décrit l'ESN, pas le
 * vendeur qui a répondu le premier. Migration idempotente
 * (`179561xxxxxxx-CompanyLevelReferencesNoGo`) : la valeur d'un membre
 * devient celle de l'espace SEULEMENT si celle-ci est vide, jamais un
 * écrasement — une correction humaine gagne.
 *
 * `consultants_managed_by_user_band` n'y est PAS : reclassée PERSONNE le
 * même jour (#2005.6) — le nombre de consultants qu'ON gère directement
 * décrit la personne, pas l'entreprise.
 */
export const COMPANY_LAYER_ANSWER_KEYS = [
  'esn_name',
  'company_group_structure',
  'company_age',
  'offer_domains',
  'expertise_areas',
  'service_types',
  'positioning',
  'reference_sectors',
  'case_study_results',
  'client_testimonials',
  // #2039.6 (épopée #2880) — même famille que `case_study_results` : décrit
  // l'ESN (quelles expertises manquent encore de preuve), pas la personne qui
  // a répondu.
  'expertise_no_concrete_proof',
  // #2039.3/.4/.5 (épopée #2880, vague G lot g10) — même famille : décrivent
  // l'ESN, jamais la personne qui a répondu.
  'expertise_personal_experience',
  'expertise_partner',
  'expertise_talent_pool',
  'contractual_constraints',
  'consultant_size',
  'company_size',
  'sales_team_size',
  'staffing_model',
  'staffing_modes',
  'revenue_recurrence',
  // #2005.4 (DÉCISION Louis 17/09) — où l'ESN est implantée (siège + bureaux).
  'company_locations',
  // #2005.4 (DÉCISION Louis 17/09) — passées ENTREPRISE, voir le commentaire
  // au-dessus.
  'client_references',
  'no_go_sectors',
] as const satisfies readonly (keyof EsnAnswers)[]

/** Les réponses que lit la couche PERSONNE — toutes des clés personnelles. */
export const PERSON_LAYER_ANSWER_KEYS = [
  'user_role',
  'role_tenure',
  'industry_tenure',
  'role_functions_practiced',
  'portfolio_size',
  'accounts_relationship_status',
  'weekly_calls',
  'weekly_emails',
  'weekly_linkedin',
  'sales_routine',
  'proactivity_level',
  'individual_goal',
  'monthly_target',
  'esn_objectives',
  'shared_data_scope',
  // #2005.6 (DÉCISION Louis 17/09) — le nombre de consultants gérés
  // DIRECTEMENT par cette personne : reclassée PERSONNE (elle décrivait la
  // personne mais était rangée entreprise par `ESN_PERSONAL_ANSWER_KEYS`,
  // et absente des deux couches — voir #2005.6 au registre).
  'consultants_managed_by_user_band',
] as const satisfies readonly (keyof EsnAnswers)[]

/**
 * La version d'une couche : l'empreinte de son contenu
 * (`importContentFingerprint` — longueur, deux accumulateurs FNV-1a).
 */
export const layerVersionSchema = z.string().regex(/^[0-9a-z]+-[0-9a-z]+-[0-9a-z]+$/)

/**
 * #2005.11 — les trois versions qu'une recommandation porte. Les TROIS clés
 * sont obligatoires ; `null` dit « cette couche n'a pas servi, ou ne se lisait
 * pas » — jamais une version devinée.
 */
export const layerVersionsSchema = z
  .object({
    company: layerVersionSchema.nullable(),
    businessUnit: layerVersionSchema.nullable(),
    person: layerVersionSchema.nullable(),
  })
  .strict()
export type LayerVersions = z.infer<typeof layerVersionsSchema>

const textSchema = z.string().min(1).nullable()
const listSchema = z.array(z.string().min(1)).min(1).nullable()
const countSchema = z.number().int().nonnegative()

const companyLayerSchema = z.object({
  version: layerVersionSchema,
  identity: z.object({ name: textSchema, groupStructure: textSchema, companyAge: textSchema }).nullable(),
  offers: z
    .object({ domains: listSchema, expertiseAreas: listSchema, serviceTypes: listSchema, positioning: textSchema })
    .nullable(),
  references: z
    .object({
      sectors: listSchema,
      caseStudyResults: listSchema,
      testimonials: listSchema,
      // #2005.4 (DÉCISION Louis 17/09) — passées ENTREPRISE (voir le
      // commentaire de `COMPANY_LAYER_ANSWER_KEYS`).
      clientReferences: listSchema,
    })
    .nullable(),
  /** #2005.4 (DÉCISION Louis 17/09) — où l'ESN est IMPLANTÉE (siège +
   *  bureaux), distinct de `geo_zones` qui dit où elle PROSPECTE. `null` tant
   *  que la question (`company_locations`) n'a pas de réponse. */
  locations: z.object({ items: listSchema }).nullable(),
  policies: z
    .object({
      contractualConstraints: listSchema,
      // #2005.4 (DÉCISION Louis 17/09) — passé ENTREPRISE.
      noGoSectors: listSchema,
    })
    .nullable(),
  size: z.object({ consultants: textSchema, company: textSchema, salesTeam: textSchema }).nullable(),
  model: z.object({ staffingModel: textSchema, staffingModes: listSchema, revenueRecurrence: textSchema }).nullable(),
  unknown: z.array(z.enum(COMPANY_LAYER_FACETS)),
})
type CompanyLayer = z.infer<typeof companyLayerSchema>

const businessUnitLayerUnitSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: businessUnitKindSchema,
  membership: businessUnitMembershipSchema,
  territory: textSchema,
  specialties: listSchema,
  /** #2005.5 (DÉCISION Louis 17/09, lot CP2) — consultants DISPONIBLES,
   *  saisis par le responsable de BU. `null` tant que non renseigné. */
  capacity: countSchema.nullable(),
  /** ⚠️ `null` = non déclaré, jamais « aucun consultant ». */
  consultants: countSchema.nullable(),
  /** Les comptes RATTACHÉS se comptent — zéro est un fait, pas une absence. */
  accounts: z.object({ attached: countSchema, note: textSchema }),
  team: z.object({ declaredSize: countSchema.nullable(), members: countSchema, leadUserId: textSchema }),
  /** #2005.5 (DÉCISION Louis 17/09, lot CP2) — l'objectif du TRIMESTRE, saisi
   *  par le responsable de BU. `null` tant que non renseigné. */
  objectives: z.object({ quarterObjective: textSchema }).nullable(),
  unknown: z.array(z.enum(BUSINESS_UNIT_LAYER_FACETS)),
})

const businessUnitLayerSchema = z.object({
  version: layerVersionSchema,
  /** Une personne peut porter plusieurs périmètres (`business_unit_members`
   *  est une table) : la couche les porte TOUS, triés par nom. */
  units: z.array(businessUnitLayerUnitSchema).min(1),
})

const currentObjectiveSchema = z.object({
  periodMonth: z.string().min(1),
  meetings: z.number().nullable(),
  accounts: z.number().nullable(),
  revenue: z.number().nullable(),
})

const personLayerSchema = z.object({
  version: layerVersionSchema,
  role: z.object({ declared: textSchema }).nullable(),
  experience: z
    .object({
      roleTenure: textSchema,
      industryTenure: textSchema,
      functionsPracticed: listSchema,
      // #2005.4 (DÉCISION Louis 17/09) — passé ENTREPRISE : lu par
      // `companyLayerSchema.references.clientReferences` désormais.
    })
    .nullable(),
  portfolio: z
    .object({
      size: textSchema,
      relationshipStatus: textSchema,
      // #2005.6 (DÉCISION Louis 17/09) — combien de consultants CETTE
      // personne gère directement ; reclassée PERSONNE (elle décrit qui a
      // répondu, pas l'entreprise).
      managedConsultants: textSchema,
    })
    .nullable(),
  habits: z
    .object({
      weeklyCalls: textSchema,
      weeklyEmails: textSchema,
      weeklyLinkedin: textSchema,
      salesRoutine: listSchema,
      proactivityLevel: textSchema,
    })
    .nullable(),
  objectives: z
    .object({
      individualGoal: textSchema,
      monthlyTarget: textSchema,
      named: z.array(esnObjectiveSchema).min(1).nullable(),
      currentMonth: currentObjectiveSchema.nullable(),
    })
    .nullable(),
  /** « Les préférences personnelles restent PRIVÉES » (#2005.10) : cette couche
   *  ne se compose que pour la personne elle-même. */
  preferences: z
    .object({
      timezone: textSchema,
      sharedDataScope: listSchema,
      // #2005.4 (DÉCISION Louis 17/09) — `no_go_sectors` passé ENTREPRISE :
      // lu par `companyLayerSchema.policies.noGoSectors` désormais.
      copilot: z.record(z.string(), z.unknown()).nullable(),
    })
    .nullable(),
  permissions: z
    .object({
      workspaceRole: workspaceRoleSchema.nullable(),
      businessUnitAccess: businessUnitAccessSchema.nullable(),
      portfolioVisibility: portfolioVisibilitySchema.nullable(),
    })
    .nullable(),
  unknown: z.array(z.enum(PERSON_LAYER_FACETS)),
})

export const layeredProfileSchema = z.object({
  company: companyLayerSchema.nullable(),
  businessUnit: businessUnitLayerSchema.nullable(),
  person: personLayerSchema.nullable(),
  /** Les couches absentes, NOMMÉES. */
  unknown: z.array(z.enum(LAYERED_PROFILE_LAYERS)),
})
export type LayeredProfile = z.infer<typeof layeredProfileSchema>

/** Une BU portée, telle que l'API la lit — des faits bruts, déjà bornés à l'espace. */
export interface BusinessUnitLayerSource {
  id: string
  name: string
  kind: BusinessUnitKind
  membership: BusinessUnitMembership
  territory: string | null
  specialties: readonly string[]
  consultantCount: number | null
  teamSize: number | null
  memberCount: number
  leadUserId: string | null
  portfolioNote: string | null
  attachedAccountCount: number
  /** #2005.5 (DÉCISION Louis 17/09, lot CP2) — consultants disponibles. */
  capacityAvailableConsultants: number | null
  /** #2005.5 (DÉCISION Louis 17/09, lot CP2) — l'objectif du trimestre. */
  quarterObjective: string | null
}

/** Ce que la dérivation compose. Aucune source n'est obligatoire. */
export interface LayeredProfileSources {
  /** Les réponses FUSIONNÉES (fiche d'entreprise + surcouche du membre). */
  answers: Partial<EsnAnswers> | null
  businessUnits: readonly BusinessUnitLayerSource[]
  person: {
    workspaceRole: WorkspaceRole | null
    businessUnitAccess: BusinessUnitAccess | null
    portfolioVisibility: PortfolioVisibility | null
    timezone: string | null
    copilotPreferences: Record<string, unknown> | null
    currentObjective: {
      periodMonth: string
      meetings: number | null
      accounts: number | null
      revenue: number | null
    } | null
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function list(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const out = value.flatMap(item => (typeof item === 'string' && item.trim() ? [item.trim()] : []))
  return out.length > 0 ? out : null
}

function count(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

/** Une facette dont aucune source n'est renseignée n'existe pas. */
function facet<T extends Record<string, unknown>>(value: T): T | null {
  return Object.values(value).every(item => item === null) ? null : value
}

function missing<F extends string>(facets: readonly F[], layer: Record<F, unknown>): F[] {
  return facets.filter(name => layer[name] === null)
}

/**
 * JSON à clés triées : deux contenus égaux s'écrivent pareil, quel que soit
 * l'ordre de construction. EXPORTÉ depuis le 26/09/2026 pour
 * `commercial-audit-version.ts` (#2908, #2011.4) — une seconde empreinte de
 * contenu qui recopierait cette fonction diverger. Une dérivation vit à UN
 * seul endroit (GA-26).
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .filter(key => record[key] !== undefined)
      .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

// #2005.11 — la version d'une couche : l'empreinte de TOUT son contenu.
function versioned<T extends object>(content: T): T & { version: string } {
  return { version: importContentFingerprint(canonicalJson(content)), ...content }
}

function composeCompany(a: Partial<EsnAnswers>): CompanyLayer | null {
  const layer = {
    identity: facet({
      name: text(a.esn_name),
      groupStructure: text(a.company_group_structure),
      companyAge: text(a.company_age),
    }),
    offers: facet({
      domains: list(a.offer_domains),
      expertiseAreas: list(a.expertise_areas),
      serviceTypes: list(a.service_types),
      positioning: text(a.positioning),
    }),
    references: facet({
      sectors: list(a.reference_sectors),
      caseStudyResults: list(a.case_study_results),
      testimonials: list(a.client_testimonials),
      // #2005.4 (DÉCISION Louis 17/09) — passé ENTREPRISE.
      clientReferences: list(a.client_references),
    }),
    // #2005.4 (DÉCISION Louis 17/09) — où l'ESN est implantée (siège +
    // bureaux). `null` tant que `company_locations` n'a pas de réponse.
    locations: facet({ items: list(a.company_locations) }),
    policies: facet({
      contractualConstraints: list(a.contractual_constraints),
      // #2005.4 (DÉCISION Louis 17/09) — passé ENTREPRISE.
      noGoSectors: list(a.no_go_sectors),
    }),
    size: facet({
      consultants: text(a.consultant_size),
      company: text(a.company_size),
      salesTeam: text(a.sales_team_size),
    }),
    model: facet({
      staffingModel: text(a.staffing_model),
      staffingModes: list(a.staffing_modes),
      revenueRecurrence: text(a.revenue_recurrence),
    }),
  }
  const unknown = missing(COMPANY_LAYER_FACETS, layer)
  if (unknown.length === COMPANY_LAYER_FACETS.length) return null
  return versioned({ ...layer, unknown })
}

function composeUnit(source: BusinessUnitLayerSource): z.infer<typeof businessUnitLayerUnitSchema> {
  const unit = {
    id: source.id,
    name: source.name,
    kind: source.kind,
    membership: source.membership,
    territory: text(source.territory),
    specialties: list(source.specialties),
    // #2005.5 (DÉCISION Louis 17/09, lot CP2) — consultants disponibles.
    capacity: count(source.capacityAvailableConsultants),
    consultants: count(source.consultantCount),
    accounts: { attached: count(source.attachedAccountCount) ?? 0, note: text(source.portfolioNote) },
    team: {
      declaredSize: count(source.teamSize),
      members: count(source.memberCount) ?? 0,
      leadUserId: text(source.leadUserId),
    },
    // #2005.5 (DÉCISION Louis 17/09, lot CP2) — l'objectif du trimestre.
    objectives: facet({ quarterObjective: text(source.quarterObjective) }),
  }
  return { ...unit, unknown: missing(BUSINESS_UNIT_LAYER_FACETS, unit) }
}

function composePerson(
  a: Partial<EsnAnswers>,
  person: LayeredProfileSources['person'],
): z.infer<typeof personLayerSchema> | null {
  const objective = person.currentObjective
  const copilot =
    person.copilotPreferences && Object.keys(person.copilotPreferences).length > 0 ? person.copilotPreferences : null
  const layer = {
    role: facet({ declared: text(a.user_role) }),
    experience: facet({
      roleTenure: text(a.role_tenure),
      industryTenure: text(a.industry_tenure),
      functionsPracticed: list(a.role_functions_practiced),
    }),
    portfolio: facet({
      size: text(a.portfolio_size),
      relationshipStatus: text(a.accounts_relationship_status),
      // #2005.6 (DÉCISION Louis 17/09) — reclassée PERSONNE.
      managedConsultants: text(a.consultants_managed_by_user_band),
    }),
    habits: facet({
      weeklyCalls: text(a.weekly_calls),
      weeklyEmails: text(a.weekly_emails),
      weeklyLinkedin: text(a.weekly_linkedin),
      salesRoutine: list(a.sales_routine),
      proactivityLevel: text(a.proactivity_level),
    }),
    objectives: facet({
      individualGoal: text(a.individual_goal),
      monthlyTarget: text(a.monthly_target),
      named: a.esn_objectives && a.esn_objectives.length > 0 ? [...a.esn_objectives] : null,
      currentMonth:
        objective && [objective.meetings, objective.accounts, objective.revenue].some(value => value !== null)
          ? { ...objective }
          : null,
    }),
    preferences: facet({
      timezone: text(person.timezone),
      sharedDataScope: list(a.shared_data_scope),
      copilot: copilot ? { ...copilot } : null,
    }),
    permissions: facet({
      workspaceRole: person.workspaceRole,
      businessUnitAccess: person.businessUnitAccess,
      portfolioVisibility: person.portfolioVisibility,
    }),
  }
  const unknown = missing(PERSON_LAYER_FACETS, layer)
  if (unknown.length === PERSON_LAYER_FACETS.length) return null
  return versioned({ ...layer, unknown })
}

/**
 * LA dérivation du profil à trois couches — pure, sans horloge ni base.
 * L'API lit les sources ; ce qui compose et versionne vit ici, une fois.
 */
export function composeLayeredProfile(sources: LayeredProfileSources): LayeredProfile {
  const answers = sources.answers ?? {}
  const units = [...sources.businessUnits]
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
    .map(composeUnit)
  const profile = {
    company: composeCompany(answers),
    businessUnit: units.length > 0 ? versioned({ units }) : null,
    person: composePerson(answers, sources.person),
  }
  const unknown: LayeredProfileLayer[] = LAYERED_PROFILE_LAYERS.filter(layer => profile[layer] === null)
  return { ...profile, unknown }
}

/** #2005.11 — les trois versions d'un profil composé, `null` pour une couche absente. */
export function layerVersionsOf(profile: LayeredProfile): LayerVersions {
  return {
    company: profile.company?.version ?? null,
    businessUnit: profile.businessUnit?.version ?? null,
    person: profile.person?.version ?? null,
  }
}
