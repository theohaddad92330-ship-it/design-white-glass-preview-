import type { ProjectLearningRow } from '@bellum/contracts'
import { renderWorkspaceLearning } from './workspace-learning'

const row = (over: Partial<ProjectLearningRow> = {}): ProjectLearningRow => ({
  sector: 'Banque',
  offer: 'Cloud',
  kind: 'pain',
  converted: 0,
  transformed: 0,
  obsolete: 0,
  ...over,
})

/**
 * Boucle d'apprentissage (§6). Deux propriétés comptent : le SILENCE par défaut
 * (une équipe qui n'a rien déplacé lance un run byte-identique à avant la
 * feature) et le fait que le bloc ne dise QUE ce qui a été réellement compté.
 */
describe('renderWorkspaceLearning', () => {
  it('reste vide quand rien n’a été déplacé — pas d’apprentissage inventé', () => {
    expect(renderWorkspaceLearning([])).toBe('')
    expect(renderWorkspaceLearning([row()])).toBe('')
  })

  it('cite les comptages réels, secteur et offre', () => {
    expect(renderWorkspaceLearning([row({ converted: 3, obsolete: 1 })])).toBe(
      '- Banque · Cloud : 3 convertis, 1 déclaré obsolète',
    )
  })

  it('n’écrit que les issues non nulles', () => {
    const line = renderWorkspaceLearning([row({ transformed: 2 })])
    expect(line).toContain('2 transformés en action')
    expect(line).not.toContain('converti')
    expect(line).not.toContain('obsolète')
  })

  it('n’invente ni secteur ni offre quand ils manquent', () => {
    expect(renderWorkspaceLearning([row({ sector: null, offer: null, converted: 1 })])).toBe(
      '- sans secteur ni offre rattachés : 1 converti',
    )
    expect(renderWorkspaceLearning([row({ offer: null, converted: 1 })])).toBe('- Banque : 1 converti')
  })

  it('met les cellules les plus documentées en tête', () => {
    const out = renderWorkspaceLearning([
      row({ offer: 'Data', converted: 1 }),
      row({ offer: 'Cloud', converted: 4 }),
      row({ offer: 'Cyber', transformed: 9 }),
    ])
    expect(out.split('\n').map(line => line.split(' : ')[0])).toEqual([
      '- Banque · Cloud',
      '- Banque · Data',
      '- Banque · Cyber',
    ])
  })

  it('borne le bloc — une leçon, pas un export', () => {
    const many = Array.from({ length: 40 }, (_, i) => row({ offer: `Offre ${i}`, converted: 1 }))
    expect(renderWorkspaceLearning(many).split('\n')).toHaveLength(12)
  })
})
