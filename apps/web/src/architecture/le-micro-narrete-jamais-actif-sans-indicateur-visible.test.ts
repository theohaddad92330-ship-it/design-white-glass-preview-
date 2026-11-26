import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GARDE #2434.84 — LE MICRO NE RESTE JAMAIS ACTIF SANS INDICATEUR VISIBLE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * `voice-never-records-a-meeting.test.ts` prouve qu'un seul fichier (`useVoiceMode.ts`)
 * ouvre le micro, et qu'aucun effet ne le démarre seul. Elle ne dit rien de ce
 * que l'écran MONTRE pendant que le micro écoute. Cette garde ferme cette moitié :
 * `VoiceInput.tsx`, seul consommateur d'écran de `useVoiceMode`, doit rendre un
 * indicateur VISIBLE (pas seulement accessible aux lecteurs d'écran) précisément
 * quand `voice.phase === 'recording'` — jamais avant (permission), jamais après
 * (transcription : le micro est déjà coupé par `stop()`), jamais inconditionnellement.
 *
 * Elle prouve qu'elle LIT (corpus non vide) et qu'elle sait dire NON (une source
 * fabriquée sans indicateur, ou avec un indicateur toujours affiché, la fait
 * rougir).
 */

const VOICE_INPUT_FILE = join(__dirname, '..', 'features', 'chat', 'voice', 'VoiceInput.tsx')

/** Le bloc JSX borné par `voice.phase === '<phase>' ? ( ... ) : null`, parenthèses comptées. */
function phaseBlock(source: string, phase: string): string | null {
  const marker = `voice.phase === '${phase}'`
  const start = source.indexOf(marker)
  if (start === -1) return null
  const openParen = source.indexOf('(', source.indexOf('?', start))
  if (openParen === -1) return null
  let depth = 1
  let index = openParen + 1
  while (index < source.length && depth > 0) {
    if (source[index] === '(') depth += 1
    else if (source[index] === ')') depth -= 1
    index += 1
  }
  return source.slice(openParen, index)
}

/** Un marqueur d'écoute VISIBLE — pas `sr-only`, pas seulement un `aria-label`. */
function hasVisibleListeningIndicator(block: string): boolean {
  return /data-testid=["']voice-listening-indicator["']/.test(block)
}

describe('#2434.84 — le micro ne reste jamais actif sans indicateur visible', () => {
  const source = readFileSync(VOICE_INPUT_FILE, 'utf8')

  it('lit un corpus non vide, et y trouve les trois phases attendues', () => {
    expect(source.length).toBeGreaterThan(500)
    expect(source).toContain("voice.phase === 'recording'")
    expect(source).toContain("voice.phase === 'idle'")
    expect(source).toContain("voice.phase === 'requesting'")
  })

  it('la phase "recording" — micro réellement ouvert — porte l’indicateur visible', () => {
    const block = phaseBlock(source, 'recording')
    expect(block).not.toBeNull()
    expect(hasVisibleListeningIndicator(block ?? '')).toBe(true)
  })

  it('les phases "requesting" (pas encore accordé) et "idle" (coupé) ne le portent PAS', () => {
    expect(hasVisibleListeningIndicator(phaseBlock(source, 'requesting') ?? '')).toBe(false)
    expect(hasVisibleListeningIndicator(phaseBlock(source, 'idle') ?? '')).toBe(false)
  })

  it('sait dire NON — indicateur manquant en "recording", ou affiché HORS de "recording"', () => {
    const missing = phaseBlock(
      `x = voice.phase === 'recording' ? (<span role="group">{t('voice.listening')}</span>) : null`,
      'recording',
    )
    expect(hasVisibleListeningIndicator(missing ?? '')).toBe(false)

    const misplaced = phaseBlock(
      `x = voice.phase === 'idle' ? (<span data-testid="voice-listening-indicator" />) : null`,
      'idle',
    )
    expect(hasVisibleListeningIndicator(misplaced ?? '')).toBe(true)
  })

  it('n’attrape pas ce qu’elle ne vise pas — un autre testid ne vaut pas indicateur d’écoute', () => {
    const fake = `x = voice.phase === 'recording' ? (<span data-testid="voice-processing-indicator" />) : null`
    const block = phaseBlock(fake, 'recording')
    expect(hasVisibleListeningIndicator(block ?? '')).toBe(false)
  })
})
