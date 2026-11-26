import { describe, expect, it } from 'vitest'
import { defaultNewEventSlot, slotFromInputs, slotToInputs } from './agenda-slot-input'

// Théo A today-agenda.R3 — « Ajouter un rendez-vous » : date, heure, durée tapées.
describe('slotFromInputs', () => {
  it('compose un créneau local depuis la date, l’heure et la durée', () => {
    const slot = slotFromInputs('2026-10-22', '14:30', 45)
    expect(slot).not.toBeNull()
    const start = new Date(slot!.start)
    expect(start.getFullYear()).toBe(2026)
    expect(start.getMonth()).toBe(9)
    expect(start.getDate()).toBe(22)
    expect(start.getHours()).toBe(14)
    expect(start.getMinutes()).toBe(30)
    expect(new Date(slot!.end).getTime() - start.getTime()).toBe(45 * 60_000)
  })

  it('refuse une saisie incomplète ou une durée nulle — jamais un créneau deviné', () => {
    expect(slotFromInputs('', '14:30', 45)).toBeNull()
    expect(slotFromInputs('2026-10-22', '', 45)).toBeNull()
    expect(slotFromInputs('2026-10-22', '14:30', 0)).toBeNull()
    expect(slotFromInputs('2026-10-22', '14:30', Number.NaN)).toBeNull()
  })
})

describe('defaultNewEventSlot', () => {
  it('propose la prochaine heure pleine, pour trente minutes', () => {
    const slot = defaultNewEventSlot(new Date(2026, 9, 22, 9, 12))
    expect(new Date(slot.start).getHours()).toBe(10)
    expect(new Date(slot.start).getMinutes()).toBe(0)
    expect(new Date(slot.end).getTime() - new Date(slot.start).getTime()).toBe(30 * 60_000)
  })
})

describe('slotToInputs', () => {
  it('restitue ce que slotFromInputs a composé', () => {
    const slot = slotFromInputs('2026-10-22', '14:30', 45)!
    expect(slotToInputs(slot)).toEqual({ date: '2026-10-22', time: '14:30', duration: 45 })
  })
})
