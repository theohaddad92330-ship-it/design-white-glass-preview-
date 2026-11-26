import { describe, expect, it } from 'vitest'
import {
  BOTTLENECK_FAMILIES,
  deriveWeakestLinkDiagnosis,
  explainDiagnosisChange,
  shouldReevaluateDiagnosis,
  weakestLinkDiagnosisSchema,
  type WeakestLinkAccountSignal,
} from './weakest-link-diagnosis.js'

function account(overrides: Partial<WeakestLinkAccountSignal> = {}): WeakestLinkAccountSignal {
  return {
    account_id: overrides.account_id ?? 'acc-1',
    name: overrides.name ?? 'Compte',
    is_open: overrides.is_open ?? true,
    has_next_action: overrides.has_next_action ?? true,
    has_identified_sponsor: overrides.has_identified_sponsor ?? true,
  }
}

describe('deriveWeakestLinkDiagnosis', () => {
  it('sélectionne « absence de suivi » quand la majorité des comptes ouverts n’ont ni prochaine action ni sponsor (l’exemple du ticket)', () => {
    const accounts: WeakestLinkAccountSignal[] = [
      ...Array.from({ length: 7 }, (_, i) =>
        account({ account_id: `acc-${i}`, has_next_action: false, has_identified_sponsor: false }),
      ),
      account({ account_id: 'acc-7' }),
      account({ account_id: 'acc-8' }),
    ]

    const diagnosis = deriveWeakestLinkDiagnosis({ accounts, pipeline: null, bench: null, commercialCapacity: null })

    expect(diagnosis.primary_bottleneck).not.toBeNull()
    expect(diagnosis.primary_bottleneck?.family).toBe('absence_de_suivi_ou_de_prochaine_action')
    expect(diagnosis.primary_bottleneck?.supporting_evidence.length).toBeGreaterThan(0)
    // Neuf comptes actifs, sept sans prochaine action ni sponsor — repris de l'exemple du ticket.
    expect(diagnosis.primary_bottleneck?.business_impact).toMatch(/7/)
    // NO-GO du ticket : Bellum ne demande jamais de tout résoudre en même temps.
    expect(diagnosis.primary_bottleneck?.actions_to_stop.length).toBeGreaterThan(0)
    expect(diagnosis.primary_bottleneck?.actions_to_stop[0]).toMatch(/nouvelle recherche|nouveau compte/i)
  })

  it('ne fabrique jamais de diagnostic sans donnée : familles sans signal sortent du dénominateur, jamais un 0', () => {
    const diagnosis = deriveWeakestLinkDiagnosis({
      accounts: [],
      pipeline: null,
      bench: null,
      commercialCapacity: null,
    })

    expect(diagnosis.primary_bottleneck).toBeNull()
    expect(diagnosis.not_evaluable_families.length).toBeGreaterThan(0)
    expect(diagnosis.not_evaluable_families.every(entry => entry.reason.length > 0)).toBe(true)
    expect(diagnosis.confidence).toBe('low')
  })

  it('ne mentionne jamais de probabilité ou de pourcentage de chance', () => {
    const diagnosis = deriveWeakestLinkDiagnosis({
      accounts: [account({ has_next_action: false, has_identified_sponsor: false })],
      pipeline: { qualified_count: 0, total_count: 4 },
      bench: null,
      commercialCapacity: null,
    })

    const serialized = JSON.stringify(diagnosis)
    expect(serialized.toLowerCase()).not.toMatch(/probabilit|% de chance|closing_probability/)
  })

  it('signale un pipeline non qualifié quand aucun compte n’a de suivi manquant mais que le pipeline est vide', () => {
    const diagnosis = deriveWeakestLinkDiagnosis({
      accounts: [account(), account({ account_id: 'acc-2' })],
      pipeline: { qualified_count: 0, total_count: 5 },
      bench: null,
      commercialCapacity: null,
    })

    expect(diagnosis.primary_bottleneck?.family).toBe('pas_de_pipeline_qualifie')
  })

  it('valide le schéma sur un diagnostic dérivé', () => {
    const diagnosis = deriveWeakestLinkDiagnosis({
      accounts: [account({ has_next_action: false, has_identified_sponsor: false })],
      pipeline: null,
      bench: null,
      commercialCapacity: null,
    })
    expect(() => weakestLinkDiagnosisSchema.parse(diagnosis)).not.toThrow()
  })

  it('porte les 16 familles nommées par le ticket BEL-SC-224', () => {
    expect(BOTTLENECK_FAMILIES).toHaveLength(16)
    expect(BOTTLENECK_FAMILIES).toContain('absence_de_suivi_ou_de_prochaine_action')
    expect(BOTTLENECK_FAMILIES).toContain('dependance_a_une_seule_personne')
  })
})

