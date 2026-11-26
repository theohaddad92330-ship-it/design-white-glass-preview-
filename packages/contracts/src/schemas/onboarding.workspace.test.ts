import { describe, expect, it } from 'vitest'

import {
  ESN_COMPANY_ANSWER_KEYS,
  ESN_PERSONAL_ANSWER_KEYS,
  TEMPS1_REQUIRED_KEYS,
  TEMPS2_ANSWER_KEYS,
  esnProfileWorkspaceMetaSchema,
  isPersonalAnswerKey,
  mergeWorkspaceAnswers,
  splitAnswersByScope,
  type EsnAnswers,
} from './onboarding.js'

const CANONICAL: EsnAnswers = {
  esn_name: 'Acme ESN',
  consultant_size: '30-80',
  sales_team_size: '4-8 personnes',
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

describe('ESN answer key scopes', () => {
  it('company + personal keys partition the Temps-1 keys exactly', () => {
    // The Temps-2 complement is personal too, so restrict the partition check to
    // the Temps-1 keys it is about.
    const personalTemps1 = ESN_PERSONAL_ANSWER_KEYS.filter(key =>
      (TEMPS1_REQUIRED_KEYS as readonly string[]).includes(key),
    )
    const all = [...ESN_COMPANY_ANSWER_KEYS, ...personalTemps1].sort()
    expect(all).toEqual([...TEMPS1_REQUIRED_KEYS].sort())
  })

  it('main_sales_pain is the personal overlay; company fields are not', () => {
    expect(isPersonalAnswerKey('main_sales_pain')).toBe(true)
    expect(isPersonalAnswerKey('esn_name')).toBe(false)
    expect(isPersonalAnswerKey('geo_zones')).toBe(false)
  })

  // #2052 — un objectif se déclare par vendeur : sans ce classement, une fois
  // un profil canonique d'espace posé, l'objectif d'un membre disparaîtrait
  // en silence derrière celui — ou l'absence — du canonique (piège #735).
  it('keeps the named objectives (esn_objectives) in the personal overlay', () => {
    expect(isPersonalAnswerKey('esn_objectives')).toBe(true)
  })

  // #2018.5 — les outils qu'UNE personne déclare (profil progressif) ne sont
  // pas ceux de son associé, exactement comme `sales_routine`/`sales_blockers`
  // juste à côté dans `PROFILE_PERSONAL_ANSWER_KEYS`. Rangé côté entreprise,
  // la réponse d'un membre s'écrivait dans le canonique de l'espace et
  // écrasait ce que les autres membres avaient déclaré.
  it('keeps tooling (profil progressif) in the personal overlay, not the company canonical', () => {
    expect(isPersonalAnswerKey('tooling')).toBe(true)
  })

  it('keeps three of the five Temps-2 keys in the personal overlay', () => {
    // A member answers it from their own dashboard: routed to the company
    // bucket, their answers would be dropped once a canonical profile exists.
    //
    // #2005.4 (DÉCISION Louis 17/09, lot CP2) — `client_references` and
    // `no_go_sectors` are the TWO named exceptions: a client reference or a
    // refused sector describes the ESN, not whichever member answered first,
    // so they moved to the company bucket (see `layered-profile.ts`,
    // `COMPANY_LAYER_ANSWER_KEYS`, and the idempotent data migration).
    const COMPANY_SINCE_20260917 = new Set(['client_references', 'no_go_sectors'])
    for (const key of TEMPS2_ANSWER_KEYS) {
      const expected = !COMPANY_SINCE_20260917.has(key)
      expect(isPersonalAnswerKey(key), `${key} personal-ness`).toBe(expected)
    }
  })

  it('lets a member override the team default without touching the canonical', () => {
    const canonical: EsnAnswers = { ...EMPTY, avg_tjm: '400-550', decision_maker_personas: ['DSI'] }
    const personal: EsnAnswers = { ...EMPTY, avg_tjm: '700-900' }
    const merged = mergeWorkspaceAnswers(canonical, personal)

    expect(merged.avg_tjm).toBe('700-900')
    // Unanswered by the member → the canonical (the owner's) value stands.
    expect(merged.decision_maker_personas).toEqual(['DSI'])
  })
})

describe('mergeWorkspaceAnswers', () => {
  it('company fields ALWAYS come from the canonical profile', () => {
    const personal: EsnAnswers = {
      ...EMPTY,
      esn_name: 'Shadow ESN',
      expertise_areas: ['Cybersécurité & Conformité'],
      main_sales_pain: null,
    }
    const merged = mergeWorkspaceAnswers(CANONICAL, personal)
    expect(merged.esn_name).toBe('Acme ESN')
    expect(merged.expertise_areas).toEqual(['Data & Intelligence Artificielle'])
  })

  it("the member's answered personal field wins over the canonical's", () => {
    const personal: EsnAnswers = { ...EMPTY, main_sales_pain: 'Convertir mes RDV en signatures' }
    const merged = mergeWorkspaceAnswers(CANONICAL, personal)
    expect(merged.main_sales_pain).toBe('Convertir mes RDV en signatures')
  })

  it("an unanswered personal field falls back to the canonical's value", () => {
    const merged = mergeWorkspaceAnswers(CANONICAL, EMPTY)
    expect(merged).toEqual(CANONICAL)
  })

  it('a blank (whitespace) personal answer does not override', () => {
    const personal: EsnAnswers = { ...EMPTY, main_sales_pain: '   ' }
    expect(mergeWorkspaceAnswers(CANONICAL, personal).main_sales_pain).toBe('Trouver les bons comptes à cibler')
  })

  // #2052 — même garde que `main_sales_pain` juste au-dessus, pour le tableau
  // d'objets plutôt qu'une chaîne : `isAnswerFilled` doit reconnaître un
  // tableau non vide sans caster.
  it("the member's declared objectives win over the canonical's", () => {
    const objective = {
      kind: 'meetings' as const,
      value: 10,
      unit: 'rendez-vous',
      period: 'monthly' as const,
      horizon: null,
      commitmentLevel: 'objective' as const,
      source: 'human' as const,
      observedAt: '2026-09-16T00:00:00.000Z',
      note: null,
    }
    const personal: EsnAnswers = { ...EMPTY, esn_objectives: [objective] }
    const merged = mergeWorkspaceAnswers(CANONICAL, personal)
    expect(merged.esn_objectives).toEqual([objective])
  })

  it('is pure — neither input is mutated', () => {
    const personal: EsnAnswers = { ...EMPTY, main_sales_pain: 'X' }
    const canonicalCopy = { ...CANONICAL }
    const personalCopy = { ...personal }
    mergeWorkspaceAnswers(CANONICAL, personal)
    expect(CANONICAL).toEqual(canonicalCopy)
    expect(personal).toEqual(personalCopy)
  })
})

describe('splitAnswersByScope', () => {
  it('routes company and personal keys to their halves', () => {
    const { company, personal } = splitAnswersByScope({
      esn_name: 'Acme',
      geo_zones: ['Paris & Île-de-France'],
      main_sales_pain: 'Fidéliser mes comptes existants',
    })
    expect(company).toEqual({ esn_name: 'Acme', geo_zones: ['Paris & Île-de-France'] })
    expect(personal).toEqual({ main_sales_pain: 'Fidéliser mes comptes existants' })
  })

  it('keys absent from the partial stay absent from both halves', () => {
    const { company, personal } = splitAnswersByScope({ consultant_size: '1-10' })
    expect(company).toEqual({ consultant_size: '1-10' })
    expect(personal).toEqual({})
  })

  it('null answers are kept (an explicit reset is a write, not an omission)', () => {
    const { company, personal } = splitAnswersByScope({ esn_name: null, main_sales_pain: null })
    expect(company).toEqual({ esn_name: null })
    expect(personal).toEqual({ main_sales_pain: null })
  })
})

describe('esnProfileWorkspaceMetaSchema', () => {
  it('accepts the shared/canEditCompany/role shape', () => {
    expect(esnProfileWorkspaceMetaSchema.parse({ shared: true, canEditCompany: false, role: 'member' })).toEqual({
      shared: true,
      canEditCompany: false,
      role: 'member',
    })
  })

  it('role is nullable (no workspace resolved)', () => {
    expect(esnProfileWorkspaceMetaSchema.parse({ shared: false, canEditCompany: true, role: null }).role).toBeNull()
  })

  it('rejects an unknown role', () => {
    expect(() => esnProfileWorkspaceMetaSchema.parse({ shared: true, canEditCompany: true, role: 'boss' })).toThrow()
  })
})
