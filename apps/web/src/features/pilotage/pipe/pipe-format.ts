import type { PipeRiskSignal, PipeWaterfall } from '@bellum/contracts'

type WaterfallBarKey =
  | 'opening'
  | 'created'
  | 'raised'
  | 'lowered'
  | 'lost'
  | 'signed'
  | 'removed'
  | 'unexplained'
  | 'closing'

export interface WaterfallBar {
  key: WaterfallBarKey
  cents: number
  /** `total` : une ligne d'état (ouverture, clôture) ; `plus`/`minus` : un mouvement. */
  kind: 'total' | 'plus' | 'minus'
}

/**
 * Les barres du waterfall, dans l'ordre de l'ÉQUATION (le serveur la prouve :
 * `closing = opening + created + raised − lowered − lost − signed − removed
 * + unexplained`). Une barre nulle ne fait AUCUNE ligne — « absence ne fait
 * aucune ligne » — sauf l'ouverture et la clôture, qui bornent la lecture.
 * L'écart non expliqué n'apparaît que s'il existe, et il est nommé.
 */
export function waterfallBars(waterfall: PipeWaterfall): WaterfallBar[] {
  const movements: WaterfallBar[] = [
    { key: 'created', cents: waterfall.createdCents, kind: 'plus' },
    { key: 'raised', cents: waterfall.raisedCents, kind: 'plus' },
    { key: 'lowered', cents: waterfall.loweredCents, kind: 'minus' },
    { key: 'lost', cents: waterfall.lostCents, kind: 'minus' },
    { key: 'signed', cents: waterfall.signedCents, kind: 'minus' },
    { key: 'removed', cents: waterfall.removedCents, kind: 'minus' },
  ]
  const unexplained: WaterfallBar[] =
    waterfall.unexplainedCents === 0
      ? []
      : [
          {
            key: 'unexplained',
            cents: waterfall.unexplainedCents,
            kind: waterfall.unexplainedCents > 0 ? 'plus' : 'minus',
          },
        ]
  return [
    { key: 'opening', cents: waterfall.openingCents, kind: 'total' },
    ...movements.filter(bar => bar.cents !== 0),
    ...unexplained,
    { key: 'closing', cents: waterfall.closingCents, kind: 'total' },
  ]
}

/** Les variables de la phrase d'un signal — les chiffres du FAIT, déjà formatés. */
export function signalParams(signal: PipeRiskSignal, money: (cents: number) => string) {
  return {
    days: signal.days ?? undefined,
    count: signal.count ?? undefined,
    from: signal.fromCents === null ? undefined : money(signal.fromCents),
    to: signal.toCents === null ? undefined : money(signal.toCents),
  }
}
