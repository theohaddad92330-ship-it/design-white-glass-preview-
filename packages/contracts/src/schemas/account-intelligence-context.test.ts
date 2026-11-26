import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_INTELLIGENCE_SOURCES,
  ACCOUNT_INTELLIGENCE_SOURCE_ORDER,
  accountIntelligenceRecommendationSchema,
  accountIntelligenceSourceRank,
  accountIntelligenceSourceSchema,
  accountRecommendationFreshness,
  isAccountIntelligenceUnavailable,
  resolveAccountIntelligenceField,
  type AccountIntelligenceCandidate,
} from './account-intelligence-context.js'

describe('#1618 — la hiérarchie de confiance, ÉCRITE', () => {
  it('classe correction humaine > donnée courante > DataForge > mémoire marché > inférence', () => {
    // #2116.1-8 — l'ordre de DÉCLARATION n'est plus l'ordre d'autorité : GA-08
    // interdit d'insérer au milieu, les trois provenances neuves sont donc en
    // queue de tableau. La hiérarchie se lit sur `..._SOURCE_ORDER`.
    const ranks = ACCOUNT_INTELLIGENCE_SOURCE_ORDER.map(accountIntelligenceSourceRank)
    expect(ranks).toEqual([...ranks].sort((a, b) => b - a))
    expect(new Set(ACCOUNT_INTELLIGENCE_SOURCE_ORDER)).toEqual(new Set(ACCOUNT_INTELLIGENCE_SOURCES))
    expect(accountIntelligenceSourceRank('human_correction')).toBeGreaterThan(
      accountIntelligenceSourceRank('current_data'),
    )
    expect(accountIntelligenceSourceRank('current_data')).toBeGreaterThan(accountIntelligenceSourceRank('dataforge'))
    expect(accountIntelligenceSourceRank('dataforge')).toBeGreaterThan(accountIntelligenceSourceRank('market_memory'))
    expect(accountIntelligenceSourceRank('market_memory')).toBeGreaterThan(accountIntelligenceSourceRank('inference'))
  })
})

