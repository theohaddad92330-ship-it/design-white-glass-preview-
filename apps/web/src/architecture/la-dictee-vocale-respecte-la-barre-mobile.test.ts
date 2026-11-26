import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GARDE — LA DICTÉE VOCALE TIENT LA BARRE MOBILE (#2434.66-.70).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LE TRI DU 24/09 A ÉCARTÉ, ET CE QUI RESTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Cinq points demandaient du natif — verrouillage au pouce, vibration, reprise
 * après appel, gestion Bluetooth : aucun n'est vérifiable par du code seul
 * (device réel exigé), certains supposent un réglage qui n'a pas d'emplacement
 * (GA-26). Ce qui RESTE, et qui EST du code : que la dictée vocale — micro de
 * `/chat` (`VoiceInput.tsx`, `VoiceReplay.tsx`) et dictée
 * d'une liste (`ImportTargetListDialog.tsx`, #2434.55) — tienne la même barre
 * que le reste du produit mobile (D80 et suivants) : aucune cible tactile en
 * dessous de 44 px, et aucune hauteur figée en `vh` (`dvh` seul est fiable sur
 * mobile, la barre d'adresse variable fausse `vh`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE, PAS CE QU'ELLE INVENTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `Button` (`@bellum/ui`) porte déjà `pointer-coarse:min-h-11` sur ses quatre
 * tailles et son variant `icon` — cette garde ne le revérifie pas, elle vise
 * les `<button>` NUS que ces trois fichiers écrivent à la main (le micro
 * principal, « réécouter »), là où oublier
 * la classe est un geste humain, pas une régression du design system.
 */

const VOICE_FILES = [
  join(__dirname, '..', 'features', 'chat', 'voice', 'VoiceInput.tsx'),
  // #5032.5 — `ListenReply.tsx` supprimé avec le bouton « Écouter » (revient sur #1939.12).
  join(__dirname, '..', 'features', 'chat', 'voice', 'VoiceReplay.tsx'),
  join(__dirname, '..', 'features', 'target-lists', 'view', 'ImportTargetListDialog.tsx'),
]

/**
 * Chaque balise d'OUVERTURE `<button ...>`, jusqu'à son `>` réel — jamais celui
 * d'une flèche `=>` dans un gestionnaire inline (`onClick={() => ...}`), qui
 * romprait une recherche non gourmande naïve avant `className`. La profondeur
 * d'accolades ignore tout `>` À L'INTÉRIEUR d'une expression JS `{...}`.
 */
function rawButtonTags(source: string): string[] {
  const tags: string[] = []
  let searchFrom = 0
  while (true) {
    const start = source.indexOf('<button', searchFrom)
    if (start < 0) break
    let depth = 0
    let end = -1
    for (let i = start + '<button'.length; i < source.length; i += 1) {
      const char = source[i]
      if (char === '{') depth += 1
      else if (char === '}') depth -= 1
      else if (char === '>' && depth === 0) {
        end = i
        break
      }
    }
    if (end < 0) break
    tags.push(source.slice(start, end + 1))
    searchFrom = end + 1
  }
  return tags
}

describe('GA — la dictée vocale tient la barre mobile (#2434.66-.70)', () => {
  it('lit un corpus non vide sur les trois fichiers', () => {
    for (const file of VOICE_FILES) {
      const source = readFileSync(file, 'utf8')
      expect(source.length).toBeGreaterThan(500)
    }
  })

  it('aucun `<button>` nu, dans ces trois fichiers, sans cible `min-h-11` (nue ou `pointer-coarse:`) — #3356.3b', () => {
    const offenders: string[] = []
    for (const file of VOICE_FILES) {
      const source = readFileSync(file, 'utf8')
      for (const tag of rawButtonTags(source)) {
        if (!tag.includes('min-h-11')) offenders.push(`${file}: ${tag.slice(0, 80)}…`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('aucune hauteur figée en `vh` — `dvh` seul, ou rien', () => {
    // Un CHIFFRE suivi directement de `vh` (`100vh`) est l'unité fautive ;
    // `100dvh` ne matche pas (le chiffre est suivi de `d`, pas de `v`).
    for (const file of VOICE_FILES) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/\dvh\b/)
    }
  })

  it('sait dire NON — un bouton nu sans la classe est reproché, même avec une flèche inline', () => {
    const leaky = '<button type="button" onClick={() => start()} className="text-xs">Dicter</button>'
    const tags = rawButtonTags(leaky)
    expect(tags).toHaveLength(1)
    expect(tags[0]).toContain('className="text-xs"')
    const offenders = tags.filter(tag => !tag.includes('min-h-11'))
    expect(offenders).toHaveLength(1)
  })

  it('n’attrape pas ce qu’elle ne vise pas — un bouton conforme, flèche inline comprise, ne fait pas rougir la garde', () => {
    const fine =
      '<button type="button" onClick={() => start()} className="pointer-coarse:min-h-11 text-xs">Dicter</button>'
    const offenders = rawButtonTags(fine).filter(tag => !tag.includes('min-h-11'))
    expect(offenders).toHaveLength(0)
  })
})
