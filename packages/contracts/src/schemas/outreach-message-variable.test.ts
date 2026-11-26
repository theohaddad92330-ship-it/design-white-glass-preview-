import { marketMemorySourceRef, describe, expect, it } from 'vitest'
import {
  OUTREACH_MARKET_MEMORY_SOURCE_PREFIX,
  documentSourceTitles,
  marketMemorySourceRef,
  marketMemorySourcedVariables,
  setOutreachMessageVariableRequestSchema,
  variablesNotClearedForExternalUse,
} from './outreach-message-variable.js'

const OK = {
  name: 'Technologie data',
  value: 'Snowflake',
  source: 'Site client, page carrières',
  as_of: '2026-09-12',
  confidence: 'probable',
  external_use: 'allowed',
}

describe('variable de message — #3419.1', () => {
  it('porte valeur, source, date, confiance et usage externe', () => {
    expect(setOutreachMessageVariableRequestSchema.safeParse(OK).success).toBe(true)
  })

  it.each(['name', 'value', 'source', 'as_of', 'confidence', 'external_use'])(
    'NON — sans %s, la variable est refusée (aucune valeur par défaut devinée)',
    field => {
      const { [field]: _omitted, ...rest } = OK as Record<string, string>
      expect(setOutreachMessageVariableRequestSchema.safeParse(rest).success).toBe(false)
    },
  )

  it('NON — une date qui n’est pas un jour, une confiance ou un usage hors liste', () => {
    expect(setOutreachMessageVariableRequestSchema.safeParse({ ...OK, as_of: '12/09/2026' }).success).toBe(false)
    expect(setOutreachMessageVariableRequestSchema.safeParse({ ...OK, confidence: 'sure' }).success).toBe(false)
    expect(setOutreachMessageVariableRequestSchema.safeParse({ ...OK, external_use: 'yes' }).success).toBe(false)
  })

  it('« inconnu » n’est pas « autorisé » : seule l’autorisation explicite lave la variable', () => {
    const rows = [
      { name: 'a', external_use: 'allowed' as const },
      { name: 'b', external_use: 'unknown' as const },
      { name: 'c', external_use: 'forbidden' as const },
    ]
    expect(variablesNotClearedForExternalUse(rows).map(row => row.name)).toEqual(['b', 'c'])
  })
})

describe('source documentaire d’une variable — #3752.7', () => {
  it('ne retient que les variables sourcées sur un document de l’espace, sans doublon', () => {
    expect(
      documentSourceTitles([
        { source: 'Document de l’espace : Cas client WMS' },
        { source: 'Site client, page carrières' },
        { source: 'Document de l’espace : Cas client WMS' },
        { source: 'Document de l’espace :   ' },
      ]),
    ).toEqual(['Cas client WMS'])
  })

  it('aucune variable → aucune source (jamais une source inventée)', () => {
    expect(documentSourceTitles([])).toEqual([])
  })
})

// #2877 / #3419.4 — « la mémoire marché ne produit jamais seule une affirmation
// nominative » : un extrait de mémoire marché devient une SOURCE RECONNAISSABLE
// (même mécanisme que #3752.7, pas une colonne de plus — GA-26), et cette source
// seule ne lave JAMAIS une variable pour l'usage externe (le message envoyé).
describe('source mémoire marché d’une variable — #2877 / #3419.4', () => {
  it('REFUSE la déclaration : mémoire marché + usage externe autorisé (le NO-GO)', () => {
    const attempt = {
      name: 'Ancien poste',
      value: 'A quitté son poste de DSI en septembre',
      source: 'Mémoire marché : observation-industrie-2026-09',
      as_of: '2026-09-12',
      confidence: 'probable',
      external_use: 'allowed',
    }
    const result = setOutreachMessageVariableRequestSchema.safeParse(attempt)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('mémoire marché')
    }
  })

  it('ACCEPTE la même variable en `forbidden` ou `unknown` — jamais `allowed` seulement', () => {
    const base = {
      name: 'Ancien poste',
      value: 'A quitté son poste de DSI en septembre',
      source: 'Mémoire marché : observation-industrie-2026-09',
      as_of: '2026-09-12',
      confidence: 'probable' as const,
    }
    expect(setOutreachMessageVariableRequestSchema.safeParse({ ...base, external_use: 'forbidden' }).success).toBe(true)
    expect(setOutreachMessageVariableRequestSchema.safeParse({ ...base, external_use: 'unknown' }).success).toBe(true)
  })

  it('une source QUI N’EST PAS la mémoire marché reste libre de tout usage externe', () => {
    expect(setOutreachMessageVariableRequestSchema.safeParse(OK).success).toBe(true)
  })

  it('ne retient que les variables sourcées sur la mémoire marché, sans doublon', () => {
    expect(
      marketMemorySourcedVariables([
        { source: 'Mémoire marché : obs-1' },
        { source: 'Site client, page carrières' },
        { source: 'Mémoire marché : obs-1' },
        { source: 'Mémoire marché :   ' },
      ]),
    ).toEqual(['obs-1'])
  })

  it('aucune variable mémoire marché → aucune ligne (jamais une source inventée)', () => {
    expect(marketMemorySourcedVariables([])).toEqual([])
  })
})

// #4074 — le préfixe persisté est une donnée, jamais un texte montré.
describe('marketMemorySourceRef — #4074', () => {
  it('retire le préfixe persisté et rend l’extrait', () => {
    expect(marketMemorySourceRef(`${OUTREACH_MARKET_MEMORY_SOURCE_PREFIX}tendance-cloud`)).toBe('tendance-cloud')
  })

  it('une autre source, ou un préfixe seul, ne rend rien (jamais « 0 » ni un texte inventé)', () => {
    expect(marketMemorySourceRef('Site client')).toBeNull()
    expect(marketMemorySourceRef(OUTREACH_MARKET_MEMORY_SOURCE_PREFIX)).toBeNull()
  })
})
