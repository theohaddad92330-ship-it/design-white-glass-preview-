import { employmentLeftFromHistory, employmentLeftOf } from './employment-left'

/**
 * #4290.12 — « a quitté l'entreprise » ne se pose que sur une PREUVE datée : un autre employeur observé à la
 * relecture. La liste des contacts lit cette preuve (`raw_data.employmentCheck`) sans traîner `raw_data` entier.
 */
describe('employmentLeftOf', () => {
  it('rend l’employeur observé et la date quand la relecture dit « left »', () => {
    expect(
      employmentLeftOf({ state: 'left', at: '2026-10-08T10:00:00.000Z', organization: ' Orange Business ' }),
    ).toEqual({ organization: 'Orange Business', at: '2026-10-08T10:00:00.000Z' })
  })

  it('sait dire NON : « non retrouvé », sans employeur, sans date lisible, ou sans relecture ne vaut pas départ', () => {
    expect(employmentLeftOf({ state: 'not_found', at: '2026-10-08T10:00:00.000Z' })).toBeNull()
    expect(employmentLeftOf({ state: 'left', at: '2026-10-08T10:00:00.000Z', organization: '  ' })).toBeNull()
    expect(employmentLeftOf({ state: 'left', at: 'pas-une-date', organization: 'Orange' })).toBeNull()
    expect(employmentLeftOf(null)).toBeNull()
    expect(employmentLeftOf('left')).toBeNull()
  })
})

/**
 * #4465.2 (recette 23/10, CAFPI) — « a quitté l'entreprise » se lit aussi sur le PARCOURS : l'expérience chez
 * l'employeur du compte a une date de fin et aucune autre n'y est en cours. Sans relecture d'annuaire.
 */
describe('employmentLeftFromHistory (#4465.2)', () => {
  const history = (...entries: Record<string, unknown>[]) => ({ apolloDetails: { employmentHistory: entries } })

  it('le poste chez l’employeur du compte a une date de fin ⇒ parti, à cette date, avec l’employeur actuel s’il est connu', () => {
    const raw = history(
      { title: 'Directeur', organization: 'Orange', current: true, start_date: '2024-05-01' },
      {
        title: 'Responsable IT',
        organization: 'Cafpi SA',
        current: false,
        start_date: '2019-01-01',
        end_date: '2024-03-31',
      },
    )
    expect(employmentLeftFromHistory(raw, 'CAFPI')).toEqual({ organization: 'Orange', at: '2024-03-31' })
  })

  it('sans employeur actuel connu : parti quand même, employeur vide (rien n’est deviné)', () => {
    const raw = history({ title: 'Responsable IT', organization_name: 'CAFPI', end_date: '2024-03' })
    expect(employmentLeftFromHistory(raw, 'Cafpi')).toEqual({ organization: '', at: '2024-03' })
  })

  it('sait dire NON : un poste en cours chez l’employeur, aucune fin datée, un autre employeur, ou rien à lire', () => {
    expect(
      employmentLeftFromHistory(
        history(
          { title: 'DSI', organization: 'CAFPI', current: true },
          { title: 'Ancien poste', organization: 'CAFPI', end_date: '2020-01-01' },
        ),
        'CAFPI',
      ),
    ).toBeNull()
    expect(
      employmentLeftFromHistory(history({ title: 'DSI', organization: 'CAFPI', current: false }), 'CAFPI'),
    ).toBeNull()
    expect(
      employmentLeftFromHistory(history({ title: 'DSI', organization: 'Orange', end_date: '2020-01-01' }), 'CAFPI'),
    ).toBeNull()
    expect(employmentLeftFromHistory({}, 'CAFPI')).toBeNull()
    expect(
      employmentLeftFromHistory(history({ title: 'DSI', organization: 'CAFPI', end_date: 'pas-une-date' }), 'CAFPI'),
    ).toBeNull()
    expect(
      employmentLeftFromHistory(history({ title: 'DSI', organization: 'CAFPI', end_date: '2020-01-01' }), ''),
    ).toBeNull()
  })
})
