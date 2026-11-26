import { describe, expect, it } from 'vitest'
import type { Consultant } from '@bellum/contracts'
import { parseLanguages, toForm, toUpsert, type ConsultantFormState } from './consultantForm'

/**
 * La conversion formulaire ↔ contrat, testée seule : c'est la partie où l'on
 * pourrait, sans le vouloir, inventer une donnée (un TJM à 0, une chaîne vide au
 * lieu d'un null). La p22 exige un vivier honnête — un champ non saisi ne doit
 * jamais devenir une valeur.
 */
describe('toUpsert — un champ vide devient null, jamais une valeur inventée', () => {
  const base = {
    full_name: 'Nadia Fournier',
    title: '',
    seniority: 'senior',
    years_experience: '',
    availability: 'immediate',
    available_from: '',
    contract_type: 'cdi',
    engagement_kind: 'salarie' as const,
    kind: 'consultant',
    partner_account_id: '',
    manager_id: '',
    email: '',
    phone: '',
    public_profile_url: '',
    tjm: '',
    min_tjm: '',
    cost_rate: '',
    purchase_tjm: '',
    mobility_zones: '',
    remote_preference: '',
    travel_acceptance: '',
    relocation: '',
    site_frequency: '',
    international_mobility: '',
    mobility_restrictions: '',
    process_in_progress: '',
    process_exclusive: '',
    process_other_interviews: '',
    process_decision_deadline: '',
    refused_sectors: '',
    refused_technologies: '',
    preferred_client_types: '',
    refused_clients: '',
    environments_to_avoid: '',
    non_negotiable_conditions: '',
    stack: 'Splunk, SOC',
    sectors: '',
    zones: '',
    mobility: {
      zones: null,
      remote: null,
      travel: null,
      relocation: null,
      siteFrequency: null,
      international: null,
      restrictions: null,
    },
    process: { inProgress: null, exclusive: null, otherInterviews: null, decisionDeadline: null },
    positioningAgreement: { tjmValidatedAt: null, cvValidatedAt: null, otherProcessesKnown: false },
    preferences: { wantedSectors: [], refusedSectors: [], refusedTechnologies: [], wantedContractKinds: [] },
    references: '',
    languages: '',
    clearances: '',
    wants: '',
    notes: '',
    cv_text: '',
    consent_given_at: '',
    consent_expires_at: '',
    consent_basis: '',
    consent_restrictions: '',
  }

  it('transforme les champs vides en null', () => {
    const upsert = toUpsert(base)

    expect(upsert.title).toBeNull()
    expect(upsert.available_from).toBeNull()
    expect(upsert.tjm).toBeNull()
    expect(upsert.wants).toBeNull()
  })

  it('n’envoie jamais un TJM à zéro ni négatif', () => {
    expect(toUpsert({ ...base, tjm: '0' }).tjm).toBeNull()
    expect(toUpsert({ ...base, tjm: '-50' }).tjm).toBeNull()
    expect(toUpsert({ ...base, tjm: 'abc' }).tjm).toBeNull()
    expect(toUpsert({ ...base, tjm: '620' }).tjm).toBe(620)
  })

  it('les années d’expérience : vide devient null, mais 0 est une VRAIE réponse (contrairement au TJM)', () => {
    expect(toUpsert({ ...base, years_experience: '' }).years_experience).toBeNull()
    expect(toUpsert({ ...base, years_experience: 'abc' }).years_experience).toBeNull()
    expect(toUpsert({ ...base, years_experience: '-3' }).years_experience).toBeNull()
    // « 0 » TRAVERSE — une personne tout juste diplômée a réellement 0 an
    // d'expérience, ce n'est pas un champ vide déguisé.
    expect(toUpsert({ ...base, years_experience: '0' }).years_experience).toBe(0)
    expect(toUpsert({ ...base, years_experience: '9' }).years_experience).toBe(9)
  })

  it('découpe une liste, sans vide ni doublon', () => {
    expect(toUpsert({ ...base, stack: 'SOC, soc , Splunk,  ' }).stack).toEqual(['SOC', 'Splunk'])
  })

  it('coupe les espaces du nom', () => {
    expect(toUpsert({ ...base, full_name: '  Nadia  ' }).full_name).toBe('Nadia')
  })

  // #3410.10/.11/.13/.14 — retour bêta #3410.
  it('découpe les quatre préférences neuves en listes, et vide la condition non négociable en null', () => {
    const upsert = toUpsert({
      ...base,
      preferred_client_types: 'Grand compte, Scale-up',
      refused_clients: 'Ancien Client SA',
      environments_to_avoid: 'Astreinte',
      non_negotiable_conditions: '  Pas de déplacement le vendredi  ',
    })
    expect(upsert.preferred_client_types).toEqual(['Grand compte', 'Scale-up'])
    expect(upsert.refused_clients).toEqual(['Ancien Client SA'])
    expect(upsert.environments_to_avoid).toEqual(['Astreinte'])
    expect(upsert.non_negotiable_conditions).toBe('Pas de déplacement le vendredi')
  })

  it('une condition non négociable vide devient null, jamais une chaîne vide', () => {
    expect(toUpsert({ ...base, non_negotiable_conditions: '' }).non_negotiable_conditions).toBeNull()
  })
})

