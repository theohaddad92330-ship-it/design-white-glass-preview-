import { describe, expect, it } from 'vitest'
import {
  applyFieldUpdates,
  decideFieldWrite,
  EVIDENCE_FIELD_SOURCES,
  evidenceFieldSourceSchema,
  fieldSourceRank,
  FIELD_SOURCES,
  isEvidenceSource,
  isStaleSinceHumanCorrection,
  PROVENANCE_DECISION_REASONS,
  provenanceDecisionReasonKey,
} from './provenance.js'

describe('hiérarchie des sources', () => {
  it('classe human > connector > pipeline > model', () => {
    const ranks = FIELD_SOURCES.map(fieldSourceRank)
    expect(ranks).toEqual([...ranks].sort((a, b) => b - a))
    expect(fieldSourceRank('human')).toBeGreaterThan(fieldSourceRank('connector'))
    expect(fieldSourceRank('connector')).toBeGreaterThan(fieldSourceRank('pipeline'))
    expect(fieldSourceRank('pipeline')).toBeGreaterThan(fieldSourceRank('model'))
  })
})

describe('decideFieldWrite', () => {
  it('remplit un champ vide quelle que soit la source', () => {
    expect(
      decideFieldWrite({
        incomingValue: 'contact@acme.example',
        incomingSource: 'model',
        currentValue: null,
        currentSource: null,
      }),
    ).toEqual({ write: true, reason: 'no_previous' })
  })

  it("traite une chaîne d'espaces comme un champ vide", () => {
    expect(
      decideFieldWrite({
        incomingValue: 'Directrice SI',
        incomingSource: 'pipeline',
        currentValue: '   ',
        currentSource: 'human',
      }),
    ).toEqual({ write: true, reason: 'no_previous' })
  })

  it("n'écrase JAMAIS une valeur avec un blanc venu d'un fournisseur", () => {
    expect(
      decideFieldWrite({
        incomingValue: null,
        incomingSource: 'connector',
        currentValue: 'contact@acme.example',
        currentSource: 'human',
      }),
    ).toEqual({ write: false, reason: 'blank_never_overwrites' })
  })

  it('laisse un humain vider un champ — lui seul peut dire « c’est faux »', () => {
    expect(
      decideFieldWrite({
        incomingValue: '',
        incomingSource: 'human',
        currentValue: 'contact@acme.example',
        currentSource: 'connector',
      }),
    ).toEqual({ write: true, reason: 'higher_or_equal_authority' })
  })

  it('refuse au pipeline d’écraser une saisie humaine', () => {
    expect(
      decideFieldWrite({
        incomingValue: 'Groupe TF1',
        incomingSource: 'pipeline',
        currentValue: 'TF1 PUB',
        currentSource: 'human',
      }),
    ).toEqual({ write: false, reason: 'lower_authority' })
  })

  it('refuse au modèle d’écraser une valeur de connecteur', () => {
    expect(
      decideFieldWrite({
        incomingValue: '+33 1 00 00 00 00',
        incomingSource: 'model',
        currentValue: '+33 1 41 41 12 34',
        currentSource: 'connector',
      }),
    ).toEqual({ write: false, reason: 'lower_authority' })
  })

  it('accepte une écriture de même autorité (le connecteur se corrige lui-même)', () => {
    expect(
      decideFieldWrite({
        incomingValue: 'Nouvelle raison sociale',
        incomingSource: 'connector',
        currentValue: 'Ancienne raison sociale',
        currentSource: 'connector',
      }),
    ).toEqual({ write: true, reason: 'higher_or_equal_authority' })
  })

  it('ne réécrit pas une valeur identique (aux espaces près)', () => {
    expect(
      decideFieldWrite({
        incomingValue: ' ACME  ',
        incomingSource: 'human',
        currentValue: 'ACME',
        currentSource: 'pipeline',
      }),
    ).toEqual({ write: false, reason: 'unchanged' })
  })

  it('traite une provenance inconnue comme du pipeline : l’humain passe, le modèle non', () => {
    expect(
      decideFieldWrite({
        incomingValue: 'Corrigé à la main',
        incomingSource: 'human',
        currentValue: 'Valeur historique',
        currentSource: null,
      }).write,
    ).toBe(true)

    expect(
      decideFieldWrite({
        incomingValue: 'Proposé par un modèle',
        incomingSource: 'model',
        currentValue: 'Valeur historique',
        currentSource: null,
      }).write,
    ).toBe(false)
  })

  it('ne confond pas 0 et false avec un blanc', () => {
    expect(
      decideFieldWrite({ incomingValue: 0, incomingSource: 'pipeline', currentValue: 12, currentSource: 'pipeline' }),
    ).toEqual({ write: true, reason: 'higher_or_equal_authority' })
    expect(
      decideFieldWrite({
        incomingValue: false,
        incomingSource: 'pipeline',
        currentValue: true,
        currentSource: 'pipeline',
      }),
    ).toEqual({ write: true, reason: 'higher_or_equal_authority' })
  })

  it('compare les tableaux élément par élément', () => {
    expect(
      decideFieldWrite({
        incomingValue: ['Java', 'Spring'],
        incomingSource: 'pipeline',
        currentValue: ['Java', 'Spring'],
        currentSource: 'pipeline',
      }),
    ).toEqual({ write: false, reason: 'unchanged' })
    expect(
      decideFieldWrite({
        incomingValue: [],
        incomingSource: 'pipeline',
        currentValue: ['Java'],
        currentSource: 'human',
      }),
    ).toEqual({ write: false, reason: 'blank_never_overwrites' })
  })
})