describe('resolveAccountIntelligenceField — l’arbitre, échelon par échelon', () => {
  it('rend `unknown` quand aucun candidat ne porte de valeur', () => {
    const candidates: AccountIntelligenceCandidate<string>[] = [
      { source: 'human_correction', observedAt: null, value: null },
      { source: 'current_data', observedAt: '2026-09-01T00:00:00.000Z', value: null },
      { source: 'dataforge', observedAt: '2026-08-01T00:00:00.000Z', value: null },
      { source: 'market_memory', observedAt: null, value: null },
      { source: 'inference', observedAt: null, value: null },
    ]
    expect(resolveAccountIntelligenceField(candidates)).toEqual({ state: 'unknown' })
  })

  it('une SEULE source qui parle gagne, quel que soit son rang', () => {
    const candidates: AccountIntelligenceCandidate<string>[] = [
      { source: 'human_correction', observedAt: null, value: null },
      { source: 'current_data', observedAt: null, value: null },
      { source: 'dataforge', observedAt: null, value: null },
      { source: 'market_memory', observedAt: null, value: null },
      { source: 'inference', observedAt: '2026-01-01T00:00:00.000Z', value: 'Éditique' },
    ]
    expect(resolveAccountIntelligenceField(candidates)).toEqual({
      state: 'known',
      value: 'Éditique',
      provenance: { source: 'inference', observedAt: '2026-01-01T00:00:00.000Z' },
    })
  })

  it('la mémoire marché bat l’inférence quand les deux parlent', () => {
    const candidates: AccountIntelligenceCandidate<string>[] = [
      { source: 'inference', observedAt: null, value: 'Conseil' },
      { source: 'market_memory', observedAt: null, value: 'Assurance' },
    ]
    expect(resolveAccountIntelligenceField(candidates)).toEqual({
      state: 'known',
      value: 'Assurance',
      provenance: { source: 'market_memory', observedAt: null },
    })
  })

  it('DataForge bat la mémoire marché', () => {
    const candidates: AccountIntelligenceCandidate<string>[] = [
      { source: 'market_memory', observedAt: null, value: 'Assurance' },
      { source: 'dataforge', observedAt: '2026-08-20T00:00:00.000Z', value: 'Banque' },
    ]
    expect(resolveAccountIntelligenceField(candidates)).toEqual({
      state: 'known',
      value: 'Banque',
      provenance: { source: 'dataforge', observedAt: '2026-08-20T00:00:00.000Z' },
    })
  })

  it('la donnée courante bat DataForge', () => {
    const candidates: AccountIntelligenceCandidate<string>[] = [
      { source: 'dataforge', observedAt: '2026-08-20T00:00:00.000Z', value: 'Banque' },
      { source: 'current_data', observedAt: '2026-09-05T00:00:00.000Z', value: 'Banque de détail' },
    ]
    expect(resolveAccountIntelligenceField(candidates)).toEqual({
      state: 'known',
      value: 'Banque de détail',
      provenance: { source: 'current_data', observedAt: '2026-09-05T00:00:00.000Z' },
    })
  })

  it('une correction humaine gagne TOUJOURS — même arrivée en dernier, même datée plus tôt que les autres', () => {
    const candidates: AccountIntelligenceCandidate<string>[] = [
      { source: 'current_data', observedAt: '2026-09-05T00:00:00.000Z', value: 'Banque de détail' },
      { source: 'dataforge', observedAt: '2026-09-06T00:00:00.000Z', value: 'Banque' },
      { source: 'market_memory', observedAt: null, value: 'Assurance' },
      { source: 'inference', observedAt: '2026-09-07T00:00:00.000Z', value: 'Conseil' },
      // La plus ANCIENNE de toutes, et pourtant elle gagne : ce n'est pas une
      // horloge, c'est une hiérarchie d'AUTORITÉ.
      { source: 'human_correction', observedAt: '2026-01-01T00:00:00.000Z', value: 'TF1 PUB' },
    ]
    expect(resolveAccountIntelligenceField(candidates)).toEqual({
      state: 'known',
      value: 'TF1 PUB',
      provenance: { source: 'human_correction', observedAt: '2026-01-01T00:00:00.000Z' },
    })
  })

  it('l’ordre des candidats ne change rien — ce n’est pas « premier arrivé »', () => {
    const inOrder: AccountIntelligenceCandidate<string>[] = [
      { source: 'human_correction', observedAt: '2026-01-01T00:00:00.000Z', value: 'TF1 PUB' },
      { source: 'current_data', observedAt: '2026-09-05T00:00:00.000Z', value: 'Groupe TF1' },
    ]
    const reversed = [...inOrder].reverse()
    expect(resolveAccountIntelligenceField(inOrder)).toEqual(resolveAccountIntelligenceField(reversed))
    expect(resolveAccountIntelligenceField(reversed)).toEqual({
      state: 'known',
      value: 'TF1 PUB',
      provenance: { source: 'human_correction', observedAt: '2026-01-01T00:00:00.000Z' },
    })
  })

  it('un blanc n’est pas une valeur — une chaîne vide ou faite d’espaces ne gagne rien', () => {
    const candidates: AccountIntelligenceCandidate<string>[] = [
      { source: 'human_correction', observedAt: '2026-01-01T00:00:00.000Z', value: '   ' },
      { source: 'current_data', observedAt: '2026-09-05T00:00:00.000Z', value: 'Groupe TF1' },
    ]
    expect(resolveAccountIntelligenceField(candidates)).toEqual({
      state: 'known',
      value: 'Groupe TF1',
      provenance: { source: 'current_data', observedAt: '2026-09-05T00:00:00.000Z' },
    })
  })
})

describe('#2116.1-8 — les huit provenances, fermées', () => {
  it('porte les huit sources du retour, et la hiérarchie de #1618 est INTACTE', () => {
    expect(ACCOUNT_INTELLIGENCE_SOURCES).toHaveLength(8)
    // Les cinq de #1618, à leur place de déclaration d'origine (GA-08 : jamais
    // un retrait, jamais une insertion au milieu).
    expect(ACCOUNT_INTELLIGENCE_SOURCES.slice(0, 5)).toEqual([
      'human_correction',
      'current_data',
      'dataforge',
      'market_memory',
      'inference',
    ])
    expect(ACCOUNT_INTELLIGENCE_SOURCES.slice(5)).toEqual(['registry_identity', 'connected_tools', 'public_sources'])
  })

  it('sait dire NON : une provenance inventée n’entre pas dans le schéma', () => {
    expect(accountIntelligenceSourceSchema.safeParse('linkedin').success).toBe(false)
    expect(accountIntelligenceSourceSchema.safeParse('registry_identity').success).toBe(true)
  })

  it('place les trois nouvelles sans déloger les cinq anciennes', () => {
    expect(accountIntelligenceSourceRank('current_data')).toBeGreaterThan(
      accountIntelligenceSourceRank('registry_identity'),
    )
    expect(accountIntelligenceSourceRank('registry_identity')).toBeGreaterThan(
      accountIntelligenceSourceRank('connected_tools'),
    )
    expect(accountIntelligenceSourceRank('connected_tools')).toBeGreaterThan(accountIntelligenceSourceRank('dataforge'))
    expect(accountIntelligenceSourceRank('dataforge')).toBeGreaterThan(accountIntelligenceSourceRank('public_sources'))
    expect(accountIntelligenceSourceRank('public_sources')).toBeGreaterThan(
      accountIntelligenceSourceRank('market_memory'),
    )
  })

  it('une identité registre bat une collecte publique sur le même champ', () => {
    const resolved = resolveAccountIntelligenceField<string>([
      { source: 'public_sources', observedAt: '2026-09-10T00:00:00.000Z', value: 'Acme SA' },
      { source: 'registry_identity', observedAt: '2026-03-02T00:00:00.000Z', value: 'ACME SOCIETE ANONYME' },
    ])
    expect(resolved).toEqual({
      state: 'known',
      value: 'ACME SOCIETE ANONYME',
      provenance: { source: 'registry_identity', observedAt: '2026-03-02T00:00:00.000Z' },
    })
  })
})