describe('contradictory_evidence — #3253.b, confrontation avant retenue', () => {
  it('nomme la part de comptes ouverts qui ONT bien un suivi, quand une partie du portefeuille suit la règle', () => {
    const accounts: WeakestLinkAccountSignal[] = [
      ...Array.from({ length: 3 }, (_, i) =>
        account({ account_id: `unworked-${i}`, has_next_action: false, has_identified_sponsor: false }),
      ),
      account({ account_id: 'worked-1' }),
      account({ account_id: 'worked-2' }),
    ]
    const diagnosis = deriveWeakestLinkDiagnosis({ accounts, pipeline: null, bench: null, commercialCapacity: null })

    expect(diagnosis.primary_bottleneck?.family).toBe('absence_de_suivi_ou_de_prochaine_action')
    expect(diagnosis.primary_bottleneck?.contradictory_evidence.length).toBeGreaterThan(0)
    expect(diagnosis.primary_bottleneck?.contradictory_evidence[0]).toMatch(/2/)
  })

  it('laisse contradictory_evidence vide quand AUCUN compte ouvert n’a de suivi — rien à confronter', () => {
    const accounts: WeakestLinkAccountSignal[] = Array.from({ length: 4 }, (_, i) =>
      account({ account_id: `unworked-${i}`, has_next_action: false, has_identified_sponsor: false }),
    )
    const diagnosis = deriveWeakestLinkDiagnosis({ accounts, pipeline: null, bench: null, commercialCapacity: null })

    expect(diagnosis.primary_bottleneck?.family).toBe('absence_de_suivi_ou_de_prochaine_action')
    expect(diagnosis.primary_bottleneck?.contradictory_evidence).toEqual([])
  })

  it('nomme les talents encore disponibles quand le vivier est insuffisant mais pas totalement vide', () => {
    const diagnosis = deriveWeakestLinkDiagnosis({
      accounts: [],
      pipeline: null,
      bench: { available_count: 2, total_count: 30 },
      commercialCapacity: null,
    })

    expect(diagnosis.primary_bottleneck?.family).toBe('vivier_insuffisant')
    expect(diagnosis.primary_bottleneck?.contradictory_evidence.length).toBeGreaterThan(0)
    expect(diagnosis.primary_bottleneck?.contradictory_evidence[0]).toMatch(/2/)
  })

  it('laisse contradictory_evidence vide quand le vivier disponible est réellement à zéro', () => {
    const diagnosis = deriveWeakestLinkDiagnosis({
      accounts: [],
      pipeline: null,
      bench: { available_count: 0, total_count: 30 },
      commercialCapacity: null,
    })

    expect(diagnosis.primary_bottleneck?.family).toBe('vivier_insuffisant')
    expect(diagnosis.primary_bottleneck?.contradictory_evidence).toEqual([])
  })

  it('nomme les heures restantes quand la capacité commerciale est faible mais non nulle', () => {
    const diagnosis = deriveWeakestLinkDiagnosis({
      accounts: [],
      pipeline: null,
      bench: null,
      commercialCapacity: { available_hours_per_week: 4, open_account_count: 10 },
    })

    expect(diagnosis.primary_bottleneck?.family).toBe('capacite_commerciale_trop_faible')
    expect(diagnosis.primary_bottleneck?.contradictory_evidence.length).toBeGreaterThan(0)
    expect(diagnosis.primary_bottleneck?.contradictory_evidence[0]).toMatch(/4/)
  })

  it('le pipeline n’a pas de sous-ensemble à confronter — signal agrégé, contradictory_evidence reste vide', () => {
    const diagnosis = deriveWeakestLinkDiagnosis({
      accounts: [account(), account({ account_id: 'acc-2' })],
      pipeline: { qualified_count: 0, total_count: 5 },
      bench: null,
      commercialCapacity: null,
    })

    expect(diagnosis.primary_bottleneck?.family).toBe('pas_de_pipeline_qualifie')
    expect(diagnosis.primary_bottleneck?.contradictory_evidence).toEqual([])
  })
})

