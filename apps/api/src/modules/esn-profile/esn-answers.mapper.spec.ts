import { mapRowToAnswers } from './esn-answers.mapper'
import type { EsnProfileEntity } from '../../database/entities/esn-profile.entity'

/**
 * #2034 / #2035 (lot L15) — garde de non-régression sur le motif n°1 de ce
 * dépôt : « du code juste, calculé, testé, que personne n'appelle ». La
 * colonne existe (migration), la question existe (wizard) — sans cette
 * projection, la lecture d'un profil rendrait `undefined` pour tout le monde,
 * exactement le défaut nommé par le commentaire #2118.10/#2118.15 de ce même
 * fichier pour le profil progressif.
 */
describe('mapRowToAnswers — maturité + effectif réel (#2034, #2035)', () => {
  const row = {
    esn_maturity_situation: 'Croissance',
    active_clients_band: '6 à 15 clients actifs',
    revenue_recurrence: 'Un mix de récurrent et de one-shot',
    client_concentration_risk: 'Je ne sais pas encore',
    company_growth_goal: 'Ouvrir un nouveau territoire',
    consultants_managed_by_user_band: '1 à 5 consultants',
    available_consultants_band: 'Beaucoup de disponibilité, fort intercontrat',
  } as unknown as EsnProfileEntity

  it('projette les 7 nouvelles colonnes vers EsnAnswers', () => {
    const answers = mapRowToAnswers(row)
    expect(answers.esn_maturity_situation).toBe('Croissance')
    expect(answers.active_clients_band).toBe('6 à 15 clients actifs')
    expect(answers.revenue_recurrence).toBe('Un mix de récurrent et de one-shot')
    expect(answers.client_concentration_risk).toBe('Je ne sais pas encore')
    expect(answers.company_growth_goal).toBe('Ouvrir un nouveau territoire')
    expect(answers.consultants_managed_by_user_band).toBe('1 à 5 consultants')
    expect(answers.available_consultants_band).toBe('Beaucoup de disponibilité, fort intercontrat')
  })

  it("rend `null` — jamais `undefined` ni `'0'` — quand aucune ligne n'existe (« non mesuré n'est jamais 0 »)", () => {
    const answers = mapRowToAnswers(null)
    expect(answers.esn_maturity_situation).toBeNull()
    expect(answers.active_clients_band).toBeNull()
    expect(answers.revenue_recurrence).toBeNull()
    expect(answers.client_concentration_risk).toBeNull()
    expect(answers.company_growth_goal).toBeNull()
    expect(answers.consultants_managed_by_user_band).toBeNull()
    expect(answers.available_consultants_band).toBeNull()
  })
})

/**
 * #2015.7 (filiation) / #2056.11 (économie du dossier) / #2057.10 (owner) —
 * même motif que ci-dessus : sans cette projection, un profil qui répond
 * reverrait ses réponses vides à la réouverture (migration 1795300384517).
 */
describe('mapRowToAnswers — filiation, économie du dossier, owner (#2015.7, #2056.11, #2057.10)', () => {
  const row = {
    company_group_structure: "Filiale d'un groupe",
    rfp_deal_value: '150-500 k€',
    rfp_owner_assignment: 'Un porteur nommé sur chaque dossier',
  } as unknown as EsnProfileEntity

  it('projette les 3 colonnes neuves vers EsnAnswers', () => {
    const answers = mapRowToAnswers(row)
    expect(answers.company_group_structure).toBe("Filiale d'un groupe")
    expect(answers.rfp_deal_value).toBe('150-500 k€')
    expect(answers.rfp_owner_assignment).toBe('Un porteur nommé sur chaque dossier')
  })

  it("rend `null` — jamais `undefined` — quand aucune ligne n'existe (« non mesuré n'est jamais 0 »)", () => {
    const answers = mapRowToAnswers(null)
    expect(answers.company_group_structure).toBeNull()
    expect(answers.rfp_deal_value).toBeNull()
    expect(answers.rfp_owner_assignment).toBeNull()
  })
})

/**
 * #2005.4 (DÉCISION Louis 17/09, lot CP2) — où l'ESN est implantée (siège +
 * bureaux), migration 1795610000000. Même motif : sans cette projection, la
 * réponse écrite en base resterait invisible à la lecture.
 */
describe("mapRowToAnswers — où l'ESN est implantée (#2005.4)", () => {
  it('projette `company_locations` vers EsnAnswers', () => {
    const row = { company_locations: ['Paris (siège)', 'Lyon'] } as unknown as EsnProfileEntity
    expect(mapRowToAnswers(row).company_locations).toEqual(['Paris (siège)', 'Lyon'])
  })

  it("rend `[]` — jamais `undefined` — quand aucune ligne n'existe", () => {
    expect(mapRowToAnswers(null).company_locations).toEqual([])
  })
})

