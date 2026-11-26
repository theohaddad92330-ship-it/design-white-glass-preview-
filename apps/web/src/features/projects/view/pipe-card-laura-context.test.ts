import { describe, expect, it } from 'vitest'
import { pipeCardLauraQuestion } from './pipe-card-laura-context'

/**
 * #2170.53 (tranché sans Louis) — voir le docblock de `pipe-card-laura-context.ts`
 * pour ce que cette tranche livre et ce qu'elle ne livre pas.
 */
const t = ((key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}:${JSON.stringify(opts)}` : key) as unknown as Parameters<typeof pipeCardLauraQuestion>[0]

describe('pipeCardLauraQuestion', () => {
  it('nomme toujours l’opportunité, même sans besoin ni profil connu', () => {
    const question = pipeCardLauraQuestion(t, {
      label: 'Socle data',
      primaryNeedTitle: null,
      positionedCount: undefined,
      interviewCount: undefined,
    })
    expect(question).toBe('pipeline.askLauraCardQuestion.base:{"label":"Socle data"}')
  })

  it('ajoute le besoin principal quand il est rattaché', () => {
    const question = pipeCardLauraQuestion(t, {
      label: 'Socle data',
      primaryNeedTitle: 'Architecte cloud',
      positionedCount: undefined,
      interviewCount: undefined,
    })
    expect(question).toContain('pipeline.askLauraCardQuestion.need:{"need":"Architecte cloud"}')
  })

  it('ajoute le nombre de profils positionnés — jamais sur un compte à zéro', () => {
    const zero = pipeCardLauraQuestion(t, {
      label: 'Socle data',
      primaryNeedTitle: null,
      positionedCount: 0,
      interviewCount: undefined,
    })
    expect(zero).not.toContain('pipeline.askLauraCardQuestion.positioned')

    const three = pipeCardLauraQuestion(t, {
      label: 'Socle data',
      primaryNeedTitle: null,
      positionedCount: 3,
      interviewCount: undefined,
    })
    expect(three).toContain('pipeline.askLauraCardQuestion.positioned:{"count":3}')
  })

  it('ajoute l’entretien en cours, sans le confondre avec les profils positionnés', () => {
    const question = pipeCardLauraQuestion(t, {
      label: 'Socle data',
      primaryNeedTitle: 'Architecte cloud',
      positionedCount: 2,
      interviewCount: 1,
    })
    expect(question).toBe(
      [
        'pipeline.askLauraCardQuestion.base:{"label":"Socle data"}',
        'pipeline.askLauraCardQuestion.need:{"need":"Architecte cloud"}',
        'pipeline.askLauraCardQuestion.positioned:{"count":2}',
        'pipeline.askLauraCardQuestion.interview:{"count":1}',
      ].join(' '),
    )
  })

  /**
   * #2170.53 — « Le bouton Laura ouvre le compte, l'opportunité, les besoins et
   * les profils associés. » Le COMPTE manquait : sans lui, Laura ne sait pas de
   * quel client on parle. #2170.5 — le stade dérivé « en entretien(s) » se dit
   * au pluriel quand plusieurs profils y sont. Et l'exemple de l'issue (« en
   * entretien depuis neuf jours sans retour ») : l'immobilité, quand elle passe
   * le seuil d'étape de l'espace.
   */
  it('nomme le compte de l’opportunité quand il est connu — jamais un compte inventé', () => {
    const withAccount = pipeCardLauraQuestion(t, { ...EMPTY, accountName: 'Acme' })
    expect(withAccount).toContain('pipeline.askLauraCardQuestion.account:{"account":"Acme"}')
    const without = pipeCardLauraQuestion(t, { ...EMPTY, accountName: null })
    expect(without).not.toContain('askLauraCardQuestion.account')
  })

  it('dit « en entretien » au pluriel quand plusieurs profils y sont (#2170.5)', () => {
    const question = pipeCardLauraQuestion(t, { ...EMPTY, interviewCount: 2 })
    expect(question).toContain('pipeline.askLauraCardQuestion.interview:{"count":2}')
  })

  it('dit depuis combien de jours l’affaire n’a pas bougé, seulement au-delà du seuil d’étape', () => {
    const stale = pipeCardLauraQuestion(t, { ...EMPTY, staleDays: 9 })
    expect(stale).toContain('pipeline.askLauraCardQuestion.stale:{"count":9}')
    const fresh = pipeCardLauraQuestion(t, { ...EMPTY, staleDays: null })
    expect(fresh).not.toContain('askLauraCardQuestion.stale')
  })
})

const EMPTY = {
  label: 'Socle data',
  primaryNeedTitle: null,
  positionedCount: undefined,
  interviewCount: undefined,
}
