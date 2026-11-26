import { describe, expect, it } from 'vitest'
import {
  BUSINESS_UNIT_LAYER_FACETS,
  COMPANY_LAYER_ANSWER_KEYS,
  COMPANY_LAYER_FACETS,
  composeLayeredProfile,
  layeredProfileSchema,
  layerVersionsOf,
  layerVersionsSchema,
  PERSON_LAYER_ANSWER_KEYS,
  PERSON_LAYER_FACETS,
  type BusinessUnitLayerSource,
  type LayeredProfileSources,
} from './layered-profile.js'
import { ESN_PERSONAL_ANSWER_KEYS, type EsnAnswers } from './onboarding.js'
import { parseRunProfileProvenance, recordedRunProfileProvenanceSchema } from './run-profile.js'

const NO_PERSON: LayeredProfileSources['person'] = {
  workspaceRole: null,
  businessUnitAccess: null,
  portfolioVisibility: null,
  timezone: null,
  copilotPreferences: null,
  currentObjective: null,
}

function sources(overrides: Partial<LayeredProfileSources> = {}): LayeredProfileSources {
  return { answers: null, businessUnits: [], person: NO_PERSON, ...overrides }
}

const COMPANY_ANSWERS: Partial<EsnAnswers> = {
  esn_name: 'Acme ESN',
  company_group_structure: 'Filiale d’un groupe',
  offer_domains: ['data'],
  expertise_areas: ['Data & IA'],
  positioning: 'Expertise de niche - spécialisé sur 1-2 domaines pointus',
  reference_sectors: ['Banque'],
  contractual_constraints: ['Préavis de fin de mission'],
  consultant_size: '10-50',
  sales_team_size: '1-3',
  staffing_model: 'Uniquement des CDI internes',
  revenue_recurrence: 'Un mix de récurrent et de one-shot',
}

const TOULOUSE: BusinessUnitLayerSource = {
  id: 'bu-1',
  name: 'Agence Toulouse',
  kind: 'agency',
  membership: 'member',
  territory: 'Occitanie',
  specialties: ['Cloud'],
  consultantCount: 12,
  teamSize: null,
  memberCount: 1,
  leadUserId: null,
  portfolioNote: null,
  attachedAccountCount: 0,
  // #2005.5 (DÉCISION Louis 17/09, lot CP2) — capacité et objectif du
  // trimestre, saisis par le responsable de BU.
  capacityAvailableConsultants: null,
  quarterObjective: null,
}