/**
 * #2036.9 — l'ambition territoriale déclarée (`growth_target_zones`,
 * migration `1794291845307-RoleFunctionsAndGrowthZones`) distincte de
 * `geo_zones` (où le vendeur intervient déjà). La colonne était écrite
 * (`ia.client.ts`) mais jamais reprojetée ici : une réponse enregistrée
 * redevenait invisible à la relecture — le même défaut que #2060 ci-dessous.
 */
describe('mapRowToAnswers — ambition territoriale déclarée (#2036.9)', () => {
  it('projette `growth_target_zones` vers EsnAnswers', () => {
    const row = { growth_target_zones: ['Lyon & Auvergne-Rhône-Alpes'] } as unknown as EsnProfileEntity
    expect(mapRowToAnswers(row).growth_target_zones).toEqual(['Lyon & Auvergne-Rhône-Alpes'])
  })

  it("rend `[]` — jamais `undefined` — quand aucune ligne n'existe", () => {
    expect(mapRowToAnswers(null).growth_target_zones).toEqual([])
  })
})

/**
 * #2036.2 (#2847) — le remote accepté et les déplacements
 * (`remote_and_travel_scope`, migration `1796321380100-RemoteAndTravelScope`),
 * distinct de `geo_zones` et de `growth_target_zones` — même motif de
 * projection que ces deux voisins.
 */
describe('mapRowToAnswers — remote et déplacements (#2036.2)', () => {
  it('projette `remote_and_travel_scope` vers EsnAnswers', () => {
    const row = { remote_and_travel_scope: ['Remote partiel (quelques jours sur site)'] } as unknown as EsnProfileEntity
    expect(mapRowToAnswers(row).remote_and_travel_scope).toEqual(['Remote partiel (quelques jours sur site)'])
  })

  it("rend `[]` — jamais `undefined` — quand aucune ligne n'existe", () => {
    expect(mapRowToAnswers(null).remote_and_travel_scope).toEqual([])
  })
})

/**
 * #2036.8 (#2847) — la posture territoriale déclarée
 * (`zone_capability_status`, migration `1796321504100-ZoneCapabilityStatus`),
 * v1 tranché sans Louis — même motif de projection que ses voisins.
 */
describe('mapRowToAnswers — posture territoriale déclarée (#2036.8)', () => {
  it('projette `zone_capability_status` vers EsnAnswers', () => {
    const row = { zone_capability_status: ['Je peux intervenir (capacité déjà avérée)'] } as unknown as EsnProfileEntity
    expect(mapRowToAnswers(row).zone_capability_status).toEqual(['Je peux intervenir (capacité déjà avérée)'])
  })

  it("rend `[]` — jamais `undefined` — quand aucune ligne n'existe", () => {
    expect(mapRowToAnswers(null).zone_capability_status).toEqual([])
  })
})

/**
 * #2060 — la question ouverte qui FERME le parcours, migration
 * `1795712398814-EsnProfileUncoveredActivityNote`. Même motif que
 * `growth_target_zones` (#2036.9, balayage 18/09/2026) : une colonne écrite
 * mais absente de ce mapper ne se RELIT jamais — l'écriture passe, la lecture
 * non. Cette projection est ce qui manquait pour que le champ soit vraiment
 * `déjà là` une fois répondu.
 */
describe('mapRowToAnswers — la question ouverte qui ferme le parcours (#2060)', () => {
  it('projette `uncovered_activity_note` vers EsnAnswers', () => {
    const row = { uncovered_activity_note: 'Mon associé part dans 6 mois.' } as unknown as EsnProfileEntity
    expect(mapRowToAnswers(row).uncovered_activity_note).toBe('Mon associé part dans 6 mois.')
  })

  it("rend `null` — jamais `''` — quand rien n'a été répondu (GA-18/GA-19)", () => {
    expect(
      mapRowToAnswers({ uncovered_activity_note: null } as unknown as EsnProfileEntity).uncovered_activity_note,
    ).toBeNull()
    expect(mapRowToAnswers(null).uncovered_activity_note).toBeNull()
  })
})

/**
 * #2039.6 (épopée #2880, tranché sans Louis) — migration `1796321384417`.
 * Même motif que `growth_target_zones` : une colonne écrite mais absente de
 * ce mapper ne se relit jamais.
 */
describe('mapRowToAnswers — expertises sans preuve concrète (#2039.6)', () => {
  it('projette `expertise_no_concrete_proof` vers EsnAnswers', () => {
    const row = { expertise_no_concrete_proof: ['IoT & Systèmes embarqués'] } as unknown as EsnProfileEntity
    expect(mapRowToAnswers(row).expertise_no_concrete_proof).toEqual(['IoT & Systèmes embarqués'])
  })

  it("rend `[]` — jamais `undefined` — quand aucune ligne n'existe ou que la colonne est absente", () => {
    expect(mapRowToAnswers(null).expertise_no_concrete_proof).toEqual([])
    expect(mapRowToAnswers({} as unknown as EsnProfileEntity).expertise_no_concrete_proof).toEqual([])
  })
})

