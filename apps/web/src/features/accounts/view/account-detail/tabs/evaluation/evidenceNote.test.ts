import type { TFunction } from 'i18next'
import { describe, expect, it } from 'vitest'
import { toSignalListItem } from './evidenceNote'

/** Stub i18n : rend la clé + ses variables, pour lire ce qui est composé sans
 *  dépendre du wording FR/EN. */
const t = ((key: string, options?: Record<string, unknown>) => {
  if (options && 'defaultValue' in options && key.startsWith('evaluation.proof.types.')) {
    return String(options.defaultValue)
  }
  const vars = options ? Object.entries(options).map(([k, v]) => `${k}=${String(v)}`) : []
  return vars.length > 0 ? `${key}(${vars.join(',')})` : key
}) as unknown as TFunction<'accountDetail'>

const base = { text: 'Appeler la DSI', computedAt: null, proofType: null, proof: null, proofDate: null }

describe('toSignalListItem', () => {
  it('says nothing on a dossier produced before dates and proofs existed', () => {
    // Rétro-compatibilité : lisible, sans date inventée.
    expect(toSignalListItem(base, t)).toEqual({ text: 'Appeler la DSI', note: null })
  })

  it('shows the proof, its own date, then the recompute date', () => {
    const item = toSignalListItem(
      {
        ...base,
        computedAt: '2026-07-22T09:00:00+00:00',
        proofType: 'signal',
        proof: 'Recrutement plateforme — France Travail',
        proofDate: '2026-05-12',
      },
      t,
    )
    expect(item.note).toBe(
      'evaluation.proof.prefix(proof=signal — Recrutement plateforme — France Travail) · 12/05/2026 · evaluation.proof.recomputedOn(date=22/07/2026)',
    )
  })

  it('admits when a recomputed item could not be tied to anything', () => {
    const item = toSignalListItem({ ...base, computedAt: '2026-07-22T09:00:00+00:00' }, t)
    expect(item.note).toBe('evaluation.proof.none · evaluation.proof.recomputedOn(date=22/07/2026)')
  })

  it('leaves a free-form proof period untouched rather than mangling it', () => {
    // Un budgetSignal date en « 2026 » / « S1 2026 » : ce n'est pas une date
    // parsable, on l'affiche tel quel plutôt que de la déformer.
    const item = toSignalListItem({ ...base, proofType: 'signal', proof: 'BOAMP', proofDate: 'S1 2026' }, t)
    expect(item.note).toContain('S1 2026')
  })
})
