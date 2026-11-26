import { describe, expect, it } from 'vitest'
import { ANALYSIS_BATCH_MAX_ITEMS } from '@bellum/contracts'
import { parseBatchInput } from './parse-batch-input'

/** #2293.3 — une liste collée : des noms, des identifiants, ou les deux. */
describe('parseBatchInput', () => {
  it('un nom par ligne, lignes vides ignorées', () => {
    expect(parseBatchInput('BPCE\n\n  Eiffage \nEngie')).toEqual({
      source: 'names',
      items: [{ name: 'BPCE' }, { name: 'Eiffage' }, { name: 'Engie' }],
      overLimit: 0,
    })
  })

  it('accepte aussi la virgule et le point-virgule comme séparateurs de lignes', () => {
    expect(parseBatchInput('BPCE, Eiffage; Engie').items.map(i => i.name)).toEqual(['BPCE', 'Eiffage', 'Engie'])
  })

  it('un SIREN seul est un IDENTIFIANT (espaces tolérés) ; la liste devient une liste d’identifiants', () => {
    expect(parseBatchInput('552 120 222\n493455042')).toEqual({
      source: 'identifiers',
      items: [
        { name: '552120222', siren: '552120222' },
        { name: '493455042', siren: '493455042' },
      ],
      overLimit: 0,
    })
  })

  it('« Nom (SIREN) » ou « Nom SIREN » garde les deux', () => {
    expect(parseBatchInput('Eiffage (709802094)\nVinci 552037806').items).toEqual([
      { name: 'Eiffage', siren: '709802094' },
      { name: 'Vinci', siren: '552037806' },
    ])
  })

  it('au-delà de la limite, rien n’est tronqué en silence : l’excédent est COMPTÉ', () => {
    const text = Array.from({ length: ANALYSIS_BATCH_MAX_ITEMS + 3 }, (_, i) => `Société ${i}`).join('\n')
    const parsed = parseBatchInput(text)
    expect(parsed.items).toHaveLength(ANALYSIS_BATCH_MAX_ITEMS)
    expect(parsed.overLimit).toBe(3)
  })
})