/**
 * #2039.2 (épopée #2880, tranché sans Louis) — migration `1796322010437`.
 * Même motif que `expertise_no_concrete_proof` ci-dessus.
 */
describe('mapRowToAnswers — expertises avec référence client (#2039.2)', () => {
  it('projette `expertise_client_reference` vers EsnAnswers', () => {
    const row = { expertise_client_reference: ['Data & Intelligence Artificielle'] } as unknown as EsnProfileEntity
    expect(mapRowToAnswers(row).expertise_client_reference).toEqual(['Data & Intelligence Artificielle'])
  })

  it("rend `[]` — jamais `undefined` — quand aucune ligne n'existe ou que la colonne est absente", () => {
    expect(mapRowToAnswers(null).expertise_client_reference).toEqual([])
    expect(mapRowToAnswers({} as unknown as EsnProfileEntity).expertise_client_reference).toEqual([])
  })
})

/**
 * #2039.3/.4/.5 (épopée #2880, vague G lot g10, tranché sans Louis) —
 * migrations `1796322780320`/`1796322780330`/`1796322781937`. Même motif que
 * `expertise_no_concrete_proof`/`expertise_client_reference` ci-dessus.
 */
describe('mapRowToAnswers — expérience personnelle, partenaire, vivier disponible (#2039.3/.4/.5)', () => {
  it('projette `expertise_personal_experience` vers EsnAnswers', () => {
    const row = { expertise_personal_experience: ['Cybersécurité & Conformité'] } as unknown as EsnProfileEntity
    expect(mapRowToAnswers(row).expertise_personal_experience).toEqual(['Cybersécurité & Conformité'])
  })

  it('projette `expertise_partner` vers EsnAnswers', () => {
    const row = {
      expertise_partner: ['Cloud & Infrastructure (AWS, Azure, GCP, Hosting)'],
    } as unknown as EsnProfileEntity
    expect(mapRowToAnswers(row).expertise_partner).toEqual(['Cloud & Infrastructure (AWS, Azure, GCP, Hosting)'])
  })

  it('projette `expertise_talent_pool` vers EsnAnswers', () => {
    const row = { expertise_talent_pool: ['Data & Intelligence Artificielle'] } as unknown as EsnProfileEntity
    expect(mapRowToAnswers(row).expertise_talent_pool).toEqual(['Data & Intelligence Artificielle'])
  })

  it("rend `[]` — jamais `undefined` — quand aucune ligne n'existe ou que la colonne est absente", () => {
    for (const key of ['expertise_personal_experience', 'expertise_partner', 'expertise_talent_pool'] as const) {
      expect(mapRowToAnswers(null)[key]).toEqual([])
      expect(mapRowToAnswers({} as unknown as EsnProfileEntity)[key]).toEqual([])
    }
  })
})

// #3923.a — `placed_roles` existait en base sans jamais être projetée : Découvrir
// ne pouvait juger aucune offre d'emploi contre le métier déclaré.
describe('mapRowToAnswers — métiers placés (#3923.a)', () => {
  it('projette `placed_roles` vers EsnAnswers', () => {
    const row = { placed_roles: ['Développeur Java', 'Architecte cloud'] } as unknown as EsnProfileEntity
    expect(mapRowToAnswers(row).placed_roles).toEqual(['Développeur Java', 'Architecte cloud'])
  })

  it("rend `[]` — jamais `undefined` — quand aucune ligne n'existe", () => {
    expect(mapRowToAnswers(null).placed_roles).toEqual([])
  })
})

// #4270.1 (18/10) — le profil d'espace voyage de la colonne aux réponses.
describe('#4270.1 — workspace_profile', () => {
  it('projette `forfait_conseil` vers EsnAnswers', () => {
    const row = { workspace_profile: 'forfait_conseil' } as unknown as EsnProfileEntity
    expect(mapRowToAnswers(row).workspace_profile).toBe('forfait_conseil')
  })

  it('aucun choix, ligne absente ou valeur inconnue : null — jamais un profil deviné', () => {
    expect(mapRowToAnswers(null).workspace_profile).toBeNull()
    expect(mapRowToAnswers({ workspace_profile: null } as unknown as EsnProfileEntity).workspace_profile).toBeNull()
    expect(mapRowToAnswers({ workspace_profile: 'regie' } as unknown as EsnProfileEntity).workspace_profile).toBeNull()
  })
})
