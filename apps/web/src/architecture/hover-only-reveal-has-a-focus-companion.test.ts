/**
 * GA-375 — un `<button>` qui ne s'affiche qu'au survol s'affiche AUSSI au
 * focus clavier (#2436.19).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, DÉJÀ ÉCRITE DEUX FOIS DANS CE DÉPÔT
 * ─────────────────────────────────────────────────────────────────────────
 * `AccountSimilarContainer.tsx` (#2127.37) et `ConversationsPanel.tsx`
 * (#1955.7) portent chacun le même commentaire, à la main : « visible au
 * survol ET au focus clavier — jamais SEULEMENT au survol, sinon [le bouton]
 * ne se tabule pas (GA-35) ». La règle existait, personne ne la retenait pour
 * le TROISIÈME bouton — celui qu'aucun de ces deux fichiers ne pouvait faire
 * échouer, puisque chaque garde ne lit que son propre fichier.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ
 * ─────────────────────────────────────────────────────────────────────────
 * `Knowledge.tsx` (bouton de suppression d'un document) porte
 * `opacity-0 group-hover:opacity-100`, sans aucun pendant `focus`. Un
 * `<button>` reste focusable même à `opacity: 0` (l'opacité ne retire jamais
 * du DOM) : au clavier, le focus ATTERRIT dessus, mais rien ne le montre —
 * ni contour, ni icône visible. Supprimer un document devient une fonction
 * qu'on ne peut confirmer qu'en appuyant sur Entrée à l'aveugle. C'est
 * exactement #2436.19 : une fonction dont le SEUL déclencheur visible est la
 * souris.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE NE VISE PAS — pour ne pas accuser le bien
 * ─────────────────────────────────────────────────────────────────────────
 * Une ICÔNE décorative (`<span>`, `<svg>`, `ArrowRight`…) qui s'anime au survol
 * À L'INTÉRIEUR d'un `<button>` ou `<a>` déjà entièrement focusable et déjà
 * doté de son propre `focus-visible:ring-*` n'est PAS une fonction cachée :
 * le geste (cliquer/valider la ligne) reste disponible au clavier, seule sa
 * décoration change. `RecommendedPathCard.tsx`, `AccountSimilarContainer.tsx`
 * (le chevron, pas le bouton « masquer ») et `SearchSuggestionItem.tsx` sont
 * dans ce cas — mesuré en lisant chacun avant d'écrire cette garde, pas
 * deviné. La garde ne scanne donc QUE les balises `<button`, jamais les
 * enfants décoratifs.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!entry.endsWith('.tsx') || entry.includes('.test.')) continue
    out.push(full)
  }
  return out
}

/**
 * Rend la balise ouvrante qui CONTIENT l'index donné — du `<` qui la commence
 * au `>` qui la ferme à profondeur d'accolades nulle. Reprise telle quelle de
 * `accessible-names.test.ts` (GA-32) : une extraction qui s'arrête au premier
 * `>` rencontré coupe la balise avant `onClick={() => …}`, et mesure autre
 * chose que ce qu'elle croit.
 */
function enclosingTag(source: string, index: number): string {
  const start = source.lastIndexOf('<', index)
  if (start < 0) return ''
  let depth = 0
  for (let i = start; i < source.length; i += 1) {
    const char = source[i]
    if (char === '{') depth += 1
    else if (char === '}') depth -= 1
    else if (char === '>' && depth === 0) return source.slice(start, i + 1)
  }
  return source.slice(start)
}

const HOVER_REVEAL = /group-hover(?:\/[a-zA-Z0-9_-]+)?:opacity-100/
const FOCUS_REVEAL = /(?:group-focus-within|focus-visible|focus):opacity-100/

type Violation = { file: string; tag: string }

function findViolations(): { violations: Violation[]; buttonsScanned: number; filesScanned: number } {
  const violations: Violation[] = []
  let buttonsScanned = 0
  const files = sourceFiles(SRC)
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const re = /<button\b/g
    let match: RegExpExecArray | null
    while ((match = re.exec(source))) {
      const tag = enclosingTag(source, match.index)
      if (!tag) continue
      if (!HOVER_REVEAL.test(tag)) continue
      buttonsScanned += 1
      if (!FOCUS_REVEAL.test(tag)) {
        violations.push({ file: file.slice(SRC.length + 1), tag })
      }
    }
  }
  return { violations, buttonsScanned, filesScanned: files.length }
}

describe('GA-375 — un bouton révélé au survol l’est aussi au focus', () => {
  it('a lu un corpus réel de fichiers .tsx (compteur > 0, sinon la garde est aveugle)', () => {
    const { filesScanned } = findViolations()
    expect(filesScanned).toBeGreaterThan(100)
  })

  it('sait dire NON : un bouton qui porte SEULEMENT `group-hover:opacity-100` est détecté', () => {
    // Fixture inline plutôt que relue sur le disque — la garde ne doit pas
    // dépendre de l'ordre dans lequel les fichiers passent.
    const fixture = `<button className="opacity-0 group-hover:opacity-100 transition-all" onClick={() => remove(id)}>x</button>`
    const tag = enclosingTag(fixture, fixture.indexOf('<button'))
    expect(HOVER_REVEAL.test(tag)).toBe(true)
    expect(FOCUS_REVEAL.test(tag)).toBe(false)
  })

  it('ne s’attrape pas sur un bouton déjà correct (`focus-visible:opacity-100` présent)', () => {
    const fixture = `<button className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={() => remove(id)}>x</button>`
    const tag = enclosingTag(fixture, fixture.indexOf('<button'))
    expect(HOVER_REVEAL.test(tag) && !FOCUS_REVEAL.test(tag)).toBe(false)
  })

  it('aucun `<button>` du dépôt ne se révèle SEULEMENT au survol', () => {
    const { violations, buttonsScanned } = findViolations()
    // Zéro bouton hover-only trouvé rendrait ce test aveugle par corpus vide
    // (cf. la leçon de la sonde de mise en page) : au moins un bouton légitime
    // (déjà corrigé, avec son pendant focus) doit exister pour prouver que le
    // scan traverse vraiment le motif visé.
    expect(buttonsScanned).toBeGreaterThan(0)
    expect(violations).toEqual([])
  })
})