describe('#2116.20 — la fraîcheur, et l’état qui n’est pas une durée', () => {
  const now = Date.parse('2026-09-14T12:00:00.000Z')

  it('sans date, rend `undated` — jamais `stale`', () => {
    expect(accountRecommendationFreshness(null, now)).toBe('undated')
  })

  it('une date ILLISIBLE rend `undated` — `NaN` n’est pas « très ancien »', () => {
    expect(accountRecommendationFreshness('bientôt', now)).toBe('undated')
  })

  it('classe fraîche / vieillissante / périmée sur les deux seuils', () => {
    expect(accountRecommendationFreshness('2026-09-01T12:00:00.000Z', now)).toBe('fresh')
    expect(accountRecommendationFreshness('2026-07-01T12:00:00.000Z', now)).toBe('ageing')
    expect(accountRecommendationFreshness('2025-09-01T12:00:00.000Z', now)).toBe('stale')
  })
})

describe('#2116.17-24 — les huit métadonnées, aucune optionnelle', () => {
  const complete = {
    id: 'entry-0',
    label: 'La direction technique du pôle paiement',
    detail: 'Trois offres ouvertes sur la même stack en six semaines.',
    nature: 'inference',
    provenance: { source: 'inference', observedAt: '2026-09-01T00:00:00.000Z' },
    freshness: 'fresh',
    confidence: { level: 'deduced', corroborationCount: null },
    limit: 'not_a_commitment',
    check: 'confirm_with_contact',
    action: 'open_contacts',
  }

  it('accepte une recommandation complète', () => {
    expect(accountIntelligenceRecommendationSchema.safeParse(complete).success).toBe(true)
  })

  it('sait dire NON : chacune des huit manquante fait échouer le contrat', () => {
    for (const field of ['nature', 'provenance', 'freshness', 'confidence', 'limit', 'check', 'action']) {
      const { [field]: _removed, ...amputated } = complete as Record<string, unknown>
      expect(accountIntelligenceRecommendationSchema.safeParse(amputated).success).toBe(false)
    }
  })

  it('sait dire NON à une confiance CHIFFRÉE — une probabilité n’est pas un niveau', () => {
    expect(
      accountIntelligenceRecommendationSchema.safeParse({
        ...complete,
        confidence: { level: 0.78, corroborationCount: null },
      }).success,
    ).toBe(false)
  })

  it('accepte une date INCONNUE, et la nomme plutôt que de l’omettre', () => {
    const undated = {
      ...complete,
      provenance: { source: 'market_memory', observedAt: null },
      freshness: 'undated',
    }
    expect(accountIntelligenceRecommendationSchema.safeParse(undated).success).toBe(true)
  })
})

describe('isAccountIntelligenceUnavailable', () => {
  it('distingue « façade absente » d’un contexte vide', () => {
    expect(isAccountIntelligenceUnavailable({ status: 'unavailable' })).toBe(true)
    expect(isAccountIntelligenceUnavailable(null)).toBe(false)
    expect(
      isAccountIntelligenceUnavailable({
        accountId: 'a',
        incumbentEsn: { state: 'unknown' },
        technologies: { state: 'unknown' },
        entryPaths: { state: 'unknown' },
        recommendations: [],
      }),
    ).toBe(false)
  })
})