describe('composeLayeredProfile — trois couches, UN objet (#2005.4/.5/.6)', () => {
  it('rend un objet que le contrat accepte, avec les trois couches et leurs versions', () => {
    const profile = composeLayeredProfile(
      sources({
        answers: { ...COMPANY_ANSWERS, user_role: 'Business Manager', role_tenure: 'Moins d’1 an' },
        businessUnits: [TOULOUSE],
        person: { ...NO_PERSON, workspaceRole: 'sales', businessUnitAccess: 'business_unit' },
      }),
    )
    expect(layeredProfileSchema.safeParse(profile).success).toBe(true)
    expect(profile.company?.identity?.name).toBe('Acme ESN')
    expect(profile.company?.model?.revenueRecurrence).toBe('Un mix de récurrent et de one-shot')
    expect(profile.businessUnit?.units[0]?.consultants).toBe(12)
    expect(profile.person?.role?.declared).toBe('Business Manager')
    expect(profile.person?.experience?.roleTenure).toBe('Moins d’1 an')
    expect(profile.person?.permissions?.workspaceRole).toBe('sales')
    expect(profile.unknown).toEqual([])
    const versions = layerVersionsOf(profile)
    expect(versions.company).toEqual(expect.any(String))
    expect(versions.businessUnit).toEqual(expect.any(String))
    expect(versions.person).toEqual(expect.any(String))
  })

  it('SAIT DIRE NON — une couche absente vaut `null`, est NOMMÉE, et n’a pas de version', () => {
    const profile = composeLayeredProfile(sources())
    expect(profile.company).toBeNull()
    expect(profile.businessUnit).toBeNull()
    expect(profile.person).toBeNull()
    expect(profile.unknown).toEqual(['company', 'businessUnit', 'person'])
    expect(layerVersionsOf(profile)).toEqual({ company: null, businessUnit: null, person: null })
  })

  it('une réponse vide n’est pas une réponse — chaîne blanche et liste vide rendent `null`, jamais « 0 » ni `[]`', () => {
    const profile = composeLayeredProfile(
      sources({ answers: { esn_name: '  ', expertise_areas: [], consultant_size: '10-50' } }),
    )
    expect(profile.company?.identity).toBeNull()
    expect(profile.company?.offers).toBeNull()
    expect(profile.company?.size).toEqual({ consultants: '10-50', company: null, salesTeam: null })
  })

  it('#2005.4 — sans réponse à « où es-tu implanté ? », `locations` reste `null` et NOMMÉE', () => {
    const profile = composeLayeredProfile(sources({ answers: COMPANY_ANSWERS }))
    expect(profile.company?.locations).toBeNull()
    expect(profile.company?.unknown).toContain('locations')
    // Ce qui EST renseigné n’est pas déclaré inconnu.
    expect(profile.company?.unknown).not.toContain('identity')
    expect(profile.company?.unknown).not.toContain('model')
  })

  it('#2005.4 (DÉCISION Louis 17/09) — `company_locations` répond « où l’ESN est implantée », et voyage entreprise', () => {
    const profile = composeLayeredProfile(
      sources({ answers: { ...COMPANY_ANSWERS, company_locations: ['Paris (siège)', 'Lyon'] } }),
    )
    expect(profile.company?.locations).toEqual({ items: ['Paris (siège)', 'Lyon'] })
    expect(profile.company?.unknown).not.toContain('locations')
  })

  it('#2005.4 (DÉCISION Louis 17/09) — `client_references` et `no_go_sectors` sont désormais ENTREPRISE', () => {
    const profile = composeLayeredProfile(
      sources({
        answers: { ...COMPANY_ANSWERS, client_references: ['Société Générale'], no_go_sectors: ['Défense'] },
      }),
    )
    expect(profile.company?.references?.clientReferences).toEqual(['Société Générale'])
    expect(profile.company?.policies?.noGoSectors).toEqual(['Défense'])
    // Elles ne sont plus lues par la couche personne.
    expect(COMPANY_LAYER_ANSWER_KEYS).toContain('client_references')
    expect(COMPANY_LAYER_ANSWER_KEYS).toContain('no_go_sectors')
    expect(PERSON_LAYER_ANSWER_KEYS).not.toContain('client_references')
    expect(PERSON_LAYER_ANSWER_KEYS).not.toContain('no_go_sectors')
  })

  it('#2005.5 — sans capacité ni objectif de trimestre renseignés : `null`, et NOMMÉS dans `unknown`', () => {
    const unit = composeLayeredProfile(sources({ businessUnits: [TOULOUSE] })).businessUnit?.units[0]
    expect(unit?.capacity).toBeNull()
    expect(unit?.objectives).toBeNull()
    expect(unit?.unknown).toEqual(expect.arrayContaining(['capacity', 'objectives']))
    // Un effectif non déclaré reste `null` — « je n’ai pas dit » n’est pas « aucun ».
    expect(unit?.team.declaredSize).toBeNull()
    // Zéro compte RATTACHÉ est un compte fait, pas une absence.
    expect(unit?.accounts.attached).toBe(0)
    expect(unit?.unknown).not.toContain('accounts')
  })

  it('#2005.5 (DÉCISION Louis 17/09) — capacité et objectif du trimestre, saisis par le responsable de BU', () => {
    const unit = composeLayeredProfile(
      sources({
        businessUnits: [{ ...TOULOUSE, capacityAvailableConsultants: 4, quarterObjective: 'Ouvrir 3 comptes clés' }],
      }),
    ).businessUnit?.units[0]
    expect(unit?.capacity).toBe(4)
    expect(unit?.objectives).toEqual({ quarterObjective: 'Ouvrir 3 comptes clés' })
    expect(unit?.unknown).not.toContain('capacity')
    expect(unit?.unknown).not.toContain('objectives')
  })

  it('#2005.6 (DÉCISION Louis 17/09) — le nombre de consultants gérés DIRECTEMENT est PERSONNE', () => {
    const profile = composeLayeredProfile(
      sources({ answers: { consultants_managed_by_user_band: '6 à 15 consultants' } }),
    )
    expect(profile.person?.portfolio?.managedConsultants).toBe('6 à 15 consultants')
    expect(PERSON_LAYER_ANSWER_KEYS).toContain('consultants_managed_by_user_band')
    expect(COMPANY_LAYER_ANSWER_KEYS).not.toContain('consultants_managed_by_user_band')
  })

  it('#2005.6 — une personne sans réponse garde ses autorisations, et ses manques sont nommés', () => {
    const profile = composeLayeredProfile(sources({ person: { ...NO_PERSON, workspaceRole: 'viewer' } }))
    expect(profile.person?.permissions).toEqual({
      workspaceRole: 'viewer',
      businessUnitAccess: null,
      portfolioVisibility: null,
    })
    expect(profile.person?.unknown).toEqual(
      expect.arrayContaining(['role', 'experience', 'portfolio', 'habits', 'objectives', 'preferences']),
    )
    expect(profile.person?.unknown).not.toContain('permissions')
  })

  it('les facettes nommées sont celles de la demande, ni plus ni moins', () => {
    expect([...COMPANY_LAYER_FACETS]).toEqual([
      'identity',
      'offers',
      'references',
      'locations',
      'policies',
      'size',
      'model',
    ])
    expect([...BUSINESS_UNIT_LAYER_FACETS]).toEqual([
      'territory',
      'specialties',
      'capacity',
      'consultants',
      'accounts',
      'team',
      'objectives',
    ])
    expect([...PERSON_LAYER_FACETS]).toEqual([
      'role',
      'experience',
      'portfolio',
      'habits',
      'objectives',
      'preferences',
      'permissions',
    ])
  })
})

