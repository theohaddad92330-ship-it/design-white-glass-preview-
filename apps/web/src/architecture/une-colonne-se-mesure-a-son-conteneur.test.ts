import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-373 — UNE COLONNE SE MESURE À SON CONTENEUR, PAS À LA FENÊTRE (#2652).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE LA PROD MONTRAIT
 * ─────────────────────────────────────────────────────────────────────────
 * `/discover` › « Tous les filtres » › SECTEURS EXCLUS : chaque puce rendait
 * son libellé un mot par ligne (« Industrie / et / fabrication » sur trois
 * lignes), le chevron rejeté en dessous. #2652 avait été fermée une première
 * fois sur une preuve de code vraie mais incomplète.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE MÉCANISME
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX grilles IMBRIQUÉES posent chacune leur nombre de colonnes sur un
 * palier de FENÊTRE (`sm:grid-cols-2 lg:grid-cols-3`) :
 *   1. `FilterRail.tsx` › `Group()` — autour de chaque champ de la modale.
 *   2. `SectorPicker.tsx` — sa propre grille de groupes de secteurs.
 * Une modale fait ~720 px utiles. À `lg` (fenêtre ≥ 1024 px), `Group` la
 * divise déjà en 3 (~220 px/champ) ; `SectorPicker`, qui ne sait rien de
 * cette première division, la redivise ENCORE en 3 sur la base de la MÊME
 * fenêtre (~65 px/puce). Aucune des deux grilles n'est fautive seule — une
 * grille à 3 colonnes de 220 px, ou de 65 px sur un empilement simple,
 * marche très bien. Le défaut naît de la COMPOSITION : un composant qui pose
 * ses colonnes sur la fenêtre, rendu à l'intérieur d'un autre composant qui
 * fait pareil, hérite d'une largeur qui n'a plus rien à voir avec la
 * fenêtre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE VISE, ET CE QU'ELLE NE VISE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Elle interdit la COMPOSITION : un composant qui pose une grille à COMPTE
 * de colonnes sur un palier de fenêtre (`sm:grid-cols-2`, `lg:grid-cols-3`…)
 * ne doit pas être rendu (par balise JSX, `<Composant …>` ou `<Composant … />`)
 * À L'INTÉRIEUR d'un autre composant qui fait la même chose. C'est la
 * NESTING, jamais l'existence d'une grille à palier de fenêtre seule, qui
 * est fautive : un `lg:grid-cols-3` en pleine page, isolé, est parfaitement
 * légitime (page listant des cartes, tableau de bord…) — la garde ne le
 * touche pas, parce que rien n'est composé à l'intérieur de lui.
 *
 * Elle exclut aussi délibérément les gabarits de colonnes NOMMÉES/EXPLICITES
 * (`sm:grid-cols-[140px_minmax(0,1fr)]`, `md:grid-cols-[minmax(0,1fr)_18rem]`) :
 * ceux-là dimensionnent des colonnes précises, ils ne redivisent pas une
 * largeur en N parts égales — un défaut différent, déjà tenu par le motif
 * `grid-cols-[minmax(0,1fr)_auto]` + `break-words` (#2618.1).
 *
 * ⚠️ Distinguer proprement « modale/colonne bornée » de « pleine page » à la
 * seule lecture du texte source, sans layout réel, n'est pas fiable : deux
 * composants peuvent être des frères non imbriqués dans un fichier qui
 * importe aussi `Dialog` sans rapport. La garde ne se fie donc PAS à la
 * présence d'un `Dialog`/`max-w-` : elle se fie à la vraie relation
 * parent-enfant entre deux composants qui posent CHACUN une grille à palier
 * de fenêtre — la seule chose qu'un texte source peut prouver sans jamais
 * accuser un `lg:grid-cols-3` de page isolé.
 */

const WEB_SRC = join(__dirname, '..')

function tsxFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist') continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (entry.endsWith('.tsx') && !entry.includes('.test.')) out.push(full)
    }
  }
  walk(root)
  return out
}

/**
 * Un masque « cette ligne est du commentaire » qui suit vraiment l'état
 * D'UN BLOC sur plusieurs lignes — `//` seul, ou une ligne qui contient
 * `/*` (`/* ... *\/` comme `{/* ... *\/}`, la même sous-chaîne) sans la
 * refermer, ferment TOUTES les lignes suivantes jusqu'au `*\/`. Un simple
 * `trimStart().startsWith('*')` — la convention des gardes voisines — ne
 * suffit pas : un commentaire `{/* ... *\/}` de ce dépôt n'aligne PAS une
 * `*` en tête de chaque ligne de continuation, il indente juste la prose.
 * Sans ce suivi d'état, une ligne de commentaire qui CITE un motif fautif
 * pour l'expliquer (exactement ce que fait le correctif ci-dessous) se
 * lirait comme une nouvelle offense.
 */