describe('toForm — l’édition repart de valeurs affichables', () => {
  it('rend les listes en texte séparé par des virgules et les nullités en vide', () => {
    const consultant = {
      id: '1',
      workspace_id: null,
      kind: 'consultant' as const,
      source: null,
      last_contact_at: null,
      archived_at: null,
      archived_reason: null,
      review_status: 'qualified' as const,
      consent: { givenAt: null, expiresAt: null, basis: null, restrictions: null },
      full_name: 'Nadia',
      title: null,
      seniority: 'expert',
      years_experience: 12,
      availability: 'sous_1_mois',
      available_from: null,
      contract_type: 'freelance',
      engagement_kind: 'salarie' as const,
      partner_account_id: null,
      contact_visible: true,
      finance_visible: true,
      tjm: 700,
      stack: ['SOC', 'Splunk'],
      sectors: ['Banque'],
      zones: [],
      education: [],
      mobility: {
        zones: null,
        remote: null,
        travel: null,
        relocation: null,
        siteFrequency: null,
        international: null,
        restrictions: null,
      },
      process: { inProgress: null, exclusive: null, otherInterviews: null, decisionDeadline: null },
      positioningAgreement: { tjmValidatedAt: null, cvValidatedAt: null, otherProcessesKnown: false },
      preferences: { wantedSectors: [], refusedSectors: [], refusedTechnologies: [], wantedContractKinds: [] },
      references: [],
      languages: [],
      clearances: [],
      wants: null,
      notes: null,
      cv_text: null,
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    } satisfies Consultant

    const form = toForm(consultant)

    expect(form.title).toBe('')
    expect(form.tjm).toBe('700')
    expect(form.stack).toBe('SOC, Splunk')
    expect(form.zones).toBe('')
    expect(form.years_experience).toBe('12')
    // #3410.10/.11/.13/.14 — absentes de la fiche, les quatre préférences
    // neuves rendent des champs vides, jamais une valeur devinée.
    expect(form.preferred_client_types).toBe('')
    expect(form.refused_clients).toBe('')
    expect(form.environments_to_avoid).toBe('')
    expect(form.non_negotiable_conditions).toBe('')
  })

  it('rend les quatre préférences neuves quand la fiche les porte', () => {
    const consultant = {
      id: '1',
      workspace_id: null,
      kind: 'consultant' as const,
      source: null,
      last_contact_at: null,
      archived_at: null,
      archived_reason: null,
      review_status: 'qualified' as const,
      consent: { givenAt: null, expiresAt: null, basis: null, restrictions: null },
      full_name: 'Nadia',
      title: null,
      seniority: 'expert',
      years_experience: null,
      availability: 'immediate',
      available_from: null,
      contract_type: 'freelance',
      engagement_kind: 'salarie' as const,
      partner_account_id: null,
      contact_visible: true,
      finance_visible: true,
      tjm: null,
      stack: [],
      sectors: [],
      zones: [],
      education: [],
      mobility: {
        zones: null,
        remote: null,
        travel: null,
        relocation: null,
        siteFrequency: null,
        international: null,
        restrictions: null,
      },
      process: { inProgress: null, exclusive: null, otherInterviews: null, decisionDeadline: null },
      positioningAgreement: { tjmValidatedAt: null, cvValidatedAt: null, otherProcessesKnown: false },
      preferences: {
        wantedSectors: [],
        refusedSectors: [],
        refusedTechnologies: [],
        wantedContractKinds: [],
        preferredClientTypes: ['Grand compte'],
        refusedClients: ['Ancien Client SA'],
        environmentsToAvoid: ['Astreinte'],
        nonNegotiableConditions: 'Pas de déplacement le vendredi',
      },
      references: [],
      languages: [],
      clearances: [],
      wants: null,
      notes: null,
      cv_text: null,
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    } satisfies Consultant

    const form = toForm(consultant)
    expect(form.preferred_client_types).toBe('Grand compte')
    expect(form.refused_clients).toBe('Ancien Client SA')
    expect(form.environments_to_avoid).toBe('Astreinte')
    expect(form.non_negotiable_conditions).toBe('Pas de déplacement le vendredi')
  })

  it('fait un aller-retour stable', () => {
    const consultant = {
      id: '1',
      workspace_id: null,
      kind: 'consultant' as const,
      source: null,
      last_contact_at: null,
      archived_at: null,
      archived_reason: null,
      review_status: 'qualified' as const,
      consent: { givenAt: null, expiresAt: null, basis: null, restrictions: null },
      full_name: 'Nadia',
      title: 'Ingénieure',
      seniority: 'senior',
      years_experience: 0,
      availability: 'immediate',
      available_from: '2026-09-01',
      contract_type: 'cdi',
      engagement_kind: 'salarie' as const,
      partner_account_id: null,
      contact_visible: true,
      finance_visible: true,
      tjm: 620,
      stack: ['SOC'],
      sectors: ['Banque'],
      zones: ['IDF'],
      education: [],
      mobility: {
        zones: null,
        remote: null,
        travel: null,
        relocation: null,
        siteFrequency: null,
        international: null,
        restrictions: null,
      },
      process: { inProgress: null, exclusive: null, otherInterviews: null, decisionDeadline: null },
      positioningAgreement: { tjmValidatedAt: null, cvValidatedAt: null, otherProcessesKnown: false },
      preferences: { wantedSectors: [], refusedSectors: [], refusedTechnologies: [], wantedContractKinds: [] },
      references: ['Assureur X'],
      languages: [
        { code: 'fr', level: 'natif' as const },
        { code: 'en', level: null },
      ],
      clearances: ['Confidentiel Défense'],
      wants: 'du SOC',
      notes: 'dispo confirmée',
      cv_text: 'Ingénieure SOC depuis 2016.',
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    } satisfies Consultant

    const upsert = toUpsert(toForm(consultant))

    expect(upsert.full_name).toBe('Nadia')
    expect(upsert.tjm).toBe(620)
    expect(upsert.available_from).toBe('2026-09-01')
    expect(upsert.stack).toEqual(['SOC'])
    expect(upsert.wants).toBe('du SOC')
    // `0` fait l'aller-retour intact — ce n'est PAS un champ vide.
    expect(upsert.years_experience).toBe(0)
  })
})

