import { describe, expect, it } from 'vitest'
import { looksLikePersonName } from './personName'

// #4399.5 — recette prod 22/10 : le plan de TotalEnergies listait ~90 « personnes » dont des intitulés,
// des entités et des chaînes vides. Seule une personne (prénom + nom) entre dans la liste des personnes.
describe('looksLikePersonName (#4399.5)', () => {
  it.each([
    'Claire Dupont',
    'Jean-Pierre Martin',
    'Denis P.',
    'Marie de La Fontaine',
    'Élodie O’Brien',
    'Ahmed ben Ali',
  ])('« %s » est une personne', name => expect(looksLikePersonName(name)).toBe(true))
  it.each([
    '',
    '   ',
    'Directeur des systèmes d’information',
    'Responsable achats',
    'Chief Digital Officer',
    'TotalEnergies SE',
    'Groupe Total',
    'Direction Digitale',
    'Consulting Services',
    'DSI',
    'Claire',
    'Projet 2025',
    'n/a',
    'Marie Dupont, Directrice, Paris, France, Europe',
  ])('« %s » n’est pas une personne', name => expect(looksLikePersonName(name)).toBe(false))
})