describe('explainDiagnosisChange', () => {
  it('rend null quand le maillon faible principal n’a pas changé', () => {
    const previous = deriveWeakestLinkDiagnosis({
      accounts: [account({ has_next_action: false, has_identified_sponsor: false })],
      pipeline: null,
      bench: null,
      commercialCapacity: null,
    })
    const current = deriveWeakestLinkDiagnosis({
      accounts: [
        account({ has_next_action: false, has_identified_sponsor: false }),
        account({ account_id: 'acc-2', has_next_action: false, has_identified_sponsor: false }),
      ],
      pipeline: null,
      bench: null,
      commercialCapacity: null,
    })
    expect(explainDiagnosisChange(previous, current)).toBeNull()
  })

  it('explique le changement quand le maillon faible principal change de famille', () => {
    const previous = deriveWeakestLinkDiagnosis({
      accounts: [account({ has_next_action: false, has_identified_sponsor: false })],
      pipeline: null,
      bench: null,
      commercialCapacity: null,
    })
    const current = deriveWeakestLinkDiagnosis({
      accounts: [account()],
      pipeline: { qualified_count: 0, total_count: 3 },
      bench: null,
      commercialCapacity: null,
    })
    const explanation = explainDiagnosisChange(previous, current)
    expect(explanation).not.toBeNull()
    expect(explanation).toMatch(/absence_de_suivi_ou_de_prochaine_action/)
    expect(explanation).toMatch(/pas_de_pipeline_qualifie/)
  })
})

describe('shouldReevaluateDiagnosis', () => {
  const DAY_MS = 24 * 60 * 60 * 1000

  it('ne redéclenche rien avant sept jours sans événement significatif', () => {
    const last = new Date('2026-09-20T00:00:00Z')
    const now = new Date(last.getTime() + 3 * DAY_MS)
    expect(shouldReevaluateDiagnosis({ lastComputedAt: last, now, significantEventOccurred: false })).toBe('not_due')
  })

  it('déclenche une réévaluation légère après sept jours', () => {
    const last = new Date('2026-09-20T00:00:00Z')
    const now = new Date(last.getTime() + 7 * DAY_MS)
    expect(shouldReevaluateDiagnosis({ lastComputedAt: last, now, significantEventOccurred: false })).toBe(
      'due_light_weekly',
    )
  })

  it('déclenche une réévaluation complète immédiatement après un événement significatif, même le jour même', () => {
    const last = new Date('2026-09-20T00:00:00Z')
    const now = new Date(last.getTime() + DAY_MS)
    expect(shouldReevaluateDiagnosis({ lastComputedAt: last, now, significantEventOccurred: true })).toBe('due_full')
  })
})

describe('marge_trop_faible — #3294 (#3253.a), une cinquième famille câblée', () => {
  const base = { accounts: [], pipeline: null, bench: null, commercialCapacity: null } as const

  it('retient la marge quand au moins un tiers des missions chiffrées est sous le plancher de la cible', () => {
    const diagnosis = deriveWeakestLinkDiagnosis({
      ...base,
      margin: { measured_count: 6, below_floor_count: 3, unmeasured_count: 2, floor_percent: 25 },
    })
    expect(diagnosis.primary_bottleneck?.family).toBe('marge_trop_faible')
    expect(diagnosis.primary_bottleneck?.supporting_evidence[0]).toMatch(/3 mission\(s\) chiffrée\(s\) sur 6/)
    // Les missions non chiffrées sont NOMMÉES, jamais comptées comme sous le plancher.
    expect(diagnosis.primary_bottleneck?.business_impact).toMatch(/2 mission\(s\) sans marge mesurable/)
    // La confrontation : le sous-ensemble qui tient le plancher.
    expect(diagnosis.primary_bottleneck?.contradictory_evidence[0]).toMatch(/3 mission\(s\)/)
  })

  it('ne retient rien sous un tiers, et ne devient jamais un zéro quand rien n’est chiffré', () => {
    const fine = deriveWeakestLinkDiagnosis({
      ...base,
      margin: { measured_count: 6, below_floor_count: 1, unmeasured_count: 0, floor_percent: 25 },
    })
    expect(fine.primary_bottleneck).toBeNull()
    expect(fine.not_evaluable_families.map(f => f.family)).not.toContain('marge_trop_faible')

    const unmeasured = deriveWeakestLinkDiagnosis({
      ...base,
      margin: { measured_count: 0, below_floor_count: 0, unmeasured_count: 4, floor_percent: 25 },
    })
    expect(unmeasured.primary_bottleneck).toBeNull()
    expect(unmeasured.not_evaluable_families.find(f => f.family === 'marge_trop_faible')?.reason).toMatch(/4 mission/)
  })

  it('sans signal de marge (null / absent), la famille reste non évaluable — comme avant', () => {
    for (const input of [{ ...base }, { ...base, margin: null }]) {
      const diagnosis = deriveWeakestLinkDiagnosis(input)
      expect(diagnosis.not_evaluable_families.map(f => f.family)).toContain('marge_trop_faible')
    }
  })
})

