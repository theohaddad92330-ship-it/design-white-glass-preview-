import { describe, expect, it } from 'vitest'
import {
  detectQuestionnaireContradictions,
  hasAcquisitionPriorityWithNoOutbound,
  hasBigAccountsWithNoAccess,
  hasDistantZonesWithoutReach,
  hasFreelanceOnlyWithNoBench,
  hasHighTargetWithLowTime,
  hasNicheWithWideOffer,
  hasNoSalesCapacityWithLargePortfolio,
  hasSmallTeamWithManySectors,
  hasTooManyPrioritySectors,
} from './onboarding-contradictions.js'
import { ESN_ANSWER_OPTIONS } from './onboarding.js'

// #2029 — huit détecteurs, chacun testé sur son cas positif, un cas voisin qui
// ne doit RIEN déclencher, et l'absence de données (jamais un faux positif sur
// « non répondu »).

describe('#2029.1 — équipe très petite + dix secteurs prioritaires', () => {
  it('détecte la tension', () => {
    expect(
      hasSmallTeamWithManySectors({
        sales_team_size: 'Je suis seul (fondateur / indépendant)',
        target_sectors: ESN_ANSWER_OPTIONS.target_sectors.slice(0, 10),
      }),
    ).toBe(true)
  })

  it('ne détecte rien sous le seuil de dix secteurs', () => {
    expect(
      hasSmallTeamWithManySectors({
        sales_team_size: '2-3 personnes',
        target_sectors: ESN_ANSWER_OPTIONS.target_sectors.slice(0, 3),
      }),
    ).toBe(false)
  })

  it('ne confond pas « très petite équipe » avec « aucune équipe dédiée » (#2029.2)', () => {
    expect(
      hasSmallTeamWithManySectors({
        sales_team_size: "Je n'ai pas d'équipe commerciale dédiée",
        target_sectors: ESN_ANSWER_OPTIONS.target_sectors.slice(0, 10),
      }),
    ).toBe(false)
  })
})

describe('#2029.2 — aucune capacité commerciale + cinquante comptes actifs', () => {
  it('détecte la tension', () => {
    expect(
      hasNoSalesCapacityWithLargePortfolio({
        sales_team_size: "Je n'ai pas d'équipe commerciale dédiée",
        portfolio_size: '61-100',
      }),
    ).toBe(true)
  })

  it('ne détecte rien sans portefeuille répondu (non mesuré ≠ 0)', () => {
    expect(hasNoSalesCapacityWithLargePortfolio({ sales_team_size: "Je n'ai pas d'équipe commerciale dédiée" })).toBe(
      false,
    )
  })

  it('ne détecte rien sur un petit portefeuille', () => {
    expect(
      hasNoSalesCapacityWithLargePortfolio({
        sales_team_size: "Je n'ai pas d'équipe commerciale dédiée",
        portfolio_size: '1-5',
      }),
    ).toBe(false)
  })
})

describe('#2029.3 — niche annoncée + offre très large', () => {
  it('détecte la tension', () => {
    expect(
      hasNicheWithWideOffer({
        positioning: ESN_ANSWER_OPTIONS.positioning[0],
        expertise_areas: ESN_ANSWER_OPTIONS.expertise_areas.slice(0, 6),
      }),
    ).toBe(true)
  })

  it('ne détecte rien pour un vrai spécialiste (1-2 domaines)', () => {
    expect(
      hasNicheWithWideOffer({
        positioning: ESN_ANSWER_OPTIONS.positioning[0],
        expertise_areas: ESN_ANSWER_OPTIONS.expertise_areas.slice(0, 2),
      }),
    ).toBe(false)
  })

  it('ne détecte rien pour un généraliste — ce n’est pas la même tension (#2029 amorce)', () => {
    expect(
      hasNicheWithWideOffer({
        positioning: ESN_ANSWER_OPTIONS.positioning[2],
        expertise_areas: ESN_ANSWER_OPTIONS.expertise_areas.slice(0, 6),
      }),
    ).toBe(false)
  })
})