describe('parseLanguages', () => {
  it('lit un code et son niveau', () => {
    expect(parseLanguages('fr:natif, en:b2')).toEqual([
      { code: 'fr', level: 'natif' },
      { code: 'en', level: 'b2' },
    ])
  })

  it('accepte une langue sans niveau plutôt que d’en inventer un', () => {
    expect(parseLanguages('de')).toEqual([{ code: 'de', level: null }])
  })

  it('ignore un niveau non reconnu au lieu de le rapprocher du plus proche', () => {
    // « en:courant » ne doit pas devenir « en:c1 » : ce serait une évaluation
    // que personne n'a faite, affichée ensuite devant un client.
    expect(parseLanguages('en:courant')).toEqual([{ code: 'en', level: null }])
  })

  it('ne garde qu’une entrée par langue', () => {
    expect(parseLanguages('fr:natif, fr:b1')).toEqual([{ code: 'fr', level: 'natif' }])
  })

  it('ignore les fragments vides', () => {
    expect(parseLanguages(' , , ')).toEqual([])
  })
})

/**
 * LE CONSENTEMENT, SAISI (BEL-BO-003, PDF-02 §3.2 « bloc 4 »).
 *
 * Les trois valeurs existaient en LECTURE SEULE sur l'onglet « Consentement »
 * d'une fiche : personne ne pouvait les POSER. Un dossier candidat naissait donc
 * « jamais recueilli » et le restait, quoi qu'on ait demandé à la personne.
 *
 * ⚠️ Deux états distincts, et le formulaire ne doit jamais les confondre :
 * « jamais recueilli » ≠ « expiré ». Le premier demande de poser la question, le
 * second de la reposer.
 */
