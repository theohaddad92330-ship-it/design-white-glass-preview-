import { describe, expect, it } from 'vitest'
import { markClientHistory, type ClientHistoryEntry } from './client-history-flag.js'

/**
 * Le drapeau « déjà vu chez ce client » (PDF 3 §7.2, BEL-ATS-205).
 *
 * « C'est la façon la plus rapide de perdre un compte que de repousser un
 * profil refusé. » Ce que ces tests protègent : un SILENCE ne doit jamais être
 * peint en rouge, et un refus doit survivre à tout le reste.
 */
const entry = (over: Partial<ClientHistoryEntry> = {}): ClientHistoryEntry => ({
  consultantId: 'c1',
  stage: 'rejected',
  outcomeReason: 'skills',
  closedAt: '2026-01-15T00:00:00.000Z',
  ...over,
})

describe('markClientHistory', () => {
  it('rend `null` quand la personne n’est jamais passée chez ce client', () => {
    // Afficher « jamais vu » sur tout le vivier noierait le seul badge qui
    // compte.
    expect(markClientHistory('c1', [])).toBeNull()
    expect(markClientHistory('c1', [entry({ consultantId: 'autre' })])).toBeNull()
  })

  it('signale un REFUS avec son motif et sa date', () => {
    const mark = markClientHistory('c1', [entry()])
    expect(mark).toEqual({
      flag: 'rejected',
      reason: 'skills',
      at: '2026-01-15T00:00:00.000Z',
      recoverable: false,
    })
  })

  it('distingue un SILENCE d’un refus', () => {
    const mark = markClientHistory('c1', [entry({ outcomeReason: 'no_feedback' })])
    expect(mark?.flag).toBe('no_feedback')
    // Et il n'est pas « récupérable » : ce n'est pas un refus du tout.
    expect(mark?.recoverable).toBe(false)
  })

  it('distingue un refus REJOUABLE d’un refus définitif', () => {
    // « Trop cher » dit « pas maintenant » ; « compétences » dit « pas cette
    // personne ». Les traiter pareil ferait perdre des profils repositionnables.
    expect(markClientHistory('c1', [entry({ outcomeReason: 'price' })])?.recoverable).toBe(true)
    expect(markClientHistory('c1', [entry({ outcomeReason: 'availability' })])?.recoverable).toBe(true)
    expect(markClientHistory('c1', [entry({ outcomeReason: 'seniority' })])?.recoverable).toBe(false)
  })

  it('le REFUS l’emporte sur tout le reste', () => {
    // C'est lui qui coûte un compte : un passage plus récent et plus flatteur
    // ne doit pas le cacher.
    const mark = markClientHistory('c1', [
      entry({ stage: 'submitted', outcomeReason: null, closedAt: null }),
      entry({ outcomeReason: 'no_feedback' }),
      entry(),
    ])
    expect(mark?.flag).toBe('rejected')
  })

  it('signale un profil ENCORE en cours chez ce client', () => {
    const mark = markClientHistory('c1', [entry({ stage: 'interview', outcomeReason: null, closedAt: null })])
    expect(mark?.flag).toBe('submitted')
  })

  it('ne signale RIEN pour un profil retiré par l’ESN', () => {
    // Un retrait vient de nous, pas du client : il ne dit rien de ce que le
    // client pense de la personne.
    expect(markClientHistory('c1', [entry({ stage: 'withdrawn', outcomeReason: null })])).toBeNull()
  })

  it('signale un profil DÉJÀ retenu chez ce client', () => {
    const mark = markClientHistory('c1', [entry({ stage: 'accepted', outcomeReason: null, closedAt: null })])
    expect(mark?.flag).toBe('accepted')
  })
})