describe('#2029.4 — objectif élevé + une heure disponible', () => {
  it('détecte la tension', () => {
    expect(
      hasHighTargetWithLowTime({
        weekly_sales_time_declared: 'Moins de 2 heures par semaine',
        monthly_target: '20+ RDV',
      }),
    ).toBe(true)
  })

  it('ne détecte rien sans objectif répondu', () => {
    expect(hasHighTargetWithLowTime({ weekly_sales_time_declared: 'Aucune heure dans une semaine ordinaire' })).toBe(
      false,
    )
  })

  it('ne détecte rien sur un temps confortable', () => {
    expect(
      hasHighTargetWithLowTime({
        weekly_sales_time_declared: 'Plus de 20 heures par semaine',
        monthly_target: '20+ RDV',
      }),
    ).toBe(false)
  })
})

describe('#2029.5 — grands comptes visés + aucun accès ni référence', () => {
  it('détecte la tension', () => {
    expect(
      hasBigAccountsWithNoAccess({
        target_company_types: ['CAC40 / SBF120 (grands comptes)'],
        entry_channels_used: ['Appels sortants', 'E-mails de prospection'],
        client_references: [],
      }),
    ).toBe(true)
  })

  it('ne détecte rien tant que les canaux ne sont pas répondus (non mesuré ≠ « aucun accès »)', () => {
    expect(hasBigAccountsWithNoAccess({ target_company_types: ['CAC40 / SBF120 (grands comptes)'] })).toBe(false)
  })

  it('ne détecte rien avec un canal de confiance', () => {
    expect(
      hasBigAccountsWithNoAccess({
        target_company_types: ['CAC40 / SBF120 (grands comptes)'],
        entry_channels_used: ['Réseau personnel et anciens clients'],
      }),
    ).toBe(false)
  })

  it('ne détecte rien avec une référence client déjà citée', () => {
    expect(
      hasBigAccountsWithNoAccess({
        target_company_types: ['CAC40 / SBF120 (grands comptes)'],
        entry_channels_used: ['Appels sortants'],
        client_references: ['Mission pour un grand compte bancaire'],
      }),
    ).toBe(false)
  })
})

describe('#2029.6 — freelance + aucune disponibilité au vivier', () => {
  it('détecte la tension', () => {
    expect(
      hasFreelanceOnlyWithNoBench({ staffing_model: 'Uniquement freelances (pas de CDI)', consultants_in_pipe: '0' }),
    ).toBe(true)
  })

  it('ne détecte rien sans vivier répondu', () => {
    expect(hasFreelanceOnlyWithNoBench({ staffing_model: 'Uniquement freelances (pas de CDI)' })).toBe(false)
  })

  it('ne détecte rien sur un mix CDI/freelance', () => {
    expect(
      hasFreelanceOnlyWithNoBench({ staffing_model: 'Mix équilibré CDI / Freelances', consultants_in_pipe: '0' }),
    ).toBe(false)
  })
})

describe('#2029.7 — deux zones géographiques éloignées sans justification', () => {
  it('détecte la tension nord/sud', () => {
    expect(hasDistantZonesWithoutReach({ geo_zones: ['Lille & Hauts-de-France', 'Marseille & PACA'] })).toBe(true)
  })

  it('ne détecte rien avec « National » — la justification désamorce la tension', () => {
    expect(
      hasDistantZonesWithoutReach({
        geo_zones: ['Lille & Hauts-de-France', 'Marseille & PACA', 'National (toute la France)'],
      }),
    ).toBe(false)
  })

  it('ne détecte rien sur deux zones voisines', () => {
    expect(hasDistantZonesWithoutReach({ geo_zones: ['Paris & Île-de-France', 'Lyon & Auvergne-Rhône-Alpes'] })).toBe(
      false,
    )
  })
})