describe('toUpsert / toForm — le consentement se SAISIT', () => {
  it('envoie les trois valeurs quand elles sont saisies', () => {
    const upsert = toUpsert({
      ...emptyFormState,
      consent_given_at: '2026-08-01',
      consent_expires_at: '2028-08-01',
      consent_basis: 'Consentement recueilli par e-mail le 1er août',
    })

    expect(upsert.consent_given_at).toBe('2026-08-01')
    expect(upsert.consent_expires_at).toBe('2028-08-01')
    expect(upsert.consent_basis).toBe('Consentement recueilli par e-mail le 1er août')
  })

  it('rend null — jamais une chaîne vide — quand rien n’a été recueilli', () => {
    // `''` traverserait le schéma et écrirait une base légale VIDE, qui se lit
    // « on a une base » à l'écran suivant.
    const upsert = toUpsert(emptyFormState)
    expect(upsert.consent_given_at).toBeNull()
    expect(upsert.consent_expires_at).toBeNull()
    expect(upsert.consent_basis).toBeNull()
  })

  it('rouvre l’horodatage exact d’un consentement en édition', () => {
    const form = toForm(talentWithConsent('2026-08-01T14:32:00.000Z', '2028-08-01T14:32:00.000Z'))
    expect(form.consent_given_at).toBe('2026-08-01T14:32:00.000Z')
    expect(form.consent_basis).toBe('Recueilli en entretien')
  })

  // #2185.57 — les restrictions sont un AXE DISTINCT de la base légale : ce
  // que la personne a EXCLU de son accord, jamais confondu avec le fondement
  // qui le justifie.
  it('#2185.57 — envoie la restriction saisie, indépendamment de la base légale', () => {
    const upsert = toUpsert({
      ...emptyFormState,
      consent_basis: 'Consentement recueilli par e-mail',
      consent_restrictions: 'Pas de mission chez un concurrent direct',
    })
    expect(upsert.consent_restrictions).toBe('Pas de mission chez un concurrent direct')
    expect(upsert.consent_basis).toBe('Consentement recueilli par e-mail')
  })

  it('#2185.57 — rend null, jamais une chaîne vide, quand aucune restriction n’est connue', () => {
    const upsert = toUpsert(emptyFormState)
    expect(upsert.consent_restrictions).toBeNull()
  })

  it('ne réécrit PAS l’heure d’un consentement que personne n’a touché', () => {
    // Tronquer à la date au premier enregistrement d'un champ voisin
    // déplacerait l'accord de 14 h 32 à minuit — une modification silencieuse
    // sur la donnée la plus sensible de la fiche.
    const upsert = toUpsert(toForm(talentWithConsent('2026-08-01T14:32:00.000Z', '2028-08-01T14:32:00.000Z')))
    expect(upsert.consent_given_at).toBe('2026-08-01T14:32:00.000Z')
    expect(upsert.consent_expires_at).toBe('2028-08-01T14:32:00.000Z')
  })

  it('garde « jamais recueilli » distinct de « expiré » : aucune date inventée', () => {
    const form = toForm(talentWithConsent(null, null))
    expect(form.consent_given_at).toBe('')
    expect(form.consent_expires_at).toBe('')
  })
})

/**
 * LES TROIS TARIFS SOUS LE DROIT FINANCIER (BEL-BO-003, PDF-02 §3.2 « bloc 3 »).
 *
 * La garde n'existait qu'en LECTURE : `talent.service.ts` retire `minTjmCents`
 * et `costCents` de la liste sans `finance:read`. À la SAISIE, rien — et le
 * défaut qui compte n'est pas seulement qu'on pouvait écrire : c'est qu'un
 * formulaire qui masque les champs les envoie quand même à `null`, donc EFFACE
 * les trois montants de quelqu'un qui n'avait pas le droit de les voir.
 */
