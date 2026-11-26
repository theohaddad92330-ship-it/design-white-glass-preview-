import { engagementNeedsPartner, type Consultant, type ConsultantUpsert, type EngagementKind } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { ApiError } from '@/lib/api-error'
import { toForm, toUpsert, type ConsultantFormState } from './consultantForm'

/** Une clé du formulaire d'édition, hors `source` (jamais saisie à la main). */
export type TalentFieldKey = Exclude<keyof ConsultantFormState, 'source'>

type FieldKind = 'text' | 'number' | 'date' | 'select' | 'tags' | 'textarea'

type TalentFieldSpec = {
  kind: FieldKind
  /** Étiquette : clé du namespace `consultants` (celle de la modale, jamais un second libellé — GA-26). */
  labelKey: string
  hintKey?: string
  inputType?: 'text' | 'email' | 'tel' | 'url'
  /** Pour `select` : les valeurs et la clé du libellé de chacune. */
  choices?: { values: readonly string[]; labelKey: (value: string) => string }
  min?: number
  max?: number
  placeholder?: string
  /** Les trois montants sous `finance:read` : retirés (pas grisés) hors périmètre. */
  finance?: 'always' | 'salarie' | 'achat'
}

const NOT_ASKED = 'form.notAsked'
const choices = (values: readonly string[], prefix: string) => ({
  values,
  labelKey: (value: string) => (value === '' ? NOT_ASKED : `${prefix}.${value}`),
})
const triState = (yes: string, no: string) => ({
  values: ['', 'true', 'false'] as const,
  labelKey: (value: string) => (value === '' ? NOT_ASKED : value === 'true' ? yes : no),
})

/**
 * #4402.1 — l'INVENTAIRE de ce que la modale « Modifier » édite, champ par champ. Un `Record` sur les clés du
 * formulaire : en ajouter une à la modale sans lui donner son équivalent en ligne ne COMPILE plus.
 * Vocabulaires, étiquettes et astuces sont ceux de la modale (`ConsultantFormDialog.tsx`).
 */
