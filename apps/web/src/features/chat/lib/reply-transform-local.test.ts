import { describe, expect, it } from 'vitest'
import { replyTransformRequestFor } from '@bellum/contracts'
import { localReplyTransform, type LocalTransformLabels } from './reply-transform-local'

const ID_A = '0b6f3d5e-1c1a-4a53-9a40-2f1f0e0c1a11'
const SOURCE = [
  'Voici les comptes à traiter :',
  '',
  `1. [Alpha](/accounts/${ID_A}) — contrat en fin de cycle. Le DSI vient de changer.`,
  '2. Beta — nouveau DSI',
  '3. Gamma — appel d’offres ouvert',
  '4. Delta — budget gelé',
  '',
  'La cartographie est partielle : seuls les comptes déjà analysés sont couverts.',
].join('\n')

const LABELS: LocalTransformLabels = {
  setAside: count => `${count} élément(s) mis de côté.`,
  planTitle: 'Plan d’action',
  tableHead: ['#', 'Élément', 'Détail'],
}

const run = (id: Parameters<typeof replyTransformRequestFor>[0], source = SOURCE) =>
  localReplyTransform(replyTransformRequestFor(id, source), LABELS)

describe('localReplyTransform — ce qui se déduit du texte, sans rien inventer', () => {
  it('priorities_only garde les trois premiers éléments, dit combien sont mis de côté et redit la réserve', () => {
    const out = run('priorities_only')!
    expect(out).toContain('Alpha')
    expect(out).toContain('Gamma')
    expect(out).not.toContain('Delta')
    expect(out).toContain('1 élément(s) mis de côté.')
    expect(out).toContain('La cartographie est partielle')
  })

  it('less_detail garde le nom et la raison, retire la suite, garde la réserve', () => {
    const out = run('less_detail')!
    expect(out).toContain('contrat en fin de cycle')
    expect(out).not.toContain('Le DSI vient de changer')
    expect(out).toContain('La cartographie est partielle')
  })

  it('exportable_list rend un tableau Markdown, cellule vide quand le détail manque', () => {
    const out = run('exportable_list', '1. Alpha\n2. Beta — nouveau DSI')!
    expect(out).toContain('| # | Élément | Détail |')
    expect(out).toContain('| 1 | Alpha |  |')
    expect(out).toContain('| 2 | Beta | nouveau DSI |')
  })

  it('action_plan numérote des étapes sous un titre de plan', () => {
    const out = run('action_plan')!
    expect(out.startsWith('## Plan d’action')).toBe(true)
    expect(out).toContain('1. [Alpha]')
    expect(out).toContain('La cartographie est partielle')
  })

  it('synthesize tient en peu de lignes et garde la réserve', () => {
    const out = run('synthesize')!
    expect(out.split('\n').length).toBeLessThanOrEqual(5)
    expect(out).toContain('La cartographie est partielle')
  })

  it('rend null pour les gestes qui exigent de NOUVELLES données (rien n’est inventé)', () => {
    for (const id of ['deepen', 'more_accounts', 'justify'] as const) expect(run(id)).toBeNull()
  })

  it('rend null quand la source n’a rien à transformer (aucun élément)', () => {
    expect(run('priorities_only', 'Une phrase sans liste.')).toBeNull()
    expect(run('exportable_list', 'Une phrase sans liste.')).toBeNull()
  })
})
