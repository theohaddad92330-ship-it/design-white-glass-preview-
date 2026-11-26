import { describe, expect, it } from 'vitest'
import {
  LINK_KIND_TO_VOIE,
  PERSONAL_ACCESS_VOIES,
  PERSONAL_LINK_STALE_AFTER_DAYS,
  groupPersonalAccessPathsByVoie,
  partnerRegistrySourceKind,
  personalAccessCertainty,
  personalAccessFreshness,
  personalAccessRisk,
  type PersonalAccessPath,
} from './personal-access-path.js'

/**
 * #3403 — L'ONGLET ACCÈS STRUCTURÉ AUTOUR DES VOIES D'ACCÈS PERSONNELLES.
 *
 * Onze voies nommées par le retour ; huit ont une dérivation réelle dans ce
 * dépôt et sont câblées ici (`account-access.service.ts`), trois sont
 * additives à `LINK_KINDS` (#3403.7/.9/.10, voir son docblock). Ce module est
 * PUR : il ne lit ni le CRM, ni la base — il classe ce qu'on lui donne.
 */

describe('#3403 — onze voies, et onze seulement', () => {
  it('porte exactement onze voies', () => {
    expect(PERSONAL_ACCESS_VOIES).toHaveLength(11)
  })

  it('couvre les onze libellés du retour, dans son ordre', () => {
    expect(PERSONAL_ACCESS_VOIES).toEqual([
      'consultant_en_place',
      'ancien_collegue',
      'relation_commune',
      'client_existant',
      'partenaire_rang2',
      'esn_referencee',
      'ancien_manager',
      'personne_changement_poste',
      'evenement_rencontre',
      'reseau_alumni',
      'recommandation_directe',
    ])
  })
})

describe('#3403.7 — LINK_KIND_TO_VOIE', () => {
  it('mappe les sept LinkKind qui correspondent à une voie nommée', () => {
    expect(LINK_KIND_TO_VOIE.consultant).toBe('consultant_en_place')
    expect(LINK_KIND_TO_VOIE.former_colleague).toBe('ancien_collegue')
    expect(LINK_KIND_TO_VOIE.common_relation).toBe('relation_commune')
    expect(LINK_KIND_TO_VOIE.explicit_recommendation).toBe('recommandation_directe')
    expect(LINK_KIND_TO_VOIE.former_manager).toBe('ancien_manager')
    expect(LINK_KIND_TO_VOIE.event_encounter).toBe('evenement_rencontre')
    expect(LINK_KIND_TO_VOIE.alumni_network).toBe('reseau_alumni')
  })

  it('ne mappe PAS les types hors du vocabulaire des onze voies', () => {
    expect(LINK_KIND_TO_VOIE.proposed_introduction).toBeUndefined()
    expect(LINK_KIND_TO_VOIE.workspace_colleague).toBeUndefined()
    expect(LINK_KIND_TO_VOIE.linkedin_interaction).toBeUndefined()
    expect(LINK_KIND_TO_VOIE.historic_contact).toBeUndefined()
    expect(LINK_KIND_TO_VOIE.probable_relation).toBeUndefined()
    expect(LINK_KIND_TO_VOIE.plain_homonymy).toBeUndefined()
  })
})

describe('#3403.13 — fraîcheur, sur le même seuil que la gouvernance des warm intro', () => {
  const now = new Date('2026-09-30T00:00:00.000Z')

  it('non daté = `undated`, jamais `fresh`', () => {
    expect(personalAccessFreshness(null, now)).toBe('undated')
  })

  it('sous le seuil = `fresh`', () => {
    const recent = new Date(now.getTime() - 10 * 86_400_000).toISOString()
    expect(personalAccessFreshness(recent, now)).toBe('fresh')
  })

  it(`au-delà de ${PERSONAL_LINK_STALE_AFTER_DAYS} jours = \`stale\``, () => {
    const old = new Date(now.getTime() - (PERSONAL_LINK_STALE_AFTER_DAYS + 1) * 86_400_000).toISOString()
    expect(personalAccessFreshness(old, now)).toBe('stale')
  })
})