describe('provenanceDecisionReasonKey (#2264.39, épopée #2921)', () => {
  it('donne une clé i18n distincte pour CHAQUE raison — un enum seul ne dit rien à un humain', () => {
    const keys = PROVENANCE_DECISION_REASONS.map(provenanceDecisionReasonKey)
    expect(new Set(keys).size).toBe(PROVENANCE_DECISION_REASONS.length)
    for (const reason of PROVENANCE_DECISION_REASONS) {
      expect(provenanceDecisionReasonKey(reason)).toBe(`provenance.decisionReason.${reason}`)
    }
  })
})

describe('applyFieldUpdates', () => {
  it('trie un lot en accepté / refusé avec la raison de chaque refus', () => {
    const result = applyFieldUpdates({
      incoming: { companyName: 'Groupe TF1', website: 'https://tf1.example', sector: null },
      incomingSource: 'pipeline',
      current: { companyName: 'TF1 PUB', website: null, sector: 'Médias' },
      currentSources: { companyName: 'human', sector: 'human' },
    })

    expect(result.accepted).toEqual({ website: 'https://tf1.example' })
    expect(result.rejected).toEqual([
      { field: 'companyName', reason: 'lower_authority' },
      { field: 'sector', reason: 'blank_never_overwrites' },
    ])
  })

  it('ne signale pas comme refusé un champ simplement inchangé', () => {
    const result = applyFieldUpdates({
      incoming: { companyName: 'ACME' },
      incomingSource: 'pipeline',
      current: { companyName: 'ACME' },
      currentSources: {},
    })

    expect(result.accepted).toEqual({})
    expect(result.rejected).toEqual([])
  })
})

describe('isStaleSinceHumanCorrection (#2403.38)', () => {
  const COMPUTED_AT = '2026-09-20T10:00:00.000Z'

  it('aucune correction humaine connue ⇒ jamais périmée (comportement inchangé)', () => {
    expect(isStaleSinceHumanCorrection(COMPUTED_AT, null)).toBe(false)
  })

  it('une correction humaine APRÈS le calcul rend la suggestion périmée', () => {
    expect(isStaleSinceHumanCorrection(COMPUTED_AT, '2026-09-21T09:00:00.000Z')).toBe(true)
  })

  it('une correction humaine AVANT le calcul ne périme rien — elle est déjà reflétée', () => {
    expect(isStaleSinceHumanCorrection(COMPUTED_AT, '2026-09-19T09:00:00.000Z')).toBe(false)
  })

  it('une correction EXACTEMENT au même instant ne périme rien (strictement APRÈS, jamais égal)', () => {
    expect(isStaleSinceHumanCorrection(COMPUTED_AT, COMPUTED_AT)).toBe(false)
  })

  it('accepte des `Date` comme des chaînes ISO, indifféremment', () => {
    expect(isStaleSinceHumanCorrection(new Date(COMPUTED_AT), new Date('2026-09-21T09:00:00.000Z'))).toBe(true)
  })
})

describe('provenance `inferred` — l’estimation badgée (#4016 L4, décision Louis 11/10/2026)', () => {
  const OTHERS = FIELD_SOURCES.filter(source => source !== 'inferred')

  it('est la source la plus FAIBLE de toutes, sous `model`', () => {
    expect(FIELD_SOURCES).toContain('inferred')
    for (const source of OTHERS) expect(fieldSourceRank('inferred')).toBeLessThan(fieldSourceRank(source))
  })

  it('EVIDENCE_FIELD_SOURCES est exactement FIELD_SOURCES sans `inferred`', () => {
    expect([...EVIDENCE_FIELD_SOURCES]).toEqual(OTHERS)
    expect(evidenceFieldSourceSchema.safeParse('inferred').success).toBe(false)
  })

  it('n’est JAMAIS une preuve — toutes les autres sources le restent', () => {
    expect(isEvidenceSource('inferred')).toBe(false)
    for (const source of OTHERS) expect(isEvidenceSource(source)).toBe(true)
  })

  it('remplit un trou, et seulement un trou', () => {
    expect(
      decideFieldWrite({
        incomingValue: 'a.b@acme.fr',
        incomingSource: 'inferred',
        currentValue: null,
        currentSource: null,
      }),
    ).toEqual({ write: true, reason: 'no_previous' })
  })

  it('n’écrase JAMAIS une valeur posée par une autre source — humaine, vérifiée ou d’origine inconnue', () => {
    for (const currentSource of [null, ...OTHERS]) {
      expect(
        decideFieldWrite({
          incomingValue: 'estime@acme.fr',
          incomingSource: 'inferred',
          currentValue: 'vraie@acme.fr',
          currentSource,
        }),
      ).toEqual({ write: false, reason: 'lower_authority' })
    }
  })

  it('cède TOUJOURS devant une valeur humaine ou d’une autre source', () => {
    for (const incomingSource of OTHERS) {
      expect(
        decideFieldWrite({
          incomingValue: 'vraie@acme.fr',
          incomingSource,
          currentValue: 'estime@acme.fr',
          currentSource: 'inferred',
        }),
      ).toEqual({ write: true, reason: 'higher_or_equal_authority' })
    }
  })

  it('une nouvelle estimation remplace l’ancienne estimation (même rang)', () => {
    expect(
      decideFieldWrite({
        incomingValue: 'p.nom@acme.fr',
        incomingSource: 'inferred',
        currentValue: 'prenom.nom@acme.fr',
        currentSource: 'inferred',
      }),
    ).toEqual({ write: true, reason: 'higher_or_equal_authority' })
  })

  it('un blanc estimé n’efface rien', () => {
    expect(
      decideFieldWrite({
        incomingValue: '',
        incomingSource: 'inferred',
        currentValue: 'x@acme.fr',
        currentSource: 'inferred',
      }),
    ).toEqual({ write: false, reason: 'blank_never_overwrites' })
  })
})
