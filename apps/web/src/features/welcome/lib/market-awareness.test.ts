import { describe, expect, it } from 'vitest'
import type { EsnAnswers } from '@bellum/contracts'
import { deriveMarketAwarenessQuery } from './market-awareness'

/**
 * #1627 — LES FIXTURES SONT LES LIBELLÉS DU QUESTIONNAIRE, PAS DES MOTS COURTS
 * ÉCRITS À LA MAIN.
 *
 * La première version de ce fichier nourrissait `['Java']` et `['Lyon']` —
 * deux valeurs qu'AUCUN utilisateur ne peut produire : `geo_zones` n'a pas de
 * champ libre, et ses douze choix sont tous composés (« Lyon &
 * Auvergne-Rhône-Alpes »). Les tests passaient, et la carte était morte en
 * production pour tout le monde. C'est le défaut « un semis qui ne lit pas
 * comme l'écran » : la fixture doit venir de `onboarding/lib/questions.ts`.
 */

/** Les libellés EXACTS de `Q.geo_zones` / `Q.expertise_areas` (questions.ts). */
const ZONE_PARIS = 'Paris & Île-de-France'
const ZONE_LYON = 'Lyon & Auvergne-Rhône-Alpes'
const ZONE_MARSEILLE = 'Marseille & PACA'
const ZONE_REMOTE = 'Full remote (pas de contrainte géo)'
const ZONE_NATIONAL = 'National (toute la France)'
const ZONE_INTERNATIONAL = 'International'
const EXPERTISE_CLOUD = 'Cloud & Infrastructure (AWS, Azure, GCP, Hosting)'
const EXPERTISE_DATA = 'Data & Intelligence Artificielle'
const EXPERTISE_DEVOPS = 'DevOps, SRE & Automatisation'

function answers(overrides: Partial<EsnAnswers> = {}): EsnAnswers {
  return {
    esn_name: null,
    consultant_size: null,
    sales_team_size: null,
    expertise_areas: [],
    positioning: null,
    target_sectors: [],
    target_company_types: [],
    staffing_model: null,
    geo_zones: [],
    main_sales_pain: null,
    offer_domain: null,
    offer_domains: [],
    ...overrides,
  } as EsnAnswers
}

describe('deriveMarketAwarenessQuery', () => {
  it('rend `null` quand ni expertise ni zone ne sont déclarées — jamais un appel sans discriminant', () => {
    expect(deriveMarketAwarenessQuery(answers())).toBeNull()
    expect(deriveMarketAwarenessQuery(null)).toBeNull()
    expect(deriveMarketAwarenessQuery(undefined)).toBeNull()
  })

  it('⚠️ coupe le libellé composé de la zone sur son NOM DE LIEU — le corpus stocke « Lyon », jamais « Lyon & Auvergne-Rhône-Alpes »', () => {
    expect(deriveMarketAwarenessQuery(answers({ geo_zones: [ZONE_LYON] }))).toEqual({ location: 'Lyon' })
    expect(deriveMarketAwarenessQuery(answers({ geo_zones: [ZONE_PARIS] }))).toEqual({ location: 'Paris' })
    expect(deriveMarketAwarenessQuery(answers({ geo_zones: [ZONE_MARSEILLE] }))).toEqual({ location: 'Marseille' })
  })

  it('⚠️ n’envoie JAMAIS technologie ET localisation ensemble — `searchByFilters` compose en ET, l’intersection rendrait 0', () => {
    const query = deriveMarketAwarenessQuery(answers({ expertise_areas: [EXPERTISE_DATA], geo_zones: [ZONE_LYON] }))
    expect(query).toEqual({ location: 'Lyon' })
    expect(query).not.toHaveProperty('technology')
  })

  it('saute une zone qui nomme un MODE ou une PORTÉE et non un lieu, puis essaie la suivante', () => {
    expect(deriveMarketAwarenessQuery(answers({ geo_zones: [ZONE_REMOTE, ZONE_LYON] }))).toEqual({ location: 'Lyon' })
    expect(deriveMarketAwarenessQuery(answers({ geo_zones: [ZONE_NATIONAL, ZONE_PARIS] }))).toEqual({
      location: 'Paris',
    })
    expect(deriveMarketAwarenessQuery(answers({ geo_zones: [ZONE_INTERNATIONAL, ZONE_PARIS] }))).toEqual({
      location: 'Paris',
    })
  })

  it('sans AUCUNE zone territoriale, retombe sur la première expertise — coupée elle aussi sur son premier segment', () => {
    expect(
      deriveMarketAwarenessQuery(answers({ geo_zones: [ZONE_REMOTE], expertise_areas: [EXPERTISE_CLOUD] })),
    ).toEqual({ technology: 'Cloud' })
    expect(deriveMarketAwarenessQuery(answers({ expertise_areas: [EXPERTISE_DATA] }))).toEqual({ technology: 'Data' })
    expect(deriveMarketAwarenessQuery(answers({ expertise_areas: [EXPERTISE_DEVOPS] }))).toEqual({
      technology: 'DevOps',
    })
  })

  it('⚠️ garde les ACCENTS de la technologie — `stack.techno ILIKE` ne plie PAS les diacritiques (seule la localisation est pliée des deux côtés)', () => {
    expect(deriveMarketAwarenessQuery(answers({ expertise_areas: ['Cybersécurité & Conformité'] }))).toEqual({
      technology: 'Cybersécurité',
    })
  })

  it('rend `null` quand la seule zone est non territoriale et qu’aucune expertise n’est déclarée', () => {
    expect(deriveMarketAwarenessQuery(answers({ geo_zones: [ZONE_REMOTE, ZONE_NATIONAL] }))).toBeNull()
  })

  it('ignore les entrées vides plutôt que de les envoyer telles quelles', () => {
    expect(deriveMarketAwarenessQuery(answers({ geo_zones: ['  ', ZONE_LYON] }))).toEqual({ location: 'Lyon' })
    expect(deriveMarketAwarenessQuery(answers({ expertise_areas: ['  ', EXPERTISE_DATA] }))).toEqual({
      technology: 'Data',
    })
  })

  it('ne fabrique ni secteur ni taille — le moteur ne les porte pas, et une taille cible n’est pas un effectif observé', () => {
    const query = deriveMarketAwarenessQuery(
      answers({
        geo_zones: [ZONE_LYON],
        target_sectors: ['Banque de détail & Banque privée'],
        target_company_types: ['ETI (500-5 000 salariés)'],
      }),
    )
    expect(query).toEqual({ location: 'Lyon' })
    expect(query).not.toHaveProperty('employeeMin')
    expect(query).not.toHaveProperty('employeeMax')
  })
})