describe('#3403.13 — les cinq distinctions de certitude, jamais une voie garantie sans confirmation', () => {
  it('un lien déclaré ET vérifié est un accès vérifié', () => {
    expect(personalAccessCertainty({ sourceKind: 'workspace_declared_link', verified: true, freshness: 'fresh' })).toBe(
      'verified_access',
    )
  })

  it('#3403.14 — un lien déclaré NON vérifié reste une relation probable, jamais garantie', () => {
    expect(
      personalAccessCertainty({ sourceKind: 'workspace_declared_link', verified: false, freshness: 'fresh' }),
    ).toBe('probable_relation')
  })

  it('#3403 (X68) — un lien déclaré non vérifié ET déclaré « distant » est une SIMPLE AFFINITÉ, distincte de la relation probable', () => {
    expect(
      personalAccessCertainty({
        sourceKind: 'workspace_declared_link',
        verified: false,
        freshness: 'fresh',
        warmth: 'distant',
      }),
    ).toBe('simple_affinity')
    for (const warmth of ['cordial', 'close', null, undefined] as const) {
      expect(
        personalAccessCertainty({ sourceKind: 'workspace_declared_link', verified: false, freshness: 'fresh', warmth }),
      ).toBe('probable_relation')
    }
  })

  it('#3403 (X68) — « distant » ne dégrade jamais un accès VÉRIFIÉ, et le périmé retombe en observation avant tout', () => {
    expect(
      personalAccessCertainty({
        sourceKind: 'workspace_declared_link',
        verified: true,
        freshness: 'fresh',
        warmth: 'distant',
      }),
    ).toBe('verified_access')
    expect(
      personalAccessCertainty({
        sourceKind: 'workspace_declared_link',
        verified: false,
        freshness: 'stale',
        warmth: 'distant',
      }),
    ).toBe('historic_observation')
  })

  it('#3403 (X68) — la simple affinité garde le risque « non confirmé » : jamais une garantie', () => {
    expect(personalAccessRisk({ certainty: 'simple_affinity', freshness: 'fresh' })).toBe('unconfirmed')
  })

  it('un partenaire avec placements réels (preuve) est un accès vérifié', () => {
    expect(
      personalAccessCertainty({ sourceKind: 'partner_registry_proven', verified: false, freshness: 'fresh' }),
    ).toBe('verified_access')
  })

  it('un partenaire déclaré sans placement reste une relation probable', () => {
    expect(
      personalAccessCertainty({ sourceKind: 'partner_registry_declared', verified: false, freshness: 'fresh' }),
    ).toBe('probable_relation')
  })

  it('un partenaire vu par le pipeline À UNE DATE est une relation probable — la liste des ESN dit « source actuelle » (#3473)', () => {
    expect(
      personalAccessCertainty({ sourceKind: 'partner_registry_observed', verified: false, freshness: 'fresh' }),
    ).toBe('probable_relation')
  })

  it('un partenaire vu par le pipeline SANS date ne prouve rien : observation historique', () => {
    expect(
      personalAccessCertainty({ sourceKind: 'partner_registry_observed', verified: false, freshness: 'undated' }),
    ).toBe('historic_observation')
  })

  // #3473 — la liste « Les ESN présentes » ne vieillit pas une relation du
  // registre : la parole de l'équipe reste « déclarée » à 190 jours. Une voie
  // personnelle tirée de la MÊME ligne ne doit pas dire l'inverse.
  it.each(['partner_registry_proven', 'partner_registry_declared', 'partner_registry_observed'] as const)(
    '%s : la péremption ne fait pas retomber la relation du registre en observation historique',
    sourceKind => {
      expect(personalAccessCertainty({ sourceKind, verified: false, freshness: 'stale' })).not.toBe(
        'historic_observation',
      )
    },
  )

  it('une relation client CRM active est un accès vérifié', () => {
    expect(personalAccessCertainty({ sourceKind: 'crm_relationship', verified: false, freshness: 'fresh' })).toBe(
      'verified_access',
    )
  })

  it('un signal détecté (changement de poste) reste une observation historique', () => {
    expect(personalAccessCertainty({ sourceKind: 'detected_signal', verified: false, freshness: 'fresh' })).toBe(
      'historic_observation',
    )
  })

  it('périmé fait toujours retomber en observation historique, même un accès autrement vérifié', () => {
    expect(personalAccessCertainty({ sourceKind: 'crm_relationship', verified: true, freshness: 'stale' })).toBe(
      'historic_observation',
    )
  })
})

describe('#3667.R1 — partnerRegistrySourceKind, à un seul endroit pour Accès ET la stratégie 5P', () => {
  it('des placements réels priment sur tout le reste', () => {
    expect(partnerRegistrySourceKind({ placements: 1, source: 'analysis' })).toBe('partner_registry_proven')
    expect(partnerRegistrySourceKind({ placements: 3, source: 'declared' })).toBe('partner_registry_proven')
  })

  it('sans placement, une source `declared` reste une déclaration d’équipe', () => {
    expect(partnerRegistrySourceKind({ placements: 0, source: 'declared' })).toBe('partner_registry_declared')
  })

  it('sans placement et sans déclaration, la ligne est une observation du pipeline', () => {
    expect(partnerRegistrySourceKind({ placements: 0, source: 'analysis' })).toBe('partner_registry_observed')
  })
})

describe('#3403.16 — le risque nommé, jamais un chiffre inventé', () => {
  it('périmé porte le risque `stale`', () => {
    expect(personalAccessRisk({ certainty: 'historic_observation', freshness: 'stale' })).toBe('stale')
  })

  it('une relation probable, fraîche, porte le risque `unconfirmed`', () => {
    expect(personalAccessRisk({ certainty: 'probable_relation', freshness: 'fresh' })).toBe('unconfirmed')
  })

  it('une observation historique fraîche porte `undeclared_detection`', () => {
    expect(personalAccessRisk({ certainty: 'historic_observation', freshness: 'fresh' })).toBe('undeclared_detection')
  })

  it('un accès vérifié et frais ne porte AUCUN risque', () => {
    expect(personalAccessRisk({ certainty: 'verified_access', freshness: 'fresh' })).toBeNull()
  })
})

describe('#3403.1 — dans une LISTE, une absence ne fait aucune ligne', () => {
  const item = (voie: PersonalAccessPath['voie']): PersonalAccessPath => ({
    id: `${voie}-1`,
    voie,
    subject: 'Marie D.',
    proof: null,
    observedAt: null,
    freshness: 'undated',
    certainty: 'probable_relation',
    risk: null,
  })

  it('une voie sans aucune instance ne produit AUCUN groupe', () => {
    const groups = groupPersonalAccessPathsByVoie([item('consultant_en_place')])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.voie).toBe('consultant_en_place')
  })

  it('respecte l’ordre du retour, pas l’ordre d’arrivée des données', () => {
    const groups = groupPersonalAccessPathsByVoie([item('recommandation_directe'), item('ancien_collegue')])
    expect(groups.map(g => g.voie)).toEqual(['ancien_collegue', 'recommandation_directe'])
  })

  it('aucune instance du tout = aucun groupe, jamais onze lignes vides', () => {
    expect(groupPersonalAccessPathsByVoie([])).toEqual([])
  })
})