export const TALENT_INLINE_FIELDS: Record<TalentFieldKey, TalentFieldSpec> = {
  full_name: { kind: 'text', labelKey: 'form.fullName' },
  title: { kind: 'text', labelKey: 'form.title', placeholder: 'form.titlePlaceholder' },
  kind: {
    kind: 'select',
    labelKey: 'form.kind',
    hintKey: 'form.kindHint',
    choices: choices(['consultant', 'candidate'], 'kind'),
  },
  engagement_kind: {
    kind: 'select',
    labelKey: 'form.engagement',
    hintKey: 'form.engagementHint',
    choices: choices(['inconnu', 'salarie', 'freelance', 'portage', 'sous_traitance', 'partenaire'], 'engagement'),
  },
  manager_id: { kind: 'select', labelKey: 'form.manager', hintKey: 'form.managerHint' },
  partner_account_id: {
    kind: 'text',
    labelKey: 'form.partner',
    hintKey: 'detail.inline.partnerHint',
    placeholder: 'form.partnerPlaceholder',
  },
  seniority: {
    kind: 'select',
    labelKey: 'form.seniority',
    choices: choices(['inconnu', 'junior', 'confirme', 'senior', 'expert'], 'seniority'),
  },
  years_experience: {
    kind: 'number',
    labelKey: 'form.yearsExperience',
    hintKey: 'form.yearsExperienceHint',
    min: 0,
    max: 60,
  },
  contract_type: {
    kind: 'select',
    labelKey: 'form.contract',
    choices: choices(['inconnu', 'cdi', 'cdd', 'freelance', 'portage', 'sous_traitance'], 'contract'),
  },
  availability: {
    kind: 'select',
    labelKey: 'form.availability',
    choices: choices(
      ['inconnu', 'immediate', 'sous_1_mois', 'sous_3_mois', 'indisponible', 'en_mission'],
      'availability',
    ),
  },
  available_from: { kind: 'date', labelKey: 'form.availableFrom' },
  email: { kind: 'text', labelKey: 'form.email', inputType: 'email' },
  phone: { kind: 'text', labelKey: 'form.phone', inputType: 'tel' },
  public_profile_url: {
    kind: 'text',
    labelKey: 'form.publicProfile',
    hintKey: 'form.publicProfileHint',
    inputType: 'url',
  },
  tjm: { kind: 'number', labelKey: 'form.tjm', min: 0 },
  min_tjm: { kind: 'number', labelKey: 'form.minTjm', hintKey: 'form.financeHint', min: 0, finance: 'always' },
  cost_rate: { kind: 'number', labelKey: 'form.costRate', hintKey: 'form.costHint', min: 0, finance: 'salarie' },
  purchase_tjm: { kind: 'number', labelKey: 'form.purchaseTjm', hintKey: 'form.costHint', min: 0, finance: 'achat' },
  mobility_zones: { kind: 'tags', labelKey: 'form.mobilityZones', hintKey: 'form.listHint' },
  remote_preference: {
    kind: 'select',
    labelKey: 'form.remote',
    hintKey: 'form.mobilityHint',
    choices: choices(['', 'sur_site', 'hybride', 'full_remote', 'indifferent'], 'remote'),
  },
  travel_acceptance: {
    kind: 'select',
    labelKey: 'form.travel',
    choices: choices(['', 'aucun', 'ponctuel', 'frequent'], 'travel'),
  },
  relocation: {
    kind: 'select',
    labelKey: 'form.relocation',
    choices: triState('form.relocationYes', 'form.relocationNo'),
  },
  site_frequency: {
    kind: 'select',
    labelKey: 'form.siteFrequency',
    hintKey: 'form.siteFrequencyHint',
    choices: choices(['', 'jamais', 'ponctuelle', 'reguliere', 'permanente'], 'siteFrequency'),
  },
  international_mobility: {
    kind: 'select',
    labelKey: 'form.internationalMobility',
    choices: triState('form.internationalYes', 'form.internationalNo'),
  },
  mobility_restrictions: {
    kind: 'textarea',
    labelKey: 'form.mobilityRestrictions',
    hintKey: 'form.mobilityRestrictionsHint',
  },
  process_in_progress: {
    kind: 'select',
    labelKey: 'form.processInProgress',
    choices: triState('form.processInProgressYes', 'form.processInProgressNo'),
  },
  process_exclusive: {
    kind: 'select',
    labelKey: 'form.processExclusive',
    choices: triState('form.processExclusiveYes', 'form.processExclusiveNo'),
  },
  process_other_interviews: {
    kind: 'textarea',
    labelKey: 'form.processOtherInterviews',
    hintKey: 'form.processOtherInterviewsHint',
  },
  process_decision_deadline: { kind: 'date', labelKey: 'form.processDecisionDeadline' },
  refused_sectors: { kind: 'tags', labelKey: 'form.refusedSectors', hintKey: 'form.refusedHint' },
  refused_technologies: { kind: 'tags', labelKey: 'form.refusedTechnologies', hintKey: 'form.refusedHint' },
  preferred_client_types: { kind: 'tags', labelKey: 'form.preferredClientTypes', hintKey: 'form.listHint' },
  refused_clients: { kind: 'tags', labelKey: 'form.refusedClients', hintKey: 'form.refusedHint' },
  environments_to_avoid: { kind: 'tags', labelKey: 'form.environmentsToAvoid', hintKey: 'form.refusedHint' },
  non_negotiable_conditions: {
    kind: 'textarea',
    labelKey: 'form.nonNegotiableConditions',
    hintKey: 'form.nonNegotiableConditionsHint',
  },
  stack: { kind: 'tags', labelKey: 'form.stack', hintKey: 'form.stackTyping' },
  sectors: { kind: 'tags', labelKey: 'form.sectors', hintKey: 'form.listHint' },
  zones: { kind: 'tags', labelKey: 'form.zones', hintKey: 'form.listHint' },
  references: { kind: 'tags', labelKey: 'form.references', hintKey: 'form.listHint' },
  languages: { kind: 'tags', labelKey: 'form.languages', hintKey: 'form.languagesHint' },
  clearances: { kind: 'tags', labelKey: 'form.clearances', hintKey: 'form.clearancesHint' },
  wants: { kind: 'textarea', labelKey: 'form.wants', hintKey: 'form.wantsHint' },
  notes: { kind: 'textarea', labelKey: 'form.notes' },
  cv_text: { kind: 'textarea', labelKey: 'form.cvText', hintKey: 'form.cvTextHint' },
  consent_given_at: { kind: 'date', labelKey: 'form.consentGivenAt' },
  consent_expires_at: { kind: 'date', labelKey: 'form.consentExpiresAt' },
  consent_basis: {
    kind: 'text',
    labelKey: 'form.consentBasis',
    hintKey: 'form.consentBasisHint',
    placeholder: 'form.consentBasisPlaceholder',
  },
  consent_restrictions: {
    kind: 'textarea',
    labelKey: 'form.consentRestrictions',
    hintKey: 'form.consentRestrictionsHint',
  },
}