describe('toUpsert — sans le droit financier, les trois montants ne voyagent PAS', () => {
  const withRates = { ...emptyFormState, min_tjm: '450', cost_rate: '380' }

  it('les envoie quand le droit est là', () => {
    const upsert = toUpsert(withRates, { finance: true })
    expect(upsert.min_tjm_cents).toBe(45_000)
    expect(upsert.cost_rate_cents).toBe(38_000)
  })

  it('OMET les clés — sans les mettre à null — quand le droit manque', () => {
    // `null` serait un EFFACEMENT : `fromUpsert` n'écrit que ce qui est défini,
    // et `undefined` est donc la seule façon de ne rien toucher.
    const upsert = toUpsert(withRates, { finance: false })
    expect('min_tjm_cents' in upsert).toBe(false)
    expect('cost_rate_cents' in upsert).toBe(false)
    expect('purchase_tjm_cents' in upsert).toBe(false)
  })

  it('laisse passer le TJM cible, qui n’est pas sous ce droit', () => {
    // `tjm` est lu et saisi par tout le monde (`consultantSchema.tjm` n'est pas
    // conditionné) : l'emporter dans la garde masquerait un champ public.
    const upsert = toUpsert({ ...withRates, tjm: '620' }, { finance: false })
    expect(upsert.tjm).toBe(620)
  })

  it('garde le comportement d’avant quand personne ne dit le droit', () => {
    // Un appelant qui ne sait pas ne doit pas SUPPRIMER des montants : le
    // défaut reste « on envoie », et c'est le serveur qui tranche.
    expect(toUpsert(withRates).min_tjm_cents).toBe(45_000)
  })
})

const emptyFormState: ConsultantFormState = {
  full_name: 'Nadia Fournier',
  title: '',
  seniority: 'senior',
  years_experience: '',
  availability: 'immediate',
  available_from: '',
  contract_type: 'cdi',
  engagement_kind: 'salarie',
  kind: 'consultant',
  partner_account_id: '',
  manager_id: '',
  email: '',
  phone: '',
  public_profile_url: '',
  tjm: '',
  min_tjm: '',
  cost_rate: '',
  purchase_tjm: '',
  mobility_zones: '',
  remote_preference: '',
  travel_acceptance: '',
  relocation: '',
  site_frequency: '',
  international_mobility: '',
  mobility_restrictions: '',
  process_in_progress: '',
  process_exclusive: '',
  process_other_interviews: '',
  process_decision_deadline: '',
  refused_sectors: '',
  refused_technologies: '',
  preferred_client_types: '',
  refused_clients: '',
  environments_to_avoid: '',
  non_negotiable_conditions: '',
  stack: '',
  sectors: '',
  zones: '',
  references: '',
  languages: '',
  clearances: '',
  wants: '',
  notes: '',
  cv_text: '',
  consent_given_at: '',
  consent_expires_at: '',
  consent_basis: '',
  consent_restrictions: '',
}

function talentWithConsent(givenAt: string | null, expiresAt: string | null): Consultant {
  return {
    id: '1',
    workspace_id: null,
    kind: 'consultant',
    source: null,
    last_contact_at: null,
    archived_at: null,
    archived_reason: null,
    review_status: 'qualified',
    consent: { givenAt, expiresAt, basis: givenAt ? 'Recueilli en entretien' : null, restrictions: null },
    full_name: 'Nadia',
    title: null,
    seniority: 'senior',
    years_experience: null,
    availability: 'immediate',
    available_from: null,
    contract_type: 'cdi',
    engagement_kind: 'salarie',
    partner_account_id: null,
    contact_visible: true,
    finance_visible: true,
    tjm: null,
    stack: [],
    sectors: [],
    zones: [],
    education: [],
    mobility: {
      zones: null,
      remote: null,
      travel: null,
      relocation: null,
      siteFrequency: null,
      international: null,
      restrictions: null,
    },
    process: { inProgress: null, exclusive: null, otherInterviews: null, decisionDeadline: null },
    positioningAgreement: { tjmValidatedAt: null, cvValidatedAt: null, otherProcessesKnown: false },
    preferences: { wantedSectors: [], refusedSectors: [], refusedTechnologies: [], wantedContractKinds: [] },
    references: [],
    languages: [],
    clearances: [],
    wants: null,
    notes: null,
    cv_text: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
  } satisfies Consultant
}
