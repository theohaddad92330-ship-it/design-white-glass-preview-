import { describe, expect, it } from 'vitest'
import {
  ALL_CHAT_COVERAGE_PERIMETER_TYPES,
  ALL_CHAT_COVERAGE_ROLE_FAMILIES,
  ALL_CHAT_COVERAGE_SALES_STAGES,
  capStateForSources,
  chatCoverageMapResponseSchema,
  coverageRatio,
  deriveContactState,
  PRIORITY_GAP_CATEGORIES,
  suggestGapAction,
} from './chat-coverage-map.js'

// #2308 (LAU-FINAL-049) — la carte de couverture du CHAT et ses TROUS.
//
// GA-259 tient la règle qui commande ce fichier : un taux de couverture
// mesure ce qu'on SAIT, jamais ce que le marché FAIT. Les tests ci-dessous
// vérifient que la règle est câblée, pas seulement écrite en commentaire.

describe('#2308.3-6 / #2308.7-8/13/15 / #2308.17-24 — les axes sont NOMMÉS, en entier', () => {
  it('six types de périmètre (groupe/filiale déjà là + BU/direction/programme/site)', () => {
    expect(ALL_CHAT_COVERAGE_PERIMETER_TYPES).toEqual(['groupe', 'filiale', 'bu', 'direction', 'programme', 'site'])
  })

  it('dix familles de rôle (six déjà là + opérationnel/manager/sécurité-conformité/partenaire)', () => {
    expect(ALL_CHAT_COVERAGE_ROLE_FAMILIES).toEqual([
      'sponsor',
      'decideur_economique',
      'referent_technique',
      'utilisateur',
      'achats',
      'relais',
      'operationnel',
      'manager',
      'securite_conformite',
      'partenaire',
    ])
  })

  it('huit étapes commerciales', () => {
    expect(ALL_CHAT_COVERAGE_SALES_STAGES).toEqual([
      'terrain_compris',
      'probleme_qualifie',
      'sponsor_identifie',
      'budget_confirme',
      'decision',
      'achat',
      'relation',
      'prochaine_action',
    ])
  })
})

describe('#2308.32 — jamais « couvert » sur un seul signal Market Memory (GA-259)', () => {
  it('un signal purement Market Memory plafonne à "à vérifier", jamais "couvert"', () => {
    expect(capStateForSources('covered_verified', ['market_memory'])).toBe('to_verify')
    expect(capStateForSources('covered_stale', ['market_memory'])).toBe('to_verify')
    expect(capStateForSources('partial', ['market_memory'])).toBe('to_verify')
  })

  it("un vrai contact du compte AUTORISE l'état couvert, même si Market Memory observe aussi", () => {
    expect(capStateForSources('covered_verified', ['account_contact', 'market_memory'])).toBe('covered_verified')
    expect(capStateForSources('covered_verified', ['account_contact'])).toBe('covered_verified')
  })

  it('aucune source du tout : un état "couvert" ne se maintient jamais tout seul', () => {
    expect(capStateForSources('covered_verified', [])).toBe('unknown')
  })

  it('un état déjà non-couvert traverse inchangé (rien à plafonner)', () => {
    expect(capStateForSources('to_verify', ['market_memory'])).toBe('to_verify')
    expect(capStateForSources('unknown', [])).toBe('unknown')
    expect(capStateForSources('not_relevant', ['market_memory'])).toBe('not_relevant')
  })
})

describe('#2308.25-28 / #2308.31 — les cinq états de couverture, dérivés sans jamais inventer', () => {
  const HORIZON = 18 * 30 * 24 * 60 * 60 * 1000
  const NOW = new Date('2026-09-22T00:00:00.000Z').getTime()

  it('zéro contact = "inconnu", jamais "manquant" (on ne sait pas si l\'entité existe)', () => {
    expect(deriveContactState({ contactCount: 0, freshestUpdatedAtMs: null, nowMs: NOW })).toBe('unknown')
  })

  it('contact frais (<18 mois) = "couvert et vérifié"', () => {
    const fresh = NOW - 30 * 24 * 60 * 60 * 1000
    expect(
      deriveContactState({ contactCount: 1, freshestUpdatedAtMs: fresh, nowMs: NOW, freshnessHorizonMs: HORIZON }),
    ).toBe('covered_verified')
  })

  it('contact âgé (>18 mois) = "couvert mais ancien"', () => {
    const stale = NOW - 20 * 30 * 24 * 60 * 60 * 1000
    expect(
      deriveContactState({ contactCount: 1, freshestUpdatedAtMs: stale, nowMs: NOW, freshnessHorizonMs: HORIZON }),
    ).toBe('covered_stale')
  })

  it('contact présent sans date de mise à jour lisible = "à vérifier", jamais "couvert" par défaut', () => {
    expect(deriveContactState({ contactCount: 2, freshestUpdatedAtMs: null, nowMs: NOW })).toBe('to_verify')
  })
})