function commentMask(lines: string[]): boolean[] {
  const mask: boolean[] = new Array(lines.length).fill(false)
  let inBlock = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (inBlock) {
      mask[i] = true
      if (line.includes('*/')) inBlock = false
      continue
    }
    if (line.trimStart().startsWith('//')) {
      mask[i] = true
      continue
    }
    const openIdx = line.indexOf('/*')
    if (openIdx !== -1) {
      mask[i] = true
      if (!line.slice(openIdx).includes('*/')) inBlock = true
    }
  }
  return mask
}

type SourceFile = { path: string; lines: string[] }

/**
 * Un palier de grille par COMPTE de colonnes (`grid-cols-2`, `grid-cols-3`,
 * `grid-cols-12`…) posé sur un point de rupture de FENÊTRE. Exclut les
 * gabarits explicites entre crochets (`grid-cols-[…]`) : voir docstring.
 */
export const WINDOW_TIER_GRID = /\b(?:sm|md|lg|xl|2xl):grid-cols-(?:[2-9]|\d{2,})\b/

const FUNCTION_DECL = /^\s*(?:export\s+)?function\s+([A-Z][A-Za-z0-9_]*)\s*\(/

function enclosingComponent(lines: string[], index: number): string | null {
  for (let i = index; i >= 0; i--) {
    const m = FUNCTION_DECL.exec(lines[i])
    if (m) return m[1]
  }
  return null
}

type Violation = { file: string; outer: string; outerLine: number; inner: string; innerLine: number }

/**
 * Trouve, dans un corpus de fichiers `.tsx`, les composants dont le rendu
 * pose lui-même une grille à palier de fenêtre, puis détecte quand l'un de
 * ces composants est rendu (balise JSX) à l'intérieur d'un autre.
 */
export function findNestedWindowTierGrids(corpus: SourceFile[]): Violation[] {
  // 1. Quels composants posent, dans LEUR PROPRE corps, une grille à palier
  //    de fenêtre — indépendamment de qui les appelle.
  const windowGridComponents = new Map<string, string>() // nom -> premier fichier trouvé
  for (const { path, lines } of corpus) {
    const mask = commentMask(lines)
    lines.forEach((line, index) => {
      if (mask[index]) return
      if (!WINDOW_TIER_GRID.test(line)) return
      const name = enclosingComponent(lines, index)
      if (name && !windowGridComponents.has(name)) windowGridComponents.set(name, path)
    })
  }

  const names = [...windowGridComponents.keys()]
  if (names.length === 0) return []
  const escaped = names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const usageOpen = new RegExp(`<(${escaped.join('|')})\\b`)

  // 2. Où ces composants sont-ils RENDUS (balise JSX), et quelle est
  //    l'étendue de ligne de chaque usage (soi-même s'il est auto-fermant,
  //    jusqu'à sa fermeture sinon).
  const violations: Violation[] = []
  for (const { path, lines } of corpus) {
    const mask = commentMask(lines)
    const usages: { name: string; open: number; close: number }[] = []
    lines.forEach((line, index) => {
      if (mask[index]) return
      const m = usageOpen.exec(line)
      if (!m) return
      const name = m[1]
      const afterOpen = line.slice(m.index)
      const selfClosingHere = /\/>/.test(afterOpen) && !afterOpen.includes(`</${name}>`)
      if (selfClosingHere) {
        usages.push({ name, open: index, close: index })
        return
      }
      const closeTag = `</${name}>`
      let close = index
      for (let j = index; j < lines.length; j++) {
        if (lines[j].includes(closeTag)) {
          close = j
          break
        }
      }
      usages.push({ name, open: index, close })
    })

    for (let k = 0; k < usages.length; k++) {
      for (let l = 0; l < usages.length; l++) {
        if (k === l) continue
        const outer = usages[k]
        const inner = usages[l]
        // `inner` est nesté dans `outer` si son ouverture tombe STRICTEMENT
        // après l'ouverture de `outer` et au plus tard à sa fermeture.
        if (inner.open > outer.open && inner.open <= outer.close) {
          violations.push({
            file: path,
            outer: outer.name,
            outerLine: outer.open + 1,
            inner: inner.name,
            innerLine: inner.open + 1,
          })
        }
      }
    }
  }
  return violations
}

const CORPUS: SourceFile[] = tsxFiles(WEB_SRC).map(path => ({ path, lines: readFileSync(path, 'utf8').split('\n') }))

describe('GA-373 — une colonne se mesure à son conteneur, pas à la fenêtre (#2652)', () => {
  it('LIT vraiment un corpus, et il n’est pas vide', () => {
    expect(CORPUS.length).toBeGreaterThan(800)
    expect(CORPUS.some(f => f.path.includes('/features/discover/'))).toBe(true)
  })

  it('sait dire NON — reconnaît les deux grilles réelles de #2652', () => {
    for (const ligne of [
      'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3',
      'grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3',
    ]) {
      expect(WINDOW_TIER_GRID.test(ligne), ligne).toBe(true)
    }
  })

  it('n’attrape pas un gabarit de colonnes NOMMÉES (motif #2618.1, différent)', () => {
    for (const ligne of [
      'sm:grid-cols-[140px_minmax(0,1fr)]',
      'md:grid-cols-[minmax(0,1fr)_18rem]',
      'max-lg:grid-cols-[minmax(0,1fr)_auto]',
    ]) {
      expect(WINDOW_TIER_GRID.test(ligne), ligne).toBe(false)
    }
  })

  it('n’accuse PAS une grille à palier de fenêtre ISOLÉE, même à pleine page', () => {
    // Preuve n°3 : `Solo` pose `lg:grid-cols-3` et n'imbrique rien —
    // aucune violation, quelle que soit la largeur du composant.
    const solo: SourceFile = {
      path: '/fake/Solo.tsx',
      lines: [
        'export function Solo() {',
        '  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">{cards}</div>',
        '}',
      ],
    }
    expect(findNestedWindowTierGrids([solo])).toEqual([])
  })

  it('n’accuse PAS deux grilles à palier de fenêtre qui sont FRÈRES, pas imbriquées', () => {
    const siblings: SourceFile = {
      path: '/fake/Siblings.tsx',
      lines: [
        'function First() {',
        '  return <div className="grid grid-cols-1 sm:grid-cols-2">{a}</div>',
        '}',
        'function Second() {',
        '  return <div className="grid grid-cols-1 sm:grid-cols-2">{b}</div>',
        '}',
        'export function Page() {',
        '  return (',
        '    <div>',
        '      <First />',
        '      <Second />',
        '    </div>',
        '  )',
        '}',
      ],
    }
    expect(findNestedWindowTierGrids([siblings])).toEqual([])
  })

  it('accuse deux grilles à palier de fenêtre IMBRIQUÉES — reproduit #2652', () => {
    // Rejoue la forme exacte du bug : `Outer` pose une grille à palier de
    // fenêtre, et `Inner` — qui pose LA MÊME chose dans son propre corps —
    // est rendu entre son ouverture et sa fermeture.
    const nested: SourceFile = {
      path: '/fake/Nested.tsx',
      lines: [
        'function Inner() {',
        '  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">{groups}</div>',
        '}',
        'function Outer({ children }) {',
        '  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">{children}</div>',
        '}',
        'export function Page() {',
        '  return (',
        '    <Outer>',
        '      <Inner />',
        '    </Outer>',
        '  )',
        '}',
      ],
    }
    const violations = findNestedWindowTierGrids([nested])
    expect(violations).toEqual([
      { file: '/fake/Nested.tsx', outer: 'Outer', outerLine: 9, inner: 'Inner', innerLine: 10 },
    ])
  })

  it('ne trouve AUCUNE grille à palier de fenêtre imbriquée dans le produit', () => {
    const violations = findNestedWindowTierGrids(CORPUS)
    const rendu = violations.map(
      v =>
        `${v.file.split('/src/')[1]} — <${v.outer}> (ligne ${v.outerLine}) contient <${v.inner}> (ligne ${v.innerLine})`,
    )
    expect(
      rendu,
      rendu.length === 0
        ? ''
        : `Grilles à palier de FENÊTRE imbriquées (#2652) :\n${rendu.map(r => `  ${r}`).join('\n')}\n\n` +
            `Chaque composant intérieur hérite d'une largeur qui n'a plus rien à voir\n` +
            `avec la fenêtre — dimensionner ses colonnes par le CONTENU\n` +
            `(grid-cols-[repeat(auto-fit,minmax(<min>,1fr))]) au lieu d'un palier sm:/lg:.`,
    ).toEqual([])
  })
})
