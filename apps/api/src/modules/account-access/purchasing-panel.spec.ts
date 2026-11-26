import { ANSWER_DETAIL, purchasingPanelOf } from './purchasing-panel'

// #3278.2 — le sous-aspect « panel/référencement » du processus d'achat.
describe('purchasingPanelOf', () => {
  it.each(['panel_ferme', 'panel_ouvert', 'refus_referencement'] as const)(
    'relit la réponse %s depuis le détail que le geste humain a écrit',
    answer => {
      expect(purchasingPanelOf({ source: 'human', detail: ANSWER_DETAIL[answer] ?? null })).toBe(answer)
    },
  )

  it('rend null sans fait de verrou — jamais un « pas de panel » deviné', () => {
    expect(purchasingPanelOf(null)).toBeNull()
  })

  it('rend null pour un verrou qui ne vient pas de la question panel (détail libre)', () => {
    expect(purchasingPanelOf({ source: 'human', detail: 'un concurrent est en place' })).toBeNull()
    expect(purchasingPanelOf({ source: 'human', detail: null })).toBeNull()
  })

  it('rend null quand le fait n’est pas déclaré par un humain, même au texte identique', () => {
    expect(purchasingPanelOf({ source: 'pipeline', detail: ANSWER_DETAIL.panel_ferme ?? null })).toBeNull()
  })
})
