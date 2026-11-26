/**
 * GA-26 / focus — un réglage vit à un seul endroit.
 *
 * `--bellum-focus-ring` (posé dans `tokens.css`) est désormais le SEUL anneau
 * de focus que ce périmètre écrit pour un contrôle standard. Avant lui, les
 * fichiers de `chat/` réinventaient chacun le leur avec
 * `ring-[var(--bellum-primary-500)]` — qui échoue AA en sombre (2,68:1, sous
 * les 3:1 de WCAG 1.4.11 pour un contraste non-textuel), pour la même raison
 * déjà payée sur `--bellum-text-accent` (149 endroits, voir CLAUDE.md).
 *
 * ⚠️ Ce test ne vise QUE le motif exact
 * `focus-visible:ring-[var(--bellum-primary-500)]`. Le témoin ci-dessous
 * prouve que le scanner ne le confondrait pas avec un traitement composite —
 * ex. une dilution `color-mix(in_srgb,var(--bellum-primary-500)_35%,transparent)`
 * en `focus-within` — SI un tel motif existait encore quelque part.
 *
 * Intégration L (14/09/2026) : cette dilution vivait dans `Chat.tsx`, sur le
 * cadre du composeur, au moment où ce test a été écrit. Le lot K (déjà fusionné
 * dans `main`) l'a retirée indépendamment pour la même raison — 2,68:1 sur fond
 * sombre, sous les 3:1 de WCAG 1.4.11 — et l'a remplacée par
 * `CHAT_SURFACE.focusWithinRing` (`chat-surface.ts`, `--bellum-text-accent`).
 * Les DEUX correctifs visaient le même défaut par deux chemins différents ;
 * celui de K est arrivé en premier sur `main`, donc plus rien dans `chat/` ne
 * porte la dilution — le témoin vérifie maintenant la précision du scanner sur
 * une chaîne littérale, sans dépendre du contenu de `Chat.tsx`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const CHAT_DIR = join(__dirname)
const TOKENS_CSS = join(__dirname, '../../styles/tokens.css')

// Pas de drapeau `g` : un `RegExp.test()` stateful a déjà fait tomber une
// garde de ce dépôt (six gardes borgnes en deux jours, voir CLAUDE.md).
const HARDCODED_RING = /focus-visible:ring-\[var\(--bellum-primary-500\)\]/

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : []
  })
}

// Intégration L (14/09/2026) — même idiome que `chat-mise-en-page.test.ts` :
// sans lui, ce scanner attrapait `chat-surface.ts`, dont le DOCBLOC cite le
// motif interdit pour en raconter l'histoire (« avant ce jeton, les fichiers
// de `chat/` réinventaient... »). Une garde qui punit sa propre doctrine
// n'attrape pas ce qu'elle vise — elle attrape le récit du défaut.
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

describe('anneau de focus — chat/ (GA-26)', () => {
  it('`--bellum-focus-ring` est déclaré dans tokens.css, clair ET sombre', () => {
    const css = readFileSync(TOKENS_CSS, 'utf8')
    // LIT quelque chose de réel : au moins les deux déclarations attendues
    // (bloc clair + bloc `.dark`), jamais un corpus vide qui rendrait ce test
    // vert par accident.
    const matches = Array.from(css.matchAll(/--bellum-focus-ring:\s*#[0-9a-fA-F]{6}/g))
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })

  it('aucun fichier de ce périmètre ne réécrit `ring-[var(--bellum-primary-500)]` en focus-visible', () => {
    const offenders = sourceFiles(CHAT_DIR)
      .map(f => ({ f, content: withoutComments(readFileSync(f, 'utf8')) }))
      .filter(({ content }) => HARDCODED_RING.test(content))
      .map(({ f }) => f.slice(CHAT_DIR.length + 1))

    expect(offenders).toEqual([])
  })

  it('ne se déclenche pas sur un DOCBLOC qui cite le motif pour en raconter l’histoire', () => {
    // Corpus réel, pas inventé : `chat-surface.ts` cite littéralement
    // `focus-visible:ring-[var(--bellum-primary-500)]` dans son commentaire —
    // c'est exactement le cas qui a fait tomber ce scanner à l'intégration L.
    const chatSurfaceTs = readFileSync(join(CHAT_DIR, 'view/chat-surface.ts'), 'utf8')
    expect(chatSurfaceTs).toContain('focus-visible:ring-[var(--bellum-primary-500)]')
    expect(HARDCODED_RING.test(withoutComments(chatSurfaceTs))).toBe(false)
  })

  it('témoin — une dilution color-mix en focus-within n’est PAS ce que ce test vise', () => {
    // Chaîne LITTÉRALE, pas lue depuis Chat.tsx : ce motif n'y vit plus (voir
    // le docblock ci-dessus) depuis que le lot K a remplacé la dilution du
    // composeur par `CHAT_SURFACE.focusWithinRing`. Le témoin garde sa raison
    // d'être — prouver que le scanner ne sur-attrape pas un traitement
    // composite — sans réaffirmer un fait qui n'est plus vrai sur le disque.
    expect(
      HARDCODED_RING.test('focus-within:ring-[color-mix(in_srgb,var(--bellum-primary-500)_35%,transparent)]'),
    ).toBe(false)
  })
})