describe('la version d’une couche — une empreinte STABLE de son contenu (#2005.11)', () => {
  it('stable quand rien ne change — même contenu, ordre des clés différent', () => {
    const a = composeLayeredProfile(sources({ answers: COMPANY_ANSWERS, businessUnits: [TOULOUSE] }))
    const reordered = Object.fromEntries(Object.entries(COMPANY_ANSWERS).reverse()) as Partial<EsnAnswers>
    const b = composeLayeredProfile(sources({ answers: reordered, businessUnits: [{ ...TOULOUSE }] }))
    expect(layerVersionsOf(b)).toEqual(layerVersionsOf(a))
  })

  it('SAIT DIRE NON — la version de LA couche modifiée change, celle des autres non', () => {
    const base = sources({
      answers: { ...COMPANY_ANSWERS, user_role: 'Business Manager' },
      businessUnits: [TOULOUSE],
      person: { ...NO_PERSON, workspaceRole: 'sales' },
    })
    const before = layerVersionsOf(composeLayeredProfile(base))

    const companyChanged = layerVersionsOf(
      composeLayeredProfile({ ...base, answers: { ...base.answers, consultant_size: '50-200' } }),
    )
    expect(companyChanged.company).not.toBe(before.company)
    expect(companyChanged.businessUnit).toBe(before.businessUnit)
    expect(companyChanged.person).toBe(before.person)

    const unitChanged = layerVersionsOf(
      composeLayeredProfile({ ...base, businessUnits: [{ ...TOULOUSE, consultantCount: 13 }] }),
    )
    expect(unitChanged.businessUnit).not.toBe(before.businessUnit)
    expect(unitChanged.company).toBe(before.company)

    const personChanged = layerVersionsOf(
      composeLayeredProfile({ ...base, answers: { ...base.answers, user_role: 'Directeur commercial' } }),
    )
    expect(personChanged.person).not.toBe(before.person)
    expect(personChanged.company).toBe(before.company)
  })

  it('une préférence personnelle change la version de la PERSONNE, jamais celle de l’entreprise', () => {
    const base = sources({ answers: COMPANY_ANSWERS, person: { ...NO_PERSON, workspaceRole: 'sales' } })
    const before = layerVersionsOf(composeLayeredProfile(base))
    const after = layerVersionsOf(
      composeLayeredProfile({ ...base, person: { ...base.person, copilotPreferences: { ton: 'tutoiement' } } }),
    )
    expect(after.person).not.toBe(before.person)
    expect(after.company).toBe(before.company)
  })
})

