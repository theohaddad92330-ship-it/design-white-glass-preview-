import { describe, expect, it } from 'vitest'

import {
  ESN_COMPANY_ANSWER_KEYS,
  TEMPS1_REQUIRED_KEYS,
  inheritedAnswerKeys,
  isAnswerPendingForMember,
  mergeWorkspaceAnswers,
  onboardingStateResponseSchema,
  type EsnAnswers,
} from './onboarding.js'

/**
 * #1671-ter — l'associé qui rejoint une ESN ne repose que SA question.
 *
 * `mergeWorkspaceAnswers` fait déjà retomber une clé PERSONNELLE sur la valeur
 * canonique quand le membre n'a pas répondu. C'est juste pour NOURRIR un prompt
 * (mieux vaut le frein commercial de l'associé que rien), et faux pour DÉCIDER
 * quoi demander : sans distinction, le second associé hérite du frein de son
 * collègue et on ne lui pose plus jamais la seule question qui soit la sienne.
 *
 * D'où ces deux fonctions, et la règle qu'elles portent :
 *   · une question d'ENTREPRISE remplie — même héritée — ne se repose pas ;
 *   · une question PERSONNELLE héritée se repose, parce qu'elle n'est pas
 *     encore la sienne.
 */

const CANONICAL: EsnAnswers = {
  esn_name: 'Apricot Labs',
  consultant_size: '10-30',
  sales_team_size: '1-3 personnes',
  expertise_areas: ['Data & Intelligence Artificielle'],
  positioning: 'Expertise de niche',
  target_sectors: ['Banque de détail & Banque privée'],
  target_company_types: ['ETI (500-5 000 salariés)'],
  staffing_model: 'Uniquement des CDI internes',
  geo_zones: ['Paris & Île-de-France'],
  main_sales_pain: 'Trouver les bons comptes à cibler',
}

const EMPTY: EsnAnswers = {
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
}

describe('inheritedAnswerKeys', () => {
  it('nomme toute clé dont la valeur vient de la fiche ESN et pas du membre', () => {
    const inherited = inheritedAnswerKeys(CANONICAL, EMPTY)

    // Les neuf clés d'entreprise du premier temps, plus le frein commercial qui
    // retombe sur le canonique faute de réponse personnelle.
    for (const key of ESN_COMPANY_ANSWER_KEYS) expect(inherited).toContain(key)
    expect(inherited).toContain('main_sales_pain')
  })

  it('cesse de nommer une clé personnelle dès que le membre a répondu', () => {
    const personal: EsnAnswers = { ...EMPTY, main_sales_pain: 'Convertir mes RDV en signatures' }

    expect(inheritedAnswerKeys(CANONICAL, personal)).not.toContain('main_sales_pain')
  })

  it('ne nomme pas une clé que la fiche ESN ne porte pas non plus', () => {
    // Le contrôle négatif : hériter du VIDE n'est pas hériter.
    expect(inheritedAnswerKeys(EMPTY, EMPTY)).toEqual([])
  })

  it("ne connaît QUE des valeurs — l'identité se tranche chez l'appelant", () => {
    // Prémisse à ne pas se donner : cette fonction ne peut pas savoir que la
    // ligne canonique est celle du membre lui-même (espace mono-utilisateur).
    // Avec les mêmes valeurs des deux côtés, elle nomme les clés d'entreprise,
    // et c'est CORRECT au sens de sa signature.
    expect(inheritedAnswerKeys(CANONICAL, CANONICAL)).toEqual([...ESN_COMPANY_ANSWER_KEYS])

    // Le cas mono-utilisateur est court-circuité UN cran plus haut, là où
    // l'identité existe — `EsnProfileWorkspaceResolver.mergeFromContext` rend
    // les réponses propres du membre dès que `canonicalRow.user_id === userId`,
    // et le résolveur ne nomme alors aucune clé héritée. Le test qui le prouve
    // vit dans `esn-profile-workspace.resolver.spec.ts`.
  })
})

