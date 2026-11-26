import { describe, expect, it, vi } from 'vitest'
import { SILENCE_HINT_AFTER_MS, isSilentSoFar, openLevelMeter, rmsLevel } from './voice-level'

/** Un octet 128 = silence (le zéro d'un signal non signé 8 bits). */
const flat = (n = 64) => new Uint8Array(n).fill(128)

describe('rmsLevel (#3455)', () => {
  it('silence parfait → 0', () => {
    expect(rmsLevel(flat())).toBe(0)
  })
  it('un signal fort lit plus haut qu’un signal faible, et reste dans [0, 1]', () => {
    const loud = Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 250 : 6))
    const soft = Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 134 : 122))
    expect(rmsLevel(loud) ?? 0).toBeGreaterThan(rmsLevel(soft) ?? 0)
    expect(rmsLevel(loud)).toBeLessThanOrEqual(1)
    expect(rmsLevel(soft)).toBeGreaterThan(0)
  })
  it('un tampon vide n’est PAS un silence mesuré : on ne sait pas', () => {
    expect(rmsLevel(new Uint8Array(0))).toBeNull()
  })
})

describe('isSilentSoFar (#3455)', () => {
  it('ne crie pas au silence avant le délai', () => {
    expect(isSilentSoFar({ elapsedMs: SILENCE_HINT_AFTER_MS - 1, peak: 0 })).toBe(false)
  })
  it('dit le silence quand rien n’a jamais dépassé le bruit de fond', () => {
    expect(isSilentSoFar({ elapsedMs: SILENCE_HINT_AFTER_MS, peak: 0.004 })).toBe(true)
  })
  it('NON : un pic de voix, même ancien, prouve que le micro capte', () => {
    expect(isSilentSoFar({ elapsedMs: 20_000, peak: 0.3 })).toBe(false)
  })
  it('NON : niveau jamais mesuré (null) → on ne prétend rien', () => {
    expect(isSilentSoFar({ elapsedMs: 20_000, peak: null })).toBe(false)
  })
})

describe('openLevelMeter (#3455)', () => {
  it('sans AudioContext → null (pas de jauge inventée)', () => {
    vi.stubGlobal('AudioContext', undefined)
    expect(openLevelMeter({} as MediaStream)).toBeNull()
    vi.unstubAllGlobals()
  })
  it('lit l’analyseur, et close() libère le contexte audio', () => {
    const close = vi.fn()
    const disconnect = vi.fn()
    const analyser = {
      fftSize: 0,
      getByteTimeDomainData: (buf: Uint8Array) => buf.fill(200),
    }
    class FakeCtx {
      createMediaStreamSource() {
        return { connect: vi.fn(), disconnect }
      }
      createAnalyser() {
        return analyser
      }
      close = close
    }
    vi.stubGlobal('AudioContext', FakeCtx)
    const meter = openLevelMeter({} as MediaStream)
    expect(meter).not.toBeNull()
    expect(meter?.read()).toBeGreaterThan(0.3)
    meter?.close()
    expect(close).toHaveBeenCalledTimes(1)
    expect(disconnect).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
