import { MATCH_AXES, type MatchAxis, type MatchAxisResult } from '@bellum/contracts'

/**
 * La géométrie du radar de rapprochement — 13 axes, 2 à 4 profils (PDF 5 §4.6,
 * PDF 15 §8 visualisation n°5, BEL-ATS-008).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES TREIZE AXES NE SONT PAS REDÉFINIS ICI
 * ─────────────────────────────────────────────────────────────────────────
 * `MATCH_AXES` vient du contrat, qui est aussi ce que le moteur déterministe
 * calcule (`apps/api/src/modules/consultants/matching/axes.ts`). Deux listes
 * divergeraient en silence : le radar dessinerait douze branches pendant que le
 * moteur en noterait treize, et personne ne verrait laquelle manque.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN TRACÉ QUI SE ROMPT, ET PAS UN POLYGONE PLEIN
 * ─────────────────────────────────────────────────────────────────────────
 * C'est le cœur de l'exigence, pas une décoration. Un axe non évaluable rend
 * `score: null` dans tout le dépôt — il SORT du dénominateur au lieu de coûter
 * des points. Un polygone, lui, doit passer par treize sommets : le tracer avec
 * un sommet manquant oblige soit à le poser au centre (c'est-à-dire à 0, donc
 * à dire « ce profil est mauvais sur cet axe »), soit à refermer la figure à
 * travers le trou (donc à interpoler une valeur que personne n'a mesurée).
 *
 * Les deux mentent, et le second ment plus discrètement. Le tracé se ROMPT
 * donc : il court d'un sommet mesuré au suivant tant qu'ils sont voisins, et
 * s'interrompt sur un trou. Un lecteur voit un trait ouvert, pas une figure
 * pleine qui aurait l'air complète.
 *
 * ⚠️ Un vrai zéro, lui, EST tracé, au centre : « 0 » est une mesure, et la
 * distinguer d'une absence est exactement ce que ce fichier existe pour faire.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI SE HACHURE
 * ─────────────────────────────────────────────────────────────────────────
 * La branche entière se hachure quand AUCUN des profils affichés n'a pu être
 * jugé dessus (`none`) — c'est là qu'on peut dire « on n'a pas pu juger » sans
 * se tromper. Quand un seul des profils manque à l'appel (`partial`), hachurer
 * la branche affirmerait la même chose de tout le monde : c'est le tracé de ce
 * profil-là qui s'interrompt, et le tableau nomme lequel.
 */

/** « 2 à 4 profils superposés » (§4.6). Au-delà, on ne lit plus rien. */
export const RADAR_MIN_PROFILES = 2
export const RADAR_MAX_PROFILES = 4

export type RadarProfile = {
  id: string
  label: string
  axes: readonly MatchAxisResult[]
}

export type RadarGeometry = {
  /** Centre du carré de dessin, en unités de la boîte de vue. */
  centre: number
  /** Rayon d'un score de 100. */
  radius: number
}

type RadarPoint = {
  /** Le rang de l'axe dans {@link MATCH_AXES} — jamais son rang dans le résultat reçu. */
  index: number
  axis: MatchAxis
  score: number
  x: number
  y: number
}

/** Où pointe chaque branche, à pleine longueur. */
type RadarSpoke = { index: number; axis: MatchAxis; x: number; y: number }

/**
 * L'angle d'un axe : la première branche en haut, puis dans le sens horaire.
 *
 * Le haut est le point de départ que tout le monde cherche des yeux, et l'ordre
 * horaire est celui de la lecture — l'ordre du §3, dans lequel les axes sont
 * aussi calculés et expliqués. Un ordre différent d'un écran à l'autre rendrait
 * deux radars du même profil incomparables.
 */
function angleOf(index: number, count: number): number {
  return -Math.PI / 2 + (index * 2 * Math.PI) / count
}

function pointAt(index: number, count: number, ratio: number, geometry: RadarGeometry): { x: number; y: number } {
  const angle = angleOf(index, count)
  return {
    x: geometry.centre + Math.cos(angle) * geometry.radius * ratio,
    y: geometry.centre + Math.sin(angle) * geometry.radius * ratio,
  }
}

export function axisSpokes(geometry: RadarGeometry): RadarSpoke[] {
  return MATCH_AXES.map((axis, index) => ({ index, axis, ...pointAt(index, MATCH_AXES.length, 1, geometry) }))
}

/** Le score d'un profil sur un axe NOMMÉ — `null` si absent ou non évaluable. */
function scoreOf(profile: RadarProfile, axis: MatchAxis): number | null {
  const result = profile.axes.find(entry => entry.axis === axis)
  // Un axe absent du résultat n'a pas été évalué non plus : `undefined` et
  // `null` disent la même chose ici, et ni l'un ni l'autre ne vaut zéro.
  return result?.score ?? null
}

/**
 * Le tracé d'un profil, découpé en traits continus.
 *
 * Chaque trait court sur des axes VOISINS tous mesurés. Le radar étant
 * circulaire, la suite est cyclique : un trou unique rend UN trait ouvert qui
 * enjambe le haut de la figure, et aucun trou n'en rend qu'un seul, fermé.
 */
export function radarSegments(profile: RadarProfile, geometry: RadarGeometry): RadarPoint[][] {
  const count = MATCH_AXES.length
  const scores = MATCH_AXES.map(axis => scoreOf(profile, axis))
  const measured = scores.map(score => score !== null)

  if (measured.every(Boolean)) {
    return [
      MATCH_AXES.map((axis, index) => ({
        index,
        axis,
        score: scores[index] as number,
        ...pointAt(index, count, (scores[index] as number) / 100, geometry),
      })),
    ]
  }

  // Repartir APRÈS un trou : sans ça, un trait qui enjambe le haut serait coupé
  // en deux au douzième axe, et le lecteur verrait deux ruptures pour un trou.
  const start = measured.findIndex(value => !value)
  if (start === -1) return []

  const segments: RadarPoint[][] = []
  let current: RadarPoint[] = []
  for (let step = 1; step <= count; step += 1) {
    const index = (start + step) % count
    const score = scores[index]
    if (score === null) {
      if (current.length > 0) segments.push(current)
      current = []
      continue
    }
    current.push({ index, axis: MATCH_AXES[index], score, ...pointAt(index, count, score / 100, geometry) })
  }
  if (current.length > 0) segments.push(current)
  return segments
}

/**
 * Ce qu'on peut dire d'un axe pour l'ensemble des profils affichés.
 *
 *  - `none`    — personne n'a pu être jugé : la branche se hachure.
 *  - `partial` — au moins un profil manque : le tracé de CELUI-LÀ s'interrompt,
 *                la branche ne se hachure pas.
 *  - `all`     — tout le monde a une mesure.
 */
export function axisEvaluability(profiles: readonly RadarProfile[], axis: MatchAxis): 'none' | 'partial' | 'all' {
  const measured = profiles.filter(profile => scoreOf(profile, axis) !== null).length
  if (measured === 0) return 'none'
  return measured === profiles.length ? 'all' : 'partial'
}
