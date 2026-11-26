import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createJSONStorage } from 'zustand/middleware'
import type { EsnAnswers, PrefilledField } from '@bellum/contracts'
import { useOnboardingStore } from '@/stores/onboardingStore'

/**
 * #2026.1 — le brouillon s'écrit dans un stockage qu'on peut RELIRE ici.
 *
 * jsdom casse par intermittence le `localStorage` que traverse `persist`
 * (`storage.setItem is not a function`, même contournement que
 * `analysisStore.test.ts`). Une table en mémoire donne en plus ce que le test a
 * besoin de prouver : ce qui est réellement ÉCRIT, pas seulement ce que le
 * store rend.
 */
const written = new Map<string, string>()

beforeAll(() => {
  useOnboardingStore.persist.setOptions({
    storage: createJSONStorage(() => ({
      getItem: key => written.get(key) ?? null,
      setItem: (key, value) => void written.set(key, value),
      removeItem: key => void written.delete(key),
    })),
  })
})

/**
 * The store is the only place where a PREFILLED (suggested) answer and a REAL
 * (user-given) answer are told apart. Getting that wrong ships a "Prérempli"
 * badge next to something the user typed themselves — so it is tested here
 * rather than through the UI.
 */

const store = () => useOnboardingStore.getState()

function emptyAnswers(overrides: Partial<EsnAnswers> = {}): EsnAnswers {
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
    remote_and_travel_scope: [],
    zone_capability_status: [],
    main_sales_pain: null,
    offer_domain: null,
    offer_domains: [],
    recruits_for_clients: null,
    // Lot 26 — champs additifs, non pertinents pour ce test.
    service_types: [],
    service_types_proven: [],
    service_types_desired: [],
    reference_sectors: [],
    case_study_results: [],
    reference_accounts: [],
    client_testimonials: [],
    expertise_no_concrete_proof: [],
    expertise_client_reference: [],
    expertise_personal_experience: [],
    expertise_partner: [],
    expertise_talent_pool: [],
    staffing_modes: [],
    profile_validation_methods: [],
    contractual_constraints: [],
    priority_sectors: [],
    // #2005.4 (DÉCISION Louis 17/09, lot CP2) — où l'ESN est implantée.
    company_locations: [],
    // #2088.12/.13 (DÉCISION Louis 18/09, point 16) — non pertinents pour ce test.
    consultant_count: null,
    annual_revenue_amount: null,
    annual_revenue_period: null,
    // #2640.2 — non pertinent pour ce test.
    esn_website: null,
    ...overrides,
  }
}

const FIELDS: Record<string, PrefilledField> = {
  esn_name: {
    value: 'Kicklox',
    confidence: 'high',
    source: 'registry',
    rationale: 'Raison sociale au registre',
    as_of: '2025-03-01',
  },
  consultant_size: {
    value: '10-30',
    confidence: 'medium',
    source: 'pappers',
    rationale: 'Tranche d’effectif INSEE',
    as_of: null,
  },
  geo_zones: { value: ['Paris & Île-de-France'], confidence: 'low', source: 'inference', as_of: null },
}

beforeEach(() => {
  store().reset()
})

