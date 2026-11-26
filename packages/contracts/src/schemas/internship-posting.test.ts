import { describe, expect, it } from 'vitest'
import cases from '../fixtures/internship-postings.json' with { type: 'json' }
import { dropInternshipRows, isInternshipPosting, withoutInternshipSignals } from './internship-posting.js'

type Case = { title: string | null; contractType?: string }

describe('isInternshipPosting — #4044 une offre de STAGE n’est jamais un signal', () => {
  it.each((cases.yes as Case[]).map(c => [c.title, c.contractType ?? null] as const))(
    'OUI : %s / %s',
    (title, contractType) => {
      expect(isInternshipPosting(title, contractType)).toBe(true)
    },
  )

  it.each((cases.no as Case[]).map(c => [c.title, (c as Case).contractType ?? null] as const))(
    'NON : %s / %s',
    (title, contractType) => {
      expect(isInternshipPosting(title, contractType)).toBe(false)
    },
  )

  it('ne filtre PAS l’alternance (non tranchée)', () => {
    expect(isInternshipPosting('Alternance Développeur', 'Contrat d’apprentissage')).toBe(false)
  })
})

describe('dropInternshipRows / withoutInternshipSignals — #4044 le rattrapage de l’existant à la lecture', () => {
  const stage = { signal: 'CS27 - Bac 5 - Stage Supply Chain H/F', type: 'recrutement', date: '2026-10-01' }
  const cdi = { signal: 'Architecte cloud (CDI)', type: 'recrutement', date: '2026-10-02' }
  const news = { signal: 'Levée de fonds : programme de stage de croissance', type: 'fundraise' }

  it('écarte une ligne de recrutement qui est un stage, garde le reste (une actualité qui dit « stage » reste)', () => {
    expect(dropInternshipRows([stage, cdi, news], { jobsOnly: true })).toEqual([cdi, news])
  })

  it('une ligne de la liste des offres (`it_job_signals`) se juge sur title + contractType', () => {
    const jobs = [
      { title: 'Développeur Java', contractType: 'Stage' },
      { title: 'Développeur Java', contractType: 'CDI' },
    ]
    expect(dropInternshipRows(jobs)).toEqual([{ title: 'Développeur Java', contractType: 'CDI' }])
  })

  it('un non-tableau et les lignes illisibles passent tels quels (jamais d’exception)', () => {
    expect(dropInternshipRows(null)).toEqual([])
    expect(dropInternshipRows(['x', 3, null])).toEqual(['x', 3, null])
  })

  it('withoutInternshipSignals nettoie recent_signals ET raw_analysis (recent_signals + it_job_signals), sans muter', () => {
    const account = {
      id: 'a1',
      recent_signals: [stage, cdi],
      raw_analysis: {
        recent_signals: [stage, cdi],
        it_job_signals: [{ title: 'Stage BAC1 Opérateur' }, { title: 'DSI adjoint' }],
        other: 1,
      },
    }
    const out = withoutInternshipSignals(account)
    expect(out.recent_signals).toEqual([cdi])
    expect(out.raw_analysis).toEqual({
      recent_signals: [cdi],
      it_job_signals: [{ title: 'DSI adjoint' }],
      other: 1,
    })
    expect(account.recent_signals).toHaveLength(2)
  })

  it('un compte sans ces clés revient inchangé (même référence)', () => {
    const account = { id: 'a2', recent_signals: [], raw_analysis: null }
    expect(withoutInternshipSignals(account)).toBe(account)
  })
})