describe('isAnswerPendingForMember', () => {
  const merged = mergeWorkspaceAnswers(CANONICAL, EMPTY)
  const inherited = inheritedAnswerKeys(CANONICAL, EMPTY)

  it('ne repose AUCUNE des questions sur l’ESN', () => {
    for (const key of ESN_COMPANY_ANSWER_KEYS) {
      expect(isAnswerPendingForMember(key, merged, inherited)).toBe(false)
    }
  })

  it('repose la seule question qui soit la sienne', () => {
    // C'est tout le lot : douze questions deviennent une.
    expect(isAnswerPendingForMember('main_sales_pain', merged, inherited)).toBe(true)

    const pending = TEMPS1_REQUIRED_KEYS.filter(key => isAnswerPendingForMember(key, merged, inherited))
    expect(pending).toEqual(['main_sales_pain'])
  })

  it('cesse de la reposer une fois qu’il y a répondu', () => {
    const own: EsnAnswers = { ...EMPTY, main_sales_pain: 'Convertir mes RDV en signatures' }
    const mergedAfter = mergeWorkspaceAnswers(CANONICAL, own)
    const inheritedAfter = inheritedAnswerKeys(CANONICAL, own)

    expect(isAnswerPendingForMember('main_sales_pain', mergedAfter, inheritedAfter)).toBe(false)
  })

  it('pose toujours une question d’entreprise que la fiche ESN ne porte pas', () => {
    const partial: EsnAnswers = { ...CANONICAL, positioning: null }
    const mergedPartial = mergeWorkspaceAnswers(partial, EMPTY)

    expect(isAnswerPendingForMember('positioning', mergedPartial, inheritedAnswerKeys(partial, EMPTY))).toBe(true)
  })

  it('LE CONTRÔLE NÉGATIF — sans rien d’hérité, le comportement est celui d’avant', () => {
    // L'utilisateur seul dans son espace : aucune clé héritée, donc « en
    // attente » vaut exactement « pas remplie », à l'octet près.
    for (const key of TEMPS1_REQUIRED_KEYS) {
      expect(isAnswerPendingForMember(key, EMPTY, [])).toBe(true)
      expect(isAnswerPendingForMember(key, CANONICAL, [])).toBe(false)
    }
  })

  // #2022.4 — décision Louis 15/09 : ne JAMAIS redemander une réponse jugée
  // « obsolète » ou « contradictoire » — seules les réponses ABSENTES se
  // reposent. Une réponse remplie il y a longtemps, ou qui semble contredire
  // une réponse plus récente, n'est PAS pending : rien dans `esn_profiles` ni
  // dans la réponse d'état ne porte de date par réponse pour en décider
  // autrement, et en deviner une reposerait des questions au hasard.
  it('#2022.4 — une réponse remplie ne se repose JAMAIS, même si elle semble périmée ou contradictoire', () => {
    const looksStale: EsnAnswers = {
      ...CANONICAL,
      // Une réponse qui « paraît » ne plus coller au reste du profil : rien
      // ne distingue ce cas d'une réponse fraîche, faute de date par réponse.
      positioning: 'Généraliste multi-secteurs',
      target_sectors: ['Banque'],
    }
    const merged = mergeWorkspaceAnswers(looksStale, EMPTY)
    const inherited = inheritedAnswerKeys(looksStale, EMPTY)

    expect(isAnswerPendingForMember('positioning', merged, inherited)).toBe(false)
    expect(isAnswerPendingForMember('target_sectors', merged, inherited)).toBe(false)
  })
})

describe('onboardingStateResponseSchema — la clé neuve ne casse aucun client', () => {
  const base = {
    id: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
    status: 'in_progress',
    current_stage_code: 'company_info',
    stages: [],
    answers: EMPTY,
    skipped_at: null,
  }

  it('une réponse d’API ANCIENNE (clé absente) reste valide et rend une liste vide', () => {
    // Le front neuf sur l'API ancienne : la fenêtre de déploiement où le web est
    // déjà à jour et l'API pas encore. Sans ce défaut, l'écran d'onboarding
    // planterait pendant plusieurs minutes à chaque livraison.
    const parsed = onboardingStateResponseSchema.parse(base)
    expect(parsed.inherited_answer_keys).toEqual([])
  })

  it('une valeur illisible dégrade en liste vide plutôt qu’en échec de parsing', () => {
    const parsed = onboardingStateResponseSchema.parse({ ...base, inherited_answer_keys: 'oui' })
    expect(parsed.inherited_answer_keys).toEqual([])
  })

  it('porte les clés héritées quand l’API les envoie', () => {
    const parsed = onboardingStateResponseSchema.parse({ ...base, inherited_answer_keys: ['esn_name'] })
    expect(parsed.inherited_answer_keys).toEqual(['esn_name'])
  })
})