describe('onboardingStore — prefill', () => {
  it('seeds answers and their provenance from a prefill response', () => {
    store().applyPrefill(FIELDS)

    expect(store().answers.esn_name).toBe('Kicklox')
    expect(store().answers.consultant_size).toBe('10-30')
    expect(store().answers.geo_zones).toEqual(['Paris & Île-de-France'])

    expect(store().prefillMeta.esn_name).toEqual({
      confidence: 'high',
      source: 'registry',
      rationale: 'Raison sociale au registre',
      asOf: '2025-03-01',
    })
    // A field without a rationale carries none — we never invent a citation.
    expect(store().prefillMeta.geo_zones).toEqual({ confidence: 'low', source: 'inference', asOf: null })
  })

  it('#2028.2 — porte `asOf` à `null` quand la source ne la fournit pas — jamais une date devinée', () => {
    store().applyPrefill(FIELDS)
    expect(store().prefillMeta.consultant_size?.asOf).toBeNull()
  })

  it('drops the provenance of a field as soon as the user edits it', () => {
    store().applyPrefill(FIELDS)
    expect(store().prefillMeta.consultant_size).toBeDefined()

    store().setAnswer('consultant_size', '30-80')

    expect(store().answers.consultant_size).toBe('30-80')
    expect(store().prefillMeta.consultant_size).toBeUndefined()
    // …and only that field's badge disappears.
    expect(store().prefillMeta.esn_name).toBeDefined()
  })

  it('ignores keys the contract refuses to prefill (sales_team_size, main_sales_pain)', () => {
    store().applyPrefill({
      ...FIELDS,
      sales_team_size: { value: '2-3 personnes', confidence: 'high', source: 'inference', as_of: null },
      main_sales_pain: {
        value: 'Trouver les bons comptes à cibler',
        confidence: 'high',
        source: 'inference',
        as_of: null,
      },
    })

    expect(store().answers.sales_team_size).toBeUndefined()
    expect(store().answers.main_sales_pain).toBeUndefined()
    expect(store().prefillMeta.sales_team_size).toBeUndefined()
    expect(store().prefillMeta.main_sales_pain).toBeUndefined()
  })

  it('never overwrites an answer the user already gave', () => {
    store().setAnswer('esn_name', 'Ma vraie ESN')
    store().applyPrefill(FIELDS)

    expect(store().answers.esn_name).toBe('Ma vraie ESN')
    expect(store().prefillMeta.esn_name).toBeUndefined()
    // Untouched fields are still seeded.
    expect(store().answers.consultant_size).toBe('10-30')
  })

  it('survives an empty prefill without touching anything', () => {
    store().applyPrefill({})
    expect(store().answers).toEqual({})
    expect(store().prefillMeta).toEqual({})
  })

  it('reset clears values AND provenance', () => {
    store().applyPrefill(FIELDS)
    store().reset()
    expect(store().answers).toEqual({})
    expect(store().prefillMeta).toEqual({})
  })
})

describe('onboardingStore — hydrate vs prefill', () => {
  it('keeps prefilled values and badges when the server sends an empty profile', () => {
    store().applyPrefill(FIELDS)
    store().hydrate(emptyAnswers())

    expect(store().answers.esn_name).toBe('Kicklox')
    expect(store().prefillMeta.esn_name).toBeDefined()
  })

  it('still fills the untouched keys from the server payload', () => {
    store().applyPrefill(FIELDS)
    store().hydrate(emptyAnswers({ sales_team_size: '4-8 personnes' }))

    expect(store().answers.sales_team_size).toBe('4-8 personnes')
    expect(store().prefillMeta.sales_team_size).toBeUndefined()
  })

  it('lets a stored server answer win over a later prefill (already-started onboarding)', () => {
    store().hydrate(emptyAnswers({ consultant_size: '200-500' }))
    store().applyPrefill(FIELDS)

    expect(store().answers.consultant_size).toBe('200-500')
    expect(store().prefillMeta.consultant_size).toBeUndefined()
  })

  it('keeps the historical behaviour: local edits win over the server base', () => {
    store().setAnswer('positioning', 'Régie pure - on place des profils sur demande')
    store().hydrate(emptyAnswers({ positioning: 'Généraliste - large spectre selon les besoins client' }))

    expect(store().answers.positioning).toBe('Régie pure - on place des profils sur demande')
  })
})

