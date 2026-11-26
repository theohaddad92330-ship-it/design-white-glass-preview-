import { beforeAll, describe, expect, it } from 'vitest'
import { loadPlaceRegions, placeOfTitle, regionCodesOfPlace } from './place-region'

beforeAll(async () => {
  await loadPlaceRegions()
})

describe('lot 772 c) — un lieu écrit → sa région, par le référentiel des communes (jamais deviné)', () => {
  it('« Villeurbanne/Lyon » → Auvergne-Rhône-Alpes (une seule fois)', () => {
    expect(regionCodesOfPlace('Villeurbanne/Lyon')).toEqual(['84'])
    expect(regionCodesOfPlace('Villeurbanne')).toEqual(['84'])
  })

  it('une commune hors du petit dictionnaire de métropoles : Roubaix → Hauts-de-France, Montpellier → Occitanie', () => {
    expect(regionCodesOfPlace('Roubaix')).toEqual(['32'])
    expect(regionCodesOfPlace('Montpellier')).toEqual(['76'])
  })

  it('un code postal ou un département entre parenthèses', () => {
    expect(regionCodesOfPlace('59000 Lille')).toEqual(['32'])
    expect(regionCodesOfPlace('Quelque part (69)')).toEqual(['84'])
    expect(regionCodesOfPlace('92100 Boulogne-Billancourt')).toEqual(['11'])
  })

  it('un homonyme qui traverse des régions, une zone vague, un texte vide : aucune région', () => {
    expect(regionCodesOfPlace('Saint-Denis')).toEqual([])
    expect(regionCodesOfPlace('France')).toEqual([])
    expect(regionCodesOfPlace('Remote')).toEqual([])
    expect(regionCodesOfPlace('')).toEqual([])
  })

  it('le lieu d’un intitulé reformulé : « … à Villeurbanne/Lyon. »', () => {
    expect(
      placeOfTitle(
        'Viveris publie une offre CDI de Développeur Java senior pour le secteur bancaire à Villeurbanne/Lyon.',
      ),
    ).toBe('Villeurbanne/Lyon')
    expect(placeOfTitle('Une offre de Product Owner a été publiée à Paris.')).toBe('Paris')
    expect(placeOfTitle('Développeur Android Java SoftPOS à Montpellier')).toBe('Montpellier')
    expect(placeOfTitle('Refonte du portail fournisseurs')).toBeNull()
  })
})
