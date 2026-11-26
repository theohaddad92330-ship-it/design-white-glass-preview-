import { SIZE_BANDS, type SizeBandCode } from './discover-size-bounds'
import { parseHeadcountLabel, type DiscoverCandidate } from './discover-types'

/* ------------------------------------------------------------------ */
/*  #4493 / #4495 (maquette V22) — ce que la page et les cartes comptent */
/*  sur les comptes AFFICHÉS : besoins de prestation, besoins            */
/*  historiques, nouveaux pour l'espace. Un compteur non mesuré vaut     */
/*  `null` (aucune ligne, jamais « 0 » — GA-18/19).                      */
/* ------------------------------------------------------------------ */

/**
 * Les besoins PASSÉS observés sur ce compte (base commune, #4294.9) — portés par l'axe « référentiel » de
 * `sourceAxes` quand il en a lu (`reference_needs*`, `label_params.n`). `null` = non lus pour ce compte.
 */
export function historicalNeedsCount(candidate: Pick<DiscoverCandidate, 'sourceAxes'>): number | null {
  const axis = candidate.sourceAxes?.axes.find(
    entry => entry.key === 'dataforge' && entry.label_key.startsWith('reference_needs'),
  )
  const n = axis?.label_params?.n
  return typeof n === 'number' ? n : null
}

/** Les besoins de prestation CONNUS de l'espace (compte déjà possédé, #3819.1) ; `null` = non connus. */
export function knownNeedsOf(candidate: Pick<DiscoverCandidate, 'knownNeedsCount'>): number | null {
  return typeof candidate.knownNeedsCount === 'number' ? candidate.knownNeedsCount : null
}

/** Somme d'un compteur sur la liste : `null` quand AUCUN compte ne l'a mesuré (jamais un zéro inventé). */
function sumMeasured(values: readonly (number | null)[]): number | null {
  const measured = values.filter((value): value is number => value !== null)
  return measured.length === 0 ? null : measured.reduce((sum, value) => sum + value, 0)
}

interface DiscoverOverviewCounters {
  newForWorkspace: number
  knownNeeds: number | null
  historicalNeeds: number | null
}

export function overviewCounters(
  visible: readonly Pick<DiscoverCandidate, 'portfolioState' | 'knownNeedsCount' | 'sourceAxes'>[],
): DiscoverOverviewCounters {
  return {
    newForWorkspace: visible.filter(candidate => candidate.portfolioState === 'new').length,
    knownNeeds: sumMeasured(visible.map(knownNeedsOf)),
    historicalNeeds: sumMeasured(visible.map(historicalNeedsCount)),
  }
}

/**
 * L'illustration d'une piste (« IDF », « SAP », « BA ») : les initiales du libellé, jamais un logo deviné.
 * Les mots-outils (de, la, &…) ne comptent pas ; trois lettres au plus.
 */
export function monogram(label: string): string {
  const plain = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, ' ')
  const words = plain
    .split(/[\s–—·,&/']+/)
    .filter(word => word.length > 0 && !/^(de|du|des|la|le|les|et|d|l|of|and|the)$/i.test(word))
  const [first] = words
  if (!first) return ''
  if (words.length === 1) {
    // « Île-de-France » → IDF : un nom composé garde l'initiale de chaque partie.
    const parts = first.split('-').filter(Boolean)
    return (parts.length > 1 ? parts.map(part => part.charAt(0)).join('') : first.slice(0, 3)).toUpperCase()
  }
  return words
    .slice(0, 3)
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase()
}

/** Une expertise DÉCLARÉE, sans sa liste entre parenthèses (« Cloud & Infrastructure (AWS, …) »). */
export function expertiseHeadline(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*/g, ' ').trim()
}

/**
 * #4495 — la TRANCHE maison d'un effectif (TPE < 10 · PME 10–249 · ETI 250–999 · GC ≥ 1 000), lue sur la borne
 * basse du libellé publié (« 250 à 499 salariés ») comme sur un code (« 250-999 »). `null` = effectif non publié
 * ou nul : aucune tranche n'est devinée.
 */
export function sizeBandOf(headcountRange: string | null | undefined): SizeBandCode | null {
  const bounds = parseHeadcountLabel(headcountRange ?? null)
  if (!bounds || bounds[0] <= 0) return null
  const low = bounds[0]
  return SIZE_BANDS.find(band => low >= band.min && (band.max === null || low <= band.max))?.code ?? null
}