describe('#2026.1 — le brouillon survit à la fermeture de l’onglet', () => {
  beforeEach(() => {
    written.clear()
    store().reset()
  })

  it('une réponse saisie est ÉCRITE avant tout aller-retour serveur', async () => {
    store().setAnswer('esn_name', 'Abricot Labs')
    await useOnboardingStore.persist.rehydrate()

    const draft = written.get('bellum:onboarding-draft')
    expect(draft).toBeDefined()
    expect(JSON.parse(draft ?? '{}').state.answers.esn_name).toBe('Abricot Labs')
  })

  it('la provenance voyage AVEC la valeur — un badge orphelin mentirait sur l’origine', () => {
    store().applyPrefill({
      consultant_size: { value: '200-500', confidence: 'high', source: 'registry', rationale: 'greffe', as_of: null },
    })

    const draft = JSON.parse(written.get('bellum:onboarding-draft') ?? '{}')
    expect(draft.state.answers.consultant_size).toBe('200-500')
    expect(draft.state.prefillMeta.consultant_size.source).toBe('registry')
  })

  it('la déconnexion l’efface — sinon le questionnaire du suivant rejouerait les réponses du précédent', () => {
    store().setAnswer('esn_name', 'Abricot Labs')
    // Exactement ce qu'appelle `clearVolatileUserState` à la déconnexion.
    store().reset()

    expect(JSON.parse(written.get('bellum:onboarding-draft') ?? '{}').state.answers).toEqual({})
  })
})

describe('#2026.2 — l’horodatage de l’autosauvegarde', () => {
  beforeEach(() => {
    written.clear()
    store().reset()
  })

  it('est absent tant qu’aucune réponse n’a été saisie — pas d’heure inventée', () => {
    expect(store().lastSavedAt).toBeNull()
  })

  it('s’écrit à chaque réponse saisie, avec une date lisible', () => {
    store().setAnswer('esn_name', 'Abricot Labs')

    const saved = store().lastSavedAt
    expect(saved).not.toBeNull()
    expect(Number.isNaN(new Date(saved as string).getTime())).toBe(false)
  })

  it('avance quand une nouvelle réponse est saisie', () => {
    store().setAnswer('esn_name', 'Abricot Labs')
    const first = store().lastSavedAt
    store().setAnswer('positioning', 'Régie pure')
    expect(store().lastSavedAt).not.toBeNull()
    expect(new Date(store().lastSavedAt as string).getTime()).toBeGreaterThanOrEqual(
      new Date(first as string).getTime(),
    )
  })

  it('redevient null après une déconnexion (`reset`)', () => {
    store().setAnswer('esn_name', 'Abricot Labs')
    store().reset()
    expect(store().lastSavedAt).toBeNull()
  })

  it('survit à la fermeture de l’onglet — le brouillon écrit porte son heure', async () => {
    store().setAnswer('esn_name', 'Abricot Labs')
    await useOnboardingStore.persist.rehydrate()

    const draft = JSON.parse(written.get('bellum:onboarding-draft') ?? '{}')
    expect(draft.state.lastSavedAt).toBe(store().lastSavedAt)
  })
})

// Théo O onboarding-theme.N1 — le statut d'une réponse qui ne peut pas le porter dans sa valeur.
describe('statuses (Théo O onboarding-theme.N1)', () => {
  beforeEach(() => {
    useOnboardingStore.getState().reset()
    written.clear()
  })

  it('pose puis retire un statut, et reset() le vide avec le reste du brouillon', () => {
    const { setStatus } = useOnboardingStore.getState()
    setStatus('expertise_areas', 'answer_later')
    expect(useOnboardingStore.getState().statuses).toEqual({ expertise_areas: 'answer_later' })
    setStatus('expertise_areas', null)
    expect(useOnboardingStore.getState().statuses).toEqual({})
    setStatus('geo_zones', 'to_verify_with_team')
    useOnboardingStore.getState().reset()
    expect(useOnboardingStore.getState().statuses).toEqual({})
  })

  it('survit à la fermeture de l’onglet comme le reste du brouillon', () => {
    useOnboardingStore.getState().setStatus('geo_zones', 'not_applicable')
    const persisted = JSON.parse(written.get('bellum:onboarding-draft') ?? '{}') as {
      state?: { statuses?: Record<string, string> }
    }
    expect(persisted.state?.statuses).toEqual({ geo_zones: 'not_applicable' })
  })
})
