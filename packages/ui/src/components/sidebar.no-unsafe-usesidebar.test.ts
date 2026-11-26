import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #2593 — AUCUN COMPOSANT DE `packages/ui` N'APPELLE `useSidebar()` SANS
 * FILET.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT, REVENU UNE QUATRIÈME FOIS
 * ─────────────────────────────────────────────────────────────────────────
 * `useSidebar()` — la version STRICTE de `sidebar.tsx` — lève hors d'un
 * `SidebarProvider`. Trois appelants de ce fichier en sont déjà morts,
 * chacun réparé un par un : `Sidebar` (collapsible="none"),
 * `useSidebarCollapsePreference`, `SidebarCollapseToggle`. Mesuré en
 * production le 18/09/2026 (#2593) : un QUATRIÈME, `SidebarMenuButton`, a
 * fait tomber `/settings` et `/integrations` au chargement direct.
 *
 * Trois correctifs sur la MÊME cause, réparant chacun UN appelant nommé,
 * c'est le signe qu'on soigne des symptômes. Cette garde-ci vise la CAUSE :
 * elle lit tout le code source de `packages/ui` et refuse tout appel de
 * `useSidebar()` qui ne soit pas la déclaration de la fonction elle-même —
 * `useSidebarOptional()` est la seule porte sûre. Elle aurait attrapé les
 * QUATRE appelants d'un coup, au lieu d'attendre un cinquième.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN GREP EXACT, ET PAS UN PARSEUR
 * ─────────────────────────────────────────────────────────────────────────
 * `useSidebar()` — le nom suivi immédiatement d'une parenthèse ouvrante puis
 * fermante — ne matche JAMAIS `useSidebarOptional()`, dont le nom continue
 * après `useSidebar` (`Optional`, pas `(`). Aucun cas particulier à écrire :
 * c'est la forme littérale qui protège, pas une liste d'exceptions.
 *
 * Les COMMENTAIRES sont retirés avant la recherche (même motif que
 * `account-intelligence-single-facade.spec.ts` et consorts) : ce fichier même
 * écrit `useSidebar()` en prose, dans ses propres docblocks, pour raconter le
 * défaut passé — les compter serait accuser du texte, pas du code.
 */

const UI_SRC = join(__dirname, '..')

/** Retire `/* … *\/` et `// …` sans décaler les numéros de ligne : un
 *  commentaire bloc devient autant de lignes vides que de lignes qu'il
 *  occupait, pour que `file:line` reste exact sur le fichier RÉEL. Le garde
 *  `(^|[^:])` évite de couper une URL (`https://…`). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, '')).replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      out.push(...listSourceFiles(full))
      continue
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue
    if (/\.test\.(ts|tsx)$/.test(entry)) continue // ce fichier compris
    out.push(full)
  }
  return out
}

/**
 * Les numéros de ligne (1-indexés) d'un appel `useSidebar()` NON filtré dans
 * `source` — c'est-à-dire ni la déclaration de la fonction, ni
 * `useSidebarOptional()`.
 */
function unsafeSidebarCallLines(source: string): number[] {
  const offenders: number[] = []
  stripComments(source)
    .split('\n')
    .forEach((line, index) => {
      if (/\bfunction\s+useSidebar\s*\(/.test(line)) return // la déclaration
      if (/\buseSidebar\(\)/.test(line)) offenders.push(index + 1)
    })
  return offenders
}

describe('#2593 — aucun appelant de packages/ui n’utilise useSidebar() sans filet', () => {
  const files = listSourceFiles(UI_SRC)

  it('LIT un corpus non vide — sinon la garde ne garde rien', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('aucun appel useSidebar() non filtré, où que ce soit dans le paquet', () => {
    const offenders: string[] = []
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const line of unsafeSidebarCallLines(source)) {
        offenders.push(`${relative(UI_SRC, file)}:${line}`)
      }
    }
    // Un rouge ici liste le ou les appelants fautifs — jamais un simple
    // « attendu vide, reçu non-vide » qui enverrait chercher.
    expect(offenders, `appelants sans filet : ${offenders.join(', ') || '(aucun)'}`).toEqual([])
  })

  it('SAIT DIRE NON — un appel non filtré synthétique est détecté', () => {
    const snippet = [
      'function SidebarTrigger() {',
      '  const { toggleSidebar } = useSidebar()',
      '  return null',
      '}',
    ].join('\n')
    expect(unsafeSidebarCallLines(snippet)).toEqual([2])
  })

  it('n’attrape pas ce qu’elle ne vise pas — useSidebarOptional() et la déclaration passent', () => {
    const snippet = [
      'function useSidebar() {',
      '  return null',
      '}',
      'function useSidebarOptional() {',
      '  const sidebar = useSidebarOptional()',
      '  return sidebar',
      '}',
    ].join('\n')
    expect(unsafeSidebarCallLines(snippet)).toEqual([])
  })

  it('n’attrape pas ce qu’elle ne vise pas — une MENTION en commentaire n’est pas un appel', () => {
    // Ce fichier même fait ça dans son propre docblock : raconter le défaut
    // en citant `useSidebar()` dans de la prose n'est pas l'appeler.
    const snippet = [
      '/** ⚠️ ne PAS appeler useSidebar() ici, ça lève sans fournisseur. */',
      '// une autre mise en garde qui cite useSidebar() en commentaire de ligne',
      'function SidebarRail() {',
      '  const sidebar = useSidebarOptional()',
      '  return sidebar',
      '}',
    ].join('\n')
    expect(unsafeSidebarCallLines(snippet)).toEqual([])
  })
})
