import { describe, expect, it } from 'vitest'
import { esnAnswersSchema, isPersonalAnswerKey, type EsnAnswers } from '../onboarding.js'
import { V23_NEW_KEYS } from '../onboarding-v23-catalog.js'
import { placesProfilesForClients } from './answers-recrutement.js'

/** Les 27 clés dont la V23 retire le plafond de sélection (« choix multiples conservés sans troncature »). */
const UNCAPPED_KEYS = [
  'entry_channels_last_starts',
  'entry_channels_time_split',
  'go_to_market_channels',
  'decision_maker_personas',
  'rfp_outcomes',
  'rfp_platforms_used',
  'sales_blockers',
  'sales_freins',
  'expertise_areas',
  'company_locations',
  'tooling',
  'tooling_reference_data',
  'contact_windows',
  'shared_data_scope',
  'case_study_results',
  'client_references',
  'client_testimonials',
  'reference_accounts',
  'role_functions_practiced',
  'sales_routine',
  'growth_target_zones',
  'reference_sectors',
  'target_sectors',
  'content_active_profile',
  'content_funnel_stages_reached',
  'content_visible_expertise',
  'no_go_sectors',
] as const

const shape = esnAnswersSchema.shape as unknown as Record<
  string,
  { safeParse: (v: unknown) => { success: boolean; data?: unknown } }
>
const forty = Array.from({ length: 40 }, (_, i) => `Choix ${i + 1}`)

describe('V23 — plafond de sélection retiré (rien n’est tronqué en silence)', () => {
  it('compte 27 clés concernées', () => {
    expect(UNCAPPED_KEYS).toHaveLength(27)
  })

  for (const key of UNCAPPED_KEYS) {
    it(`${key} garde 40 choix sans troncature ni rejet`, () => {
      const parsed = shape[key]?.safeParse(forty)
      expect(parsed?.success, `${key} rejette 40 choix`).toBe(true)
      expect((parsed?.data as unknown[]).length, `${key} tronque`).toBe(40)
    })
  }
})

describe('V23 — les 26 clés neuves sont facultatives et tolérantes', () => {
  it('une charge utile qui les omet reste valide', () => {
    for (const key of V23_NEW_KEYS) expect(shape[key]?.safeParse(undefined).success, key).toBe(true)
  })

  it('une valeur illisible dégrade en null / [] au lieu de casser le profil', () => {
    for (const key of V23_NEW_KEYS) {
      const parsed = shape[key]?.safeParse(12345)
      expect(parsed?.success, key).toBe(true)
      expect(parsed?.data === null || (Array.isArray(parsed?.data) && parsed.data.length === 0), key).toBe(true)
    }
  })
})

describe('V23 — recruits_for_clients : trois valeurs de plus, la lecture reste en un seul endroit', () => {
  it('accepte les cinq valeurs machine et dégrade le reste en null', () => {
    const field = shape.recruits_for_clients
    for (const value of ['yes', 'no', 'sometimes', 'services_only', 'to_develop']) {
      expect(field?.safeParse(value).data, value).toBe(value)
    }
    expect(field?.safeParse('peut-être').data).toBeNull()
  })

  it('ne place des profils chez les clients que pour « oui » et « ponctuellement »', () => {
    expect(placesProfilesForClients('yes')).toBe(true)
    expect(placesProfilesForClients('sometimes')).toBe(true)
    for (const value of ['no', 'services_only', 'to_develop', null, undefined]) {
      expect(placesProfilesForClients(value), String(value)).toBe(false)
    }
  })
})

describe('V23 — la couche de chaque clé neuve (personne ou entreprise) est écrite, pas laissée au défaut', () => {
  // Une réponse PERSONNELLE rangée côté entreprise s'écrit dans le canonique de l'espace et y écrase ce que d'autres membres
  // ont déclaré — le piège de #735. On nomme donc celles qui décrivent LA PERSONNE ; le reste décrit l'entreprise.
  const PERSONAL = [
    'first_name',
    'scope_level',
    'scope_unit',
    'autonomy',
    'context_policy',
    'horizon',
    'success_target',
    'workflow_pain',
    'tools',
    'account_access',
    'priority_expertise',
    'delivery_frictions',
  ]

  it('range dans la couche PERSONNE les douze clés qui décrivent la personne', () => {
    for (const key of PERSONAL) expect(isPersonalAnswerKey(key as keyof EsnAnswers), key).toBe(true)
  })

  it('laisse côté ENTREPRISE les quatorze autres', () => {
    for (const key of V23_NEW_KEYS.filter(k => !PERSONAL.includes(k))) {
      expect(isPersonalAnswerKey(key as keyof EsnAnswers), key).toBe(false)
    }
  })
})
