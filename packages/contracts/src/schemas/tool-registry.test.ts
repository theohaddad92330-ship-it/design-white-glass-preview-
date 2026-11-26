import { describe, expect, it } from 'vitest'

import {
  availableCapabilitiesFrom,
  connectedToolSchema,
  deriveInternalCapabilities,
  internalCapabilityDescriptorSchema,
  internalCapabilityValues,
  toolBetaSchema,
  toolFamilySchema,
  toolFamilyValues,
  toolLatencySchema,
  toolRegistrySchema,
  toolFamiliesOf,
  toolStatusSchema,
} from './tool-registry.js'

const ISO = '2026-07-16T10:00:00.000Z'

const CONNECTED_CRM = {
  provider: 'hubspot',
  family: 'crm',
  display_name: 'HubSpot',
  status: 'connected',
  scopes: ['crm.objects.contacts.read', 'crm.objects.contacts.write'],
  owner: 'workspace',
  last_sync: ISO,
  capability_state: 'operational',
  capabilities: [
    {
      key: 'read',
      state: 'operational',
      scope_required: ['crm.objects.contacts.read'],
      last_proof_at: ISO,
      last_proof_sample: 'Contacts — 240 fiches',
      last_error_code: null,
      last_error_at: null,
    },
  ],
  data_types: { reads: ['contacts', 'companies', 'deals'], writes: ['contacts', 'activity_notes'] },
  allowed_actions: ['export_contact', 'import_contacts', 'log_activity'],
  rate_limits: { fr: '100 req / 10 s', en: '100 req / 10 s' },
  cost_model: { fr: 'inclus', en: 'included' },
  memory_policy: { fr: 'non stocké', en: 'not stored' },
  coverage_period: null,
  latency: null,
  beta: null,
} as const

describe('tool-registry schemas', () => {
  it('accepts a fully populated connected tool', () => {
    const parsed = connectedToolSchema.parse(CONNECTED_CRM)
    expect(parsed.status).toBe('connected')
    expect(parsed.scopes).toHaveLength(2)
    expect(parsed.last_sync).toBe(ISO)
    expect(parsed.data_types.reads).toContain('deals')
    expect(parsed.data_types.writes).toContain('activity_notes')
    expect(parsed.cost_model?.en).toBe('included')
  })

  it('accepts a modeled-only tool with null last_sync and no optional envelope', () => {
    const parsed = connectedToolSchema.parse({
      provider: 'gmail',
      family: 'email',
      display_name: 'Gmail',
      status: 'coming_soon',
      scopes: [],
      owner: 'user',
      last_sync: null,
      capability_state: 'not_connected',
      capabilities: [],
      data_types: { reads: ['emails', 'threads'], writes: ['drafts'] },
      allowed_actions: ['read_emails', 'create_draft'],
      coverage_period: null,
      latency: null,
      beta: null,
    })
    expect(parsed.last_sync).toBeNull()
    expect(parsed.rate_limits).toBeUndefined()
  })

  it('rejects a half-localized meta text (FR+EN are both required)', () => {
    expect(connectedToolSchema.safeParse({ ...CONNECTED_CRM, cost_model: { fr: 'inclus' } }).success).toBe(false)
    expect(connectedToolSchema.safeParse({ ...CONNECTED_CRM, cost_model: 'inclus' }).success).toBe(false)
  })

  it('rejects flat data_types (reads/writes are both required)', () => {
    expect(connectedToolSchema.safeParse({ ...CONNECTED_CRM, data_types: ['contacts'] }).success).toBe(false)
    expect(connectedToolSchema.safeParse({ ...CONNECTED_CRM, data_types: { reads: ['contacts'] } }).success).toBe(false)
  })

  it('rejects an unknown family', () => {
    expect(toolFamilySchema.safeParse('telepathy').success).toBe(false)
  })

  it('rejects an unknown status', () => {
    expect(toolStatusSchema.safeParse('paused').success).toBe(false)
  })

  it('rejects an unknown owner scope', () => {
    expect(connectedToolSchema.safeParse({ ...CONNECTED_CRM, owner: 'planet' }).success).toBe(false)
  })

  it('rejects a non-ISO last_sync (never an invented free-text date)', () => {
    expect(connectedToolSchema.safeParse({ ...CONNECTED_CRM, last_sync: 'hier' }).success).toBe(false)
  })

  it('parses an array of tools as the registry response', () => {
    const parsed = toolRegistrySchema.parse([CONNECTED_CRM])
    expect(parsed).toHaveLength(1)
  })
})

