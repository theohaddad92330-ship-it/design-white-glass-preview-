import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #3356.2 (LAU-UI-309 — « uniformiser les états visuels de la barre de saisie »).
 *
 * `Chat.composerSignature.test.ts` tient le focus, la cible 44 px et l'absence de
 * couleur hexadécimale. Ce fichier tient les ÉTATS restants, bouton par bouton :
 *   (1) HOVER — chaque `<button>` natif change d'aspect au survol (`hover:`), sinon
 *       il est le seul à ne pas répondre ;
 *   (2) DISABLED — un bouton qui peut être désactivé (`disabled=`) le DIT par un
 *       style `disabled:` (pas seulement par l'attribut) ;
 *   (3) FOCUS-VISIBLE — jamais le `focus:` nu (il s'allume au clic souris) ;
 *   (4) ERREUR / CONNECTÉ — l'état se dit par un JETON sémantique (`--danger-soft-*`,
 *       `--success-*`, `--bellum-text-accent`), jamais une couleur Tailwind brute ;
 *   (5) MOUVEMENT — la grammaire de `packages/ui/src/motion.ts` : ni rebond, ni durée
 *       hors des paliers, ni courbe écrite à la main.
 */
describe('barre de saisie — états de TOUS les boutons (#3356.2)', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/features/chat/view/Chat.tsx'), 'utf8')
  const start = source.indexOf('data-testid="chat-composer"')
  const end = source.indexOf('</form>', start)
  const composer = source.slice(start, end)

  /** Le bloc de TOUTE ouverture de balise `<tag …>` (jusqu'au `>` hors accolades). */
  function openings(tag: string): { line: number; text: string }[] {
    const out: { line: number; text: string }[] = []
    for (const match of composer.matchAll(new RegExp(`<${tag}\\b`, 'g'))) {
      let depth = 0
      let i = match.index ?? 0
      const from = i
      for (; i < composer.length; i += 1) {
        const c = composer[i]
        if (c === '{') depth += 1
        else if (c === '}') depth -= 1
        else if (c === '>' && depth === 0 && composer[i - 1] !== '=') break
      }
      out.push({ line: source.slice(0, start + from).split('\n').length, text: composer.slice(from, i) })
    }
    return out
  }
  const natives = openings('button')
  const shared = openings('Button')

  it('la garde lit quelque chose : des boutons natifs ET le composant partagé', () => {
    expect(natives.length).toBeGreaterThanOrEqual(4)
    expect(shared.length).toBeGreaterThanOrEqual(2)
  })

  it('(1) chaque bouton natif répond au survol', () => {
    expect(natives.filter(({ text }) => !/hover:/.test(text)).map(({ line }) => line)).toEqual([])
  })

  it('(2) un bouton natif désactivable porte un style disabled:', () => {
    const bad = natives.filter(({ text }) => /\bdisabled=/.test(text) && !/disabled:/.test(text))
    expect(bad.map(({ line }) => line)).toEqual([])
  })

  it('(3) le focus est toujours focus-visible, jamais focus: nu', () => {
    expect(composer.match(/(?<![-\w])focus:(?!outline-none)\S+/g) ?? []).toEqual([])
  })

  it('(4) aucune couleur Tailwind brute : des jetons, donc parité clair/sombre', () => {
    const raw = composer.match(
      /\b(?:text|bg|border|ring)-(?:red|green|emerald|amber|yellow|blue|rose|orange)-\d{2,3}\b/g,
    )
    expect(raw ?? []).toEqual([])
  })

  it('(5) mouvement : aucun rebond, aucune durée ni courbe écrite à la main', () => {
    expect(composer.match(/animate-bounce|\bduration-\d+|\bease-\[|\bease-(?:in|out|in-out)\b/g) ?? []).toEqual([])
  })
})