describe('#2308.33-36 / #2308.43 — priorité du gap et action suggérée', () => {
  it('les deux catégories qui bloquent sont "prioritaires" ; les deux autres ne le sont pas', () => {
    expect(PRIORITY_GAP_CATEGORIES).toEqual(['bloque_action', 'bloque_etape_suivante'])
  })

  it('un gap "bloque l\'action" produit l\'action suggérée', () => {
    expect(suggestGapAction('bloque_action', 'question_contact')).toBe('question_contact')
  })

  it('un gap "bloque l\'étape suivante" produit l\'action suggérée', () => {
    expect(suggestGapAction('bloque_etape_suivante', 'verification')).toBe('verification')
  })

  it('#2308.43 — "améliore la confiance" avec une action qui COÛTE un geste commercial ne produit JAMAIS d\'action', () => {
    expect(suggestGapAction('ameliore_confiance', 'recherche_ciblee')).toBeNull()
  })

  it('#2308.43 — "information secondaire" ne produit JAMAIS d\'action : pas prioritaire', () => {
    expect(suggestGapAction('information_secondaire', 'demande_equipe')).toBeNull()
  })

  it('#2308.39 (corrigé 23/09/2026) — « enrichissement » est atteignable même hors catégorie prioritaire : elle ne coûte aucun geste commercial (recherche automatisée, jamais une sollicitation)', () => {
    // Avant ce correctif, `enrichissement` était la SEULE action attachée à
    // `ameliore_confiance` (GapRule groupe/filiale/relation) : le gate de
    // priorité la rendait donc INATTEIGNABLE — du code juste, jamais atteint.
    expect(suggestGapAction('ameliore_confiance', 'enrichissement')).toBe('enrichissement')
  })

  it("sait dire NON — les gaps bloquants restent seuls à produire les CINQ autres actions, `enrichissement` n'élève pas `ameliore_confiance` au rang prioritaire", () => {
    expect(suggestGapAction('ameliore_confiance', 'question_contact')).toBeNull()
    expect(suggestGapAction('ameliore_confiance', 'import_crm')).toBeNull()
    expect(suggestGapAction('ameliore_confiance', 'verification')).toBeNull()
    expect(suggestGapAction('ameliore_confiance', 'demande_equipe')).toBeNull()
    expect(PRIORITY_GAP_CATEGORIES).toEqual(['bloque_action', 'bloque_etape_suivante'])
  })
})

describe('GA-18/GA-19 — un axe "inconnu" sort du DÉNOMINATEUR, jamais compté comme un zéro', () => {
  it('tout inconnu ⇒ aucun ratio calculable (null, jamais 0/0 ni 0 %)', () => {
    expect(coverageRatio(['unknown', 'unknown', 'unknown'])).toBeNull()
  })

  it('un mélange exclut les "inconnu" du dénominateur', () => {
    // 1 couvert sur 2 mesurables — le 3e (inconnu) ne compte ni au numérateur ni au dénominateur.
    expect(coverageRatio(['covered_verified', 'missing', 'unknown'])).toEqual({ covered: 1, measurable: 2 })
  })
})

describe('la réponse complète respecte "un score n\'est jamais nu" (axes toujours nommés)', () => {
  it('parse une réponse minimale valide avec les trois axes complets', () => {
    const parsed = chatCoverageMapResponseSchema.parse({
      account_id: '11111111-1111-4111-8111-111111111111',
      generated_at: '2026-09-22T00:00:00.000Z',
      meaning: 'Ce que nous savons de ce compte, jamais ce que le marché fait.',
      role_families: ALL_CHAT_COVERAGE_ROLE_FAMILIES.map(role_family => ({
        role_family,
        label: role_family,
        state: 'unknown' as const,
        contact_count: 0,
      })),
      perimeters: ALL_CHAT_COVERAGE_PERIMETER_TYPES.map(perimeter_type => ({
        perimeter_type,
        label: perimeter_type,
        state: 'unknown' as const,
        contact_count: 0,
        entity_names: [],
      })),
      sales_stages: ALL_CHAT_COVERAGE_SALES_STAGES.map(sales_stage => ({
        sales_stage,
        label: sales_stage,
        state: 'unknown' as const,
        reason: null,
      })),
      gaps: [],
    })
    expect(parsed.role_families).toHaveLength(10)
    expect(parsed.perimeters).toHaveLength(6)
    expect(parsed.sales_stages).toHaveLength(8)
  })

  it("un gap non prioritaire n'a pas d'action (suggested_action nullable, jamais inventée)", () => {
    const gap = {
      id: 'g1',
      axis: 'role_family' as const,
      key: 'partenaire',
      label: 'Partenaire',
      reason: 'Aucun contact classé partenaire.',
      state: 'unknown' as const,
      priority_category: 'information_secondaire' as const,
      suggested_action: null,
    }
    const parsed = chatCoverageMapResponseSchema.shape.gaps.element.parse(gap)
    expect(parsed.suggested_action).toBeNull()
  })
})