// #2261.8 — la période couverte : ce que l'outil DÉCLARE, ou `null` (« inconnu »).
describe('#2261.8 — période couverte, jamais devinée', () => {
  it('accepte une période DÉCLARÉE, en FR+EN', () => {
    const parsed = connectedToolSchema.parse({
      ...CONNECTED_CRM,
      coverage_period: {
        fr: 'les 12 derniers mois (déclaré par HubSpot)',
        en: 'the last 12 months (declared by HubSpot)',
      },
    })
    expect(parsed.coverage_period?.fr).toContain('12')
  })

  it('accepte `null` — « inconnu » est une réponse honnête, jamais un champ absent', () => {
    const parsed = connectedToolSchema.parse({ ...CONNECTED_CRM, coverage_period: null })
    expect(parsed.coverage_period).toBeNull()
  })

  it('sait dire NON — une valeur devinée qui remplace « inconnu » sans les deux langues est refusée', () => {
    expect(
      connectedToolSchema.safeParse({ ...CONNECTED_CRM, coverage_period: { fr: 'probablement 12 mois' } }).success,
    ).toBe(false)
    expect(connectedToolSchema.safeParse({ ...CONNECTED_CRM, coverage_period: 'probablement 12 mois' }).success).toBe(
      false,
    )
  })

  it('le champ est REQUIS (pas `.optional()`) — une entrée qui l’omet est refusée, jamais silencieusement sautée', () => {
    const { coverage_period: _coverage_period, ...withoutCoveragePeriod } = CONNECTED_CRM
    expect(connectedToolSchema.safeParse(withoutCoveragePeriod).success).toBe(false)
  })
})

// #2261.13 — la latence déclarée, jamais estimée.
describe('#2261.13 — latence DÉCLARÉE ou MESURÉE, jamais estimée', () => {
  it('accepte une latence DÉCLARÉE par le fournisseur, datée', () => {
    const parsed = toolLatencySchema.parse({
      source: 'declared',
      value: { fr: '< 2 s (documentation HubSpot)', en: '< 2 s (HubSpot docs)' },
      as_of: ISO,
    })
    expect(parsed.source).toBe('declared')
  })

  it('accepte une latence MESURÉE par Bellum, datée', () => {
    const parsed = toolLatencySchema.parse({
      source: 'measured',
      value: { fr: '~3 s p95 sur les 100 derniers appels', en: '~3 s p95 over the last 100 calls' },
      as_of: ISO,
    })
    expect(parsed.source).toBe('measured')
  })

  it('sait dire NON — une latence sans date est refusée (on ne sait jamais QUAND elle a été observée)', () => {
    expect(toolLatencySchema.safeParse({ source: 'declared', value: { fr: 'rapide', en: 'fast' } }).success).toBe(false)
  })

  it('sait dire NON — une latence n’est jamais un texte nu ni une moyenne inventée sans source', () => {
    expect(connectedToolSchema.safeParse({ ...CONNECTED_CRM, latency: 'rapide' }).success).toBe(false)
    expect(
      toolLatencySchema.safeParse({ source: 'estimated', value: { fr: 'rapide', en: 'fast' }, as_of: ISO }).success,
    ).toBe(false)
  })

  it('`null` au niveau de l’outil — le concept ne s’applique pas (outil non connecté, ou hors du périmètre synchro)', () => {
    const parsed = connectedToolSchema.parse({ ...CONNECTED_CRM, latency: null })
    expect(parsed.latency).toBeNull()
  })

  // #2261.13 (décision Louis 19/09) — pour un outil CONNECTÉ dont le concept
  // s'applique, `null` muet ne suffit plus : soit une mesure réelle datée,
  // soit la raison écrite de son absence (GA-18/GA-19).
  it('accepte une mesure RÉELLE avec sa fenêtre et son échantillon', () => {
    const parsed = toolLatencySchema.parse({
      source: 'measured',
      value: { fr: '~12 min', en: '~12 min' },
      as_of: ISO,
      window_days: 7,
      sample_count: 42,
    })
    expect(parsed).toMatchObject({ source: 'measured', window_days: 7, sample_count: 42 })
  })

  it('accepte « non mesuré » avec sa raison — jamais silencieux, jamais 0', () => {
    const parsed = toolLatencySchema.parse({
      source: 'not_measured',
      reason: {
        fr: 'Pas assez de synchronisations réelles sur les 7 derniers jours.',
        en: 'Not enough real synchronizations in the last 7 days.',
      },
    })
    expect(parsed.source).toBe('not_measured')
  })

  it('sait dire NON — « non mesuré » sans raison FR+EN est refusé', () => {
    expect(toolLatencySchema.safeParse({ source: 'not_measured' }).success).toBe(false)
    expect(toolLatencySchema.safeParse({ source: 'not_measured', reason: { fr: 'seule la fr' } }).success).toBe(false)
  })
})

