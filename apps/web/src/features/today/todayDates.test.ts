import { describe, expect, it } from 'vitest'
import { dueDate, postponeChoices, sectionOfDue, toLocalDayKey, withDayKeepingTime } from './todayDates'

// Mercredi 14/10/2026, 10 h — heure LOCALE : les tests ne dépendent pas du fuseau.
const NOW = new Date(2026, 9, 14, 10, 0, 0)

describe('toLocalDayKey', () => {
  it('rend le jour calendaire local', () => {
    expect(toLocalDayKey(new Date(2026, 9, 14, 23, 59))).toBe('2026-10-14')
    expect(toLocalDayKey(new Date(2026, 0, 3, 0, 1))).toBe('2026-01-03')
  })
})

describe('sectionOfDue', () => {
  it('une date passée est en retard', () => {
    expect(sectionOfDue('2026-10-13', NOW)).toBe('overdue')
    expect(sectionOfDue(new Date(2026, 9, 10, 9, 0).toISOString(), NOW)).toBe('overdue')
  })
  it('le jour même — même une heure déjà passée — est « aujourd’hui », pas en retard', () => {
    expect(sectionOfDue('2026-10-14', NOW)).toBe('today')
    expect(sectionOfDue(new Date(2026, 9, 14, 7, 0).toISOString(), NOW)).toBe('today')
    expect(sectionOfDue(new Date(2026, 9, 14, 18, 0).toISOString(), NOW)).toBe('today')
  })
  it('les six jours suivants sont « cette semaine »', () => {
    expect(sectionOfDue('2026-10-15', NOW)).toBe('week')
    expect(sectionOfDue('2026-10-20', NOW)).toBe('week')
  })
  it('au-delà : plus tard', () => {
    expect(sectionOfDue('2026-10-21', NOW)).toBe('later')
  })
  it('sans échéance ou illisible : null — jamais une date inventée', () => {
    expect(sectionOfDue(null, NOW)).toBeNull()
    expect(sectionOfDue('pas une date', NOW)).toBeNull()
  })
})

describe('postponeChoices', () => {
  it('demain, dans 3 jours, lundi prochain', () => {
    expect(postponeChoices(NOW)).toEqual([
      { key: 'tomorrow', date: '2026-10-15' },
      { key: 'in3days', date: '2026-10-17' },
      { key: 'nextMonday', date: '2026-10-19' },
    ])
  })
  it('un lundi, « lundi prochain » est dans 7 jours (jamais aujourd’hui)', () => {
    const monday = new Date(2026, 9, 12, 10, 0)
    expect(postponeChoices(monday).find(c => c.key === 'nextMonday')?.date).toBe('2026-10-19')
  })
  it('un dimanche, « lundi prochain » est demain — et se distingue quand même de « demain » par la clé', () => {
    const sunday = new Date(2026, 9, 18, 10, 0)
    expect(postponeChoices(sunday).find(c => c.key === 'nextMonday')?.date).toBe('2026-10-19')
  })
  it('passe le mois et l’année', () => {
    const eve = new Date(2026, 11, 30, 10, 0)
    expect(postponeChoices(eve)[0]?.date).toBe('2026-12-31')
    expect(postponeChoices(eve)[1]?.date).toBe('2027-01-02')
  })
})

describe('withDayKeepingTime', () => {
  it('pose le jour choisi en gardant l’heure d’origine', () => {
    const original = new Date(2026, 9, 12, 8, 30).toISOString()
    const moved = new Date(withDayKeepingTime(original, '2026-10-19', NOW))
    expect(toLocalDayKey(moved)).toBe('2026-10-19')
    expect(moved.getHours()).toBe(8)
    expect(moved.getMinutes()).toBe(30)
  })
  it('sans échéance d’origine : 9 h du jour choisi', () => {
    const moved = new Date(withDayKeepingTime(null, '2026-10-19', NOW))
    expect(toLocalDayKey(moved)).toBe('2026-10-19')
    expect(moved.getHours()).toBe(9)
  })
})

describe('dueDate', () => {
  it('lit un jour comme le jour LOCAL, jamais décalé par le fuseau', () => {
    expect(toLocalDayKey(dueDate('2026-10-14') as Date)).toBe('2026-10-14')
    expect(toLocalDayKey(dueDate(new Date(2026, 9, 14, 23, 30).toISOString()) as Date)).toBe('2026-10-14')
  })
  it('absente ou illisible : null', () => {
    expect(dueDate(null)).toBeNull()
    expect(dueDate('n’importe quoi')).toBeNull()
  })
})