describe('absence_de_rituels et dependance_a_une_seule_personne — #3294 (#3253.a), sixième et septième familles', () => {
  const base = { accounts: [], pipeline: null, bench: null, commercialCapacity: null } as const

  it('rituels : le point hebdomadaire jamais marqué alors que d’autres rituels le sont → retenu', () => {
    const diagnosis = deriveWeakestLinkDiagnosis({ ...base, rituals: { marked_count: 2, weekly_days_since: null } })
    expect(diagnosis.primary_bottleneck?.family).toBe('absence_de_rituels')
    expect(diagnosis.primary_bottleneck?.supporting_evidence[0]).toMatch(/hebdomadaire/i)
  })

  it('rituels : un point hebdomadaire tenu il y a plus de 14 jours → retenu ; récent → rien', () => {
    expect(
      deriveWeakestLinkDiagnosis({ ...base, rituals: { marked_count: 1, weekly_days_since: 20 } }).primary_bottleneck
        ?.family,
    ).toBe('absence_de_rituels')
    const fine = deriveWeakestLinkDiagnosis({ ...base, rituals: { marked_count: 1, weekly_days_since: 6 } })
    expect(fine.primary_bottleneck).toBeNull()
    expect(fine.not_evaluable_families.map(f => f.family)).not.toContain('absence_de_rituels')
  })

  it('rituels : aucun rituel jamais marqué → NON ÉVALUABLE (une absence de marque n’est pas une absence de rituel)', () => {
    for (const rituals of [null, undefined, { marked_count: 0, weekly_days_since: null }]) {
      const diagnosis = deriveWeakestLinkDiagnosis({ ...base, rituals })
      expect(diagnosis.primary_bottleneck).toBeNull()
      expect(diagnosis.not_evaluable_families.map(f => f.family)).toContain('absence_de_rituels')
    }
  })

  it('dépendance : un porteur tient 75 % ou plus des comptes ouverts attribués (≥ 4, ≥ 2 porteurs) → retenu, sans nommer personne', () => {
    const diagnosis = deriveWeakestLinkDiagnosis({
      ...base,
      ownership: { assigned_open_count: 8, unassigned_open_count: 2, owners_count: 2, top_owner_count: 7 },
    })
    expect(diagnosis.primary_bottleneck?.family).toBe('dependance_a_une_seule_personne')
    expect(diagnosis.primary_bottleneck?.business_impact).toMatch(/7 compte\(s\) ouvert\(s\) sur 8/)
    expect(diagnosis.primary_bottleneck?.business_impact).toMatch(/2 compte\(s\) sans porteur/)
  })

  it('dépendance : répartition équilibrée → rien ; un seul porteur visible, trop peu de comptes, ou rien → NON ÉVALUABLE', () => {
    const balanced = deriveWeakestLinkDiagnosis({
      ...base,
      ownership: { assigned_open_count: 8, unassigned_open_count: 0, owners_count: 3, top_owner_count: 4 },
    })
    expect(balanced.primary_bottleneck).toBeNull()
    expect(balanced.not_evaluable_families.map(f => f.family)).not.toContain('dependance_a_une_seule_personne')
    for (const ownership of [
      { assigned_open_count: 8, unassigned_open_count: 0, owners_count: 1, top_owner_count: 8 },
      { assigned_open_count: 3, unassigned_open_count: 0, owners_count: 2, top_owner_count: 3 },
      null,
      undefined,
    ]) {
      const diagnosis = deriveWeakestLinkDiagnosis({ ...base, ownership })
      expect(diagnosis.primary_bottleneck).toBeNull()
      expect(diagnosis.not_evaluable_families.map(f => f.family)).toContain('dependance_a_une_seule_personne')
    }
  })
})