/** Les trois montants du formulaire sont stockés en centimes : la provenance porte le nom de la COLONNE. */
const PROVENANCE_COLUMN: Partial<Record<TalentFieldKey, string>> = {
  min_tjm: 'min_tjm_cents',
  cost_rate: 'cost_rate_cents',
  purchase_tjm: 'purchase_tjm_cents',
}

/**
 * #4577.3 — ce champ est-il « saisi à la main » ? Vrai seulement sur une provenance `human` : une valeur de
 * connecteur ou du CV reste éditable, mais n'est pas marquée. Une provenance absente n'est jamais devinée.
 */
export function isHandEntered(talent: Pick<Consultant, 'field_sources'>, key: TalentFieldKey): boolean {
  return talent.field_sources?.[PROVENANCE_COLUMN[key] ?? key] === 'human'
}

/**
 * #4577.6 — la provenance qui VERROUILLE : une valeur reprise d'un connecteur (`connector`) ou du CV / de l'import
 * (`pipeline`). Rien d'autre : une provenance absente n'est jamais devinée, et `human` reste éditable d'un clic.
 */
export function lockedSourceOf(
  talent: Pick<Consultant, 'field_sources'>,
  key: TalentFieldKey,
): 'connector' | 'pipeline' | null {
  const source = talent.field_sources?.[PROVENANCE_COLUMN[key] ?? key]
  return source === 'connector' || source === 'pipeline' ? source : null
}

/** Où chaque champ vit sur la fiche : un onglet, une section. Un champ n'est posé qu'à UN endroit (GA-26). */
export const TALENT_FIELD_GROUPS: readonly {
  tab: 'profile' | 'skills' | 'rates' | 'documents' | 'notes' | 'consent'
  id: string
  titleKey: string
  fields: readonly TalentFieldKey[]
}[] = [
  {
    tab: 'profile',
    id: 'identity',
    titleKey: 'detail.inline.groups.identity',
    fields: [
      'full_name',
      'title',
      'kind',
      'engagement_kind',
      'manager_id',
      'partner_account_id',
      'seniority',
      'years_experience',
      'contract_type',
    ],
  },
  {
    tab: 'profile',
    id: 'contact',
    titleKey: 'detail.inline.groups.contact',
    fields: ['email', 'phone', 'public_profile_url'],
  },
  {
    tab: 'profile',
    id: 'availability',
    titleKey: 'detail.inline.groups.availability',
    fields: ['availability', 'available_from'],
  },
  {
    tab: 'profile',
    id: 'mobility',
    titleKey: 'detail.inline.groups.mobility',
    fields: [
      'remote_preference',
      'travel_acceptance',
      'mobility_zones',
      'relocation',
      'site_frequency',
      'international_mobility',
      'mobility_restrictions',
    ],
  },
  {
    tab: 'profile',
    id: 'process',
    titleKey: 'detail.inline.groups.process',
    fields: ['process_in_progress', 'process_exclusive', 'process_other_interviews', 'process_decision_deadline'],
  },
  {
    tab: 'profile',
    id: 'preferences',
    titleKey: 'detail.inline.groups.preferences',
    fields: [
      'refused_sectors',
      'refused_technologies',
      'preferred_client_types',
      'refused_clients',
      'environments_to_avoid',
      'non_negotiable_conditions',
      'wants',
    ],
  },
  {
    tab: 'skills',
    id: 'skills',
    titleKey: 'detail.inline.groups.skills',
    fields: ['stack', 'sectors', 'zones', 'languages', 'clearances', 'references'],
  },
  {
    tab: 'rates',
    id: 'rates',
    titleKey: 'detail.inline.groups.rates',
    fields: ['tjm', 'min_tjm', 'cost_rate', 'purchase_tjm'],
  },
  { tab: 'notes', id: 'notes', titleKey: 'detail.inline.groups.notes', fields: ['notes'] },
  { tab: 'documents', id: 'cvText', titleKey: 'detail.inline.groups.cvText', fields: ['cv_text'] },
  {
    tab: 'consent',
    id: 'consent',
    titleKey: 'detail.inline.groups.consent',
    fields: ['consent_given_at', 'consent_expires_at', 'consent_basis', 'consent_restrictions'],
  },
]