// #2261.16 — la bêta déclarée par le fournisseur, jamais déduite.
describe('#2261.16 — statut bêta déclaré, jamais déduit', () => {
  it('accepte une bêta déclarée, avec la fonctionnalité nommée', () => {
    const parsed = toolBetaSchema.parse({ beta: true, feature: { fr: 'export CSV', en: 'CSV export' } })
    expect(parsed.beta).toBe(true)
  })

  it('accepte une déclaration explicite de stabilité (pas de bêta annoncée)', () => {
    const parsed = toolBetaSchema.parse({ beta: false, feature: null })
    expect(parsed.beta).toBe(false)
  })

  it('sait dire NON — un booléen NU à la racine ne peut pas représenter « inconnu », donc il est refusé', () => {
    expect(connectedToolSchema.safeParse({ ...CONNECTED_CRM, beta: false }).success).toBe(false)
    expect(connectedToolSchema.safeParse({ ...CONNECTED_CRM, beta: true }).success).toBe(false)
  })

  it('`null` au niveau de l’outil — statut inconnu, jamais traité comme « stable »', () => {
    const parsed = connectedToolSchema.parse({ ...CONNECTED_CRM, beta: null })
    expect(parsed.beta).toBeNull()
  })
})

// #2261.30 — la famille « appels d'offres », distincte de `jobs` (offres d'emploi).
describe('#2261.30 — famille `tenders`, jamais confondue avec `jobs`', () => {
  it('`tenders` existe dans les familles et n’est pas `jobs`', () => {
    expect(toolFamilyValues).toContain('tenders')
    expect(toolFamilyValues).toContain('jobs')
    expect('tenders').not.toBe('jobs')
  })

  it('ajoutée EN FIN de l’énumération — GA-08 interdit d’insérer au milieu', () => {
    expect(toolFamilyValues[toolFamilyValues.length - 1]).toBe('tenders')
  })
})

