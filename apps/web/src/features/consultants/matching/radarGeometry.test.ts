import { describe, expect, it } from 'vitest'
import { MATCH_AXES, type MatchAxisResult } from '@bellum/contracts'
import {
  RADAR_MAX_PROFILES,
  RADAR_MIN_PROFILES,
  axisEvaluability,
  axisSpokes,
  radarSegments,
  type RadarProfile,
} from './radarGeometry'

const GEOMETRY = { centre: 100, radius: 80 }

function axes(scores: readonly (number | null)[]): MatchAxisResult[] {
  return MATCH_AXES.map((axis, index) => ({
    axis,
    score: scores[index] ?? null,
    weight: 8,
    detail: `détail ${axis}`,
    evidence: [],
  }))
}

function profile(id: string, scores: readonly (number | null)[]): RadarProfile {
  return { id, label: `Profil ${id}`, axes: axes(scores) }
}

const ALL_MEASURED = Array.from({ length: MATCH_AXES.length }, () => 50)

describe('tous les axes viennent du contrat, jamais d’une seconde liste', () => {
  it('trace exactement une branche par axe, dans l’ordre du contrat', () => {
    const spokes = axisSpokes(GEOMETRY)
    expect(spokes).toHaveLength(MATCH_AXES.length)
    expect(spokes.map(spoke => spoke.axis)).toEqual([...MATCH_AXES])
  })

  it('place la première branche en haut et tourne dans le sens horaire', () => {
    const [first, second] = axisSpokes(GEOMETRY)
    // En haut : même abscisse que le centre, ordonnée au-dessus.
    expect(first.x).toBeCloseTo(100, 5)
    expect(first.y).toBeCloseTo(20, 5)
    // Un pas plus loin, dans le sens horaire : l'angle avance d'exactement
    // 2π / nombre d'axes — vrai quel que soit le compte, contrairement à un
    // repère « quart de tour » qui suppose une division entière par 4.
    const angleFromCentre = (point: { x: number; y: number }) => Math.atan2(point.y - 100, point.x - 100)
    const step = angleFromCentre(second) - angleFromCentre(first)
    expect(step).toBeCloseTo((2 * Math.PI) / MATCH_AXES.length, 10)
  })

  it('borne le nombre de profils superposés à ce que la source demande', () => {
    expect(RADAR_MIN_PROFILES).toBe(2)
    expect(RADAR_MAX_PROFILES).toBe(4)
  })
})

describe('un axe non évaluable n’est JAMAIS un axe à zéro', () => {
  it('ne pose aucun point là où le score est absent', () => {
    const measured = [...ALL_MEASURED]
    measured[5] = null as unknown as number
    const segments = radarSegments(profile('a', measured), GEOMETRY)
    const plotted = segments.flatMap(segment => segment.map(point => point.index))
    expect(plotted).not.toContain(5)
    // ⚠️ La preuve qui compte : pas de point à 0 non plus. Un zéro tracé dirait
    // « ce profil est mauvais sur cet axe » là où on n'a rien pu juger.
    const centreHits = segments.flatMap(segment =>
      segment.filter(point => point.x === GEOMETRY.centre && point.y === GEOMETRY.centre),
    )
    expect(centreHits).toEqual([])
  })

  it('ROMPT le tracé au lieu de le refermer à travers le trou', () => {
    const measured = [...ALL_MEASURED]
    measured[5] = null as unknown as number
    const segments = radarSegments(profile('a', measured), GEOMETRY)
    // Un seul trou : un seul trait ouvert, qui court de l'axe 6 à l'axe 4 en
    // passant par le haut. Deux traits voudraient dire deux trous.
    expect(segments).toHaveLength(1)
    expect(segments[0][0].index).toBe(6)
    expect(segments[0][segments[0].length - 1].index).toBe(4)
  })

  it('referme le tracé quand tous les axes sont mesurés', () => {
    const segments = radarSegments(profile('a', ALL_MEASURED), GEOMETRY)
    expect(segments).toHaveLength(1)
    expect(segments[0]).toHaveLength(MATCH_AXES.length)
    // Le premier et le dernier point sont voisins : le tracé se referme.
    expect(segments[0][0].index).toBe(0)
    expect(segments[0][12].index).toBe(12)
  })

  it('rend deux traits quand deux trous séparent les axes mesurés', () => {
    const measured = [...ALL_MEASURED]
    measured[2] = null as unknown as number
    measured[8] = null as unknown as number
    const segments = radarSegments(profile('a', measured), GEOMETRY)
    expect(segments).toHaveLength(2)
    expect(segments.map(segment => segment.map(point => point.index))).toEqual([
      [3, 4, 5, 6, 7],
      [9, 10, 11, 12, 13, 14, 0, 1],
    ])
  })

  it('ne trace rien du tout quand rien n’est évaluable', () => {
    expect(
      radarSegments(
        profile(
          'a',
          Array.from({ length: MATCH_AXES.length }, () => null),
        ),
        GEOMETRY,
      ),
    ).toEqual([])
  })

  it('place le point à la distance du score, pas à celle de son rang', () => {
    const measured = Array.from({ length: MATCH_AXES.length }, () => 0)
    measured[0] = 100
    const [segment] = radarSegments(profile('a', measured), GEOMETRY)
    const top = segment.find(point => point.index === 0)
    expect(top?.y).toBeCloseTo(20, 5) // 100/100 × 80 px au-dessus du centre
    const next = segment.find(point => point.index === 3)
    // Un vrai zéro EST tracé : il dit « mauvais », et c'est une mesure.
    expect(next?.x).toBeCloseTo(100, 5)
    expect(next?.y).toBeCloseTo(100, 5)
  })
})

describe('axisEvaluability — ce qui se hachure, et ce qui ne se hachure pas', () => {
  it('« none » quand AUCUN profil affiché n’a pu être jugé sur cet axe', () => {
    const measured = [...ALL_MEASURED]
    measured[4] = null as unknown as number
    const both = [profile('a', measured), profile('b', measured)]
    expect(axisEvaluability(both, 'environment')).toBe('none')
  })

  it('« partial » quand un seul des deux a pu être jugé — la branche ne se hachure pas', () => {
    const withHole = [...ALL_MEASURED]
    withHole[4] = null as unknown as number
    const mixed = [profile('a', withHole), profile('b', ALL_MEASURED)]
    // Hachurer la branche entière dirait « personne n'a pu être jugé ici », ce
    // qui est faux : c'est le TRACÉ du profil concerné qui s'interrompt.
    expect(axisEvaluability(mixed, 'environment')).toBe('partial')
  })

  it('« all » quand tout le monde a été jugé', () => {
    const both = [profile('a', ALL_MEASURED), profile('b', ALL_MEASURED)]
    expect(axisEvaluability(both, 'environment')).toBe('all')
  })

  it('lit l’axe par son NOM, pas par sa position dans le tableau reçu', () => {
    // Un résultat qui ne porterait que quelques axes, dans un autre ordre, ne
    // doit pas décaler la lecture.
    const partialResult: RadarProfile = {
      id: 'a',
      label: 'Profil a',
      axes: [{ axis: 'rate', score: null, weight: 7, detail: '', evidence: [] }],
    }
    expect(axisEvaluability([partialResult], 'rate')).toBe('none')
    // Un axe totalement absent du résultat n'a pas été évalué non plus.
    expect(axisEvaluability([partialResult], 'must_have')).toBe('none')
  })
})
