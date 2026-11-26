import { describe, expect, it } from 'vitest'
import { assessReplySubstance } from './reply-substance.js'
import { replyBlockSchema, type ReplyBlock } from './reply-blocks.js'

const ranking = (items: Array<{ name: string; sourced: boolean }>): ReplyBlock =>
  replyBlockSchema.parse({
    type: 'account_ranking',
    axes: ['Taille'],
    items: items.map(({ name, sourced }) => ({
      name,
      why: ['Une raison écrite'],
      ...(sourced ? { source: { label: 'Registre', as_of: '2026-09' } } : {}),
    })),
  })

const names = (count: number, sourced: number) =>
  Array.from({ length: count }, (_, index) => ({ name: `Compte ${index + 1}`, sourced: index < sourced }))

describe('#3771 — une réponse riche ne maquille jamais une faiblesse de fond', () => {
  it('#3771.1 — une réponse dont chaque carte est étayée ne reçoit AUCUN avis', () => {
    expect(assessReplySubstance([ranking(names(3, 3))])).toEqual([])
  })

  it('#3771.2 — un seul compte n’est pas un classement : la carte le dit', () => {
    const findings = assessReplySubstance([ranking(names(1, 1))])
    expect(findings).toEqual([{ block: 0, type: 'account_ranking', reason: 'list_not_ranking', found: 1, total: 1 }])
  })

  it('#3771.3 — huit comptes dont deux sourcés : 2 sur 8, dit tel quel', () => {
    const findings = assessReplySubstance([ranking(names(8, 2))])
    expect(findings).toEqual([{ block: 0, type: 'account_ranking', reason: 'few_dated_sources', found: 2, total: 8 }])
  })

  it('#3771.3 — aucun compte sourcé : « aucune source datée », jamais « 0 sur N » déguisé', () => {
    const findings = assessReplySubstance([ranking(names(3, 0))])
    expect(findings).toEqual([{ block: 0, type: 'account_ranking', reason: 'no_dated_source', found: 0, total: 3 }])
  })

  it('#3771.4 — une simple liste de contacts sans aucune source le dit aussi', () => {
    const block = replyBlockSchema.parse({
      type: 'contact_list',
      items: [{ name: 'A' }, { name: 'B' }],
    })
    expect(assessReplySubstance([block])).toEqual([
      { block: 0, type: 'contact_list', reason: 'no_dated_source', found: 0, total: 2 },
    ])
  })

  it('#3771.2 — une comparaison aux cellules surtout non mesurées le dit, rang du bloc conservé', () => {
    const comparison = replyBlockSchema.parse({
      type: 'comparison',
      columns: ['A', 'B'],
      rows: [
        { label: 'CA', cells: ['10 M€', null] },
        { label: 'Effectif', cells: [null, null] },
      ],
    })
    const verdict = replyBlockSchema.parse({ type: 'verdict', conclusion: 'Oui', reasons: ['Raison'] })
    expect(assessReplySubstance([verdict, comparison])).toEqual([
      { block: 1, type: 'comparison', reason: 'mostly_unmeasured', found: 1, total: 4 },
    ])
  })

  it('une comparaison à moitié renseignée reste silencieuse sous le seuil, une petite grille aussi', () => {
    const half = replyBlockSchema.parse({
      type: 'comparison',
      columns: ['A', 'B'],
      rows: [
        { label: 'CA', cells: ['1', '2'] },
        { label: 'Effectif', cells: ['3', null] },
      ],
    })
    expect(assessReplySubstance([half])).toEqual([])
  })

  it('les blocs qui NOMMENT déjà une limite (missing_data, count_contract) ne reçoivent jamais d’avis', () => {
    const missing = replyBlockSchema.parse({
      type: 'missing_data',
      missing: [{ what: 'Contacts', how: 'Importer' }],
    })
    expect(assessReplySubstance([missing])).toEqual([])
  })
  // #4065 — le constat ne compte jamais un plafond interne (20) à côté d'un tableau de 82 lignes.
  it('#4065 — une carte de 20 lignes à côté d’un tableau de 82 : aucune note chiffrée « 20 »', () => {
    const table = replyBlockSchema.parse({
      type: 'file_export',
      filename: 'comptes.csv',
      columns: ['Nom'],
      rows: Array.from({ length: 82 }, (_, index) => ({ cells: [`Compte ${index + 1}`] })),
    })
    expect(assessReplySubstance([ranking(names(20, 0)), table]).filter(f => f.total === 20)).toEqual([])
    expect(assessReplySubstance([ranking(names(20, 0))])).toHaveLength(1)
  })
})