describe('availableCapabilitiesFrom — ce qu’un workflow a le droit de tenter', () => {
  const tool = (family: string, status: string) =>
    ({ ...CONNECTED_CRM, family, status }) as unknown as Parameters<typeof availableCapabilitiesFrom>[0][number]

  it('la notification in-app est toujours disponible — Bellum la sert lui-même', () => {
    expect([...availableCapabilitiesFrom([])]).toEqual(['notifications'])
  })

  it('un outil branché rend sa famille disponible', () => {
    const caps = availableCapabilitiesFrom([tool('crm', 'connected'), tool('email', 'connected')])
    expect(caps.has('crm')).toBe(true)
    expect(caps.has('email')).toBe(true)
    expect(caps.has('calendar')).toBe(false)
  })

  it('#3973 — un outil multi-familles rend CHACUNE de ses familles disponible', () => {
    const microsoft = { ...tool('email', 'connected'), additional_families: ['calendar'] } as Parameters<
      typeof availableCapabilitiesFrom
    >[0][number]
    const caps = availableCapabilitiesFrom([microsoft])
    expect(caps.has('email')).toBe(true)
    expect(caps.has('calendar')).toBe(true)
  })

  it('« branché mais cassé » ne compte pas comme disponible', () => {
    // Un jeton périmé fait refuser le connecteur. Compter la capacité ferait
    // partir un pas vers un refus certain — la fausse promesse que le contrat
    // d'erreur de connecteur combat.
    expect(availableCapabilitiesFrom([tool('crm', 'action_required')]).has('crm')).toBe(false)
    expect(availableCapabilitiesFrom([tool('crm', 'available')]).has('crm')).toBe(false)
    expect(availableCapabilitiesFrom([tool('crm', 'coming_soon')]).has('crm')).toBe(false)
  })

  it('couvre les capacités que le catalogue de workflows exige', () => {
    // `crm`, `email`, `calendar`, `prospection` sont des familles d'outils ;
    // `notifications` n'en est pas une, et c'est le seul cas particulier.
    const caps = availableCapabilitiesFrom([
      tool('crm', 'connected'),
      tool('email', 'connected'),
      tool('calendar', 'connected'),
      tool('prospection', 'connected'),
    ])
    for (const needed of ['crm', 'email', 'calendar', 'prospection', 'notifications']) {
      expect(caps.has(needed)).toBe(true)
    }
  })
})

// #2261.21-32 — le manifeste ne couvrait que les outils TIERS (`toolFamilyValues`).
// Laura ne pouvait donc jamais dire d'elle-même si le vivier ou les routines
// sont utilisables MAINTENANT : ces huit familles sont les fonctions natives du
// produit, pas des connecteurs à autoriser.
describe('capacités internes (#2261)', () => {
  it('déclare les neuf familles internes minimales du chapitre', () => {
    for (const key of [
      'accounts',
      'contacts',
      'needs',
      'talent_pool',
      'missions',
      'market_memory',
      'dataforge',
      'invoicing',
      'routines',
    ]) {
      expect(internalCapabilityValues).toContain(key)
    }
    expect(internalCapabilityValues).toHaveLength(9)
  })

  it('une capacité interne disponible ne porte ni raison ni booléen nu', () => {
    const [descriptor] = deriveInternalCapabilities({ routinesCut: false })
    const parsed = internalCapabilityDescriptorSchema.parse(descriptor)
    expect(parsed.available).toBe(true)
    expect(parsed.unavailable_reason).toBeNull()
  })

  it('les routines coupées par le kill-switch opérateur sortent indisponibles, avec leur raison', () => {
    const descriptors = deriveInternalCapabilities({ routinesCut: true })
    const routines = descriptors.find(d => d.key === 'routines')
    expect(routines?.available).toBe(false)
    expect(routines?.unavailable_reason?.fr.length).toBeGreaterThan(0)
    expect(routines?.unavailable_reason?.en.length).toBeGreaterThan(0)
  })

  it('routines actives : disponible, comme les huit autres familles', () => {
    const descriptors = deriveInternalCapabilities({ routinesCut: false })
    expect(descriptors).toHaveLength(9)
    for (const d of descriptors) {
      expect(d.available).toBe(true)
      expect(d.unavailable_reason).toBeNull()
    }
  })
})

describe('#3973 — un outil peut servir plusieurs familles', () => {
  it('toolFamiliesOf rend la famille principale puis les autres, sans doublon', () => {
    expect(toolFamiliesOf({ family: 'email', additional_families: ['calendar'] })).toEqual(['email', 'calendar'])
    expect(toolFamiliesOf({ family: 'email', additional_families: ['email'] })).toEqual(['email'])
    expect(toolFamiliesOf({ family: 'crm' })).toEqual(['crm'])
  })

  it('le contrat accepte `additional_families` (optionnel) et refuse une famille inconnue', () => {
    expect(connectedToolSchema.safeParse({ ...CONNECTED_CRM, additional_families: ['calendar'] }).success).toBe(true)
    expect(connectedToolSchema.safeParse(CONNECTED_CRM).success).toBe(true)
    expect(connectedToolSchema.safeParse({ ...CONNECTED_CRM, additional_families: ['agenda'] }).success).toBe(false)
  })
})