describe('chaque couche lit SA moitié de la fusion — jamais celle de l’autre (GA-26)', () => {
  const personal = new Set<string>(ESN_PERSONAL_ANSWER_KEYS)

  it('lit quelque chose — les deux listes de sources ne sont pas vides', () => {
    expect(COMPANY_LAYER_ANSWER_KEYS.length).toBeGreaterThan(5)
    expect(PERSON_LAYER_ANSWER_KEYS.length).toBeGreaterThan(5)
  })

  it('la couche ENTREPRISE ne lit aucune réponse personnelle', () => {
    expect(COMPANY_LAYER_ANSWER_KEYS.filter(key => personal.has(key))).toEqual([])
  })

  it('la couche PERSONNE ne lit que des réponses personnelles', () => {
    expect(PERSON_LAYER_ANSWER_KEYS.filter(key => !personal.has(key))).toEqual([])
  })
})

describe('layerVersionsSchema — une recommandation porte ses TROIS versions (#2005.11)', () => {
  const VERSIONS = { company: 'a-1-2', businessUnit: null, person: 'b-3-4' }

  it('accepte trois clés, `null` pour une couche absente', () => {
    expect(layerVersionsSchema.safeParse(VERSIONS).success).toBe(true)
  })

  it('SAIT DIRE NON — une clé manquante ou une clé inventée est refusée', () => {
    expect(layerVersionsSchema.safeParse({ company: 'a-1-2', person: 'b-3-4' }).success).toBe(false)
    expect(layerVersionsSchema.safeParse({ ...VERSIONS, team: 'x-1-1' }).success).toBe(false)
    expect(layerVersionsSchema.safeParse({ ...VERSIONS, company: '' }).success).toBe(false)
  })

  const PROVENANCE = {
    mode: 'personalised',
    reason: null,
    esnProfileVersion: 3,
    profileContextVersion: 1,
    answered: 10,
    required: 10,
    esnName: 'Acme ESN',
  }

  it('SAIT DIRE NON — une provenance ÉCRITE sans versions de couche est refusée', () => {
    expect(recordedRunProfileProvenanceSchema.safeParse(PROVENANCE).success).toBe(false)
    expect(recordedRunProfileProvenanceSchema.safeParse({ ...PROVENANCE, layerVersions: null }).success).toBe(false)
    expect(recordedRunProfileProvenanceSchema.safeParse({ ...PROVENANCE, layerVersions: VERSIONS }).success).toBe(true)
  })

  it('une provenance LUE d’un run antérieur reste lisible — ses versions de couche valent `null`, jamais inventées', () => {
    expect(parseRunProfileProvenance(PROVENANCE)?.layerVersions).toBeNull()
    expect(parseRunProfileProvenance({ ...PROVENANCE, layerVersions: VERSIONS })?.layerVersions).toEqual(VERSIONS)
  })
})