/**
 * Une fiche dont un bloc manque (réponse partielle, ancienne version de l'API) se lit avec des blocs VIDES — « non
 * renseigné » — au lieu de faire tomber toute la fiche au rendu : `toForm` lit ces blocs sans les protéger, et la
 * modale ne l'appelait qu'à l'ouverture. Jamais une valeur inventée : un bloc absent est un bloc vide.
 */
export function withFormDefaults(talent: Consultant): Consultant {
  return {
    ...talent,
    mobility: talent.mobility ?? {
      zones: [],
      remote: null,
      travel: null,
      relocation: null,
      siteFrequency: null,
      international: null,
      restrictions: null,
    },
    process: talent.process ?? { inProgress: null, exclusive: null, otherInterviews: null, decisionDeadline: null },
    preferences: talent.preferences ?? {
      refusedSectors: [],
      refusedTechnologies: [],
      preferredClientTypes: [],
      refusedClients: [],
      environmentsToAvoid: [],
      nonNegotiableConditions: null,
    },
    consent: talent.consent ?? { givenAt: null, expiresAt: null, basis: null, restrictions: null },
    stack: talent.stack ?? [],
    sectors: talent.sectors ?? [],
    zones: talent.zones ?? [],
    references: talent.references ?? [],
    languages: talent.languages ?? [],
    clearances: talent.clearances ?? [],
  }
}

/**
 * Le MÊME payload que la modale « Modifier » : l'état de formulaire de la fiche, un champ changé, puis `toUpsert`
 * — aucun nouvel endpoint, aucune seconde règle de conversion.
 *
 * Refus AVANT l'appel (le serveur renverrait un 400 qui ne dirait pas quel champ) :
 * - un nom vide (`consultantUpsertSchema.full_name`, `min(1)`) ;
 * - une sous-traitance sans partenaire. Renseigner le partenaire passe l'engagement en sous-traitance (une seule
 *   écriture) ; le retirer à un sous-traitant est refusé — il porte toujours son partenaire.
 */
export function buildInlineUpsert(
  talent: Consultant,
  patch: Partial<ConsultantFormState>,
  rights: { finance?: boolean },
): ConsultantUpsert {
  const form: ConsultantFormState = { ...toForm(withFormDefaults(talent)), ...patch }
  if ('full_name' in patch && form.full_name.trim().length === 0) {
    throw new Error(i18n.t('consultants:detail.inline.errors.nameRequired'))
  }
  if (
    'partner_account_id' in patch &&
    form.partner_account_id.trim().length > 0 &&
    form.engagement_kind !== 'sous_traitance'
  ) {
    form.engagement_kind = 'sous_traitance'
  }
  if (
    ('engagement_kind' in patch || 'partner_account_id' in patch) &&
    engagementNeedsPartner(form.engagement_kind as EngagementKind) &&
    form.partner_account_id.trim().length === 0
  ) {
    throw new Error(i18n.t('consultants:detail.inline.errors.partnerRequired'))
  }
  return toUpsert(form, rights)
}

/**
 * #4833 — un refus de validation serveur NOMME son champ. L'enregistrement inline envoie TOUTE la fiche : le champ
 * refusé peut être un AUTRE que celui qu'on vient de toucher (une valeur déjà en base, issue d'un CV, que le
 * contrat n'accepte pas) — l'utilisateur accuserait sinon le champ qu'il édite. Tout autre échec garde son message.
 */
export function explainSaveRefusal(error: unknown, editedKey: string): Error {
  if (!(error instanceof ApiError) || error.status !== 400)
    return error instanceof Error ? error : new Error(String(error))
  const issues = (error.details as { errors?: unknown } | null | undefined)?.errors
  if (!Array.isArray(issues)) return error
  const first = issues.find(
    (issue): issue is { path: (string | number)[]; message: string } =>
      Array.isArray((issue as { path?: unknown })?.path) &&
      (issue as { path: unknown[] }).path.length > 0 &&
      typeof (issue as { message?: unknown }).message === 'string',
  )
  if (!first) return error
  const fieldOf = (key: string): string => {
    const spec = (TALENT_INLINE_FIELDS as Record<string, TalentFieldSpec | undefined>)[key]
    return spec ? i18n.t(`consultants:${spec.labelKey}`) : key
  }
  const field = fieldOf(String(first.path[0]))
  const same = String(first.path[0]) === editedKey
  return new Error(
    same
      ? i18n.t('consultants:detail.inline.errors.refusedField', { field, rule: first.message })
      : i18n.t('consultants:detail.inline.errors.refusedOtherField', {
          field,
          edited: fieldOf(editedKey),
          rule: first.message,
        }),
  )
}
