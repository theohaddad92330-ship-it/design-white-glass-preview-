/**
 * #3455 — « la wave enregistre rien » : la PREUVE à l'écran que le micro capte.
 *
 * Un analyseur Web Audio lit le niveau du flux accordé (le même que celui du
 * `MediaRecorder`) ; il ne touche jamais à l'enregistrement. Sans `AudioContext`
 * (navigateur ancien, jsdom), il n'y a PAS de jauge : un niveau non mesuré est
 * `null`, jamais 0 — « silence » n'est dit que sur une mesure.
 */

/** Le pic en dessous duquel on tient le flux pour du bruit de fond (≈ -48 dBFS). */
const NOISE_FLOOR = 0.01
/** Au-delà de ce temps SANS le moindre pic, l'écran dit que rien n'est capté. */
export const SILENCE_HINT_AFTER_MS = 3000

/** Niveau efficace d'un tampon d'octets temporels (128 = zéro), dans [0, 1] ; `null` si le tampon est vide. */
export function rmsLevel(samples: Uint8Array): number | null {
  if (samples.length === 0) return null
  let sum = 0
  for (const byte of samples) {
    const centered = (byte - 128) / 128
    sum += centered * centered
  }
  return Math.min(1, Math.sqrt(sum / samples.length))
}

/** Vrai quand l'écoute dure depuis assez longtemps et que le niveau n'a JAMAIS dépassé le bruit de fond. */
export function isSilentSoFar({ elapsedMs, peak }: { elapsedMs: number; peak: number | null }): boolean {
  if (peak === null) return false
  return elapsedMs >= SILENCE_HINT_AFTER_MS && peak < NOISE_FLOOR
}

export type LevelMeter = { read: () => number | null; close: () => void }

export function openLevelMeter(stream: MediaStream): LevelMeter | null {
  const Ctx = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext
  if (typeof Ctx !== 'function') return null
  try {
    const context = new Ctx()
    const source = context.createMediaStreamSource(stream)
    const analyser = context.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)
    const buffer = new Uint8Array(analyser.fftSize)
    return {
      read: () => {
        analyser.getByteTimeDomainData(buffer)
        return rmsLevel(buffer)
      },
      close: () => {
        try {
          source.disconnect()
        } finally {
          void context.close()
        }
      },
    }
  } catch {
    return null
  }
}
