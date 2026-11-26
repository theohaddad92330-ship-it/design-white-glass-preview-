import { describe, expect, it } from 'vitest'
import { committeeSeatsHeldByContact, committeeSeatsHeldByTitle } from './committee-seat-titles.js'

// #4324.1 — une place n'est « à pourvoir » que si AUCUN contact du dossier ne peut la tenir.
describe('committeeSeatsHeldByTitle (#4324.1) — un intitulé voisin tient la place', () => {
  it.each([
    ['Responsable de Domaine IT / Pole Transport & Logistique', 'technical'],
    ['IT Infrastructure and Security Manager', 'technical'],
    ['CIO', 'technical'],
    ['Head of IT', 'technical'],
    ['IT Director', 'technical'],
    ['CFO', 'economic'],
    ['Chief Financial Officer', 'economic'],
    ['Directeur Administratif et Financier', 'economic'],
    ['DAF', 'economic'],
    ['Chief Procurement Officer', 'procurement'],
    ['Directeur des Achats', 'procurement'],
    ['Head of Procurement', 'procurement'],
  ] as const)('%s tient %s', (title, seat) => {
    expect(committeeSeatsHeldByTitle(title)).toContain(seat)
  })

  // Le test qui prouve que la garde sait dire NON : sans lui le correctif ne vaut rien.
  it.each([
    null,
    undefined,
    '',
    'Directeur Commercial',
    'Responsable RH',
    'Chauffeur livreur',
    'Stagiaire DSI',
    'Assistante de direction',
    'Comptable',
    'Responsable sécurité incendie',
    'Développeur Java',
  ])('%s ne tient aucune place critique', title => {
    expect(committeeSeatsHeldByTitle(title)).toEqual([])
  })

  it('un Responsable Achats IT tient les achats, pas le siège technique', () => {
    expect(committeeSeatsHeldByTitle('Responsable Achats IT')).toEqual(['procurement'])
  })
})

describe('committeeSeatsHeldByContact (#4324.1) — « à qualifier » n’est pas « absent »', () => {
  it('un rôle « unknown » (À qualifier) laisse le titre parler', () => {
    expect(committeeSeatsHeldByContact({ title: 'Responsable de Domaine IT', decision_role: 'unknown' })).toEqual([
      'technical',
    ])
  })

  it('un rôle posé n’est jamais écrasé par le titre', () => {
    expect(committeeSeatsHeldByContact({ title: 'CFO', decision_role: 'user' })).toEqual([])
    expect(committeeSeatsHeldByContact({ title: 'Chauffeur', decision_role: 'economic' })).toEqual(['economic'])
  })

  it('l’ancien rôle « purchasing » tient les achats', () => {
    expect(committeeSeatsHeldByContact({ title: null, decision_role: 'purchasing' })).toEqual(['procurement'])
  })
})
