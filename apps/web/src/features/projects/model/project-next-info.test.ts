import type { Submission } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { nextInformation } from './project-next-info'

const sub = (over: Partial<Submission>): Submission =>
  ({
    id: 's1',
    consultantName: 'Camille Moreau',
    stage: 'submitted',
    substatus: 'presented',
    firstFeedbackAt: null,
    ...over,
  }) as Submission

describe('projects-fiche.R3 — « la prochaine information utile », un seul bandeau', () => {
  it('une affaire gagnée sans mission : préparer la mission, rien n’est créé avant relecture', () => {
    expect(nextInformation({ stage: 'won', hasMission: false }, [])).toEqual({ kind: 'prepareMission' })
  })

  it('une affaire gagnée avec sa mission : ouvrir la mission', () => {
    expect(nextInformation({ stage: 'won', hasMission: true }, [])).toEqual({ kind: 'openMission' })
  })

  it('une présentation consignée sans retour : le retour client est la prochaine information', () => {
    expect(nextInformation({ stage: 'profiles_submitted', hasMission: false }, [sub({})])).toEqual({
      kind: 'clientFeedback',
      name: 'Camille Moreau',
    })
  })

  it('une présentation qui a déjà un retour ne devient pas la prochaine information', () => {
    expect(
      nextInformation({ stage: 'profiles_submitted', hasMission: false }, [sub({ firstFeedbackAt: '2026-10-18' })]),
    ).toEqual({ kind: 'primaryAction' })
  })

  it('une sortie (perdue, en sommeil) n’a pas de bandeau : rien à pousser', () => {
    expect(nextInformation({ stage: 'lost', hasMission: false }, [])).toBeNull()
    expect(nextInformation({ stage: 'dormant', hasMission: false }, [])).toBeNull()
  })

  it('sans présentation en attente : l’action principale de l’étape, comme avant', () => {
    expect(nextInformation({ stage: 'qualified', hasMission: false }, [])).toEqual({ kind: 'primaryAction' })
  })
})