describe('absence_de_voie_dacces et talents_mal_securises — X64 / #3294 (#3253.a), huitième et neuvième familles', () => {
  const base = { accounts: [], pipeline: null, bench: null, commercialCapacity: null } as const

  it('voie d’accès : la moitié ou plus des comptes ouverts (≥ 3) sans aucun contact → retenu, sans nommer de compte', () => {
    const diagnosis = deriveWeakestLinkDiagnosis({
      ...base,
      accessPath: { measured_count: 6, without_contact_count: 4 },
    })
    expect(diagnosis.primary_bottleneck?.family).toBe('absence_de_voie_dacces')
    expect(diagnosis.primary_bottleneck?.business_impact).toMatch(/4 compte\(s\) ouvert\(s\) sur 6/)
  })

  it('voie d’accès : peu de comptes sans contact → rien ; moins de trois comptes ouverts ou aucune lecture → NON ÉVALUABLE', () => {
    const fine = deriveWeakestLinkDiagnosis({ ...base, accessPath: { measured_count: 8, without_contact_count: 2 } })
    expect(fine.primary_bottleneck).toBeNull()
    expect(fine.not_evaluable_families.map(f => f.family)).not.toContain('absence_de_voie_dacces')
    for (const accessPath of [{ measured_count: 2, without_contact_count: 2 }, null, undefined]) {
      const diagnosis = deriveWeakestLinkDiagnosis({ ...base, accessPath })
      expect(diagnosis.primary_bottleneck).toBeNull()
      expect(diagnosis.not_evaluable_families.map(f => f.family)).toContain('absence_de_voie_dacces')
    }
  })

  it('talents : des missions actives finissent dans l’horizon sans suite décidée → retenu ; les missions sans date de fin sont nommées hors du compte', () => {
    const diagnosis = deriveWeakestLinkDiagnosis({
      ...base,
      talentSecurity: { measured_count: 5, unsecured_count: 3, unmeasured_count: 2, horizon_days: 60 },
    })
    expect(diagnosis.primary_bottleneck?.family).toBe('talents_mal_securises')
    expect(diagnosis.primary_bottleneck?.business_impact).toMatch(/3 mission\(s\) active\(s\) sur 5/)
    expect(diagnosis.primary_bottleneck?.business_impact).toMatch(/2 mission\(s\) sans date de fin/)
  })

  it('talents : aucune fin proche non décidée → rien ; aucune mission datée ou aucune lecture → NON ÉVALUABLE (jamais « 0 »)', () => {
    const fine = deriveWeakestLinkDiagnosis({
      ...base,
      talentSecurity: { measured_count: 4, unsecured_count: 0, unmeasured_count: 0, horizon_days: 60 },
    })
    expect(fine.primary_bottleneck).toBeNull()
    expect(fine.not_evaluable_families.map(f => f.family)).not.toContain('talents_mal_securises')
    for (const talentSecurity of [
      { measured_count: 0, unsecured_count: 0, unmeasured_count: 3, horizon_days: 60 },
      null,
      undefined,
    ]) {
      const diagnosis = deriveWeakestLinkDiagnosis({ ...base, talentSecurity })
      expect(diagnosis.primary_bottleneck).toBeNull()
      expect(diagnosis.not_evaluable_families.map(f => f.family)).toContain('talents_mal_securises')
    }
  })
})

describe('comptes_ouverts_non_etendus — #3294 (#3253.a), dixième famille câblée', () => {
  const base = { accounts: [], pipeline: null, bench: null, commercialCapacity: null } as const

  it('la moitié ou plus des comptes ouverts joignables (≥ 3) n’ont qu’un seul contact → retenu, sans nommer de compte', () => {
    const diagnosis = deriveWeakestLinkDiagnosis({
      ...base,
      extension: { measured_count: 6, single_contact_count: 4 },
    })
    expect(diagnosis.primary_bottleneck?.family).toBe('comptes_ouverts_non_etendus')
    expect(diagnosis.primary_bottleneck?.business_impact).toMatch(/4 compte\(s\) ouvert\(s\) sur 6/)
    expect(diagnosis.primary_bottleneck?.contradictory_evidence.length).toBeGreaterThan(0)
  })

  it('peu de comptes à un seul contact → rien ; moins de trois comptes joignables ou aucune lecture → NON ÉVALUABLE, jamais 0', () => {
    const fine = deriveWeakestLinkDiagnosis({ ...base, extension: { measured_count: 8, single_contact_count: 2 } })
    expect(fine.primary_bottleneck).toBeNull()
    expect(fine.not_evaluable_families.map(f => f.family)).not.toContain('comptes_ouverts_non_etendus')
    for (const extension of [{ measured_count: 2, single_contact_count: 2 }, null, undefined]) {
      const diagnosis = deriveWeakestLinkDiagnosis({ ...base, extension })
      expect(diagnosis.primary_bottleneck).toBeNull()
      expect(diagnosis.not_evaluable_families.map(f => f.family)).toContain('comptes_ouverts_non_etendus')
    }
  })
})
