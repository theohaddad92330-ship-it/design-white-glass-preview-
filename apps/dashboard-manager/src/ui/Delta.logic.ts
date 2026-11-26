// #1642 — Delta : « badge coloré, flèche, jamais de couleur seule ».
//
// La DÉCISION (signe → ton → flèche → texte) vit ici, pure, parce que
// `vitest.config.mts` tourne en environnement `node` (pas jsdom) : c'est la
// seule façon de la garder de façon exhaustive dans ce dépôt.
//
// « Non mesuré n'est jamais 0 » (doctrine, registre `doctrine-registry.ts`) :
// un delta ABSENT (null/undefined/NaN) rend le ton `unknown`, jamais un badge
// à 0 % qui prétendrait qu'on a mesuré une stagnation.

// Locaux : `computeDelta` est la seule porte, et son résultat se lit par ses
// champs. Exporter les deux noms sans consommateur les ferait dériver.
type DeltaTone = 'up' | 'down' | 'flat' | 'unknown'

type DeltaInfo = {
  tone: DeltaTone
  /** Texte affiché — jamais vide, jamais un nombre nu pour `unknown`. */
  formatted: string
  /** La flèche porte le signe EN PLUS de la couleur — jamais la couleur seule. */
  arrow: '↑' | '↓' | '→' | null
}

const NON_MESURE = 'non mesuré'

export function computeDelta(value: number | null | undefined, decimals = 1): DeltaInfo {
  if (value == null || !Number.isFinite(value)) {
    return { tone: 'unknown', formatted: NON_MESURE, arrow: null }
  }
  if (value === 0) {
    return { tone: 'flat', formatted: '0 %', arrow: '→' }
  }
  const sign = value > 0 ? '+' : '−'
  const formatted = `${sign}${Math.abs(value).toFixed(decimals).replace('.', ',')} %`
  return { tone: value > 0 ? 'up' : 'down', formatted, arrow: value > 0 ? '↑' : '↓' }
}