describe('#2029.8 — priorité acquisition + aucune action sortante', () => {
  it('détecte la tension', () => {
    expect(
      hasAcquisitionPriorityWithNoOutbound({
        individual_goal: 'Ouvrir de nouveaux comptes',
        entry_channels_used: ['Événements et salons', 'Demandes entrantes'],
      }),
    ).toBe(true)
  })

  it('ne détecte rien tant que les canaux ne sont pas répondus', () => {
    expect(hasAcquisitionPriorityWithNoOutbound({ individual_goal: 'Ouvrir de nouveaux comptes' })).toBe(false)
  })

  it('ne détecte rien avec un canal sortant sélectionné', () => {
    expect(
      hasAcquisitionPriorityWithNoOutbound({
        individual_goal: 'Ouvrir de nouveaux comptes',
        entry_channels_used: ['Appels sortants'],
      }),
    ).toBe(false)
  })
})

describe('#2041.1 — plus de deux secteurs prioritaires', () => {
  const SECTORS = ESN_ANSWER_OPTIONS.target_sectors

  it('détecte la tension au-delà du seuil, STRICTEMENT', () => {
    expect(hasTooManyPrioritySectors({ priority_sectors: SECTORS.slice(0, 3) })).toBe(true)
    // Deux, c'est le seuil, pas un dépassement : la relance se tait dessus.
    expect(hasTooManyPrioritySectors({ priority_sectors: SECTORS.slice(0, 2) })).toBe(false)
  })

  it('ne dit RIEN sur une question non répondue — non mesuré n’est pas « zéro priorité »', () => {
    expect(hasTooManyPrioritySectors({})).toBe(false)
    expect(hasTooManyPrioritySectors({ priority_sectors: [] })).toBe(false)
  })

  it('n’attrape pas le voisin légitime : vingt secteurs VISÉS ne sont pas vingt priorités', () => {
    // C'est la tension que `small_team_many_sectors` regarde, avec sa propre
    // condition d'équipe — celle-ci parle du mot « prioritaire », pas du
    // nombre de cases cochées.
    expect(hasTooManyPrioritySectors({ target_sectors: SECTORS.slice(0, 10) })).toBe(false)
  })

  it('compte ce que le classement compte — un prioritaire refusé n’est pas une priorité', () => {
    expect(
      hasTooManyPrioritySectors({ priority_sectors: SECTORS.slice(0, 3), no_go_sectors: [SECTORS[0] ?? ''] }),
    ).toBe(false)
  })
})

describe('detectQuestionnaireContradictions — l’agrégateur', () => {
  it('ne rend rien sur un profil sans tension (le profil de démo, en substance)', () => {
    expect(
      detectQuestionnaireContradictions({
        sales_team_size: 'Je suis seul (fondateur / indépendant)',
        positioning: ESN_ANSWER_OPTIONS.positioning[1],
        expertise_areas: ESN_ANSWER_OPTIONS.expertise_areas.slice(0, 3),
        target_sectors: ESN_ANSWER_OPTIONS.target_sectors.slice(0, 4),
        target_company_types: ['CAC40 / SBF120 (grands comptes)'],
        staffing_model: 'Principalement CDI + quelques freelances ponctuels',
        geo_zones: ['Paris & Île-de-France'],
        entry_channels_used: ['Réseau personnel et anciens clients', 'Appels sortants'],
        individual_goal: 'Ouvrir de nouveaux comptes',
        weekly_sales_time_declared: '5 à 10 heures par semaine',
      }),
    ).toEqual([])
  })

  it('rend chaque tension trouvée avec ses clés, jamais un statut inventé', () => {
    const found = detectQuestionnaireContradictions({
      sales_team_size: 'Je suis seul (fondateur / indépendant)',
      target_sectors: ESN_ANSWER_OPTIONS.target_sectors.slice(0, 10),
    })
    expect(found).toEqual([{ id: 'small_team_many_sectors', keys: ['sales_team_size', 'target_sectors'] }])
  })

  it('empile plusieurs tensions distinctes sans en écraser une autre', () => {
    const found = detectQuestionnaireContradictions({
      sales_team_size: 'Je suis seul (fondateur / indépendant)',
      target_sectors: ESN_ANSWER_OPTIONS.target_sectors.slice(0, 10),
      staffing_model: 'Uniquement freelances (pas de CDI)',
      consultants_in_pipe: '0',
    })
    expect(found.map(c => c.id).sort()).toEqual(['freelance_only_no_bench', 'small_team_many_sectors'].sort())
  })
})
